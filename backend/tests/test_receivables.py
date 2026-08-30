from datetime import datetime, timedelta
import pytest

from app.models import OverdueInvoice
from app.engine.diagnoser import DiagnosisResult, diagnose_receivable
from app.engine.policy_engine import decide_receivable
from app.engine.executor import execute_receivable


def make_invoice(
    days_overdue: int = 10,
    previous_payment_history: str = "always_on_time",
    escalation_stage: str = "none",
    relationship_value_tier: str = "standard",
    touch_count: int = 0,
    promise_to_pay_date: datetime = None,
    amount: float = 85000.0,
) -> OverdueInvoice:
    now = datetime.utcnow()
    return OverdueInvoice(
        invoice_id="inv_test_rec_101",
        business_customer_id="Acme Traders Pvt Ltd",
        invoice_amount=amount,
        currency="INR",
        due_date=now - timedelta(days=days_overdue),
        days_overdue=days_overdue,
        previous_payment_history=previous_payment_history,
        escalation_stage=escalation_stage,
        promise_to_pay_date=promise_to_pay_date,
        relationship_value_tier=relationship_value_tier,
        touch_count=touch_count,
        recovery_attempted=False,
    )


# --- 1. Test Guardrails ---

def test_strategic_tier_escalates_to_human_immediately():
    invoice = make_invoice(relationship_value_tier="strategic", escalation_stage="none")
    diagnosis = DiagnosisResult(root_cause="likely_oversight", confidence=0.95, reasoning="Good customer", source="gemini")
    decision = decide_receivable(invoice, diagnosis, cycle_number=1)
    
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "strategic accounts get white-glove human handling" in decision.reason


def test_dispute_risk_escalates_to_human_immediately():
    invoice = make_invoice(relationship_value_tier="standard", escalation_stage="none")
    diagnosis = DiagnosisResult(root_cause="dispute_risk", confidence=0.90, reasoning="Customer disputed invoice terms.", source="gemini")
    decision = decide_receivable(invoice, diagnosis, cycle_number=1)
    
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "potential dispute requires human judgment" in decision.reason


def test_touch_count_limit_escalates_to_human():
    invoice = make_invoice(touch_count=4, escalation_stage="reminder_sent")
    diagnosis = DiagnosisResult(root_cause="likely_oversight", confidence=0.95, reasoning="Overdue", source="gemini")
    decision = decide_receivable(invoice, diagnosis, cycle_number=2)
    
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "automated touch limit reached (4 touches)" in decision.reason


# --- 2. Test Collections Escalation Ladder ---

def test_first_touch_sends_gentle_reminder():
    invoice = make_invoice(days_overdue=8, escalation_stage="none", touch_count=0)
    diagnosis = DiagnosisResult(root_cause="likely_oversight", confidence=0.95, reasoning="Early overdue", source="gemini")
    decision = decide_receivable(invoice, diagnosis, cycle_number=1)
    
    assert decision.action == "send_reminder"
    assert decision.allowed is True
    assert "first touch, gentle reminder appropriate" in decision.reason


def test_second_touch_sends_firm_notice_when_overdue_exceeds_20_days():
    invoice = make_invoice(days_overdue=25, escalation_stage="reminder_sent", touch_count=1)
    diagnosis = DiagnosisResult(root_cause="reliable_but_slow", confidence=0.92, reasoning="Late payment", source="gemini")
    decision = decide_receivable(invoice, diagnosis, cycle_number=1)
    
    assert decision.action == "send_firm_notice"
    assert decision.allowed is True
    assert "reminder unanswered" in decision.reason


def test_promise_captured_pending_maturity_holds():
    now = datetime.utcnow()
    # Promise set for future relative to cycle simulated date
    future_promise = now + timedelta(days=10)
    invoice = make_invoice(days_overdue=10, escalation_stage="promise_captured", promise_to_pay_date=future_promise)
    diagnosis = DiagnosisResult(root_cause="reliable_but_slow", confidence=0.90, reasoning="Promise given", source="gemini")
    decision = decide_receivable(invoice, diagnosis, cycle_number=1)
    
    assert decision.action == "hold"
    assert decision.allowed is False
    assert "active promise-to-pay pending maturity" in decision.reason


def test_promise_captured_past_due_escalates_broken_promise():
    now = datetime.utcnow()
    # Promise was in past
    past_promise = now - timedelta(days=5)
    invoice = make_invoice(days_overdue=30, escalation_stage="promise_captured", promise_to_pay_date=past_promise)
    diagnosis = DiagnosisResult(root_cause="reliable_but_slow", confidence=0.90, reasoning="Promise broken", source="gemini")
    decision = decide_receivable(invoice, diagnosis, cycle_number=2)
    
    assert decision.action == "escalate_broken_promise"
    assert decision.allowed is True
    assert "promise-to-pay date passed without payment" in decision.reason


def test_broken_promise_escalates_to_human():
    invoice = make_invoice(days_overdue=40, escalation_stage="broken_promise")
    diagnosis = DiagnosisResult(root_cause="reliable_but_slow", confidence=0.90, reasoning="Broken", source="gemini")
    decision = decide_receivable(invoice, diagnosis, cycle_number=3)
    
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "broken promise requires human relationship management" in decision.reason


# --- 3. Test Executor ---

def test_executor_strategic_escalate_to_human():
    invoice = make_invoice(relationship_value_tier="strategic")
    decision = decide_receivable(
        invoice,
        DiagnosisResult(root_cause="likely_oversight", confidence=0.95, reasoning="Strategic", source="gemini"),
        cycle_number=1,
    )
    result = execute_receivable(invoice, decision, cycle_number=1)
    
    assert invoice.escalation_stage == "human_handoff"
    assert invoice.recovery_attempted is True
    assert result.status == "escalated"


def test_executor_escalate_broken_promise_transitions_stage():
    invoice = make_invoice(escalation_stage="promise_captured", promise_to_pay_date=datetime.utcnow() - timedelta(days=2))
    decision = decide_receivable(
        invoice,
        DiagnosisResult(root_cause="reliable_but_slow", confidence=0.90, reasoning="Broken", source="gemini"),
        cycle_number=2,
    )
    result = execute_receivable(invoice, decision, cycle_number=2)
    
    assert invoice.escalation_stage == "broken_promise"
    assert result.status == "broken_promise_escalated"
