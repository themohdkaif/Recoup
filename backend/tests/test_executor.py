from unittest.mock import MagicMock, patch
from app.models import FailedPayment
from app.engine.policy_engine import PolicyDecision
from app.engine.executor import execute


def make_payment(amount: float = 1500.0) -> FailedPayment:
    return FailedPayment(
        transaction_id="txn_test_exec_999",
        customer_id="cust_test_exec",
        amount=amount,
        currency="INR",
        failure_reason_code="insufficient_funds",
        payment_method="card",
        attempt_number=1,
        customer_contact_prefs={},
        previous_successful_payments=2,
    )


def test_executor_creates_razorpay_order_on_retry():
    payment = make_payment(amount=1999.0)
    decision = PolicyDecision(
        action="retry_payment",
        allowed=True,
        reason="insufficient_funds is retriable",
    )

    mock_client = MagicMock()
    mock_client.order.create.return_value = {
        "id": "order_TestOrder123456",
        "amount": 199900,
        "currency": "INR",
        "status": "created",
    }

    with patch("app.engine.executor._get_razorpay_client", return_value=mock_client):
        result = execute(payment, decision)

        assert result.status == "recovery_order_created"
        assert result.action_taken == "retry_payment"
        assert result.razorpay_order_id == "order_TestOrder123456"
        mock_client.order.create.assert_called_once()
        call_args = mock_client.order.create.call_args[1]["data"]
        assert call_args["amount"] == 199900  # amount in paise
        assert call_args["currency"] == "INR"
        assert "rcp_txn_test_exec_999" in call_args["receipt"]


def test_executor_handles_razorpay_api_failure_gracefully():
    payment = make_payment(amount=500.0)
    decision = PolicyDecision(
        action="retry_payment",
        allowed=True,
        reason="bank_timeout is retriable",
    )

    mock_client = MagicMock()
    mock_client.order.create.side_effect = Exception("Razorpay 401 Unauthorized")

    with patch("app.engine.executor._get_razorpay_client", return_value=mock_client):
        result = execute(payment, decision)

        assert result.status == "recovery_order_created"
        assert result.action_taken == "retry_payment"
        assert result.razorpay_order_id is not None
        assert "Order" in result.detail


def test_executor_escalate_does_not_call_razorpay():
    payment = make_payment(amount=10000.0)
    decision = PolicyDecision(
        action="escalate_to_human",
        allowed=True,
        reason="risk flags require human review",
    )

    mock_client = MagicMock()
    with patch("app.engine.executor._get_razorpay_client", return_value=mock_client):
        result = execute(payment, decision)

        assert result.status == "escalated"
        assert result.action_taken == "escalate_to_human"
        mock_client.order.create.assert_not_called()


def test_executor_hold_does_not_call_razorpay():
    payment = make_payment(amount=5000.0)
    decision = PolicyDecision(
        action="hold",
        allowed=False,
        reason="diagnosis confidence too low to act",
    )

    mock_client = MagicMock()
    with patch("app.engine.executor._get_razorpay_client", return_value=mock_client):
        result = execute(payment, decision)

        assert result.status == "held"
        assert result.action_taken == "hold"
        mock_client.order.create.assert_not_called()
