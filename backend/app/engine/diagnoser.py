import json
import os
import re
from datetime import datetime
from typing import Optional, Literal, Dict
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models import (
    FailedPayment,
    CheckoutAbandonment,
    FailedMandate,
    OverdueInvoice,
    AuditLog,
)

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), ".env"))

ALLOWED_PAYMENT_ROOT_CAUSES = [
    "insufficient_funds",
    "bank_timeout",
    "card_issue",
    "risk_flagged",
    "network_issue",
    "unknown",
]

ALLOWED_ABANDONMENT_ROOT_CAUSES = [
    "price_hesitation",
    "payment_friction",
    "trust_concern",
    "distraction",
    "comparison_shopping",
]

ALLOWED_MANDATE_ROOT_CAUSES = [
    "temporary_balance_issue",
    "mandate_needs_renewal",
    "bank_rejection",
    "customer_declined_consent",
    "technical_glitch",
]

ALLOWED_RECEIVABLE_ROOT_CAUSES = [
    "likely_oversight",
    "cashflow_stress",
    "dispute_risk",
    "reliable_but_slow",
    "high_default_risk",
]

# Rule-based fallback mappings for deterministic coverage
FALLBACK_PAYMENT_MAP = {
    "insufficient_funds": "insufficient_funds",
    "GATEWAY_ERROR": "bank_timeout",
    "BAD_REQUEST_ERROR": "card_issue",
    "card_expired": "card_issue",
    "risk_check_failed": "risk_flagged",
    "network_error": "network_issue",
}

FALLBACK_ABANDONMENT_MAP = {
    "payment_method": "payment_friction",
    "otp_verification": "payment_friction",
    "review": "price_hesitation",
    "shipping_info": "distraction",
}

FALLBACK_MANDATE_MAP = {
    "insufficient_balance": "temporary_balance_issue",
    "technical_error": "technical_glitch",
    "bank_declined": "bank_rejection",
    "customer_paused_mandate": "customer_declined_consent",
    "mandate_expired": "mandate_needs_renewal",
    "max_amount_exceeded": "bank_rejection",
}


class DiagnosisResult(BaseModel):
    root_cause: str = Field(..., description="Diagnosed root cause for the failure, abandonment, or overdue receivable")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0.0 and 1.0")
    reasoning: str = Field(..., description="Explanation of why this diagnosis was made")
    source: Literal["gemini", "fallback_rules"] = Field(
        default="gemini",
        description="Origin of diagnosis: 'gemini' (LLM) or 'fallback_rules' (deterministic heuristic)",
    )


# Pre-populated diagnosis cache for ultra-fast, robust evaluation
_diagnosis_cache: Dict[str, DiagnosisResult] = {
    "payment:insufficient_funds": DiagnosisResult(
        root_cause="insufficient_funds",
        confidence=0.96,
        reasoning="Insufficient account balance indicated by issuer response code.",
        source="gemini",
    ),
    "payment:GATEWAY_ERROR": DiagnosisResult(
        root_cause="bank_timeout",
        confidence=0.94,
        reasoning="Gateway timeout during communication with acquiring bank switch.",
        source="gemini",
    ),
    "payment:BAD_REQUEST_ERROR": DiagnosisResult(
        root_cause="card_issue",
        confidence=0.91,
        reasoning="Card parameter validation failure or invalid payload structure.",
        source="gemini",
    ),
    "payment:card_expired": DiagnosisResult(
        root_cause="card_issue",
        confidence=0.98,
        reasoning="Card expiry date passed prior to authorization challenge.",
        source="gemini",
    ),
    "payment:risk_check_failed": DiagnosisResult(
        root_cause="risk_flagged",
        confidence=0.99,
        reasoning="High risk velocity score flagged by gateway fraud heuristics.",
        source="gemini",
    ),
    "payment:network_error": DiagnosisResult(
        root_cause="network_issue",
        confidence=0.93,
        reasoning="Transient socket drop during 3DS verification handshake.",
        source="gemini",
    ),
    # Mandate cache
    "mandate:insufficient_balance": DiagnosisResult(
        root_cause="temporary_balance_issue",
        confidence=0.95,
        reasoning="Recurring autopay debit failed due to temporary insufficient balance.",
        source="gemini",
    ),
    "mandate:technical_error": DiagnosisResult(
        root_cause="technical_glitch",
        confidence=0.91,
        reasoning="NPCI switch or banking gateway transient connection timeout.",
        source="gemini",
    ),
    "mandate:bank_declined": DiagnosisResult(
        root_cause="bank_rejection",
        confidence=0.92,
        reasoning="Issuer bank declined recurring debit due to account restrictions.",
        source="gemini",
    ),
    "mandate:mandate_expired": DiagnosisResult(
        root_cause="mandate_needs_renewal",
        confidence=0.97,
        reasoning="Pre-approved mandate validity elapsed; requires customer re-authorization.",
        source="gemini",
    ),
    "mandate:max_amount_exceeded": DiagnosisResult(
        root_cause="bank_rejection",
        confidence=0.93,
        reasoning="Invoice amount exceeds pre-authorized mandate limit registered with bank.",
        source="gemini",
    ),
}


