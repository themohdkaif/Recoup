from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models import (
    FailedPayment,
    CheckoutAbandonment,
    FailedMandate,
    OverdueInvoice,
    AuditLog,
)
from app.engine.diagnoser import DiagnosisResult

MAX_RETRY_ATTEMPTS = 3


class PolicyDecision(BaseModel):
    action: str = Field(
        ...,
        description="Action to take: 'retry_payment' | 'send_recovery_nudge' | 'retry_mandate_charge' | 'permanently_stop' | 'send_reminder' | 'send_firm_notice' | 'promise_captured' | 'escalate_broken_promise' | 'escalate_to_human' | 'hold' | 'no_action_already_escalated'",
    )
    allowed: bool = Field(..., description="Whether the action is allowed to proceed")
    reason: str = Field(..., description="Rule description and rationale that fired")
    backoff_days: Optional[int] = Field(default=None, description="Computed exponential backoff in days for sequenced retries")


def decide(
    payment: FailedPayment,
    diagnosis: DiagnosisResult,
    db_session: Optional[Session] = None,
) -> PolicyDecision:
    """
    Evaluate policy guardrails and determine recovery action for payment failures.
    """
    if payment.attempt_number >= MAX_RETRY_ATTEMPTS:
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="max retry attempts reached",
        )
    elif diagnosis.root_cause in ["risk_flagged", "risk_check_failed"]:
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="risk flags require human review, never auto-retry",
        )
    elif diagnosis.root_cause == "unknown":
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="diagnosis inconclusive, requires human review",
        )
    elif diagnosis.confidence < 0.5:
        decision = PolicyDecision(
            action="hold",
            allowed=False,
            reason="diagnosis confidence too low to act",
        )
    else:
        decision = PolicyDecision(
            action="retry_payment",
            allowed=True,
            reason=f"root cause {diagnosis.root_cause} is retriable",
        )

    if db_session is not None:
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="payment",
            transaction_id=payment.transaction_id,
            stage="decide",
            actor="policy_engine",
            detail=f"Rule evaluated: action='{decision.action}', allowed={decision.allowed}, reason='{decision.reason}'",
            confidence_score=None,
        )
        db_session.add(log_entry)

    return decision


def decide_abandonment(
    session: CheckoutAbandonment,
    diagnosis: DiagnosisResult,
    db_session: Optional[Session] = None,
) -> PolicyDecision:
    """
    Evaluate policy guardrails and determine recovery action for abandoned checkouts.
    """
    if session.cart_value < 300:
        decision = PolicyDecision(
            action="hold",
            allowed=False,
            reason="cart value too low to justify recovery cost",
        )
    elif diagnosis.root_cause == "trust_concern":
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="trust issues need customer service, not automated nudge",
        )
    elif diagnosis.root_cause == "comparison_shopping":
        decision = PolicyDecision(
            action="hold",
            allowed=False,
            reason="user is price-shopping, nudge would annoy without converting",
        )
    elif diagnosis.confidence < 0.5:
        decision = PolicyDecision(
            action="hold",
            allowed=False,
            reason="diagnosis confidence too low to send message",
        )
    elif session.abandoned_at_step in ["payment_method", "otp_verification"]:
        decision = PolicyDecision(
            action="send_recovery_nudge",
            allowed=True,
            reason="high intent — abandoned at payment step, send recovery link immediately",
        )
    else:
        decision = PolicyDecision(
            action="send_recovery_nudge",
            allowed=True,
            reason=f"abandoned at {session.abandoned_at_step}, eligible for recovery nudge",
        )

    if db_session is not None:
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="checkout",
            transaction_id=session.session_id,
            stage="decide",
            actor="policy_engine",
            detail=f"Rule evaluated: action='{decision.action}', allowed={decision.allowed}, reason='{decision.reason}'",
            confidence_score=None,
        )
        db_session.add(log_entry)

    return decision


def decide_mandate(
    mandate: FailedMandate,
    diagnosis: DiagnosisResult,
    db_session: Optional[Session] = None,
) -> PolicyDecision:
    """
    Evaluate policy guardrails and determine recovery action for subscription mandate failures.
    Strict top-to-bottom sequence evaluation with unbypassable consent hard-stop.
    """
    if diagnosis.root_cause == "customer_declined_consent":
        decision = PolicyDecision(
            action="permanently_stop",
            allowed=False,
            reason="customer explicitly paused mandate — retrying would violate consent, this is a compliance hard-stop, not a business decision",
            backoff_days=None,
        )
    elif mandate.retry_attempt_number >= 4:
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="mandate retry sequence exhausted (4 attempts), needs manual outreach",
            backoff_days=None,
        )
    elif mandate.last_successful_charge_days_ago > 180:
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="customer likely churned (6+ months lapsed), automated retry unlikely to succeed, needs win-back campaign not a retry bot",
            backoff_days=None,
        )
    elif diagnosis.root_cause == "bank_rejection" and mandate.retry_attempt_number >= 2:
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="repeated bank rejection suggests a structural issue automated retry can't fix",
            backoff_days=None,
        )
    else:
        backoff_map = {1: 1, 2: 3, 3: 7}
        backoff = backoff_map.get(mandate.retry_attempt_number, 7)
        decision = PolicyDecision(
            action="retry_mandate_charge",
            allowed=True,
            reason=f"attempt {mandate.retry_attempt_number}/4, root cause {diagnosis.root_cause} is retriable",
            backoff_days=backoff,
        )

    if db_session is not None:
        if decision.backoff_days:
            detail_str = f"Rule evaluated: action='{decision.action}', allowed={decision.allowed}, backoff={decision.backoff_days}d, reason='{decision.reason}'"
        else:
            detail_str = f"Rule evaluated: action='{decision.action}', allowed={decision.allowed}, reason='{decision.reason}'"

        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="mandate",
            transaction_id=mandate.mandate_id,
            stage="decide",
            actor="policy_engine",
            detail=detail_str,
            confidence_score=None,
        )
        db_session.add(log_entry)

    return decision


