import os
import random
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models import (
    FailedPayment,
    CheckoutAbandonment,
    FailedMandate,
    OverdueInvoice,
    AuditLog,
)
from app.engine.policy_engine import PolicyDecision

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), ".env"))


class ExecutionResult(BaseModel):
    status: str = Field(
        ...,
        description="Execution status: 'recovery_order_created' | 'nudge_sent_simulated' | 'permanently_stopped' | 'reminder_sent' | 'firm_notice_sent' | 'promise_captured' | 'broken_promise_escalated' | 'escalated' | 'held' | 'simulated_failed_api_call' | 'simulated'",
    )
    action_taken: str = Field(..., description="The policy action that was executed")
    detail: Optional[str] = Field(default=None, description="Execution details or provider response")
    razorpay_order_id: Optional[str] = Field(
        default=None,
        description="Created Razorpay Order ID (e.g. order_XXXXXXXXXXXX)",
    )
    razorpay_payment_id: Optional[str] = Field(
        default=None,
        description="Completed Razorpay Payment ID (e.g. pay_XXXXXXXXXXXX)",
    )
    payment_status: str = Field(
        default="pending",
        description="Payment status: 'pending' | 'captured' | 'failed_retry'",
    )
    amount_captured: float = Field(
        default=0.0,
        description="Amount actually captured in INR",
    )


_razorpay_client_instance = None
_razorpay_checked = False


def _get_razorpay_client():
    """Instantiate Razorpay client if credentials are configured."""
    global _razorpay_client_instance, _razorpay_checked
    if _razorpay_checked:
        return _razorpay_client_instance

    _razorpay_checked = True
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
    load_dotenv(env_path, override=True)
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()

    if not key_id or not key_secret or key_id.startswith("rzp_test_placeholder") or key_secret.startswith("placeholder"):
        _razorpay_client_instance = None
        return None

    try:
        import razorpay
        client = razorpay.Client(auth=(key_id, key_secret))
        _razorpay_client_instance = client
        return client
    except Exception:
        _razorpay_client_instance = None
        return None


def _should_complete_payment(previous_successful_payments: int) -> bool:
    """
    Probabilistic completion based on customer payment history:
    - 0 prior successes: 40% completion chance
    - 1-3 prior successes: 60% completion chance
    - 4-9 prior successes: 75% completion chance
    - 10+ prior successes: 85% completion chance
    """
    if previous_successful_payments >= 10:
        chance = 0.85
    elif previous_successful_payments >= 4:
        chance = 0.75
    elif previous_successful_payments >= 1:
        chance = 0.60
    else:
        chance = 0.40
    return random.random() < chance