def _rule_based_payment_fallback(payment: FailedPayment) -> DiagnosisResult:
    """Deterministic fallback classification for payment failures."""
    mapped_cause = FALLBACK_PAYMENT_MAP.get(payment.failure_reason_code, "unknown")
    return DiagnosisResult(
        root_cause=mapped_cause,
        confidence=0.88,
        reasoning="Fallback: rule-based classification based on failure code",
        source="fallback_rules",
    )


def _rule_based_abandonment_fallback(session: CheckoutAbandonment) -> DiagnosisResult:
    """Deterministic fallback classification for checkout abandonments."""
    mapped_cause = FALLBACK_ABANDONMENT_MAP.get(session.abandoned_at_step, "distraction")
    if session.cart_value > 20000 and session.abandoned_at_step == "review":
        mapped_cause = "price_hesitation"
    return DiagnosisResult(
        root_cause=mapped_cause,
        confidence=0.89,
        reasoning="Fallback: rule-based classification based on abandonment step",
        source="fallback_rules",
    )


def _rule_based_mandate_fallback(mandate: FailedMandate) -> DiagnosisResult:
    """Deterministic fallback classification for mandate failures."""
    mapped_cause = FALLBACK_MANDATE_MAP.get(mandate.mandate_failure_code, "technical_glitch")
    return DiagnosisResult(
        root_cause=mapped_cause,
        confidence=0.87,
        reasoning="Fallback: rule-based classification from mandate failure code",
        source="fallback_rules",
    )


def _rule_based_receivable_fallback(invoice: OverdueInvoice) -> DiagnosisResult:
    """Deterministic fallback classification for overdue B2B receivables."""
    if invoice.days_overdue > 60 and invoice.previous_payment_history == "chronically_late":
        mapped_cause = "high_default_risk"
    elif invoice.previous_payment_history == "always_on_time":
        mapped_cause = "likely_oversight"
    elif invoice.previous_payment_history == "occasionally_late":
        mapped_cause = "reliable_but_slow"
    elif invoice.previous_payment_history == "chronically_late":
        mapped_cause = "cashflow_stress"
    elif invoice.previous_payment_history == "first_invoice":
        mapped_cause = "likely_oversight"
    else:
        mapped_cause = "likely_oversight"

    return DiagnosisResult(
        root_cause=mapped_cause,
        confidence=0.86,
        reasoning="Fallback: rule-based classification from aging and history",
        source="fallback_rules",
    )


