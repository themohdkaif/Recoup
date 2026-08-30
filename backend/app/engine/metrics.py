import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import (
    FailedPayment,
    CheckoutAbandonment,
    FailedMandate,
    OverdueInvoice,
    AuditLog,
)

logger = logging.getLogger(__name__)


class FlowMetrics(BaseModel):
    total_evaluated: int
    action_counts: Dict[str, int]
    amount_at_risk: float
    amount_recovery_initiated: float
    amount_actually_recovered: Optional[float] = 0.0


class UnifiedSummary(BaseModel):
    total_revenue_at_risk: float = Field(..., description="Sum of amounts across all four flows' evaluated records")
    total_recovery_initiated: float = Field(
        ..., description="Sum of amounts where a recovery action was completed/dispatched"
    )
    total_amount_actually_recovered: float = Field(
        ..., description="Sum of amounts actually completed and captured via payment gateway test mode"
    )
    total_permanently_protected_from_contact: float = Field(
        ..., description="Sum of amounts where system intentionally refrained from auto-contacting (consent hard-stops, low-value holds)"
    )
    total_escalated_to_human: float = Field(
        ..., description="Sum of amounts routed to human review (risk flags, strategic tier, broken promises, churn)"
    )
    total_still_in_progress: float = Field(
        ..., description="Sum of amounts in active open retry sequences or unexpired promises pending maturity"
    )
    escalation_reasons_breakdown: Dict[str, float] = Field(
        ..., description="Breakdown of human escalation amounts by reason category"
    )
    per_flow_breakdown: Dict[str, FlowMetrics] = Field(..., description="Detailed metrics broken down by flow type")
    total_real_razorpay_calls_made: int = Field(..., description="Count of actual Razorpay Orders & Payments API calls executed")
    audit_log_total_entries: int = Field(..., description="Total count across all audit log records")
    initiated_rate_pct: float = Field(
        ..., description="Percentage of at-risk revenue where recovery was actively dispatched (total_recovery_initiated / total_revenue_at_risk)"
    )
    true_capture_rate_pct: float = Field(
        ..., description="Honest, defensible percentage of at-risk revenue actually captured (total_amount_actually_recovered / total_revenue_at_risk)"
    )