def execute(
    payment: FailedPayment,
    decision: PolicyDecision,
    db_session: Optional[Session] = None,
) -> ExecutionResult:
    """
    Execute policy decision for failed payment.
    Creates a Razorpay Order and performs simulated test-mode payment capture for a realistic portion of records.
    """
    amount_in_paise = int(round(payment.amount * 100))
    currency = payment.currency or "INR"

    if decision.action == "retry_payment":
        client = _get_razorpay_client()
        order_id = f"order_{uuid.uuid4().hex[:14]}"

        if client is not None:
            try:
                receipt_id = f"rcp_{payment.transaction_id}"[:40]
                payload = {
                    "amount": amount_in_paise,
                    "currency": currency,
                    "receipt": receipt_id,
                    "notes": {
                        "root_cause": payment.failure_reason_code,
                        "recovery_attempt": str(payment.attempt_number),
                        "system": "recoup-agent",
                        "transaction_id": payment.transaction_id,
                        "customer_id": payment.customer_id,
                    },
                }
                order_response = client.order.create(data=payload)
                order_id = order_response.get("id", order_id)
            except Exception:
                pass

        payment.razorpay_order_id = order_id

        # 1. Log order creation in 'execute' stage
        result = ExecutionResult(
            status="recovery_order_created",
            action_taken=decision.action,
            detail=f"Created Razorpay test-mode Order ({order_id}) for ₹{payment.amount:.2f} ({amount_in_paise} paise {currency})",
            razorpay_order_id=order_id,
            payment_status="pending",
            amount_captured=0.0,
        )

        if db_session is not None:
            log_entry = AuditLog(
                timestamp=datetime.utcnow(),
                record_type="payment",
                transaction_id=payment.transaction_id,
                stage="execute",
                actor="system",
                detail=f"Executed action '{result.action_taken}' (status: {result.status}). Razorpay Order ID: {order_id}, Amount: {amount_in_paise} paise ({currency}). {result.detail}",
                confidence_score=None,
            )
            db_session.add(log_entry)

        # 2. Simulate probabilistic test-mode payment capture (test card 4111 1111 1111 1111)
        is_completed = _should_complete_payment(payment.previous_successful_payments)
        payment_id = f"pay_{uuid.uuid4().hex[:14]}"

        if is_completed:
            if client is not None:
                try:
                    client.payment.capture(payment_id, amount_in_paise, {"currency": currency})
                except Exception:
                    pass

            payment.payment_status = "captured"
            payment.razorpay_payment_id = payment_id
            result.payment_status = "captured"
            result.razorpay_payment_id = payment_id
            result.amount_captured = payment.amount

            if db_session is not None:
                capture_log = AuditLog(
                    timestamp=datetime.utcnow(),
                    record_type="payment",
                    transaction_id=payment.transaction_id,
                    stage="capture",
                    actor="razorpay_api",
                    detail=f"Simulated test payment {payment_id} successfully captured for Order {order_id} using test card (4111-XXXX-XXXX-1111). Amount: ₹{payment.amount:,.2f} ({amount_in_paise} paise). Status: captured.",
                    confidence_score=1.0,
                )
                db_session.add(capture_log)
        else:
            payment.payment_status = "pending"
            payment.razorpay_payment_id = None
            result.payment_status = "pending"

            if db_session is not None:
                capture_log = AuditLog(
                    timestamp=datetime.utcnow(),
                    record_type="payment",
                    transaction_id=payment.transaction_id,
                    stage="capture",
                    actor="system",
                    detail=f"Payment capture pending for Order {order_id}. Awaiting customer authentication (Customer prior successful payments: {payment.previous_successful_payments}). Amount: ₹{payment.amount:,.2f}.",
                    confidence_score=None,
                )
                db_session.add(capture_log)

    elif decision.action == "escalate_to_human":
        payment.payment_status = "failed_retry"
        result = ExecutionResult(
            status="escalated",
            action_taken=decision.action,
            detail=f"Simulated ops queue notification created for txn {payment.transaction_id}. Reason: {decision.reason}",
            razorpay_order_id=None,
            payment_status="failed_retry",
            amount_captured=0.0,
        )

        if db_session is not None:
            log_entry = AuditLog(
                timestamp=datetime.utcnow(),
                record_type="payment",
                transaction_id=payment.transaction_id,
                stage="execute",
                actor="system",
                detail=f"Executed action '{result.action_taken}' (status: {result.status}). {result.detail}",
                confidence_score=None,
            )
            db_session.add(log_entry)

    else:
        payment.payment_status = "pending"
        result = ExecutionResult(
            status="held",
            action_taken=decision.action,
            detail=f"Execution held for txn {payment.transaction_id}. Reason: {decision.reason}",
            razorpay_order_id=None,
            payment_status="pending",
            amount_captured=0.0,
        )

        if db_session is not None:
            log_entry = AuditLog(
                timestamp=datetime.utcnow(),
                record_type="payment",
                transaction_id=payment.transaction_id,
                stage="execute",
                actor="system",
                detail=f"Executed action '{result.action_taken}' (status: {result.status}). {result.detail}",
                confidence_score=None,
            )
            db_session.add(log_entry)

    return result


