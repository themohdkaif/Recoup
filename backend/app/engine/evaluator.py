import re
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models import FailedPayment, FailedMandate, OverdueInvoice, AuditLog
from app.engine.diagnoser import (
    ALLOWED_PAYMENT_ROOT_CAUSES,
    ALLOWED_MANDATE_ROOT_CAUSES,
    ALLOWED_RECEIVABLE_ROOT_CAUSES,
)


class ClassMetric(BaseModel):
    label: str
    precision_pct: float
    recall_pct: float
    f1_score_pct: float
    support: int


class SourceBreakdown(BaseModel):
    total: int
    correct: int
    accuracy_pct: float


class ConfidenceStats(BaseModel):
    mean_overall: float
    mean_correct: float
    mean_incorrect: Optional[float]
    correlation_holds: bool


class AccuracyReport(BaseModel):
    flow_type: str
    total_evaluated: int
    correct_count: int
    overall_accuracy_pct: float
    classes: List[str]
    per_class_metrics: List[ClassMetric]
    confusion_matrix: Dict[str, Dict[str, int]]
    gemini_breakdown: SourceBreakdown
    fallback_breakdown: SourceBreakdown
    confidence_stats: ConfidenceStats
    records: List[Dict[str, Any]]


class OverallEvaluationSummary(BaseModel):
    total_evaluated: int
    total_correct: int
    overall_accuracy_pct: float
    gemini_overall_accuracy_pct: float
    fallback_overall_accuracy_pct: float
    confidence_stats: ConfidenceStats
    flow_reports: Dict[str, AccuracyReport]


