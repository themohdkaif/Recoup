from dataclasses import dataclass
from typing import Optional, Any
from app.models import FailedPayment, CheckoutAbandonment, FailedMandate, OverdueInvoice
from app.engine.policy_engine import PolicyDecision
from app.engine.diagnoser import DiagnosisResult


@dataclass
class CounterfactualResult:
    guardrail_type: str
    naive_action: str
    naive_would_have_contacted: bool
    additional_contacts_prevented: int
    compliance_risk: bool
    reasoning: str
    record_amount: float


def compute_counterfactual(
    record: Any,
    real_decision: PolicyDecision,
    flow_type: str,
    diagnosis: Optional[DiagnosisResult] = None,
) -> Optional[CounterfactualResult]:
    """
    Computes for any guardrail-triggered decision what a NAIVE agent
    (with no guardrails that always blindly retries / contacts) would have done instead.
    """
    # 1. CONSENT HARD-STOP (mandate, customer_paused_mandate or customer_declined_consent)
    if flow_type == "mandate":
        failure_code = getattr(record, "mandate_failure_code", "")
        root_cause = diagnosis.root_cause if diagnosis else ""
        if failure_code == "customer_paused_mandate" or root_cause == "customer_declined_consent" or real_decision.action == "permanently_stop":
            attempt = getattr(record, "retry_attempt_number", 1)
            prevented = max(1, 3 - attempt)
            return CounterfactualResult(
                guardrail_type="consent_hard_stop",
                naive_action="would have continued retry sequence",
                naive_would_have_contacted=True,
                additional_contacts_prevented=prevented,
                compliance_risk=True,
                reasoning="a naive agent has no concept of consent revocation and would continue contacting a customer who explicitly withdrew authorization — this is a compliance and trust risk regardless of the specific regulatory framework in play",
                record_amount=float(getattr(record, "amount", 0.0)),
            )

    # 2. STRATEGIC TIER BYPASS (receivable, relationship_value_tier == "strategic")
    if flow_type == "receivable":
        tier = getattr(record, "relationship_value_tier", "")
        if tier == "strategic" or real_decision.action == "human_handoff" and getattr(record, "days_overdue", 0) <= 30:
            return CounterfactualResult(
                guardrail_type="strategic_tier_bypass",
                naive_action="would have run standard automated dunning ladder (reminder → firm notice → broken promise)",
                naive_would_have_contacted=True,
                additional_contacts_prevented=3,
                compliance_risk=False,
                reasoning="A naive agent would apply the same automated collections tone to a strategic account as a standard one, risking high-value enterprise relationships.",
                record_amount=float(getattr(record, "invoice_amount", 0.0)),
            )

    # 3. LOW CART VALUE HOLD (checkout, cart_value < 300)
    if flow_type == "checkout":
        cart_value = float(getattr(record, "cart_value", 0.0))
        if cart_value < 300.0 or real_decision.action == "hold_no_action":
            return CounterfactualResult(
                guardrail_type="low_cart_value_hold",
                naive_action="would have sent a recovery nudge regardless of cost-effectiveness",
                naive_would_have_contacted=True,
                additional_contacts_prevented=1,
                compliance_risk=False,
                reasoning="Cost of the recovery message likely exceeds the gross margin on a sub-₹300 cart.",
                record_amount=cart_value,
            )

    # 4. RISK-FLAGGED ESCALATION (payment, risk_check_failed or root_cause == risk_flagged)
    if flow_type == "payment":
        code = getattr(record, "failure_reason_code", "")
        root_cause = diagnosis.root_cause if diagnosis else ""
        if code == "risk_check_failed" or root_cause == "risk_flagged" or real_decision.action == "escalate_to_human":
            return CounterfactualResult(
                guardrail_type="risk_flagged_escalation",
                naive_action="would have auto-retried a transaction flagged for fraud/risk review",
                naive_would_have_contacted=True,
                additional_contacts_prevented=1,
                compliance_risk=True,
                reasoning="retrying a transaction flagged for risk without human review bypasses the fraud-review step that exists specifically to catch this kind of case",
                record_amount=float(getattr(record, "amount", 0.0)),
            )

    # 5. LOW-CONFIDENCE HOLD (confidence < 0.50)
    if diagnosis and diagnosis.confidence is not None and diagnosis.confidence < 0.50:
        amt = float(getattr(record, "amount", 0.0) or getattr(record, "cart_value", 0.0) or getattr(record, "invoice_amount", 0.0))
        return CounterfactualResult(
            guardrail_type="low_confidence_hold",
            naive_action="would have retried anyway based on the raw signal alone",
            naive_would_have_contacted=True,
            additional_contacts_prevented=1,
            compliance_risk=False,
            reasoning="A naive agent has no confidence threshold and acts on any signal regardless of certainty.",
            record_amount=amt,
        )

    # 6. BROKEN PROMISE / MAX TOUCH LIMIT (receivable broken promise or excessive touches)
    if flow_type == "receivable":
        stage = getattr(record, "escalation_stage", "")
        touches = getattr(record, "touch_count", 0)
        if stage == "broken_promise" or touches >= 2:
            prevented = max(1, 8 - touches)
            return CounterfactualResult(
                guardrail_type="broken_promise_limit",
                naive_action="would have kept sending automated reminders indefinitely",
                naive_would_have_contacted=True,
                additional_contacts_prevented=prevented,
                compliance_risk=False,
                reasoning="A naive agent without a touch limit or broken-promise rule would keep automating contact indefinitely, risking harassment complaints and debtor fatigue.",
                record_amount=float(getattr(record, "invoice_amount", 0.0)),
            )

    return None
