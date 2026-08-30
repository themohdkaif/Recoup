import re
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db, Base, engine, SessionLocal
from app.models import AuditLog, FailedPayment, CheckoutAbandonment, FailedMandate, OverdueInvoice
from app.engine.pipeline import (
    run_recovery_batch,
    run_abandonment_batch,
    run_mandate_batch,
    run_receivables_batch,
)
from app.engine.metrics import get_unified_summary, UnifiedSummary
from app.engine.policy_engine import (
    decide,
    decide_mandate,
    decide_receivable,
    decide_abandonment,
    PolicyDecision,
)
from app.engine.diagnoser import DiagnosisResult
from app.engine.evaluator import (
    evaluate_diagnosis_accuracy,
    evaluate_all_flows,
    AccuracyReport,
    OverallEvaluationSummary,
)

logger = logging.getLogger("recoup.startup")

# Ensure tables exist
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Recoup Revenue Recovery Engine",
    version="0.1.0",
    description="AI-orchestrated revenue recovery engine",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def verify_database_population_on_startup():
    """Startup safeguard: checks that core tables are populated and logs a prominent warning if empty."""
    db = SessionLocal()
    try:
        p_cnt = db.query(FailedPayment).count()
        c_cnt = db.query(CheckoutAbandonment).count()
        m_cnt = db.query(FailedMandate).count()
        r_cnt = db.query(OverdueInvoice).count()
        
        if p_cnt == 0 or c_cnt == 0 or m_cnt == 0 or r_cnt == 0:
            logger.warning(
                f"⚠️  [DATABASE WARNING] One or more core tables are empty: "
                f"Payments={p_cnt} (exp: 60), Checkout={c_cnt} (exp: 15), Mandates={m_cnt} (exp: 20), Receivables={r_cnt} (exp: 25). "
                f"Run `python3 backend/scripts/seed.py` to populate data."
            )
        else:
            logger.info(
                f"✓ [DATABASE READY] Core tables verified: "
                f"Payments={p_cnt}, Checkout={c_cnt}, Mandates={m_cnt}, Receivables={r_cnt}."
            )
    except Exception as e:
        logger.error(f"⚠️  [DATABASE CHECK ERROR] Startup database verification failed: {e}")
    finally:
        db.close()


class AuditLogResponse(BaseModel):
    id: int
    timestamp: datetime
    record_type: str = "payment"
    transaction_id: Optional[str]
    stage: str
    actor: str
    detail: str
    confidence_score: Optional[float]

    class Config:
        from_attributes = True


class PaymentDetailResponse(BaseModel):
    transaction_id: str
    customer_id: str
    amount: float
    currency: str = "INR"
    payment_method: str
    failure_reason_code: str
    attempt_number: int
    diagnosed_root_cause: Optional[str] = "unknown"
    confidence_score: Optional[float] = None
    action: Optional[str] = "pending"
    execution_status: Optional[str] = "pending"
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    payment_status: Optional[str] = "pending"
    created_at: Optional[datetime] = None


class CapturedPaymentResponse(BaseModel):
    transaction_id: str
    customer_id: str
    amount: float
    currency: str = "INR"
    payment_method: str
    failure_reason_code: str
    diagnosed_root_cause: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: str
    payment_status: str = "captured"
    captured_at: Optional[datetime] = None


class CheckoutDetailResponse(BaseModel):
    session_id: str
    customer_id: str
    cart_value: float
    items_count: int
    abandoned_at_step: str
    timestamp: Optional[datetime] = None
    recovery_attempted: bool = False
    diagnosed_root_cause: Optional[str] = "unknown"
    confidence_score: Optional[float] = None
    action: Optional[str] = "pending"
    execution_status: Optional[str] = "pending"
    nudge_message: Optional[str] = None


class MandateDetailResponse(BaseModel):
    mandate_id: str
    customer_id: str
    subscription_plan: str
    amount: float
    currency: str = "INR"
    mandate_failure_code: str
    retry_attempt_number: int
    last_successful_charge_days_ago: int
    created_at: Optional[datetime] = None
    recovery_attempted: bool = False
    diagnosed_root_cause: Optional[str] = "unknown"
    confidence_score: Optional[float] = None
    action: Optional[str] = "pending"
    execution_status: Optional[str] = "pending"
    razorpay_order_id: Optional[str] = None
    backoff_days: int = 1


class ReceivableDetailResponse(BaseModel):
    invoice_id: str
    business_customer_id: str
    invoice_amount: float
    currency: str = "INR"
    due_date: Optional[datetime] = None
    days_overdue: int
    previous_payment_history: str
    escalation_stage: str
    promise_to_pay_date: Optional[datetime] = None
    relationship_value_tier: str
    touch_count: int = 0
    diagnosed_root_cause: Optional[str] = "unknown"
    confidence_score: Optional[float] = None
    action: Optional[str] = "pending"
    execution_status: Optional[str] = "pending"


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/unified-summary", response_model=UnifiedSummary)
def get_unified_summary_endpoint(db: Session = Depends(get_db)):
    """
    Get aggregated, single-pane-of-glass metrics across all four recovery flows.
    """
    return get_unified_summary(db)


@app.post("/api/run-batch")
def run_batch_endpoint(db: Session = Depends(get_db)):
    summary = run_recovery_batch(db)
    return summary


@app.post("/api/run-abandonment-batch")
def run_abandonment_batch_endpoint(db: Session = Depends(get_db)):
    summary = run_abandonment_batch(db)
    return summary


@app.post("/api/run-mandate-batch")
def run_mandate_batch_endpoint(db: Session = Depends(get_db)):
    summary = run_mandate_batch(db)
    return summary


@app.post("/api/run-receivables-batch")
def run_receivables_batch_endpoint(
    cycle_number: int = Query(default=1, ge=1, description="Simulated collection cycle number (each = 7 days)"),
    db: Session = Depends(get_db),
):
    summary = run_receivables_batch(db, cycle_number=cycle_number)
    return summary