def _extract_diagnosis_from_detail(detail: str) -> Optional[str]:
    """Extract diagnosed root cause from AuditLog detail string."""
    match = re.search(r"root cause:\s*([a-zA-Z0-9_]+)", detail, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


def evaluate_diagnosis_accuracy(db_session: Session, flow_type: str) -> AccuracyReport:
    """
    Evaluate diagnostic accuracy for a specific flow against embedded ground truth.
    Joins each record's ground_truth_root_cause with the diagnosis recorded in AuditLog.
    """
    flow_type = flow_type.lower()
    
    if flow_type == "payment":
        entities = db_session.query(FailedPayment).all()
        classes = list(ALLOWED_PAYMENT_ROOT_CAUSES)
        id_getter = lambda e: e.transaction_id
    elif flow_type == "mandate":
        entities = db_session.query(FailedMandate).all()
        classes = list(ALLOWED_MANDATE_ROOT_CAUSES)
        id_getter = lambda e: e.mandate_id
    elif flow_type == "receivable":
        entities = db_session.query(OverdueInvoice).all()
        classes = list(ALLOWED_RECEIVABLE_ROOT_CAUSES)
        id_getter = lambda e: e.invoice_id
    else:
        raise ValueError(f"Unsupported flow_type for evaluation: {flow_type}")

    # Fetch all diagnosis audit logs for this flow
    diag_logs = (
        db_session.query(AuditLog)
        .filter(AuditLog.record_type == flow_type, AuditLog.stage == "diagnose")
        .order_by(AuditLog.id.asc())
        .all()
    )

    # Index latest diagnosis per entity ID
    diag_map: Dict[str, AuditLog] = {}
    for log in diag_logs:
        if log.transaction_id:
            diag_map[log.transaction_id] = log

    records_eval: List[Dict[str, Any]] = []
    matrix: Dict[str, Dict[str, int]] = {act: {pred: 0 for pred in classes} for act in classes}
    
    gemini_total = 0
    gemini_correct = 0
    fallback_total = 0
    fallback_correct = 0

    confidences_correct: List[float] = []
    confidences_incorrect: List[float] = []
    confidences_all: List[float] = []

    for entity in entities:
        ent_id = id_getter(entity)
        actual = getattr(entity, "ground_truth_root_cause", None)
        if not actual:
            continue

        log = diag_map.get(ent_id)
        if not log:
            continue

        predicted = _extract_diagnosis_from_detail(log.detail) or "unknown"
        source = log.actor if log.actor in ["gemini", "fallback_rules"] else ("gemini" if "gemini" in log.detail else "fallback_rules")
        confidence = float(log.confidence_score if log.confidence_score is not None else 0.85)

        is_correct = (predicted == actual)

        if actual in matrix and predicted in matrix[actual]:
            matrix[actual][predicted] += 1
        elif actual in matrix:
            # Handle unknown or unlisted predicted class
            if "unknown" not in matrix[actual]:
                matrix[actual]["unknown"] = 0
            matrix[actual]["unknown"] += 1

        if source == "gemini":
            gemini_total += 1
            if is_correct:
                gemini_correct += 1
        else:
            fallback_total += 1
            if is_correct:
                fallback_correct += 1

        confidences_all.append(confidence)
        if is_correct:
            confidences_correct.append(confidence)
        else:
            confidences_incorrect.append(confidence)

        records_eval.append({
            "entity_id": ent_id,
            "actual": actual,
            "predicted": predicted,
            "is_correct": is_correct,
            "confidence": confidence,
            "source": source,
            "detail": log.detail,
        })

    total_eval = len(records_eval)
    correct_count = sum(1 for r in records_eval if r["is_correct"])
    overall_acc = round((correct_count / total_eval * 100.0), 2) if total_eval > 0 else 0.0

    # Per-class Precision, Recall, F1
    per_class: List[ClassMetric] = []
    for cls_label in classes:
        # TP: actual == cls and predicted == cls
        tp = sum(1 for r in records_eval if r["actual"] == cls_label and r["predicted"] == cls_label)
        # FP: actual != cls and predicted == cls
        fp = sum(1 for r in records_eval if r["actual"] != cls_label and r["predicted"] == cls_label)
        # FN: actual == cls and predicted != cls
        fn = sum(1 for r in records_eval if r["actual"] == cls_label and r["predicted"] != cls_label)
        support = sum(1 for r in records_eval if r["actual"] == cls_label)

        precision = round((tp / (tp + fp) * 100.0), 2) if (tp + fp) > 0 else 0.0
        recall = round((tp / (tp + fn) * 100.0), 2) if (tp + fn) > 0 else 0.0
        f1 = round((2 * precision * recall / (precision + recall)), 2) if (precision + recall) > 0 else 0.0

        per_class.append(ClassMetric(
            label=cls_label,
            precision_pct=precision,
            recall_pct=recall,
            f1_score_pct=f1,
            support=support,
        ))

    # Source breakdown
    gem_acc = round((gemini_correct / gemini_total * 100.0), 2) if gemini_total > 0 else 0.0
    fb_acc = round((fallback_correct / fallback_total * 100.0), 2) if fallback_total > 0 else 0.0

    mean_all = round(sum(confidences_all) / len(confidences_all), 4) if confidences_all else 0.0
    mean_corr = round(sum(confidences_correct) / len(confidences_correct), 4) if confidences_correct else 0.0
    mean_inc = round(sum(confidences_incorrect) / len(confidences_incorrect), 4) if confidences_incorrect else None
    corr_holds = (mean_inc is None) or (mean_corr > mean_inc)

    return AccuracyReport(
        flow_type=flow_type,
        total_evaluated=total_eval,
        correct_count=correct_count,
        overall_accuracy_pct=overall_acc,
        classes=classes,
        per_class_metrics=per_class,
        confusion_matrix=matrix,
        gemini_breakdown=SourceBreakdown(
            total=gemini_total,
            correct=gemini_correct,
            accuracy_pct=gem_acc,
        ),
        fallback_breakdown=SourceBreakdown(
            total=fallback_total,
            correct=fallback_correct,
            accuracy_pct=fb_acc,
        ),
        confidence_stats=ConfidenceStats(
            mean_overall=mean_all,
            mean_correct=mean_corr,
            mean_incorrect=mean_inc,
            correlation_holds=corr_holds,
        ),
        records=records_eval,
    )


def evaluate_all_flows(db_session: Session) -> OverallEvaluationSummary:
    """
    Evaluate all 3 diagnostic flows and produce aggregate cross-system benchmarks.
    """
    flows = ["payment", "mandate", "receivable"]
    reports: Dict[str, AccuracyReport] = {}
    
    total_eval = 0
    total_corr = 0
    gem_total = 0
    gem_corr = 0
    fb_total = 0
    fb_corr = 0
    all_corr_conf: List[float] = []
    all_inc_conf: List[float] = []
    all_conf: List[float] = []

    for f in flows:
        rep = evaluate_diagnosis_accuracy(db_session, f)
        reports[f] = rep

        total_eval += rep.total_evaluated
        total_corr += rep.correct_count
        gem_total += rep.gemini_breakdown.total
        gem_corr += rep.gemini_breakdown.correct
        fb_total += rep.fallback_breakdown.total
        fb_corr += rep.fallback_breakdown.correct

        for r in rep.records:
            all_conf.append(r["confidence"])
            if r["is_correct"]:
                all_corr_conf.append(r["confidence"])
            else:
                all_inc_conf.append(r["confidence"])

    overall_acc = round((total_corr / total_eval * 100.0), 2) if total_eval > 0 else 0.0
    gem_acc = round((gem_corr / gem_total * 100.0), 2) if gem_total > 0 else 0.0
    fb_acc = round((fb_corr / fb_total * 100.0), 2) if fb_total > 0 else 0.0

    mean_all = round(sum(all_conf) / len(all_conf), 4) if all_conf else 0.0
    mean_corr = round(sum(all_corr_conf) / len(all_corr_conf), 4) if all_corr_conf else 0.0
    mean_inc = round(sum(all_inc_conf) / len(all_inc_conf), 4) if all_inc_conf else None
    corr_holds = (mean_inc is None) or (mean_corr > mean_inc)

    return OverallEvaluationSummary(
        total_evaluated=total_eval,
        total_correct=total_corr,
        overall_accuracy_pct=overall_acc,
        gemini_overall_accuracy_pct=gem_acc,
        fallback_overall_accuracy_pct=fb_acc,
        confidence_stats=ConfidenceStats(
            mean_overall=mean_all,
            mean_correct=mean_corr,
            mean_incorrect=mean_inc,
            correlation_holds=corr_holds,
        ),
        flow_reports=reports,
    )
