import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock
from app.database import SessionLocal, Base, engine
from app.models import FailedPayment, FailedMandate, OverdueInvoice, AuditLog, HumanAction
from app.main import (
    HumanActionRequest,
    execute_human_action,
    get_human_actions,
    get_human_action_stats,
)


@pytest.fixture(scope="module")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


def test_human_action_mark_resolved_receivable(db_session):
    inv = OverdueInvoice(
        invoice_id="inv_test_human_res_01",
        business_customer_id="Test Enterprise Corp",
        invoice_amount=250000.0,
        currency="INR",
        due_date=datetime.utcnow(),
        days_overdue=14,
        previous_payment_history="always_on_time",
        relationship_value_tier="strategic",
        escalation_stage="human_handoff",
        touch_count=0,
    )
    db_session.merge(inv)
    db_session.commit()

    req = HumanActionRequest(
        record_type="receivable",
        record_id="inv_test_human_res_01",
        action="marked_resolved",
        note="Payment settled via direct bank transfer ref #9001",
    )
    resp = execute_human_action(req, db_session)

    assert resp.success is True
    assert resp.action_taken == "marked_resolved"
    assert resp.resulting_status == "resolved"
    assert resp.blocked_by_guardrail is False
    assert resp.stamp_text == "RESOLVED"

    # Verify DB update
    updated_inv = db_session.query(OverdueInvoice).filter_by(invoice_id="inv_test_human_res_01").first()
    assert updated_inv.escalation_stage == "resolved"

    # Verify AuditLog
    audit = db_session.query(AuditLog).filter_by(transaction_id="inv_test_human_res_01", actor="human_operator").first()
    assert audit is not None
    assert audit.stage == "human_intervention"
    assert "marked record as resolved" in audit.detail
    assert "ref #9001" in audit.detail


def test_human_action_consent_hard_stop_override_blocked(db_session):
    mandate = FailedMandate(
        mandate_id="mdt_test_human_hardstop_01",
        customer_id="cust_test_revoked_01",
        subscription_plan="Pro Annual",
        amount=4999.0,
        currency="INR",
        mandate_failure_code="customer_paused_mandate",
        retry_attempt_number=1,
        last_successful_charge_days_ago=120,
    )
    db_session.merge(mandate)
    db_session.commit()

    req = HumanActionRequest(
        record_type="mandate",
        record_id="mdt_test_human_hardstop_01",
        action="override_retry",
        note="Operator attempting to force auto-debit retry",
    )
    resp = execute_human_action(req, db_session)

    assert resp.success is False
    assert resp.blocked_by_guardrail is True
    assert resp.stamp_text == "OVERRIDE BLOCKED — CONSENT HARD-STOP"
    assert resp.stamp_variant == "hardstop"
    assert "compliance hard-stop" in resp.guardrail_reason or "paused mandate" in resp.guardrail_reason

    # Verify HumanAction table recorded the refusal
    ha = db_session.query(HumanAction).filter_by(record_id="mdt_test_human_hardstop_01", action_taken="override_retry").first()
    assert ha is not None
    assert ha.blocked_by_guardrail is True
    assert ha.resulting_status == "override_blocked_by_guardrail"

    # Verify AuditLog entry for the blocked attempt
    audit = db_session.query(AuditLog).filter_by(transaction_id="mdt_test_human_hardstop_01", actor="human_operator").first()
    assert audit is not None
    assert "OVERRIDE BLOCKED BY POLICY GUARDRAIL" in audit.detail
    assert "revoked consent" in audit.detail


def test_human_action_override_retry_payment_succeeds(db_session):
    payment = FailedPayment(
        transaction_id="txn_test_human_pmt_01",
        customer_id="cust_test_risk_01",
        amount=7500.0,
        currency="INR",
        payment_method="card",
        failure_reason_code="risk_check_failed",
        attempt_number=1,
        customer_contact_prefs={"email": "test@domain.com"},
        previous_successful_payments=3,
        payment_status="pending",
    )
    db_session.merge(payment)
    db_session.commit()

    mock_client = MagicMock()
    mock_client.order.create.return_value = {"id": "order_HumanOverride123", "status": "created"}

    req = HumanActionRequest(
        record_type="payment",
        record_id="txn_test_human_pmt_01",
        action="override_retry",
        note="Customer verified KYC via phone, override approved",
    )

    with patch("app.engine.executor._get_razorpay_client", return_value=mock_client):
        resp = execute_human_action(req, db_session)

    assert resp.success is True
    assert resp.blocked_by_guardrail is False
    assert resp.action_taken == "override_retry"
    assert resp.resulting_status == "retry_executed"
    assert resp.stamp_text == "OVERRIDE RETRY EXECUTED"
    assert resp.razorpay_order_id == "order_HumanOverride123"

    # Verify AuditLog
    audit = db_session.query(AuditLog).filter_by(transaction_id="txn_test_human_pmt_01", actor="human_operator").first()
    assert audit is not None
    assert "authorized payment retry" in audit.detail


def test_human_action_stats_endpoint(db_session):
    stats = get_human_action_stats(db_session)
    assert stats.total_actions >= 3
    assert stats.marked_resolved_count >= 1
    assert stats.override_retry_count >= 2
    assert stats.overrides_blocked_by_guardrails >= 1

