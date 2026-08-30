from datetime import datetime
from typing import List
from sqlalchemy.orm import Session

from app.models import (
    FailedPayment,
    CheckoutAbandonment,
    FailedMandate,
    OverdueInvoice,
    AuditLog,
)

MAX_RETRY_ATTEMPTS = 3


def detect_at_risk_payments(db_session: Session) -> List[FailedPayment]:
    """
    Detect payments at risk of permanent failure that have not exceeded MAX_RETRY_ATTEMPTS.
    Logs a detection event to AuditLog for each qualifying transaction.
    """
    at_risk_payments = (
        db_session.query(FailedPayment)
        .filter(FailedPayment.attempt_number < MAX_RETRY_ATTEMPTS)
        .all()
    )

    for payment in at_risk_payments:
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="payment",
            transaction_id=payment.transaction_id,
            stage="detect",
            actor="system",
            detail="flagged for recovery evaluation",
            confidence_score=None,
        )
        db_session.add(log_entry)

    db_session.commit()
    return at_risk_payments


def detect_abandoned_checkouts(db_session: Session) -> List[CheckoutAbandonment]:
    """
    Detect abandoned checkouts where recovery has not yet been attempted.
    Logs a detection event to AuditLog for each qualifying session.
    """
    abandoned_sessions = (
        db_session.query(CheckoutAbandonment)
        .filter(CheckoutAbandonment.recovery_attempted.is_(False))
        .all()
    )

    for session in abandoned_sessions:
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="checkout",
            transaction_id=session.session_id,
            stage="detect",
            actor="system",
            detail=f"Checkout session {session.session_id} flagged for abandonment recovery evaluation (Cart: ₹{session.cart_value:.2f}, Step: {session.abandoned_at_step})",
            confidence_score=None,
        )
        db_session.add(log_entry)

    db_session.commit()
    return abandoned_sessions


def detect_at_risk_mandates(db_session: Session) -> List[FailedMandate]:
    """
    Detect subscription mandate failures where recovery has not been permanently stopped or completed.
    Logs a detection event to AuditLog for each qualifying mandate.
    """
    at_risk_mandates = (
        db_session.query(FailedMandate)
        .filter(FailedMandate.recovery_attempted.is_(False))
        .all()
    )

    for mandate in at_risk_mandates:
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="mandate",
            transaction_id=mandate.mandate_id,
            stage="detect",
            actor="system",
            detail=f"Subscription mandate {mandate.mandate_id} ({mandate.subscription_plan}, ₹{mandate.amount:.2f}) flagged for recovery evaluation (Attempt #{mandate.retry_attempt_number}, Last charge: {mandate.last_successful_charge_days_ago}d ago)",
            confidence_score=None,
        )
        db_session.add(log_entry)

    db_session.commit()
    return at_risk_mandates


def detect_overdue_invoices(db_session: Session, cycle_number: int = 1) -> List[OverdueInvoice]:
    """
    Detect overdue B2B invoices that are not in terminal collection states (human_handoff, resolved).
    Logs a detection event to AuditLog for each qualifying invoice.
    """
    overdue_invoices = (
        db_session.query(OverdueInvoice)
        .filter(OverdueInvoice.escalation_stage.notin_(["human_handoff", "resolved"]))
        .all()
    )

    for invoice in overdue_invoices:
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="receivable",
            transaction_id=invoice.invoice_id,
            stage="detect",
            actor="system",
            detail=f"B2B Invoice {invoice.invoice_id} ({invoice.business_customer_id}, ₹{invoice.invoice_amount:,.2f}) flagged for collection evaluation (Stage: {invoice.escalation_stage}, Overdue: {invoice.days_overdue}d, Tier: {invoice.relationship_value_tier}, Touches: {invoice.touch_count})",
            confidence_score=None,
        )
        db_session.add(log_entry)

    db_session.commit()
    return overdue_invoices
