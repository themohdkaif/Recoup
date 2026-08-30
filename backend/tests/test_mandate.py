from unittest.mock import MagicMock, patch
import pytest

from app.models import FailedMandate
from app.engine.diagnoser import DiagnosisResult, diagnose_mandate
from app.engine.policy_engine import decide_mandate
from app.engine.executor import execute_mandate


def make_mandate(
    mandate_failure_code: str = "insufficient_balance",
    retry_attempt_number: int = 1,
    last_successful_charge_days_ago: int = 15,
    amount: float = 999.0,
    recovery_attempted: bool = False,
) -> FailedMandate:
    return FailedMandate(
        mandate_id="mdt_test_mandate_101",
        customer_id="cust_test_m1",
        subscription_plan="Pro Monthly",
        amount=amount,
        currency="INR",
        mandate_failure_code=mandate_failure_code,
        retry_attempt_number=retry_attempt_number,
        last_successful_charge_days_ago=last_successful_charge_days_ago,
        recovery_attempted=recovery_attempted,
    )


# --- 1. Test Unbypassable Consent Hard-Stop ---

def test_diagnose_mandate_hard_codes_consent_precheck():
    mandate = make_mandate(mandate_failure_code="customer_paused_mandate")
    diagnosis = diagnose_mandate(mandate)
    assert diagnosis.root_cause == "customer_declined_consent"
    assert diagnosis.confidence == 1.0
    assert "Consent revoked" in diagnosis.reasoning


def test_consent_hard_stop_cannot_be_overridden_in_policy():
    mandate = make_mandate(mandate_failure_code="customer_paused_mandate", retry_attempt_number=1)
    diagnosis = DiagnosisResult(
        root_cause="customer_declined_consent",
        confidence=0.10,  # Even with low confidence, consent rule is absolute
        reasoning="Customer revoked autopay consent.",
        source="fallback_rules",
    )
    decision = decide_mandate(mandate, diagnosis)
    assert decision.action == "permanently_stop"
    assert decision.allowed is False
    assert "compliance hard-stop" in decision.reason
    assert decision.backoff_days is None


def test_consent_hard_stop_executor_locks_record_and_makes_zero_api_calls():
    mandate = make_mandate(mandate_failure_code="customer_paused_mandate", recovery_attempted=False)
    decision = decide_mandate(
        mandate,
        DiagnosisResult(root_cause="customer_declined_consent", confidence=1.0, reasoning="Revoked", source="fallback_rules")
    )
    mock_client = MagicMock()
    with patch("app.engine.executor._get_razorpay_client", return_value=mock_client):
        result = execute_mandate(mandate, decision)

        assert mandate.recovery_attempted is True
        assert result.status == "permanently_stopped"
        assert "hard-stop" in result.detail.lower()
        mock_client.order.create.assert_not_called()


# --- 2. Test Policy Guardrails & Escalations ---

def test_mandate_retry_sequence_exhaustion_escalates():
    mandate = make_mandate(retry_attempt_number=4)
    diagnosis = DiagnosisResult(
        root_cause="temporary_balance_issue",
        confidence=0.95,
        reasoning="Low balance on attempt 4.",
        source="gemini",
    )
    decision = decide_mandate(mandate, diagnosis)
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "mandate retry sequence exhausted" in decision.reason


def test_mandate_lapsed_customer_churn_escalates():
    mandate = make_mandate(last_successful_charge_days_ago=210)  # > 180 days
    diagnosis = DiagnosisResult(
        root_cause="temporary_balance_issue",
        confidence=0.90,
        reasoning="Long-term lapsed subscription.",
        source="gemini",
    )
    decision = decide_mandate(mandate, diagnosis)
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "customer likely churned" in decision.reason


def test_mandate_repeated_bank_rejection_escalates():
    mandate = make_mandate(retry_attempt_number=2)
    diagnosis = DiagnosisResult(
        root_cause="bank_rejection",
        confidence=0.90,
        reasoning="Bank rejected second attempt.",
        source="gemini",
    )
    decision = decide_mandate(mandate, diagnosis)
    assert decision.action == "escalate_to_human"
    assert decision.allowed is True
    assert "repeated bank rejection" in decision.reason


# --- 3. Test Exponential Backoff Computation ---

@pytest.mark.parametrize(
    "attempt,expected_backoff",
    [
        (1, 1),
        (2, 3),
        (3, 7),
    ],
)
def test_mandate_exponential_backoff_schedule(attempt, expected_backoff):
    mandate = make_mandate(retry_attempt_number=attempt, last_successful_charge_days_ago=20)
    diagnosis = DiagnosisResult(
        root_cause="temporary_balance_issue",
        confidence=0.95,
        reasoning="Temporary balance issue.",
        source="gemini",
    )
    decision = decide_mandate(mandate, diagnosis)
    assert decision.action == "retry_mandate_charge"
    assert decision.allowed is True
    assert decision.backoff_days == expected_backoff
    assert f"attempt {attempt}/4" in decision.reason


# --- 4. Test Executor Sequenced Retry ---

def test_executor_mandate_retry_creates_order_and_increments_attempt():
    mandate = make_mandate(amount=999.0, retry_attempt_number=1, recovery_attempted=False)
    decision = decide_mandate(
        mandate,
        DiagnosisResult(root_cause="temporary_balance_issue", confidence=0.95, reasoning="Balance", source="gemini")
    )

    mock_client = MagicMock()
    mock_client.order.create.return_value = {"id": "order_MandateRetry123", "status": "created"}

    with patch("app.engine.executor._get_razorpay_client", return_value=mock_client):
        result = execute_mandate(mandate, decision)

        assert result.status == "recovery_order_created"
        assert result.razorpay_order_id == "order_MandateRetry123"
        assert mandate.retry_attempt_number == 2  # Incremented from 1 to 2
        assert mandate.recovery_attempted is True
        mock_client.order.create.assert_called_once()
        call_args = mock_client.order.create.call_args[1]["data"]
        assert call_args["amount"] == 99900  # Amount in paise
        assert "mdt_test_mandate_101" in call_args["receipt"]