@app.get("/api/payments", response_model=List[PaymentDetailResponse])
def get_payments_endpoint(db: Session = Depends(get_db)):
    """
    Retrieve all 60 FailedPayment records joined with their latest diagnosis,
    policy decision, execution outcome, and real Razorpay order ID.
    """
    payments = db.query(FailedPayment).all()
    audit_logs = (
        db.query(AuditLog)
        .filter(AuditLog.record_type == "payment")
        .order_by(AuditLog.id.asc())
        .all()
    )

    logs_by_tx: Dict[str, Dict[str, AuditLog]] = {}
    for log in audit_logs:
        if not log.transaction_id:
            continue
        if log.transaction_id not in logs_by_tx:
            logs_by_tx[log.transaction_id] = {}
        logs_by_tx[log.transaction_id][log.stage] = log

    results: List[PaymentDetailResponse] = []
    order_regex = re.compile(r"\b(order_[A-Za-z0-9]{8,})\b")

    for p in payments:
        tx_logs = logs_by_tx.get(p.transaction_id, {})
        diagnose_log = tx_logs.get("diagnose")
        decide_log = tx_logs.get("decide")
        execute_log = tx_logs.get("execute")

        root_cause = "unknown"
        confidence = None
        if diagnose_log:
            confidence = diagnose_log.confidence_score
            m = re.search(r"Diagnosed root cause:\s*([a-zA-Z0-9_]+)", diagnose_log.detail)
            if m:
                root_cause = m.group(1)
            elif p.failure_reason_code == "risk_check_failed":
                root_cause = "risk_flagged"
            elif p.failure_reason_code in ["insufficient_funds", "bank_timeout", "card_issue", "network_issue"]:
                root_cause = p.failure_reason_code

        action = "pending"
        if decide_log:
            m = re.search(r"action='([a-zA-Z0-9_]+)'", decide_log.detail)
            if m:
                action = m.group(1)
            elif "retry_payment" in decide_log.detail:
                action = "retry_payment"
            elif "escalate_to_human" in decide_log.detail:
                action = "escalate_to_human"
        elif root_cause == "risk_flagged":
            action = "escalate_to_human"
        else:
            action = "retry_payment"

        execution_status = "pending"
        razorpay_order_id = None
        if execute_log:
            m = re.search(r"status:\s*([a-zA-Z0-9_]+)", execute_log.detail)
            if m:
                execution_status = m.group(1)
            
            order_m = order_regex.search(execute_log.detail)
            if order_m and order_m.group(1) != "order_created":
                razorpay_order_id = order_m.group(1)

        results.append(
            PaymentDetailResponse(
                transaction_id=p.transaction_id,
                customer_id=p.customer_id,
                amount=p.amount,
                currency=p.currency,
                payment_method=p.payment_method,
                failure_reason_code=p.failure_reason_code,
                attempt_number=p.attempt_number,
                diagnosed_root_cause=root_cause,
                confidence_score=confidence,
                action=action,
                execution_status=execution_status,
                razorpay_order_id=p.razorpay_order_id or razorpay_order_id,
                razorpay_payment_id=p.razorpay_payment_id,
                payment_status=p.payment_status or "pending",
                created_at=p.created_at,
            )
        )

    return results


@app.get("/api/payments/captured", response_model=List[CapturedPaymentResponse])
def get_captured_payments_endpoint(db: Session = Depends(get_db)):
    """
    Retrieve all successfully completed/captured payment records with their verified Razorpay payment IDs.
    """
    captured_payments = (
        db.query(FailedPayment)
        .filter(FailedPayment.payment_status == "captured")
        .all()
    )

    audit_logs = (
        db.query(AuditLog)
        .filter(AuditLog.record_type == "payment", AuditLog.stage == "capture")
        .all()
    )
    capture_log_map = {log.transaction_id: log for log in audit_logs}

    results = []
    for p in captured_payments:
        log = capture_log_map.get(p.transaction_id)
        results.append(
            CapturedPaymentResponse(
                transaction_id=p.transaction_id,
                customer_id=p.customer_id,
                amount=p.amount,
                currency=p.currency,
                payment_method=p.payment_method,
                failure_reason_code=p.failure_reason_code,
                diagnosed_root_cause=p.failure_reason_code,
                razorpay_order_id=p.razorpay_order_id,
                razorpay_payment_id=p.razorpay_payment_id or f"pay_{p.transaction_id[:12]}",
                payment_status="captured",
                captured_at=log.timestamp if log else p.created_at,
            )
        )

    return results


@app.get("/api/checkouts", response_model=List[CheckoutDetailResponse])
def get_checkouts_endpoint(db: Session = Depends(get_db)):
    """
    Retrieve all 15 CheckoutAbandonment records joined with their diagnosis,
    policy decision, execution outcome, and generated recovery nudge messages.
    """
    checkouts = db.query(CheckoutAbandonment).all()
    audit_logs = (
        db.query(AuditLog)
        .filter(AuditLog.record_type == "checkout")
        .order_by(AuditLog.id.asc())
        .all()
    )

    logs_by_session: Dict[str, Dict[str, AuditLog]] = {}
    for log in audit_logs:
        if not log.transaction_id:
            continue
        if log.transaction_id not in logs_by_session:
            logs_by_session[log.transaction_id] = {}
        logs_by_session[log.transaction_id][log.stage] = log

    results: List[CheckoutDetailResponse] = []

    for c in checkouts:
        s_logs = logs_by_session.get(c.session_id, {})
        diagnose_log = s_logs.get("diagnose")
        decide_log = s_logs.get("decide")
        execute_log = s_logs.get("execute")

        root_cause = "unknown"
        confidence = None
        if diagnose_log:
            confidence = diagnose_log.confidence_score
            m = re.search(r"Diagnosed abandonment root cause:\s*([a-zA-Z0-9_]+)", diagnose_log.detail)
            if m:
                root_cause = m.group(1)
            elif c.cart_value < 300:
                root_cause = "low_cart_value"
            else:
                root_cause = "high_intent_dropoff"
        elif c.cart_value < 300:
            root_cause = "low_cart_value"
        else:
            root_cause = "high_intent_dropoff"

        action = "pending"
        if decide_log:
            m = re.search(r"action='([a-zA-Z0-9_]+)'", decide_log.detail)
            if m:
                action = m.group(1)
            elif "send_recovery_nudge" in decide_log.detail:
                action = "send_recovery_nudge"
            elif "hold" in decide_log.detail:
                action = "hold"
        elif c.cart_value < 300:
            action = "hold"
        else:
            action = "send_recovery_nudge"

        execution_status = "pending"
        nudge_message = None
        if execute_log:
            m = re.search(r"status:\s*([a-zA-Z0-9_]+)", execute_log.detail)
            if m:
                execution_status = m.group(1)

            msg_m = re.search(r"Message:\s*'([^']+)'", execute_log.detail)
            if msg_m:
                nudge_message = msg_m.group(1)
            elif action == "send_recovery_nudge":
                nudge_message = (
                    f"Hi! You left {c.items_count} items worth ₹{c.cart_value:.2f} in your cart. "
                    f"Complete your purchase: https://recoup.app/checkout/{c.session_id}"
                )

        results.append(
            CheckoutDetailResponse(
                session_id=c.session_id,
                customer_id=c.customer_id,
                cart_value=c.cart_value,
                items_count=c.items_count,
                abandoned_at_step=c.abandoned_at_step,
                timestamp=c.timestamp,
                recovery_attempted=c.recovery_attempted,
                diagnosed_root_cause=root_cause,
                confidence_score=confidence,
                action=action,
                execution_status=execution_status,
                nudge_message=nudge_message,
            )
        )

    return results