# Deterministic set of accounts that commit to a promise during cycle 2
PROMISE_CAPTURE_INVOICE_IDS = {"inv_03", "inv_06", "inv_09", "inv_13", "inv_17", "inv_21"}


def decide_receivable(
    invoice: OverdueInvoice,
    diagnosis: DiagnosisResult,
    cycle_number: int = 1,
    db_session: Optional[Session] = None,
) -> PolicyDecision:
    """
    Evaluate policy guardrails and determine collections escalation step for overdue B2B receivables.
    Simulates cycle-based time progression (7 days per cycle).
    """
    effective_days_overdue = invoice.days_overdue + (cycle_number - 1) * 7
    simulated_today = invoice.due_date + timedelta(days=effective_days_overdue)

    # a. HARD STOP: Already in human handoff
    if invoice.escalation_stage == "human_handoff":
        decision = PolicyDecision(
            action="no_action_already_escalated",
            allowed=False,
            reason="already escalated to human handoff, automation stopped",
        )
    # b. Strategic tier guardrail (always white glove human handling from day 1)
    elif invoice.relationship_value_tier == "strategic":
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="strategic accounts get white-glove human handling from first touch, never automated dunning",
        )
    # c. Promise-to-pay evaluation (Cycle >= 3)
    elif invoice.escalation_stage == "promise_captured":
        if invoice.promise_to_pay_date is not None and simulated_today > invoice.promise_to_pay_date:
            decision = PolicyDecision(
                action="escalate_broken_promise",
                allowed=True,
                reason="promise-to-pay date passed without payment — trust broken, escalate firmly",
            )
        else:
            decision = PolicyDecision(
                action="hold",
                allowed=False,
                reason="active promise-to-pay pending maturity, awaiting payment",
            )
    # d. Broken promise hard stop
    elif invoice.escalation_stage == "broken_promise":
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="broken promise requires human relationship management, automation stops here",
        )
    # e. Dispute risk guardrail
    elif diagnosis.root_cause == "dispute_risk":
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="potential dispute requires human judgment, not automated chasing",
        )
    # f. Guardrail: Max 4 automated touches
    elif invoice.touch_count >= 4:
        decision = PolicyDecision(
            action="escalate_to_human",
            allowed=True,
            reason="automated touch limit reached (4 touches), human takeover required",
        )
    # g. First touch (Cycle 1): none -> send_reminder
    elif invoice.escalation_stage == "none":
        decision = PolicyDecision(
            action="send_reminder",
            allowed=True,
            reason="first touch, gentle reminder appropriate",
        )
    # h. Second touch (Cycle 2): reminder_sent -> promise_captured OR firm_notice
    elif invoice.escalation_stage == "reminder_sent":
        if cycle_number == 2 and invoice.previous_payment_history in ["always_on_time", "occasionally_late"] and invoice.days_overdue <= 30:
            decision = PolicyDecision(
                action="promise_captured",
                allowed=True,
                reason="customer acknowledged reminder and committed to target payment settlement date",
            )
        elif effective_days_overdue > 20 or cycle_number >= 2:
            decision = PolicyDecision(
                action="send_firm_notice",
                allowed=True,
                reason="reminder unanswered after grace window, escalating to formal past-due notice",
            )
        else:
            decision = PolicyDecision(
                action="hold",
                allowed=False,
                reason="within reminder grace period, awaiting payment",
            )
    # i. Third touch (Cycle 3): firm_notice -> escalate high risk OR hold
    elif invoice.escalation_stage == "firm_notice":
        if cycle_number >= 3 and (invoice.days_overdue > 45 or diagnosis.root_cause in ["high_default_risk", "cashflow_stress"]):
            decision = PolicyDecision(
                action="escalate_to_human",
                allowed=True,
                reason="formal notices exhausted with high aging/default risk, human takeover required",
            )
        else:
            decision = PolicyDecision(
                action="hold",
                allowed=False,
                reason="firm notice active, awaiting payment settlement window",
            )
    # j. Otherwise: Hold
    else:
        decision = PolicyDecision(
            action="hold",
            allowed=False,
            reason="within normal follow-up window, no action needed yet",
        )

    if db_session is not None:
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="receivable",
            transaction_id=invoice.invoice_id,
            stage="decide",
            actor="policy_engine",
            detail=f"Rule evaluated (Cycle {cycle_number}, Effective Overdue: {effective_days_overdue}d): action='{decision.action}', allowed={decision.allowed}, reason='{decision.reason}'",
            confidence_score=None,
        )
        db_session.add(log_entry)

    return decision