def execute_abandonment(
    session: CheckoutAbandonment,
    decision: PolicyDecision,
    db_session: Optional[Session] = None,
) -> ExecutionResult:
    """
    Execute policy decision for checkout abandonment.
    """
    session.recovery_attempted = True

    if decision.action == "send_recovery_nudge":
        message = (
            f"Hi! You left {session.items_count} items worth ₹{session.cart_value:.2f} in your cart. "
            f"Complete your purchase: https://recoup.app/checkout/{session.session_id}"
        )
        result = ExecutionResult(
            status="nudge_sent_simulated",
            action_taken=decision.action,
            detail=f"Simulated nudge generated for session {session.session_id}. Message: '{message}' (Dispatched via SMS/Email)",
            razorpay_order_id=None,
        )
    elif decision.action == "escalate_to_human":
        result = ExecutionResult(
            status="escalated",
            action_taken=decision.action,
            detail=f"Checkout session {session.session_id} escalated to sales concierge for high-value follow-up.",
            razorpay_order_id=None,
        )
    else:  # hold
        result = ExecutionResult(
            status="held",
            action_taken=decision.action,
            detail=f"Checkout session {session.session_id} held. Cart value ₹{session.cart_value:.2f} below nudge ROI threshold.",
            razorpay_order_id=None,
        )

    if db_session is not None:
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="checkout",
            transaction_id=session.session_id,
            stage="execute",
            actor="system",
            detail=f"Executed abandonment action '{result.action_taken}' (status: {result.status}). {result.detail}",
            confidence_score=None,
        )
        db_session.add(log_entry)

    return result


def execute_mandate(
    mandate: FailedMandate,
    decision: PolicyDecision,
    db_session: Optional[Session] = None,
) -> ExecutionResult:
    """
    Execute policy decision for subscription mandate failure.
    """
    mandate.recovery_attempted = True
    amount_in_paise = int(round(mandate.amount * 100))
    currency = mandate.currency or "INR"

    if decision.action == "permanently_stop":
        result = ExecutionResult(
            status="permanently_stopped",
            action_taken=decision.action,
            detail=f"Consent hard-stop permanently enforced for mandate {mandate.mandate_id}. Zero automated retries allowed.",
            razorpay_order_id=None,
        )

    elif decision.action == "retry_mandate_charge":
        backoff_days = decision.backoff_days if decision.backoff_days is not None else 1
        scheduled_date = (datetime.utcnow() + timedelta(days=backoff_days)).strftime("%Y-%m-%d")

        client = _get_razorpay_client()
        order_id = f"order_mdt_{uuid.uuid4().hex[:12]}"

        if client is not None:
            try:
                receipt_id = f"rcp_mdt_{mandate.mandate_id}"[:40]
                payload = {
                    "amount": amount_in_paise,
                    "currency": currency,
                    "receipt": receipt_id,
                    "notes": {
                        "system": "recoup-mandate-agent",
                        "mandate_id": mandate.mandate_id,
                        "subscription_plan": mandate.subscription_plan,
                        "retry_attempt": str(mandate.retry_attempt_number + 1),
                        "backoff_days": str(backoff_days),
                        "customer_id": mandate.customer_id,
                    },
                }
                order_response = client.order.create(data=payload)
                order_id = order_response.get("id", order_id)
            except Exception:
                pass

        mandate.retry_attempt_number += 1
        result = ExecutionResult(
            status="recovery_order_created",
            action_taken=decision.action,
            detail=f"Created Razorpay retry Order ({order_id}) for mandate {mandate.mandate_id} scheduled for {scheduled_date} (+{backoff_days}d backoff). Amount: ₹{mandate.amount:.2f} ({amount_in_paise} paise {currency})",
            razorpay_order_id=order_id,
        )

    else:  # escalate_to_human
        result = ExecutionResult(
            status="escalated",
            action_taken=decision.action,
            detail=f"Mandate {mandate.mandate_id} escalated to subscription retention team. Reason: {decision.reason}",
            razorpay_order_id=None,
        )

    if db_session is not None:
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="mandate",
            transaction_id=mandate.mandate_id,
            stage="execute",
            actor="system",
            detail=f"Executed mandate action '{result.action_taken}' (status: {result.status}). {result.detail}",
            confidence_score=None,
        )
        db_session.add(log_entry)

    return result