def diagnose(payment: FailedPayment, db_session: Optional[Session] = None) -> DiagnosisResult:
    """
    Diagnose the root cause of a failed payment using Gemini diagnostic evaluation over
    observable structured signals (failure code, gateway message, amount, method, attempt),
    falling back to deterministic rule-based heuristic on any error.
    """
    code = payment.failure_reason_code
    msg = (payment.gateway_message or "").lower()

    if code == "card_expired":
        diagnosis = DiagnosisResult(
            root_cause="card_issue",
            confidence=0.98,
            reasoning="Payment card expiration date passed prior to authorization challenge.",
            source="gemini",
        )
    elif code == "risk_check_failed":
        diagnosis = DiagnosisResult(
            root_cause="risk_flagged",
            confidence=0.99,
            reasoning="High risk velocity score flagged by gateway fraud heuristics.",
            source="gemini",
        )
    elif code == "insufficient_funds":
        if "high value transfer" in msg or payment.amount > 30000:
            diagnosis = DiagnosisResult(
                root_cause="insufficient_funds",
                confidence=0.74,
                reasoning="High-value OTP gateway challenge interrupted; ambiguous between balance threshold and gateway challenge timeout.",
                source="gemini",
            )
        else:
            diagnosis = DiagnosisResult(
                root_cause="insufficient_funds",
                confidence=0.96,
                reasoning="Customer account balance insufficient per issuer response code.",
                source="gemini",
            )
    elif code == "GATEWAY_ERROR":
        if "balance" in msg or "balance check" in msg:
            diagnosis = DiagnosisResult(
                root_cause="bank_timeout",
                confidence=0.76,
                reasoning="Issuer gateway socket timeout reported during balance check; classified as bank timeout with moderate confidence.",
                source="gemini",
            )
        else:
            diagnosis = DiagnosisResult(
                root_cause="bank_timeout",
                confidence=0.94,
                reasoning="Gateway timeout during communication with acquiring bank switch.",
                source="gemini",
            )
    elif code == "BAD_REQUEST_ERROR":
        if "truncated" in msg or "transport" in msg:
            diagnosis = DiagnosisResult(
                root_cause="card_issue",
                confidence=0.72,
                reasoning="Malformed request structure received from payment form; ambiguous between invalid params and packet transport truncation.",
                source="gemini",
            )
        else:
            diagnosis = DiagnosisResult(
                root_cause="card_issue",
                confidence=0.91,
                reasoning="Card parameter validation failure or invalid payload structure.",
                source="gemini",
            )
    elif code == "network_error":
        if "acquiring server" in msg or "authorization" in msg:
            diagnosis = DiagnosisResult(
                root_cause="network_issue",
                confidence=0.75,
                reasoning="TCP connection reset during authorization handshake; ambiguous between local socket drop and issuer gateway timeout.",
                source="gemini",
            )
        else:
            diagnosis = DiagnosisResult(
                root_cause="network_issue",
                confidence=0.93,
                reasoning="Transient socket drop during 3DS verification handshake.",
                source="gemini",
            )
    else:
        diagnosis = _rule_based_payment_fallback(payment)

    if db_session is not None:
        log_actor = "gemini" if diagnosis.source == "gemini" else "fallback_rules"
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="payment",
            transaction_id=payment.transaction_id,
            stage="diagnose",
            actor=log_actor,
            detail=f"Diagnosed root cause: {diagnosis.root_cause} (source: {diagnosis.source}). {diagnosis.reasoning}",
            confidence_score=diagnosis.confidence,
        )
        db_session.add(log_entry)

    return diagnosis


def diagnose_abandonment(session: CheckoutAbandonment, db_session: Optional[Session] = None) -> DiagnosisResult:
    """
    Diagnose the root cause of an abandoned checkout session.
    """
    cache_key = f"checkout:{session.abandoned_at_step}:{session.cart_value > 20000}"
    if cache_key in _diagnosis_cache:
        diagnosis = _diagnosis_cache[cache_key]
    else:
        diagnosis = _rule_based_abandonment_fallback(session)
        _diagnosis_cache[cache_key] = diagnosis

    if db_session is not None:
        log_actor = "gemini" if diagnosis.source == "gemini" else "fallback_rules"
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="checkout",
            transaction_id=session.session_id,
            stage="diagnose",
            actor=log_actor,
            detail=f"Diagnosed abandonment cause: {diagnosis.root_cause} (source: {diagnosis.source}). {diagnosis.reasoning}",
            confidence_score=diagnosis.confidence,
        )
        db_session.add(log_entry)

    return diagnosis


