from typing import Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session

from app.models import CounterfactualLog
from app.engine.counterfactual import compute_counterfactual, CounterfactualResult
from app.engine.detector import (
    detect_at_risk_payments,
    detect_abandoned_checkouts,
    detect_at_risk_mandates,
    detect_overdue_invoices,
)
from app.engine.diagnoser import (
    diagnose,
    diagnose_abandonment,
    diagnose_mandate,
    diagnose_receivable,
)
from app.engine.policy_engine import (
    decide,
    decide_abandonment,
    decide_mandate,
    decide_receivable,
)
from app.engine.executor import (
    execute,
    execute_abandonment,
    execute_mandate,
    execute_receivable,
)


def _log_counterfactual(db_session: Session, record_type: str, record_id: str, cf_res: CounterfactualResult):
    """Idempotently create or update a counterfactual log record."""
    existing = db_session.query(CounterfactualLog).filter(
        CounterfactualLog.record_type == record_type,
        CounterfactualLog.record_id == record_id,
        CounterfactualLog.guardrail_type == cf_res.guardrail_type,
    ).first()
    if existing:
        existing.timestamp = datetime.utcnow()
        existing.naive_action = cf_res.naive_action
        existing.additional_contacts_prevented = cf_res.additional_contacts_prevented
        existing.compliance_risk = cf_res.compliance_risk
        existing.reasoning = cf_res.reasoning
        existing.record_amount = cf_res.record_amount
    else:
        db_session.add(CounterfactualLog(
            timestamp=datetime.utcnow(),
            record_type=record_type,
            record_id=record_id,
            guardrail_type=cf_res.guardrail_type,
            naive_action=cf_res.naive_action,
            additional_contacts_prevented=cf_res.additional_contacts_prevented,
            compliance_risk=cf_res.compliance_risk,
            reasoning=cf_res.reasoning,
            record_amount=cf_res.record_amount,
        ))


def run_recovery_batch(db_session: Session) -> Dict[str, Any]:
    """
    Run a full recovery evaluation batch across all detected at-risk payments.
    Chains Detector -> Diagnoser -> Policy Engine -> Executor (with test payment capture).
    """
    at_risk_payments = detect_at_risk_payments(db_session)

    total_evaluated = len(at_risk_payments)
    retried_count = 0
    captured_count = 0
    escalated_count = 0
    held_count = 0
    total_amount_at_risk = 0.0
    total_amount_recovery_initiated = 0.0
    total_amount_captured = 0.0

    for payment in at_risk_payments:
        total_amount_at_risk += payment.amount

        diagnosis = diagnose(payment, db_session=db_session)
        decision = decide(payment, diagnosis, db_session=db_session)
        exec_res = execute(payment, decision, db_session=db_session)

        # Counterfactual Evaluation
        cf_res = compute_counterfactual(payment, decision, flow_type="payment", diagnosis=diagnosis)
        if cf_res:
            _log_counterfactual(db_session, "payment", payment.transaction_id, cf_res)

        if decision.action == "retry_payment":
            retried_count += 1
            total_amount_recovery_initiated += payment.amount
            if exec_res.payment_status == "captured":
                captured_count += 1
                total_amount_captured += payment.amount
        elif decision.action == "escalate_to_human":
            escalated_count += 1
        elif decision.action == "hold":
            held_count += 1
        else:
            held_count += 1

    db_session.commit()

    summary = {
        "total_evaluated": total_evaluated,
        "retried": retried_count,
        "captured": captured_count,
        "escalated": escalated_count,
        "held": held_count,
        "total_amount_at_risk": round(total_amount_at_risk, 2),
        "total_amount_recovery_initiated": round(total_amount_recovery_initiated, 2),
        "total_amount_recovered_simulated": round(total_amount_recovery_initiated, 2),
        "total_amount_captured": round(total_amount_captured, 2),
    }

    return summary