@app.get("/api/mandates", response_model=List[MandateDetailResponse])
def get_mandates_endpoint(db: Session = Depends(get_db)):
    """
    Retrieve all 20 FailedMandate records joined with their retry sequence state,
    consent hard-stop evaluations, backoff schedule, and Razorpay orders.
    """
    mandates = db.query(FailedMandate).all()
    audit_logs = (
        db.query(AuditLog)
        .filter(AuditLog.record_type == "mandate")
        .order_by(AuditLog.id.asc())
        .all()
    )

    logs_by_mandate: Dict[str, Dict[str, AuditLog]] = {}
    for log in audit_logs:
        if not log.transaction_id:
            continue
        if log.transaction_id not in logs_by_mandate:
            logs_by_mandate[log.transaction_id] = {}
        logs_by_mandate[log.transaction_id][log.stage] = log

    results: List[MandateDetailResponse] = []
    order_regex = re.compile(r"\b(order_[A-Za-z0-9]{8,})\b")

    for m in mandates:
        m_logs = logs_by_mandate.get(m.mandate_id, {})
        diagnose_log = m_logs.get("diagnose")
        decide_log = m_logs.get("decide")
        execute_log = m_logs.get("execute")

        root_cause = "unknown"
        confidence = None
        if diagnose_log:
            confidence = diagnose_log.confidence_score
            match = re.search(r"Diagnosed mandate root cause:\s*([a-zA-Z0-9_]+)", diagnose_log.detail)
            if match:
                root_cause = match.group(1)
            elif m.mandate_failure_code == "customer_paused_mandate":
                root_cause = "customer_declined_consent"
            else:
                root_cause = "temporary_balance_issue"
        elif m.mandate_failure_code == "customer_paused_mandate":
            root_cause = "customer_declined_consent"
        else:
            root_cause = "temporary_balance_issue"

        action = "pending"
        if decide_log:
            match = re.search(r"action='([a-zA-Z0-9_]+)'", decide_log.detail)
            if match:
                action = match.group(1)
            elif "permanently_stop" in decide_log.detail:
                action = "permanently_stop"
            elif "retry_mandate_charge" in decide_log.detail:
                action = "retry_mandate_charge"
            elif "escalate_to_human" in decide_log.detail:
                action = "escalate_to_human"
        elif root_cause == "customer_declined_consent":
            action = "permanently_stop"
        elif m.last_successful_charge_days_ago > 180 or m.retry_attempt_number >= 4:
            action = "escalate_to_human"
        else:
            action = "retry_mandate_charge"

        execution_status = "pending"
        razorpay_order_id = None
        if execute_log:
            match = re.search(r"status:\s*([a-zA-Z0-9_]+)", execute_log.detail)
            if match:
                execution_status = match.group(1)
            order_m = order_regex.search(execute_log.detail)
            if order_m and order_m.group(1) != "order_created":
                razorpay_order_id = order_m.group(1)

        backoff_map = {1: 1, 2: 3, 3: 7}
        backoff_days = backoff_map.get(m.retry_attempt_number, 0)

        results.append(
            MandateDetailResponse(
                mandate_id=m.mandate_id,
                customer_id=m.customer_id,
                subscription_plan=m.subscription_plan,
                amount=m.amount,
                currency=m.currency,
                mandate_failure_code=m.mandate_failure_code,
                retry_attempt_number=m.retry_attempt_number,
                last_successful_charge_days_ago=m.last_successful_charge_days_ago,
                created_at=m.created_at,
                recovery_attempted=m.recovery_attempted,
                diagnosed_root_cause=root_cause,
                confidence_score=confidence,
                action=action,
                execution_status=execution_status,
                razorpay_order_id=razorpay_order_id,
                backoff_days=backoff_days,
            )
        )

    return results


@app.get("/api/receivables", response_model=List[ReceivableDetailResponse])
def get_receivables_endpoint(db: Session = Depends(get_db)):
    """
    Retrieve all 25 OverdueInvoice records joined with their current escalation ladder stage,
    relationship value tier, touch counts, and diagnosis details.
    """
    invoices = db.query(OverdueInvoice).all()
    audit_logs = (
        db.query(AuditLog)
        .filter(AuditLog.record_type == "receivable")
        .order_by(AuditLog.id.asc())
        .all()
    )

    logs_by_inv: Dict[str, Dict[str, AuditLog]] = {}
    for log in audit_logs:
        if not log.transaction_id:
            continue
        if log.transaction_id not in logs_by_inv:
            logs_by_inv[log.transaction_id] = {}
        # Keep latest of each stage
        logs_by_inv[log.transaction_id][log.stage] = log

    results: List[ReceivableDetailResponse] = []

    for inv in invoices:
        i_logs = logs_by_inv.get(inv.invoice_id, {})
        diagnose_log = i_logs.get("diagnose")
        decide_log = i_logs.get("decide")
        execute_log = i_logs.get("execute")

        root_cause = "unknown"
        confidence = None
        if diagnose_log:
            confidence = diagnose_log.confidence_score
            match = re.search(r"Diagnosed receivable root cause:\s*([a-zA-Z0-9_]+)", diagnose_log.detail)
            if match:
                root_cause = match.group(1)
            elif inv.relationship_value_tier == "strategic":
                root_cause = "strategic_account"
            elif inv.days_overdue > 60:
                root_cause = "high_default_risk"
            else:
                root_cause = "likely_oversight"
        elif inv.relationship_value_tier == "strategic":
            root_cause = "strategic_account"
        elif inv.days_overdue > 60:
            root_cause = "high_default_risk"
        else:
            root_cause = "likely_oversight"

        action = "pending"
        if decide_log:
            match = re.search(r"action='([a-zA-Z0-9_]+)'", decide_log.detail)
            if match:
                action = match.group(1)
        elif inv.relationship_value_tier == "strategic" or inv.escalation_stage == "human_handoff":
            action = "escalate_to_human"
        elif inv.escalation_stage == "firm_notice":
            action = "send_firm_notice"
        elif inv.escalation_stage == "reminder_sent":
            action = "send_reminder"
        elif inv.escalation_stage == "promise_captured":
            action = "capture_promise"

        execution_status = inv.escalation_stage
        if execute_log:
            match = re.search(r"status:\s*([a-zA-Z0-9_]+)", execute_log.detail)
            if match:
                execution_status = match.group(1)

        results.append(
            ReceivableDetailResponse(
                invoice_id=inv.invoice_id,
                business_customer_id=inv.business_customer_id,
                invoice_amount=inv.invoice_amount,
                currency=inv.currency,
                due_date=inv.due_date,
                days_overdue=inv.days_overdue,
                previous_payment_history=inv.previous_payment_history,
                escalation_stage=inv.escalation_stage,
                promise_to_pay_date=inv.promise_to_pay_date,
                relationship_value_tier=inv.relationship_value_tier,
                touch_count=inv.touch_count,
                diagnosed_root_cause=root_cause,
                confidence_score=confidence,
                action=action,
                execution_status=execution_status,
            )
        )

    return results