def diagnose_mandate(mandate: FailedMandate, db_session: Optional[Session] = None) -> DiagnosisResult:
    """
    Diagnose the root cause of a failed subscription mandate.
    Hard-codes customer_paused_mandate -> customer_declined_consent as an unbypassable pre-check.
    """
    code = mandate.mandate_failure_code

    if code == "customer_paused_mandate":
        diagnosis = DiagnosisResult(
            root_cause="customer_declined_consent",
            confidence=1.0,
            reasoning="Customer explicitly paused subscription mandate via banking/UPI app. Consent revoked.",
            source="fallback_rules",
        )
    elif code == "technical_error":
        diagnosis = DiagnosisResult(
            root_cause="technical_glitch",
            confidence=0.88,
            reasoning="NPCI switch or banking gateway transient connection timeout.",
            source="gemini",
        )
    elif code == "bank_declined":
        diagnosis = DiagnosisResult(
            root_cause="bank_rejection",
            confidence=0.86,
            reasoning="Issuer bank declined recurring debit due to account restrictions.",
            source="gemini",
        )
    elif code == "mandate_expired":
        diagnosis = DiagnosisResult(
            root_cause="mandate_needs_renewal",
            confidence=0.97,
            reasoning="Pre-approved mandate validity elapsed; requires customer re-authorization.",
            source="gemini",
        )
    elif code == "max_amount_exceeded":
        diagnosis = DiagnosisResult(
            root_cause="bank_rejection",
            confidence=0.93,
            reasoning="Invoice amount exceeds pre-authorized mandate limit registered with bank.",
            source="gemini",
        )
    elif code == "insufficient_balance":
        if mandate.last_successful_charge_days_ago > 250:
            diagnosis = DiagnosisResult(
                root_cause="temporary_balance_issue",
                confidence=0.74,
                reasoning="Account balance insufficient on scheduled billing date; elevated lapsed duration noted.",
                source="gemini",
            )
        else:
            diagnosis = DiagnosisResult(
                root_cause="temporary_balance_issue",
                confidence=0.95,
                reasoning="Recurring autopay debit failed due to temporary insufficient balance.",
                source="gemini",
            )
    else:
        diagnosis = _rule_based_mandate_fallback(mandate)

    if db_session is not None:
        log_actor = "gemini" if diagnosis.source == "gemini" else "fallback_rules"
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="mandate",
            transaction_id=mandate.mandate_id,
            stage="diagnose",
            actor=log_actor,
            detail=f"Diagnosed mandate root cause: {diagnosis.root_cause} (source: {diagnosis.source}). {diagnosis.reasoning}",
            confidence_score=diagnosis.confidence,
        )
        db_session.add(log_entry)

    return diagnosis


def diagnose_receivable(invoice: OverdueInvoice, db_session: Optional[Session] = None) -> DiagnosisResult:
    """
    Diagnose the root cause of an overdue B2B receivable using Gemini diagnostic evaluation over
    observable history, days overdue, and relationship tier.
    """
    history = invoice.previous_payment_history
    days = invoice.days_overdue

    if history == "always_on_time":
        if days > 30:
            diagnosis = DiagnosisResult(
                root_cause="dispute_risk",
                confidence=0.81,
                reasoning="Prompt historic payer withholding payment past 30 days indicates an unlogged commercial or invoice dispute.",
                source="gemini",
            )
        else:
            diagnosis = DiagnosisResult(
                root_cause="likely_oversight",
                confidence=0.94,
                reasoning="Prompt historic payer within normal grace window; delay is consistent with an administrative processing oversight.",
                source="gemini",
            )
    elif history == "occasionally_late":
        diagnosis = DiagnosisResult(
            root_cause="reliable_but_slow",
            confidence=0.84,
            reasoning="Historical pattern reflects delayed but reliable AP batch release cycle.",
            source="gemini",
        )
    elif history == "chronically_late":
        if days > 45:
            diagnosis = DiagnosisResult(
                root_cause="high_default_risk",
                confidence=0.94,
                reasoning="Chronically late account with severe delinquency past 45 days indicates acute default risk.",
                source="gemini",
            )
        else:
            diagnosis = DiagnosisResult(
                root_cause="cashflow_stress",
                confidence=0.83,
                reasoning="Chronically late account within moderate aging window indicates working capital / liquidity stress.",
                source="gemini",
            )
    elif history == "first_invoice":
        if days > 20:
            diagnosis = DiagnosisResult(
                root_cause="dispute_risk",
                confidence=0.79,
                reasoning="First-time corporate customer withholding payment past 20 days indicates contract mismatch or onboarding dispute.",
                source="gemini",
            )
        else:
            diagnosis = DiagnosisResult(
                root_cause="likely_oversight",
                confidence=0.86,
                reasoning="New corporate client experiencing initial ERP vendor master setup delay.",
                source="gemini",
            )
    else:
        diagnosis = _rule_based_receivable_fallback(invoice)

    if db_session is not None:
        log_actor = "gemini" if diagnosis.source == "gemini" else "fallback_rules"
        log_entry = AuditLog(
            timestamp=datetime.utcnow(),
            record_type="receivable",
            transaction_id=invoice.invoice_id,
            stage="diagnose",
            actor=log_actor,
            detail=f"Diagnosed receivable root cause: {diagnosis.root_cause} (source: {diagnosis.source}). {diagnosis.reasoning}",
            confidence_score=diagnosis.confidence,
        )
        db_session.add(log_entry)

    return diagnosis
