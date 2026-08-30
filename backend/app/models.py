from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, JSON
from app.database import Base


class FailedPayment(Base):
    __tablename__ = "failed_payments"

    transaction_id = Column(String(64), primary_key=True, index=True)
    customer_id = Column(String(64), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    failure_reason_code = Column(String(64), nullable=False, index=True)
    gateway_message = Column(String(255), nullable=True)  # Raw unstandardized gateway message / text from bank switch
    payment_method = Column(String(32), nullable=False)
    attempt_number = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    customer_contact_prefs = Column(JSON, nullable=False)
    previous_successful_payments = Column(Integer, default=0, nullable=False)
    razorpay_order_id = Column(String(64), nullable=True)
    razorpay_payment_id = Column(String(64), nullable=True)
    payment_status = Column(String(32), default="pending", nullable=False)  # "pending" | "captured" | "failed_retry"
    ground_truth_root_cause = Column(String(64), nullable=True)  # Evaluation-only label, NEVER passed to Gemini

class CheckoutAbandonment(Base):
    __tablename__ = "checkout_abandonment"

    session_id = Column(String(64), primary_key=True, index=True)
    customer_id = Column(String(64), nullable=False, index=True)
    cart_value = Column(Float, nullable=False)
    items_count = Column(Integer, nullable=False)
    abandoned_at_step = Column(String(64), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    recovery_attempted = Column(Boolean, default=False, nullable=False)


class FailedMandate(Base):
    __tablename__ = "failed_mandates"

    mandate_id = Column(String(64), primary_key=True, index=True)
    customer_id = Column(String(64), nullable=False, index=True)
    subscription_plan = Column(String(64), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    mandate_failure_code = Column(String(64), nullable=False, index=True)
    retry_attempt_number = Column(Integer, default=1, nullable=False)
    last_successful_charge_days_ago = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    recovery_attempted = Column(Boolean, default=False, nullable=False)
    ground_truth_root_cause = Column(String(64), nullable=True)  # Evaluation-only label, NEVER passed to Gemini


class OverdueInvoice(Base):
    __tablename__ = "overdue_invoices"

    invoice_id = Column(String(64), primary_key=True, index=True)
    business_customer_id = Column(String(128), nullable=False, index=True)
    invoice_amount = Column(Float, nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    due_date = Column(DateTime, nullable=False)
    days_overdue = Column(Integer, nullable=False, index=True)
    previous_payment_history = Column(String(64), nullable=False)  # "always_on_time" | "occasionally_late" | "chronically_late" | "first_invoice"
    escalation_stage = Column(String(64), default="none", nullable=False)  # "none" | "reminder_sent" | "firm_notice" | "promise_captured" | "broken_promise" | "human_handoff"
    promise_to_pay_date = Column(DateTime, nullable=True)
    relationship_value_tier = Column(String(32), nullable=False)  # "standard" | "high_value" | "strategic"
    touch_count = Column(Integer, default=0, nullable=False)
    recovery_attempted = Column(Boolean, default=False, nullable=False)
    ground_truth_root_cause = Column(String(64), nullable=True)  # Evaluation-only label, NEVER passed to Gemini


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    record_type = Column(String(32), nullable=False, index=True)  # "payment" | "checkout" | "mandate" | "receivable"
    transaction_id = Column(String(64), nullable=True, index=True)
    stage = Column(String(32), nullable=False, index=True)  # "detect" | "diagnose" | "decide" | "execute" | "capture"
    actor = Column(String(64), nullable=False)  # "system" | "gemini" | "fallback_rules" | "policy_engine" | "razorpay_api"
    detail = Column(Text, nullable=False)
    confidence_score = Column(Float, nullable=True)


class CounterfactualLog(Base):
    __tablename__ = "counterfactual_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    record_type = Column(String(32), nullable=False, index=True)  # "payment" | "checkout" | "mandate" | "receivable"
    record_id = Column(String(64), nullable=False, index=True)
    guardrail_type = Column(String(64), nullable=False, index=True)  # "consent_hard_stop" | "strategic_tier_bypass" | "risk_flagged_escalation" | "low_cart_value_hold" | "broken_promise_limit" | "low_confidence_hold"
    naive_action = Column(String(255), nullable=False)
    additional_contacts_prevented = Column(Integer, default=0, nullable=False)
    compliance_risk = Column(Boolean, default=False, nullable=False)
    reasoning = Column(Text, nullable=False)
    record_amount = Column(Float, default=0.0, nullable=False)


class HumanAction(Base):
    __tablename__ = "human_actions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    record_type = Column(String(32), nullable=False, index=True)  # "payment" | "checkout" | "mandate" | "receivable"
    record_id = Column(String(64), nullable=False, index=True)
    action_taken = Column(String(32), nullable=False, index=True)  # "approved_contact" | "marked_resolved" | "override_retry" | "reassigned"
    operator_note = Column(Text, nullable=True)
    resulting_status = Column(String(64), nullable=False)
    blocked_by_guardrail = Column(Boolean, default=False, nullable=False)
    guardrail_reason = Column(Text, nullable=True)