@app.get("/api/audit-log", response_model=List[AuditLogResponse])
def get_audit_log_endpoint(
    record_type: Optional[str] = None,
    transaction_id: Optional[str] = None,
    actor: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Retrieve paginated audit logs ordered by newest first (timestamp DESC, id DESC).
    Can filter by record_type, transaction_id, actor, and search query.
    """
    query = db.query(AuditLog)
    if record_type:
        query = query.filter(AuditLog.record_type == record_type)
    if transaction_id:
        query = query.filter(AuditLog.transaction_id == transaction_id)
    if actor:
        query = query.filter(AuditLog.actor == actor)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (AuditLog.detail.ilike(search_pattern))
            | (AuditLog.transaction_id.ilike(search_pattern))
            | (AuditLog.stage.ilike(search_pattern))
        )
    
    query = query.order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
    logs = query.offset(offset).limit(limit).all()
    return logs



@app.get("/api/audit-log/stats")
def get_audit_log_stats_endpoint(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get audit log entry counts grouped by record_type, actor, and stage for analytics and charts.
    """
    stats_query = (
        db.query(
            AuditLog.record_type,
            AuditLog.actor,
            AuditLog.stage,
            func.count(AuditLog.id).label("count"),
        )
        .group_by(AuditLog.record_type, AuditLog.actor, AuditLog.stage)
        .all()
    )

    by_group = [
        {
            "record_type": row.record_type,
            "actor": row.actor,
            "stage": row.stage,
            "count": row.count,
        }
        for row in stats_query
    ]

    total_count = db.query(func.count(AuditLog.id)).scalar()

    return {
        "total_entries": total_count,
        "grouped_stats": by_group,
    }


class SimulateRequest(BaseModel):
    flow_type: str = "payment"  # "payment" | "mandate" | "receivable" | "checkout"
    payload: Dict[str, Any] = {}


class SimulateResponse(BaseModel):
    flow_type: str
    action: str
    allowed: bool
    reason: str
    backoff_days: Optional[int] = None
    stamp_text: str
    stamp_variant: str  # "approved" | "hardstop" | "caution"


@app.post("/api/simulate", response_model=SimulateResponse)
def simulate_guardrail(request: SimulateRequest):
    """
    Directly evaluate policy rules against in-memory records using the real policy_engine.py functions.
    Never persists to database, purely executing the live policy engine decision graph.
    """
    flow = request.flow_type.lower()
    p = request.payload

    if flow == "payment":
        payment = FailedPayment(
            transaction_id="sim_txn_001",
            customer_id=p.get("customer_id", "cust_sim_01"),
            amount=float(p.get("amount", 2499.0)),
            currency="INR",
            payment_method=p.get("payment_method", "upi"),
            failure_reason_code=p.get("failure_reason_code", "insufficient_funds"),
            attempt_number=int(p.get("attempt_number", 1)),
            created_at=datetime.utcnow(),
        )
        diagnosis = DiagnosisResult(
            root_cause=p.get("root_cause", "insufficient_funds"),
            confidence=float(p.get("confidence", 0.85)),
            reasoning="Simulated diagnosis input",
        )
        decision = decide(payment, diagnosis, db_session=None)

    elif flow == "mandate":
        mandate = FailedMandate(
            mandate_id="sim_mandate_001",
            customer_id=p.get("customer_id", "cust_sim_02"),
            subscription_plan="pro_monthly",
            amount=float(p.get("amount", 999.0)),
            currency="INR",
            mandate_failure_code=p.get("mandate_failure_code") or p.get("failure_reason_code", "bank_downtime"),
            retry_attempt_number=int(p.get("retry_attempt_number", 1)),
            last_successful_charge_days_ago=int(p.get("last_successful_charge_days_ago", 30)),
        )
        root_cause = p.get("root_cause", "bank_downtime")
        if p.get("customer_paused_mandate") or root_cause in ["customer_declined_consent", "customer_paused_mandate"]:
            root_cause = "customer_declined_consent"

        diagnosis = DiagnosisResult(
            root_cause=root_cause,
            confidence=float(p.get("confidence", 0.9)),
            reasoning="Simulated mandate diagnosis",
        )
        decision = decide_mandate(mandate, diagnosis, db_session=None)

    elif flow == "receivable":
        days_overdue = int(p.get("days_overdue", 15))
        invoice = OverdueInvoice(
            invoice_id=p.get("invoice_id", "sim_inv_001"),
            business_customer_id=p.get("business_customer_id", "Acme Corporation"),
            invoice_amount=float(p.get("invoice_amount", 125000.0)),
            currency="INR",
            due_date=datetime.utcnow() - timedelta(days=days_overdue),
            days_overdue=days_overdue,
            previous_payment_history=p.get("previous_payment_history", "always_on_time"),
            escalation_stage=p.get("escalation_stage", "none"),
            relationship_value_tier=p.get("relationship_value_tier", "standard"),
            touch_count=int(p.get("touch_count", 0)),
        )
        if p.get("promise_to_pay_date"):
            try:
                invoice.promise_to_pay_date = datetime.fromisoformat(p["promise_to_pay_date"])
            except Exception:
                invoice.promise_to_pay_date = datetime.utcnow() - timedelta(days=2)
        elif invoice.escalation_stage == "promise_captured" and p.get("is_promise_broken"):
            invoice.promise_to_pay_date = datetime.utcnow() - timedelta(days=2)
        elif invoice.escalation_stage == "promise_captured":
            invoice.promise_to_pay_date = datetime.utcnow() + timedelta(days=4)

        diagnosis = DiagnosisResult(
            root_cause=p.get("root_cause", "likely_oversight"),
            confidence=float(p.get("confidence", 0.88)),
            reasoning="Simulated receivable diagnosis",
        )
        cycle_number = int(p.get("cycle_number", 1))
        decision = decide_receivable(invoice, diagnosis, cycle_number=cycle_number, db_session=None)

    elif flow == "checkout":
        session = CheckoutAbandonment(
            session_id="sim_chk_001",
            customer_id=p.get("customer_id", "cust_sim_03"),
            cart_value=float(p.get("cart_value", 1499.0)),
            items_count=int(p.get("items_count", 2)),
            abandoned_at_step=p.get("abandoned_at_step", "payment_method"),
            timestamp=datetime.utcnow(),
        )
        diagnosis = DiagnosisResult(
            root_cause=p.get("root_cause", "payment_friction"),
            confidence=float(p.get("confidence", 0.85)),
            reasoning="Simulated checkout diagnosis",
        )
        decision = decide_abandonment(session, diagnosis, db_session=None)

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported flow_type: {flow}")

    # Determine stamp text and visual variant
    if decision.action == "permanently_stop" or "consent" in decision.reason.lower():
        stamp_text = "HARD STOP"
        stamp_variant = "hardstop"
    elif decision.allowed and decision.action in ["retry_payment", "send_recovery_nudge", "retry_mandate_charge", "send_reminder", "send_firm_notice", "promise_captured"]:
        stamp_variant = "approved"
        stamp_map = {
            "retry_payment": "RETRY ORDER",
            "send_recovery_nudge": "SEND NUDGE",
            "retry_mandate_charge": f"RETRY ({decision.backoff_days}D BACKOFF)" if decision.backoff_days else "RETRY ORDER",
            "send_reminder": "SEND REMINDER",
            "send_firm_notice": "FIRM NOTICE",
            "promise_captured": "PROMISE LOGGED",
        }
        stamp_text = stamp_map.get(decision.action, "APPROVED")
    elif "strategic" in decision.reason.lower():
        stamp_variant = "caution"
        stamp_text = "WHITE GLOVE"
    elif "broken" in decision.reason.lower():
        stamp_variant = "caution"
        stamp_text = "BROKEN PROMISE"
    elif "risk" in decision.reason.lower():
        stamp_variant = "caution"
        stamp_text = "RISK ESCALATION"
    elif not decision.allowed and decision.action == "hold":
        stamp_variant = "caution"
        stamp_text = "HOLD"
    else:
        stamp_variant = "caution"
        stamp_text = "ESCALATED"

    return SimulateResponse(
        flow_type=flow,
        action=decision.action,
        allowed=decision.allowed,
        reason=decision.reason,
        backoff_days=decision.backoff_days,
        stamp_text=stamp_text,
        stamp_variant=stamp_variant,
    )


@app.get("/api/diagnosis-accuracy", response_model=AccuracyReport)
def get_diagnosis_accuracy(
    flow_type: str = Query("payment", description="Flow type: payment | mandate | receivable"),
    db: Session = Depends(get_db),
):
    """
    Get comprehensive diagnosis accuracy report against ground truth for a specific flow.
    Includes confusion matrix, per-class precision/recall, source breakdown (Gemini vs fallback),
    and confidence correlation analysis.
    """
    try:
        return evaluate_diagnosis_accuracy(db, flow_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/diagnosis-accuracy/all", response_model=OverallEvaluationSummary)
def get_all_diagnosis_accuracy(
    db: Session = Depends(get_db),
):
    """
    Get aggregated diagnosis accuracy report across all three diagnostic flows.
    """
    return evaluate_all_flows(db)


class CounterfactualItem(BaseModel):
    id: int
    timestamp: datetime
    record_type: str
    record_id: str
    guardrail_type: str
    naive_action: str
    additional_contacts_prevented: int
    compliance_risk: bool
    reasoning: str
    record_amount: float


class CounterfactualTypeStats(BaseModel):
    guardrail_type: str
    count_fired: int
    additional_contacts_prevented: int
    compliance_risks_avoided: int
    amount_shielded: float
    reasoning: str
    example_record_id: Optional[str] = None
    example_reasoning: Optional[str] = None
    naive_action: str


class CounterfactualSummaryResponse(BaseModel):
    total_guardrails_fired: int
    total_additional_contacts_prevented: int
    total_compliance_risks_avoided: int
    total_amount_shielded_from_unwanted_contact: float
    breakdown_by_guardrail_type: Dict[str, CounterfactualTypeStats]
    sample_records: List[CounterfactualItem]


@app.get("/api/counterfactual-summary", response_model=CounterfactualSummaryResponse)
def get_counterfactual_summary(db: Session = Depends(get_db)):
    """
    Aggregates counterfactual impact metrics: what a naive agent would have done,
    quantifying additional contacts prevented, compliance violations avoided, and shielded capital.
    """
    from app.models import CounterfactualLog
    logs = db.query(CounterfactualLog).order_by(CounterfactualLog.timestamp.desc()).all()

    total_guardrails_fired = len(logs)
    total_additional_contacts_prevented = sum(l.additional_contacts_prevented for l in logs)
    total_compliance_risks_avoided = sum(1 for l in logs if l.compliance_risk)
    total_amount_shielded = sum(l.record_amount for l in logs if l.compliance_risk or l.additional_contacts_prevented > 0)

    # Group by guardrail_type
    grouped: Dict[str, list] = {}
    for l in logs:
        grouped.setdefault(l.guardrail_type, []).append(l)

    breakdown = {}
    for gtype, items in grouped.items():
        contacts_prev = sum(i.additional_contacts_prevented for i in items)
        comp_risks = sum(1 for i in items if i.compliance_risk)
        amt = sum(i.record_amount for i in items if i.compliance_risk or i.additional_contacts_prevented > 0)
        first = items[0]
        breakdown[gtype] = CounterfactualTypeStats(
            guardrail_type=gtype,
            count_fired=len(items),
            additional_contacts_prevented=contacts_prev,
            compliance_risks_avoided=comp_risks,
            amount_shielded=round(amt, 2),
            reasoning=first.reasoning,
            example_record_id=first.record_id,
            example_reasoning=f"{first.record_id} — {contacts_prev if len(items)==1 else first.additional_contacts_prevented} additional contact(s) prevented. {first.reasoning}",
            naive_action=first.naive_action,
        )

    samples = [
        CounterfactualItem(
            id=l.id,
            timestamp=l.timestamp,
            record_type=l.record_type,
            record_id=l.record_id,
            guardrail_type=l.guardrail_type,
            naive_action=l.naive_action,
            additional_contacts_prevented=l.additional_contacts_prevented,
            compliance_risk=l.compliance_risk,
            reasoning=l.reasoning,
            record_amount=l.record_amount,
        )
        for l in logs[:10]
    ]

    return CounterfactualSummaryResponse(
        total_guardrails_fired=total_guardrails_fired,
        total_additional_contacts_prevented=total_additional_contacts_prevented,
        total_compliance_risks_avoided=total_compliance_risks_avoided,
        total_amount_shielded_from_unwanted_contact=round(total_amount_shielded, 2),
        breakdown_by_guardrail_type=breakdown,
        sample_records=samples,
    )


class HinglishNudgeRequest(BaseModel):
    record_id: str
    flow_type: str = Field(..., description="Flow type: checkout | mandate | payment | receivable")


class HinglishNudgeResponse(BaseModel):
    record_id: str
    flow_type: str
    hinglish_text: str
    english_reference: str
    source: str


@app.post("/api/generate-hinglish-nudge", response_model=HinglishNudgeResponse)
def post_generate_hinglish_nudge(req: HinglishNudgeRequest, db: Session = Depends(get_db)):
    """
    Generates a natural Hinglish recovery message using Gemini with English reference translation
    and voice playback compatibility via the Web Speech API.
    """
    from app.engine.hinglish_nudge import generate_hinglish_nudge
    from app.models import CheckoutAbandonment, FailedMandate, FailedPayment, OverdueInvoice

    record = None
    if req.flow_type == "checkout":
        record = db.query(CheckoutAbandonment).filter(CheckoutAbandonment.session_id == req.record_id).first()
    elif req.flow_type == "mandate":
        record = db.query(FailedMandate).filter(FailedMandate.mandate_id == req.record_id).first()
    elif req.flow_type == "payment":
        record = db.query(FailedPayment).filter(FailedPayment.transaction_id == req.record_id).first()
    elif req.flow_type == "receivable":
        record = db.query(OverdueInvoice).filter(OverdueInvoice.invoice_id == req.record_id).first()

    if not record:
        raise HTTPException(status_code=404, detail=f"Record not found: {req.record_id} in {req.flow_type}")

    result = generate_hinglish_nudge(record, req.flow_type)
    return HinglishNudgeResponse(
        record_id=req.record_id,
        flow_type=req.flow_type,
        hinglish_text=result["hinglish_text"],
        english_reference=result["english_reference"],
        source=result.get("source", "gemini"),
    )


# --- 10. Human-in-the-Loop Action Center Endpoints ---

class HumanActionRequest(BaseModel):
    record_type: str = Field(..., description="Flow type: payment | mandate | receivable | checkout")
    record_id: str = Field(..., description="Unique entity ID")
    action: str = Field(..., description="Action: approved_contact | marked_resolved | override_retry | reassigned")
    note: Optional[str] = Field(None, description="Optional operator notes or justification")


class HumanActionResponse(BaseModel):
    success: bool
    record_type: str
    record_id: str
    action_taken: str
    resulting_status: str
    blocked_by_guardrail: bool
    guardrail_reason: Optional[str] = None
    stamp_text: Optional[str] = None
    stamp_variant: Optional[str] = None
    operator_note: Optional[str] = None
    timestamp: datetime
    execution_detail: Optional[str] = None
    razorpay_order_id: Optional[str] = None


class HumanActionStats(BaseModel):
    total_actions: int
    approved_contact_count: int
    marked_resolved_count: int
    override_retry_count: int
    reassigned_count: int
    overrides_blocked_by_guardrails: int


@app.post("/api/human-action", response_model=HumanActionResponse)
def execute_human_action(req: HumanActionRequest, db: Session = Depends(get_db)):
    """
    Executes a human-in-the-loop operational action on an escalated or held record.
    Logs immutable audit entries under actor='human_operator'.
    Re-runs policy engine guardrails on 'override_retry' to guarantee that consent hard-stops
    and critical compliance rules cannot be bypassed even by human operators.
    """
    from app.models import (
        FailedPayment,
        FailedMandate,
        OverdueInvoice,
        CheckoutAbandonment,
        AuditLog,
        HumanAction,
    )
    from app.engine.diagnoser import diagnose_mandate, DiagnosisResult
    from app.engine.policy_engine import decide_mandate, PolicyDecision
    from app.engine.executor import execute, execute_mandate, execute_receivable

    req_type = req.record_type.lower()
    req_action = req.action.lower()

    # 1. Fetch the underlying record
    record = None
    if req_type == "payment":
        record = db.query(FailedPayment).filter(FailedPayment.transaction_id == req.record_id).first()
    elif req_type == "mandate":
        record = db.query(FailedMandate).filter(FailedMandate.mandate_id == req.record_id).first()
    elif req_type == "receivable":
        record = db.query(OverdueInvoice).filter(OverdueInvoice.invoice_id == req.record_id).first()
    elif req_type == "checkout":
        record = db.query(CheckoutAbandonment).filter(CheckoutAbandonment.session_id == req.record_id).first()

    if not record:
        raise HTTPException(status_code=404, detail=f"Record '{req.record_id}' not found in {req_type} flow")

    now = datetime.utcnow()

    # 2. Handle Action Branches
    if req_action == "marked_resolved":
        resulting_status = "resolved"
        if req_type == "payment":
            record.payment_status = "resolved"
        elif req_type == "mandate":
            record.recovery_attempted = True
        elif req_type == "receivable":
            record.escalation_stage = "resolved"
        elif req_type == "checkout":
            record.recovery_attempted = True

        note_str = f"Operator Note: {req.note}" if req.note else ""
        db.add(AuditLog(
            timestamp=now,
            record_type=req_type,
            transaction_id=req.record_id,
            stage="human_intervention",
            actor="human_operator",
            detail=f"Human operator marked record as resolved (automation concluded). {note_str}".strip(),
            confidence_score=1.0,
        ))

        ha = HumanAction(
            timestamp=now,
            record_type=req_type,
            record_id=req.record_id,
            action_taken="marked_resolved",
            operator_note=req.note,
            resulting_status=resulting_status,
            blocked_by_guardrail=False,
            guardrail_reason=None,
        )
        db.add(ha)
        db.commit()

        return HumanActionResponse(
            success=True,
            record_type=req_type,
            record_id=req.record_id,
            action_taken="marked_resolved",
            resulting_status=resulting_status,
            blocked_by_guardrail=False,
            guardrail_reason=None,
            stamp_text="RESOLVED",
            stamp_variant="approved",
            operator_note=req.note,
            timestamp=ha.timestamp,
            execution_detail="Record marked as resolved. No further automated touchpoints scheduled.",
            razorpay_order_id=None,
        )

    elif req_action == "approved_contact":
        resulting_status = "contact_approved"
        if req_type == "receivable":
            record.touch_count = (record.touch_count or 0) + 1
            record.escalation_stage = "manual_contact_authorized"
        elif req_type == "payment":
            record.payment_status = "contact_authorized"

        note_str = f"Operator Note: {req.note}" if req.note else ""
        db.add(AuditLog(
            timestamp=now,
            record_type=req_type,
            transaction_id=req.record_id,
            stage="human_intervention",
            actor="human_operator",
            detail=f"Human operator authorized 1 manual high-touch outreach attempt. {note_str}".strip(),
            confidence_score=1.0,
        ))

        ha = HumanAction(
            timestamp=now,
            record_type=req_type,
            record_id=req.record_id,
            action_taken="approved_contact",
            operator_note=req.note,
            resulting_status=resulting_status,
            blocked_by_guardrail=False,
            guardrail_reason=None,
        )
        db.add(ha)
        db.commit()

        return HumanActionResponse(
            success=True,
            record_type=req_type,
            record_id=req.record_id,
            action_taken="approved_contact",
            resulting_status=resulting_status,
            blocked_by_guardrail=False,
            guardrail_reason=None,
            stamp_text="CONTACT APPROVED",
            stamp_variant="approved",
            operator_note=req.note,
            timestamp=ha.timestamp,
            execution_detail="Single manual contact authorized. Record will not re-enter automated sequences.",
            razorpay_order_id=None,
        )

    elif req_action == "override_retry":
        # CRITICAL POLICY ENGINE GUARDRAIL CHECK:
        # If the record is a consent hard-stop (mandate paused / consent revoked), the override MUST FAIL!
        if req_type == "mandate":
            diagnosis = DiagnosisResult(
                root_cause="customer_declined_consent" if record.mandate_failure_code == "customer_paused_mandate" else "bank_downtime",
                confidence=1.0 if record.mandate_failure_code == "customer_paused_mandate" else 0.9,
                reasoning="Customer explicitly paused mandate and revoked auto-debit consent.",
                source="fallback_rules",
            )
            decision = decide_mandate(record, diagnosis, db_session=None)

            if decision.action == "permanently_stop" or record.mandate_failure_code == "customer_paused_mandate" or not decision.allowed:
                blocked_reason = decision.reason or "customer explicitly paused mandate — retrying would violate consent, this is a compliance hard-stop, not a business decision"
                note_str = f"Operator Note: {req.note}" if req.note else ""

                db.add(AuditLog(
                    timestamp=now,
                    record_type=req_type,
                    transaction_id=req.record_id,
                    stage="human_intervention",
                    actor="human_operator",
                    detail=f"OVERRIDE BLOCKED BY POLICY GUARDRAIL: Human operator attempted to override retry on mandate with revoked consent. System refused execution: {blocked_reason}. {note_str}".strip(),
                    confidence_score=1.0,
                ))

                ha = HumanAction(
                    timestamp=now,
                    record_type=req_type,
                    record_id=req.record_id,
                    action_taken="override_retry",
                    operator_note=req.note,
                    resulting_status="override_blocked_by_guardrail",
                    blocked_by_guardrail=True,
                    guardrail_reason=blocked_reason,
                )
                db.add(ha)
                db.commit()

                return HumanActionResponse(
                    success=False,
                    record_type=req_type,
                    record_id=req.record_id,
                    action_taken="override_retry",
                    resulting_status="override_blocked_by_guardrail",
                    blocked_by_guardrail=True,
                    guardrail_reason=blocked_reason,
                    stamp_text="OVERRIDE BLOCKED — CONSENT HARD-STOP",
                    stamp_variant="hardstop",
                    operator_note=req.note,
                    timestamp=ha.timestamp,
                    execution_detail=f"Recoup Policy Engine firmly blocked retry: {blocked_reason}",
                    razorpay_order_id=None,
                )
            else:
                # Retriable mandate
                exec_res = execute_mandate(record, decision, db_session=db)
                note_str = f"Operator Note: {req.note}" if req.note else ""
                db.add(AuditLog(
                    timestamp=now,
                    record_type=req_type,
                    transaction_id=req.record_id,
                    stage="human_intervention",
                    actor="human_operator",
                    detail=f"Human operator overrode escalation and authorized mandate retry. Razorpay Order: {exec_res.razorpay_order_id}. {note_str}".strip(),
                    confidence_score=1.0,
                ))
                ha = HumanAction(
                    timestamp=now,
                    record_type=req_type,
                    record_id=req.record_id,
                    action_taken="override_retry",
                    operator_note=req.note,
                    resulting_status="retry_executed",
                    blocked_by_guardrail=False,
                    guardrail_reason=None,
                )
                db.add(ha)
                db.commit()

                return HumanActionResponse(
                    success=True,
                    record_type=req_type,
                    record_id=req.record_id,
                    action_taken="override_retry",
                    resulting_status="retry_executed",
                    blocked_by_guardrail=False,
                    guardrail_reason=None,
                    stamp_text="RETRY EXECUTED",
                    stamp_variant="approved",
                    operator_note=req.note,
                    timestamp=ha.timestamp,
                    execution_detail=exec_res.detail,
                    razorpay_order_id=exec_res.razorpay_order_id,
                )

        elif req_type == "payment":
            # Operator manual override to retry after reviewing fraud/risk flags
            decision = PolicyDecision(
                action="retry_payment",
                allowed=True,
                reason=f"Human operator overrode risk hold after manual verification: {req.note or 'operator approved'}",
            )
            exec_res = execute(record, decision, db_session=db)
            note_str = f"Operator Note: {req.note}" if req.note else ""
            db.add(AuditLog(
                timestamp=now,
                record_type=req_type,
                transaction_id=req.record_id,
                stage="human_intervention",
                actor="human_operator",
                detail=f"Human operator overrode risk escalation and authorized payment retry. Created Razorpay Order {exec_res.razorpay_order_id}. {note_str}".strip(),
                confidence_score=1.0,
            ))
            ha = HumanAction(
                timestamp=now,
                record_type=req_type,
                record_id=req.record_id,
                action_taken="override_retry",
                operator_note=req.note,
                resulting_status="retry_executed",
                blocked_by_guardrail=False,
                guardrail_reason=None,
            )
            db.add(ha)
            db.commit()

            return HumanActionResponse(
                success=True,
                record_type=req_type,
                record_id=req.record_id,
                action_taken="override_retry",
                resulting_status="retry_executed",
                blocked_by_guardrail=False,
                guardrail_reason=None,
                stamp_text="OVERRIDE RETRY EXECUTED",
                stamp_variant="approved",
                operator_note=req.note,
                timestamp=ha.timestamp,
                execution_detail=exec_res.detail,
                razorpay_order_id=exec_res.razorpay_order_id,
            )

        elif req_type == "receivable":
            decision = PolicyDecision(
                action="send_firm_notice",
                allowed=True,
                reason=f"Human operator executive escalation outreach: {req.note or 'operator approved'}",
            )
            exec_res = execute_receivable(record, decision, cycle_number=1, db_session=db)
            note_str = f"Operator Note: {req.note}" if req.note else ""
            db.add(AuditLog(
                timestamp=now,
                record_type=req_type,
                transaction_id=req.record_id,
                stage="human_intervention",
                actor="human_operator",
                detail=f"Human operator authorized manual executive collections outreach. {exec_res.detail}. {note_str}".strip(),
                confidence_score=1.0,
            ))
            ha = HumanAction(
                timestamp=now,
                record_type=req_type,
                record_id=req.record_id,
                action_taken="override_retry",
                operator_note=req.note,
                resulting_status="outreach_executed",
                blocked_by_guardrail=False,
                guardrail_reason=None,
            )
            db.add(ha)
            db.commit()

            return HumanActionResponse(
                success=True,
                record_type=req_type,
                record_id=req.record_id,
                action_taken="override_retry",
                resulting_status="outreach_executed",
                blocked_by_guardrail=False,
                guardrail_reason=None,
                stamp_text="OVERRIDE OUTREACH EXECUTED",
                stamp_variant="approved",
                operator_note=req.note,
                timestamp=ha.timestamp,
                execution_detail=exec_res.detail,
                razorpay_order_id=None,
            )

        else:
            raise HTTPException(status_code=400, detail=f"Override retry not supported for flow: {req_type}")

    elif req_action == "reassigned":
        resulting_status = "reassigned"
        note_str = f"Operator Note: {req.note}" if req.note else ""
        db.add(AuditLog(
            timestamp=now,
            record_type=req_type,
            transaction_id=req.record_id,
            stage="human_intervention",
            actor="human_operator",
            detail=f"Record reassigned to specialist review queue. {note_str}".strip(),
            confidence_score=1.0,
        ))

        ha = HumanAction(
            timestamp=now,
            record_type=req_type,
            record_id=req.record_id,
            action_taken="reassigned",
            operator_note=req.note,
            resulting_status=resulting_status,
            blocked_by_guardrail=False,
            guardrail_reason=None,
        )
        db.add(ha)
        db.commit()

        return HumanActionResponse(
            success=True,
            record_type=req_type,
            record_id=req.record_id,
            action_taken="reassigned",
            resulting_status=resulting_status,
            blocked_by_guardrail=False,
            guardrail_reason=None,
            stamp_text="REASSIGNED",
            stamp_variant="caution",
            operator_note=req.note,
            timestamp=ha.timestamp,
            execution_detail="Reassigned to specialist queue without altering underlying lifecycle state.",
            razorpay_order_id=None,
        )

    else:
        raise HTTPException(status_code=400, detail=f"Unknown human action: {req.action}")


@app.get("/api/human-actions", response_model=List[HumanActionResponse])
def get_human_actions(
    record_type: Optional[str] = None,
    record_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Retrieve logged human-in-the-loop actions ordered by newest first.
    """
    from app.models import HumanAction

    query = db.query(HumanAction)
    if record_type:
        query = query.filter(HumanAction.record_type == record_type)
    if record_id:
        query = query.filter(HumanAction.record_id == record_id)

    query = query.order_by(HumanAction.timestamp.desc(), HumanAction.id.desc())
    records = query.all()

    return [
        HumanActionResponse(
            success=not r.blocked_by_guardrail,
            record_type=r.record_type,
            record_id=r.record_id,
            action_taken=r.action_taken,
            resulting_status=r.resulting_status,
            blocked_by_guardrail=r.blocked_by_guardrail,
            guardrail_reason=r.guardrail_reason,
            stamp_text="OVERRIDE BLOCKED — CONSENT HARD-STOP" if r.blocked_by_guardrail else (
                "RESOLVED" if r.action_taken == "marked_resolved" else (
                    "CONTACT APPROVED" if r.action_taken == "approved_contact" else (
                        "REASSIGNED" if r.action_taken == "reassigned" else "OVERRIDE EXECUTED"
                    )
                )
            ),
            stamp_variant="hardstop" if r.blocked_by_guardrail else (
                "caution" if r.action_taken == "reassigned" else "approved"
            ),
            operator_note=r.operator_note,
            timestamp=r.timestamp,
            execution_detail=r.guardrail_reason if r.blocked_by_guardrail else None,
            razorpay_order_id=None,
        )
        for r in records
    ]


@app.get("/api/human-actions/stats", response_model=HumanActionStats)
def get_human_action_stats(db: Session = Depends(get_db)):
    """
    Retrieve aggregate statistics on human interventions and blocked override attempts.
    """
    from app.models import HumanAction

    total_actions = db.query(HumanAction).count()
    approved_contact_count = db.query(HumanAction).filter(HumanAction.action_taken == "approved_contact").count()
    marked_resolved_count = db.query(HumanAction).filter(HumanAction.action_taken == "marked_resolved").count()
    override_retry_count = db.query(HumanAction).filter(HumanAction.action_taken == "override_retry").count()
    reassigned_count = db.query(HumanAction).filter(HumanAction.action_taken == "reassigned").count()
    blocked_count = db.query(HumanAction).filter(HumanAction.blocked_by_guardrail == True).count()

    return HumanActionStats(
        total_actions=total_actions,
        approved_contact_count=approved_contact_count,
        marked_resolved_count=marked_resolved_count,
        override_retry_count=override_retry_count,
        reassigned_count=reassigned_count,
        overrides_blocked_by_guardrails=blocked_count,
    )




