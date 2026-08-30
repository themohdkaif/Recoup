import pytest
from app.models import CheckoutAbandonment
from app.engine.diagnoser import DiagnosisResult
from app.engine.policy_engine import decide_abandonment
from app.engine.executor import execute_abandonment


def make_checkout_session(
    cart_value: float = 1500.0,
    abandoned_at_step: str = "payment_method",
    items_count: int = 2,
    recovery_attempted: bool = False,
) -> CheckoutAbandonment:
    return CheckoutAbandonment(
        session_id="sess_test_abandon_1",
        customer_id="cust_test_1",
        cart_value=cart_value,
        items_count=items_count,
        abandoned_at_step=abandoned_at_step,
        recovery_attempted=recovery_attempted,
    )


# --- 1. Test Policy Engine Guardrails for Abandonment ---

def test_abandonment_low_cart_value_holds():
    session = make_checkout_session(cart_value=249.0, abandoned_at_step="payment_method")
    diagnosis = DiagnosisResult(
        root_cause="payment_friction",
        confidence=0.95,
        reasoning="Payment failed at checkout.",
        source="gemini",
    )
    decision = decide_abandonment(session, diagnosis)
    assert decision.action == "hold"
    assert decision.allowed is False
    assert "cart value too low to justify recovery cost" in decision.reason


def test_abandonment_trust_concern_escalates():
    session = make_checkout_session(cart_value=4999.0, abandoned_at_step="review")
    diagnosis = DiagnosisResult(
        root_cause="trust_concern",
        confidence=0.90,
        reasoning="User hesitated on checkout security policies.",
        source="gemini",
    )
    decision = decide_abandonment(session, diagnosis)
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "trust issues need" in decision.reason


def test_abandonment_high_intent_payment_method_nudges():
    session = make_checkout_session(cart_value=1299.0, abandoned_at_step="payment_method")
    diagnosis = DiagnosisResult(
        root_cause="payment_friction",
        confidence=0.92,
        reasoning="User dropped off during payment method selection.",
        source="gemini",
    )
    decision = decide_abandonment(session, diagnosis)
    assert decision.action == "send_recovery_nudge"
    assert decision.allowed is True
    assert "high intent" in decision.reason


def test_abandonment_high_intent_otp_verification_nudges():
    session = make_checkout_session(cart_value=2499.0, abandoned_at_step="otp_verification")
    diagnosis = DiagnosisResult(
        root_cause="distraction",
        confidence=0.85,
        reasoning="OTP timeout or user distraction.",
        source="gemini",
    )
    decision = decide_abandonment(session, diagnosis)
    assert decision.action == "send_recovery_nudge"
    assert decision.allowed is True
    assert "high intent" in decision.reason


def test_abandonment_shipping_info_standard_nudges():
    session = make_checkout_session(cart_value=1499.0, abandoned_at_step="shipping_info")
    diagnosis = DiagnosisResult(
        root_cause="distraction",
        confidence=0.88,
        reasoning="User dropped off at shipping address entry.",
        source="gemini",
    )
    decision = decide_abandonment(session, diagnosis)
    assert decision.action == "send_recovery_nudge"
    assert decision.allowed is True
    assert "eligible for recovery nudge" in decision.reason


# --- 2. Test Executor for Abandonment ---

def test_executor_abandonment_sets_recovery_attempted_flag():
    session = make_checkout_session(cart_value=999.0, recovery_attempted=False)
    decision = decide_abandonment(
        session,
        DiagnosisResult(root_cause="payment_friction", confidence=0.9, reasoning="Test", source="gemini")
    )
    result = execute_abandonment(session, decision)

    assert session.recovery_attempted is True
    assert result.status == "nudge_sent_simulated"
    assert "Hi! You left 2 items worth ₹999.00 in your cart" in result.detail
    assert session.session_id in result.detail
