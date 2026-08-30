import pytest
from app.models import CheckoutAbandonment, FailedMandate
from app.engine.hinglish_nudge import generate_hinglish_nudge, _get_fallback_nudge


def test_fallback_hinglish_checkout():
    session = CheckoutAbandonment(
        session_id="sess_test_hinglish",
        customer_id="cust_test",
        cart_value=1499.0,
        items_count=2,
        abandoned_at_step="shipping_info",
    )
    fallback = _get_fallback_nudge(session, "checkout")
    assert "cart" in fallback["hinglish_text"].lower()
    assert "1,499" in fallback["hinglish_text"]
    assert "1,499" in fallback["english_reference"]
    assert fallback["source"] == "fallback_template"


def test_fallback_hinglish_mandate():
    mandate = FailedMandate(
        mandate_id="mdt_test_hinglish",
        customer_id="cust_test_2",
        subscription_plan="pro_tier",
        amount=499.0,
        currency="INR",
        mandate_failure_code="insufficient_balance",
        retry_attempt_number=1,
    )
    fallback = _get_fallback_nudge(mandate, "mandate")
    assert "subscription" in fallback["hinglish_text"].lower()
    assert "499" in fallback["hinglish_text"]
    assert "499" in fallback["english_reference"]
    assert fallback["source"] == "fallback_template"


def test_generate_hinglish_nudge_structure():
    session = CheckoutAbandonment(
        session_id="sess_test_2",
        customer_id="cust_test_3",
        cart_value=2500.0,
        items_count=3,
        abandoned_at_step="review",
    )
    res = generate_hinglish_nudge(session, "checkout")
    assert "hinglish_text" in res
    assert "english_reference" in res
    assert len(res["hinglish_text"]) > 10
    assert len(res["english_reference"]) > 10