def run_abandonment_batch(db_session: Session) -> Dict[str, Any]:
    """
    Run a recovery batch across all unattempted abandoned checkout sessions.
    Chains Detector -> Diagnoser -> Policy Engine -> Executor.
    """
    abandoned_sessions = detect_abandoned_checkouts(db_session)

    total_evaluated = len(abandoned_sessions)
    nudged_count = 0
    escalated_count = 0
    held_count = 0
    total_cart_value_at_risk = 0.0

    for session in abandoned_sessions:
        total_cart_value_at_risk += session.cart_value

        diagnosis = diagnose_abandonment(session, db_session=db_session)
        decision = decide_abandonment(session, diagnosis, db_session=db_session)
        _ = execute_abandonment(session, decision, db_session=db_session)

        # Counterfactual Evaluation
        cf_res = compute_counterfactual(session, decision, flow_type="checkout", diagnosis=diagnosis)
        if cf_res:
            _log_counterfactual(db_session, "checkout", session.session_id, cf_res)

        if decision.action == "send_recovery_nudge":
            nudged_count += 1
        elif decision.action == "escalate_to_human":
            escalated_count += 1
        elif decision.action == "hold":
            held_count += 1

    db_session.commit()

    summary = {
        "total_evaluated": total_evaluated,
        "nudged": nudged_count,
        "escalated": escalated_count,
        "held": held_count,
        "total_cart_value_at_risk": round(total_cart_value_at_risk, 2),
    }

    return summary


def run_mandate_batch(db_session: Session) -> Dict[str, Any]:
    """
    Run a recovery batch across all failed recurring subscription mandates.
    Chains Detector -> Diagnoser -> Policy Engine -> Executor.
    """
    at_risk_mandates = detect_at_risk_mandates(db_session)

    total_evaluated = len(at_risk_mandates)
    retried_count = 0
    permanently_stopped_count = 0
    escalated_count = 0
    total_mrr_at_risk = 0.0

    for mandate in at_risk_mandates:
        total_mrr_at_risk += mandate.amount

        diagnosis = diagnose_mandate(mandate, db_session=db_session)
        decision = decide_mandate(mandate, diagnosis, db_session=db_session)
        _ = execute_mandate(mandate, decision, db_session=db_session)

        # Counterfactual Evaluation
        cf_res = compute_counterfactual(mandate, decision, flow_type="mandate", diagnosis=diagnosis)
        if cf_res:
            _log_counterfactual(db_session, "mandate", mandate.mandate_id, cf_res)

        if decision.action == "retry_mandate_charge":
            retried_count += 1
        elif decision.action == "permanently_stop":
            permanently_stopped_count += 1
        elif decision.action == "escalate_to_human":
            escalated_count += 1

    db_session.commit()

    summary = {
        "total_evaluated": total_evaluated,
        "retried": retried_count,
        "permanently_stopped": permanently_stopped_count,
        "escalated": escalated_count,
        "total_mrr_at_risk": round(total_mrr_at_risk, 2),
    }

    return summary


def run_receivables_batch(db_session: Session, cycle_number: int = 1) -> Dict[str, Any]:
    """
    Run a 7-day collections cycle recovery batch across overdue B2B receivables.
    Chains Detector -> Diagnoser -> Policy Engine -> Executor.
    """
    invoices = detect_overdue_invoices(db_session, cycle_number=cycle_number)

    total_evaluated = len(invoices)
    reminders_sent = 0
    firm_notices_sent = 0
    promises_captured = 0
    broken_promises_caught = 0
    escalated_to_human = 0
    total_amount_at_risk = 0.0
    total_amount_with_active_promise = 0.0

    for invoice in invoices:
        total_amount_at_risk += invoice.invoice_amount

        diagnosis = diagnose_receivable(invoice, db_session=db_session)
        decision = decide_receivable(invoice, diagnosis, cycle_number=cycle_number, db_session=db_session)
        _ = execute_receivable(invoice, decision, cycle_number=cycle_number, db_session=db_session)

        # Counterfactual Evaluation
        cf_res = compute_counterfactual(invoice, decision, flow_type="receivable", diagnosis=diagnosis)
        if cf_res:
            _log_counterfactual(db_session, "receivable", invoice.invoice_id, cf_res)

        if decision.action in ["send_reminder", "reminder_sent"]:
            reminders_sent += 1
        elif decision.action in ["send_firm_notice", "firm_notice"]:
            firm_notices_sent += 1
        elif decision.action == "promise_captured":
            promises_captured += 1
            total_amount_with_active_promise += invoice.invoice_amount
        elif decision.action in ["escalate_broken_promise", "broken_promise"]:
            broken_promises_caught += 1
        elif decision.action in ["escalate_to_human", "human_handoff"]:
            escalated_to_human += 1

    db_session.commit()

    summary = {
        "cycle_number": cycle_number,
        "total_evaluated": total_evaluated,
        "reminders_sent": reminders_sent,
        "firm_notices_sent": firm_notices_sent,
        "promises_captured": promises_captured,
        "broken_promises_caught": broken_promises_caught,
        "escalated_to_human": escalated_to_human,
        "total_amount_at_risk": round(total_amount_at_risk, 2),
        "total_amount_with_active_promise": round(total_amount_with_active_promise, 2),
    }

    return summary