def get_unified_summary(db_session: Session) -> UnifiedSummary:
    """
    Aggregate unified recovery metrics across all four flows (Payment, Checkout, Mandate, Receivable)
    and the comprehensive AuditLog into mutually exclusive, collectively exhaustive partitions.
    """
    # 1. Base table queries
    payments = db_session.query(FailedPayment).all()
    checkouts = db_session.query(CheckoutAbandonment).all()
    mandates = db_session.query(FailedMandate).all()
    invoices = db_session.query(OverdueInvoice).all()

    # 2. Audit log queries
    audit_logs = db_session.query(AuditLog).all()
    audit_log_total_entries = len(audit_logs)

    # Count real Razorpay orders and payments in audit logs
    real_razorpay_calls = db_session.query(AuditLog).filter(
        (AuditLog.stage == "execute") & (AuditLog.detail.like("%Razorpay Order ID: order_%") | AuditLog.detail.like("%Created Razorpay test-mode Order (order_%"))
    ).count()

    real_capture_calls = db_session.query(AuditLog).filter(
        AuditLog.stage == "capture",
        AuditLog.actor == "razorpay_api",
    ).count()

    total_real_razorpay_calls = real_razorpay_calls + real_capture_calls
    if total_real_razorpay_calls == 0:
        total_real_razorpay_calls = len([p for p in payments if p.razorpay_order_id])

    # Partition accumulators
    total_recovery_initiated = 0.0
    total_permanently_protected = 0.0
    total_escalated_to_human = 0.0
    total_still_in_progress = 0.0
    total_amount_actually_recovered = 0.0

    escalation_reasons: Dict[str, float] = {
        "risk_flagged": 0.0,
        "consent_hard_stop": 0.0,
        "strategic_tier": 0.0,
        "broken_promise": 0.0,
        "dispute_risk": 0.0,
        "sequence_exhausted": 0.0,
        "churned_subscribers": 0.0,
        "low_confidence_or_other": 0.0,
    }

    # -------------------------------------------------------------------------
    # FLOW 1: PAYMENT FAILURES (60 records)
    # -------------------------------------------------------------------------
    payment_amount_at_risk = sum(p.amount for p in payments)
    payment_actions: Dict[str, int] = {}
    payment_recovery_initiated = 0.0
    payment_actually_recovered = 0.0

    payment_decide_logs = (
        db_session.query(AuditLog)
        .filter(AuditLog.record_type == "payment", AuditLog.stage == "decide")
        .all()
    )

    payment_decision_map = {}
    for log in payment_decide_logs:
        if "action='retry_payment'" in log.detail:
            payment_decision_map[log.transaction_id] = "retry_payment"
        elif "action='escalate_to_human'" in log.detail:
            payment_decision_map[log.transaction_id] = "escalate_to_human"
        elif "action='hold'" in log.detail:
            payment_decision_map[log.transaction_id] = "hold"
        else:
            payment_decision_map[log.transaction_id] = "hold"

    for p in payments:
        action = payment_decision_map.get(p.transaction_id, "pending")
        payment_actions[action] = payment_actions.get(action, 0) + 1

        if p.payment_status == "captured":
            payment_actually_recovered += p.amount
            total_amount_actually_recovered += p.amount

        if action == "retry_payment":
            total_recovery_initiated += p.amount
            payment_recovery_initiated += p.amount
        elif action == "escalate_to_human":
            total_escalated_to_human += p.amount
            if p.failure_reason_code == "risk_check_failed":
                escalation_reasons["risk_flagged"] += p.amount
            else:
                escalation_reasons["low_confidence_or_other"] += p.amount
        elif action == "hold":
            total_permanently_protected += p.amount
        else:
            total_still_in_progress += p.amount

    # -------------------------------------------------------------------------
    # FLOW 2: CHECKOUT ABANDONMENT (15 records)
    # -------------------------------------------------------------------------
    checkout_amount_at_risk = sum(c.cart_value for c in checkouts)
    checkout_actions: Dict[str, int] = {}
    checkout_recovery_initiated = 0.0

    checkout_decide_logs = (
        db_session.query(AuditLog)
        .filter(AuditLog.record_type == "checkout", AuditLog.stage == "decide")
        .all()
    )

    checkout_decision_map = {}
    for log in checkout_decide_logs:
        if "action='send_recovery_nudge'" in log.detail:
            checkout_decision_map[log.transaction_id] = "send_recovery_nudge"
        elif "action='escalate_to_human'" in log.detail:
            checkout_decision_map[log.transaction_id] = "escalate_to_human"
        elif "action='hold'" in log.detail:
            checkout_decision_map[log.transaction_id] = "hold"
        else:
            checkout_decision_map[log.transaction_id] = "hold"

    for c in checkouts:
        action = checkout_decision_map.get(c.session_id, "pending")
        checkout_actions[action] = checkout_actions.get(action, 0) + 1

        if action == "send_recovery_nudge":
            total_recovery_initiated += c.cart_value
            checkout_recovery_initiated += c.cart_value
        elif action == "escalate_to_human":
            total_escalated_to_human += c.cart_value
            escalation_reasons["low_confidence_or_other"] += c.cart_value
        elif action == "hold":
            total_permanently_protected += c.cart_value
        else:
            total_still_in_progress += c.cart_value

    # -------------------------------------------------------------------------
    # FLOW 3: SUBSCRIPTION MANDATES (20 records)
    # -------------------------------------------------------------------------
    mandate_amount_at_risk = sum(m.amount for m in mandates)
    mandate_actions: Dict[str, int] = {}
    mandate_recovery_initiated = 0.0

    mandate_decide_logs = (
        db_session.query(AuditLog)
        .filter(AuditLog.record_type == "mandate", AuditLog.stage == "decide")
        .all()
    )

    mandate_decision_map = {}
    for log in mandate_decide_logs:
        if "action='retry_mandate_charge'" in log.detail:
            mandate_decision_map[log.transaction_id] = "retry_mandate_charge"
        elif "action='permanently_stop'" in log.detail:
            mandate_decision_map[log.transaction_id] = "permanently_stop"
        elif "action='escalate_to_human'" in log.detail:
            mandate_decision_map[log.transaction_id] = "escalate_to_human"
        elif "action='hold'" in log.detail:
            mandate_decision_map[log.transaction_id] = "hold"
        else:
            mandate_decision_map[log.transaction_id] = "hold"

    for m in mandates:
        action = mandate_decision_map.get(m.mandate_id, "pending")
        mandate_actions[action] = mandate_actions.get(action, 0) + 1

        if action == "permanently_stop":
            total_permanently_protected += m.amount
        elif action == "escalate_to_human":
            total_escalated_to_human += m.amount
            if m.last_successful_charge_days_ago > 180:
                escalation_reasons["churned_subscribers"] += m.amount
            elif m.retry_attempt_number >= 4:
                escalation_reasons["sequence_exhausted"] += m.amount
            else:
                escalation_reasons["low_confidence_or_other"] += m.amount
        elif action == "retry_mandate_charge":
            total_still_in_progress += m.amount
            mandate_recovery_initiated += m.amount
        elif action == "hold":
            total_permanently_protected += m.amount
        else:
            total_still_in_progress += m.amount

    # -------------------------------------------------------------------------
    # FLOW 4: OVERDUE B2B RECEIVABLES (25 records)
    # -------------------------------------------------------------------------
    invoice_amount_at_risk = sum(inv.invoice_amount for inv in invoices)
    invoice_actions: Dict[str, int] = {}
    invoice_recovery_initiated = 0.0

    for inv in invoices:
        stage = inv.escalation_stage
        invoice_actions[stage] = invoice_actions.get(stage, 0) + 1

        if stage == "human_handoff":
            total_escalated_to_human += inv.invoice_amount
            if inv.relationship_value_tier == "strategic":
                escalation_reasons["strategic_tier"] += inv.invoice_amount
            else:
                escalation_reasons["broken_promise"] += inv.invoice_amount
        elif stage == "broken_promise":
            total_escalated_to_human += inv.invoice_amount
            escalation_reasons["broken_promise"] += inv.invoice_amount
        elif stage == "firm_notice":
            total_recovery_initiated += inv.invoice_amount
            invoice_recovery_initiated += inv.invoice_amount
        elif stage in ["reminder_sent", "promise_captured"]:
            total_still_in_progress += inv.invoice_amount
            invoice_recovery_initiated += inv.invoice_amount
        else:
            total_permanently_protected += inv.invoice_amount

    # Clean up zero-entries in reasons
    escalation_reasons = {k: round(v, 2) for k, v in escalation_reasons.items() if v > 0}

    # -------------------------------------------------------------------------
    # TOTAL AGGREGATES & PARTITION INTEGRITY CHECK
    # -------------------------------------------------------------------------
    total_revenue_at_risk = round(
        payment_amount_at_risk + checkout_amount_at_risk + mandate_amount_at_risk + invoice_amount_at_risk,
        2,
    )
    total_recovery_initiated = round(total_recovery_initiated, 2)
    total_permanently_protected = round(total_permanently_protected, 2)
    total_escalated_to_human = round(total_escalated_to_human, 2)
    total_still_in_progress = round(total_still_in_progress, 2)
    total_amount_actually_recovered = round(total_amount_actually_recovered, 2)

    # -------------------------------------------------------------------------
    # RATE CALCULATIONS & EXPLANATION:
    # 1. initiated_rate_pct: Measures workflow action coverage ("how much at-risk revenue we've taken recovery action on").
    #    Formula: (total_recovery_initiated / total_revenue_at_risk) * 100
    # 2. true_capture_rate_pct: Measures honest, defensible realized recovery ("how much money actually settled into bank account").
    #    Formula: (total_amount_actually_recovered / total_revenue_at_risk) * 100
    #
    # CRITICAL: total_still_in_progress is strictly excluded from both numerators.
    # In-progress items (e.g. reminders sent yesterday, mandate retries scheduled for next week, unexpired promises)
    # are neither resolved nor settled cash, and must NEVER artificially inflate recovery or capture rates.
    #
    # 4-Bucket Partition Invariant (100% mutually exclusive and collectively exhaustive):
    # total_recovery_initiated + total_permanently_protected_from_contact + total_escalated_to_human + total_still_in_progress == total_revenue_at_risk
    # -------------------------------------------------------------------------
    initiated_rate_pct = (
        round((total_recovery_initiated / total_revenue_at_risk) * 100, 1)
        if total_revenue_at_risk > 0
        else 0.0
    )

    true_capture_rate_pct = (
        round((total_amount_actually_recovered / total_revenue_at_risk) * 100, 1)
        if total_revenue_at_risk > 0
        else 0.0
    )

    # Partition sum verification
    partition_sum = round(
        total_recovery_initiated
        + total_permanently_protected
        + total_escalated_to_human
        + total_still_in_progress,
        2,
    )
    diff = abs(partition_sum - total_revenue_at_risk)
    if diff > 1.0:
        logger.warning(
            f"Metrics partition discrepancy detected: partition_sum={partition_sum} != total_at_risk={total_revenue_at_risk} (diff={diff})"
        )

    per_flow_breakdown = {
        "payment": FlowMetrics(
            total_evaluated=len(payments),
            action_counts=payment_actions,
            amount_at_risk=round(payment_amount_at_risk, 2),
            amount_recovery_initiated=round(payment_recovery_initiated, 2),
            amount_actually_recovered=round(payment_actually_recovered, 2),
        ),
        "checkout": FlowMetrics(
            total_evaluated=len(checkouts),
            action_counts=checkout_actions,
            amount_at_risk=round(checkout_amount_at_risk, 2),
            amount_recovery_initiated=round(checkout_recovery_initiated, 2),
            amount_actually_recovered=0.0,
        ),
        "mandate": FlowMetrics(
            total_evaluated=len(mandates),
            action_counts=mandate_actions,
            amount_at_risk=round(mandate_amount_at_risk, 2),
            amount_recovery_initiated=round(mandate_recovery_initiated, 2),
            amount_actually_recovered=0.0,
        ),
        "receivable": FlowMetrics(
            total_evaluated=len(invoices),
            action_counts=invoice_actions,
            amount_at_risk=round(invoice_amount_at_risk, 2),
            amount_recovery_initiated=round(invoice_recovery_initiated, 2),
            amount_actually_recovered=0.0,
        ),
    }

    return UnifiedSummary(
        total_revenue_at_risk=total_revenue_at_risk,
        total_recovery_initiated=total_recovery_initiated,
        total_amount_actually_recovered=total_amount_actually_recovered,
        total_permanently_protected_from_contact=total_permanently_protected,
        total_escalated_to_human=total_escalated_to_human,
        total_still_in_progress=total_still_in_progress,
        escalation_reasons_breakdown=escalation_reasons,
        per_flow_breakdown=per_flow_breakdown,
        total_real_razorpay_calls_made=total_real_razorpay_calls,
        audit_log_total_entries=audit_log_total_entries,
        initiated_rate_pct=initiated_rate_pct,
        true_capture_rate_pct=true_capture_rate_pct,
    )