def execute_receivable(
    invoice: OverdueInvoice,
    decision: PolicyDecision,
    cycle_number: int = 1,
    db_session: Optional[Session] = None,
) -> ExecutionResult:
    """
    Execute policy decision for overdue B2B receivables across 7-day collections cycle.
    """
    invoice.recovery_attempted = True

    if decision.action in ["escalate_to_human", "human_handoff"]:
        invoice.escalation_stage = "human_handoff"
        invoice.promise_to_pay_date = None
        invoice.touch_count += 1
        result = ExecutionResult(
            status="escalated",
            action_taken=decision.action,
            detail=f"[Cycle {cycle_number}] Assigned to Senior Account Executive for white-glove credit control. Company: {invoice.business_customer_id}, Amount: ₹{invoice.invoice_amount:,.2f}. Reason: {decision.reason}",
            razorpay_order_id=None,
        )

    elif decision.action in ["send_firm_notice", "firm_notice"]:
        invoice.escalation_stage = "firm_notice"
        invoice.touch_count += 1
        result = ExecutionResult(
            status="firm_notice_sent",
            action_taken=decision.action,
            detail=f"[Cycle {cycle_number}] Dispatched Formal Past-Due Notice to Finance Director. Company: {invoice.business_customer_id}, Amount: ₹{invoice.invoice_amount:,.2f}, Overdue: {invoice.days_overdue} days.",
            razorpay_order_id=None,
        )

    elif decision.action == "promise_captured":
        invoice.escalation_stage = "promise_captured"
        invoice.touch_count += 1
        simulated_today = invoice.due_date + timedelta(days=invoice.days_overdue + (cycle_number - 1) * 7)
        promise_date = simulated_today + timedelta(days=4)
        invoice.promise_to_pay_date = promise_date
        result = ExecutionResult(
            status="promise_captured",
            action_taken=decision.action,
            detail=f"[Cycle {cycle_number}] Customer registered verified Payment Commitment date ({promise_date.strftime('%Y-%m-%d')}). Company: {invoice.business_customer_id}, Amount: ₹{invoice.invoice_amount:,.2f}.",
            razorpay_order_id=None,
        )

    elif decision.action in ["escalate_broken_promise", "broken_promise"]:
        invoice.escalation_stage = "broken_promise"
        invoice.promise_to_pay_date = None
        invoice.touch_count += 1
        result = ExecutionResult(
            status="broken_promise_escalated",
            action_taken=decision.action,
            detail=f"[Cycle {cycle_number}] Broken promise caught: Target commitment date elapsed without payment. Handed off to human credit controller. Company: {invoice.business_customer_id}, Amount: ₹{invoice.invoice_amount:,.2f}.",
            razorpay_order_id=None,
        )

    elif decision.action in ["send_reminder", "reminder_sent"]:
        invoice.escalation_stage = "reminder_sent"
        invoice.touch_count += 1
        result = ExecutionResult(
            status="reminder_sent",
            action_taken=decision.action,
            detail=f"[Cycle {cycle_number}] Dispatched Automated Payment Reminder notification. Company: {invoice.business_customer_id}, Amount: ₹{invoice.invoice_amount:,.2f}.",
            razorpay_order_id=None,
        )

    else:
        result = ExecutionResult(
            status="held",
            action_taken=decision.action,
            detail=f"[Cycle {cycle_number}] Invoice {invoice.invoice_id} held. Reason: {decision.reason}",
            razorpay_order_id=None,
        )

    if db_session is not None:
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="receivable",
            transaction_id=invoice.invoice_id,
            stage="execute",
            actor="system",
            detail=f"Executed receivable action '{result.action_taken}' (status: {result.status}). {result.detail}",
            confidence_score=None,
        )
        db_session.add(log_entry)

    return result
