import pytest
from app.models import FailedPayment
from app.engine.diagnoser import DiagnosisResult
from app.engine.policy_engine import decide, MAX_RETRY_ATTEMPTS


def make_payment(
    attempt_number: int = 1,
    failure_reason_code: str = "insufficient_funds",
    amount: float = 1000.0,
) -> FailedPayment:
    return FailedPayment(
        transaction_id="txn_test_123",
        customer_id="cust_test_1",
        amount=amount,
        currency="INR",
        failure_reason_code=failure_reason_code,
        payment_method="upi",
        attempt_number=attempt_number,
        customer_contact_prefs={},
        previous_successful_payments=5,
    )


# --- 1. Test All 6 Root Cause Taxonomy Values ---

def test_root_cause_insufficient_funds_retries():
    payment = make_payment(attempt_number=1)
    diagnosis = DiagnosisResult(
        root_cause="insufficient_funds",
        confidence=0.95,
        reasoning="Customer account had insufficient balance.",
        source="gemini",
    )
    decision = decide(payment, diagnosis)
    assert decision.action == "retry_payment"
    assert decision.allowed is True
    assert "insufficient_funds is retriable" in decision.reason


def test_root_cause_bank_timeout_retries():
    payment = make_payment(attempt_number=1)
    diagnosis = DiagnosisResult(
        root_cause="bank_timeout",
        confidence=0.92,
        reasoning="Issuer bank gateway timed out.",
        source="gemini",
    )
    decision = decide(payment, diagnosis)
    assert decision.action == "retry_payment"
    assert decision.allowed is True
    assert "bank_timeout is retriable" in decision.reason


def test_root_cause_card_issue_retries():
    payment = make_payment(attempt_number=1)
    diagnosis = DiagnosisResult(
        root_cause="card_issue",
        confidence=0.90,
        reasoning="Card decline on attempt 1.",
        source="gemini",
    )
    decision = decide(payment, diagnosis)
    assert decision.action == "retry_payment"
    assert decision.allowed is True
    assert "card_issue is retriable" in decision.reason


def test_root_cause_network_issue_retries():
    payment = make_payment(attempt_number=1)
    diagnosis = DiagnosisResult(
        root_cause="network_issue",
        confidence=0.88,
        reasoning="Network packet drop during handshake.",
        source="gemini",
    )
    decision = decide(payment, diagnosis)
    assert decision.action == "retry_payment"
    assert decision.allowed is True
    assert "network_issue is retriable" in decision.reason


def test_root_cause_risk_flagged_escalates_to_human():
    payment = make_payment(attempt_number=1)
    diagnosis = DiagnosisResult(
        root_cause="risk_flagged",
        confidence=0.99,
        reasoning="High-risk velocity pattern detected.",
        source="gemini",
    )
    decision = decide(payment, diagnosis)
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "risk flags require human review, never auto-retry" in decision.reason


def test_root_cause_unknown_escalates_to_human():
    payment = make_payment(attempt_number=1)
    diagnosis = DiagnosisResult(
        root_cause="unknown",
        confidence=0.95,
        reasoning="Unrecognized failure signature.",
        source="gemini",
    )
    decision = decide(payment, diagnosis)
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "diagnosis inconclusive, requires human review" in decision.reason


# --- 2. Test Edge Cases & Guardrail Precedence ---

def test_max_retry_attempts_reached_escalates():
    # Even if root cause is a retriable one (e.g. bank_timeout), attempt >= 3 must escalate
    payment = make_payment(attempt_number=MAX_RETRY_ATTEMPTS)
    diagnosis = DiagnosisResult(
        root_cause="bank_timeout",
        confidence=0.99,
        reasoning="Issuer bank timed out.",
        source="gemini",
    )
    decision = decide(payment, diagnosis)
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "max retry attempts reached" in decision.reason


def test_low_confidence_diagnosis_holds():
    # If confidence < 0.5 on a retriable cause, hold execution
    payment = make_payment(attempt_number=1)
    diagnosis = DiagnosisResult(
        root_cause="insufficient_funds",
        confidence=0.45,
        reasoning="Ambiguous failure telemetry.",
        source="gemini",
    )
    decision = decide(payment, diagnosis)
    assert decision.action == "hold"
    assert decision.allowed is False
    assert "diagnosis confidence too low to act" in decision.reason


def test_low_confidence_on_risk_flagged_still_escalates():
    # Risk flags take precedence over low confidence hold
    payment = make_payment(attempt_number=1)
    diagnosis = DiagnosisResult(
        root_cause="risk_flagged",
        confidence=0.30,
        reasoning="Potential fraud alert.",
        source="gemini",
    )
    decision = decide(payment, diagnosis)
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "risk flags require human review, never auto-retry" in decision.reason


def test_low_confidence_on_unknown_still_escalates():
    # Inconclusive / unknown takes precedence over low confidence hold
    payment = make_payment(attempt_number=1)
    diagnosis = DiagnosisResult(
        root_cause="unknown",
        confidence=0.20,
        reasoning="Cannot determine cause.",
        source="gemini",
    )
    decision = decide(payment, diagnosis)
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "diagnosis inconclusive, requires human review" in decision.reason
