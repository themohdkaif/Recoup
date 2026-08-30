import pytest
from app.database import SessionLocal
from app.models import CounterfactualLog, FailedMandate, OverdueInvoice, FailedPayment, CheckoutAbandonment
from app.engine.counterfactual import compute_counterfactual, CounterfactualResult
from app.engine.policy_engine import PolicyDecision
from app.engine.diagnoser import DiagnosisResult


def test_counterfactual_consent_hard_stop():
    mandate = FailedMandate(
        mandate_id="mdt_test_cf_1",
        customer_id="cust_1",
        subscription_plan="pro_tier",
        amount=1999.0,
        currency="INR",
        mandate_failure_code="customer_paused_mandate",
        retry_attempt_number=1,
        last_successful_charge_days_ago=10,
        recovery_attempted=False,
    )
    decision = PolicyDecision(action="permanently_stop", allowed=False, reason="Consent revoked")
    res = compute_counterfactual(mandate, decision, flow_type="mandate")

    assert res is not None
    assert res.guardrail_type == "consent_hard_stop"
    assert res.compliance_risk is True
    assert res.additional_contacts_prevented == 2  # 3 - 1
    assert "consent revocation" in res.reasoning or "withdrew authorization" in res.reasoning


def test_counterfactual_strategic_tier_bypass():
    invoice = OverdueInvoice(
        invoice_id="inv_test_cf_2",
        business_customer_id="Reliance Industries",
        invoice_amount=500000.0,
        currency="INR",
        days_overdue=25,
        previous_payment_history="always_on_time",
        relationship_value_tier="strategic",
        touch_count=0,
    )
    decision = PolicyDecision(action="human_handoff", allowed=False, reason="Strategic account bypass")
    res = compute_counterfactual(invoice, decision, flow_type="receivable")

    assert res is not None
    assert res.guardrail_type == "strategic_tier_bypass"
    assert res.compliance_risk is False
    assert res.additional_contacts_prevented == 3
    assert res.record_amount == 500000.0


def test_counterfactual_risk_flagged():
    payment = FailedPayment(
        transaction_id="txn_test_cf_3",
        customer_id="cust_3",
        amount=4500.0,
        currency="INR",
        failure_reason_code="risk_check_failed",
        payment_method="card",
        attempt_number=1,
    )
    diagnosis = DiagnosisResult(root_cause="risk_flagged", confidence=0.99, reasoning="Fraud risk", source="gemini")
    decision = PolicyDecision(action="escalate_to_human", allowed=False, reason="Risk check failed")
    res = compute_counterfactual(payment, decision, flow_type="payment", diagnosis=diagnosis)

    assert res is not None
    assert res.guardrail_type == "risk_flagged_escalation"
    assert res.compliance_risk is True
    assert res.additional_contacts_prevented == 1
    assert "fraud-review" in res.reasoning or "flagged for risk" in res.reasoning


def test_counterfactual_low_cart_value():
    session = CheckoutAbandonment(
        session_id="sess_test_cf_4",
        customer_id="cust_4",
        cart_value=199.0,
        items_count=1,
        abandoned_at_step="review",
    )
    decision = PolicyDecision(action="hold_no_action", allowed=False, reason="Sub-300 cart hold")
    res = compute_counterfactual(session, decision, flow_type="checkout")

    assert res is not None
    assert res.guardrail_type == "low_cart_value_hold"
    assert res.compliance_risk is False
    assert res.additional_contacts_prevented == 1


def test_counterfactual_summary_endpoint():
    db = SessionLocal()
    try:
        count = db.query(CounterfactualLog).count()
        assert count > 0
    finally:
        db.close()
