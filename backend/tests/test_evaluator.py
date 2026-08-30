import pytest
from app.database import SessionLocal, Base, engine
from app.models import FailedPayment, FailedMandate, OverdueInvoice, AuditLog
from app.engine.evaluator import evaluate_diagnosis_accuracy, evaluate_all_flows
from app.engine.diagnoser import diagnose, diagnose_mandate, diagnose_receivable
from app.data_generator import PAYMENT_GROUND_TRUTH_MAP, MANDATE_GROUND_TRUTH_MAP, get_receivable_ground_truth


def test_evaluator_payment_accuracy_and_confusion_matrix():
    db = SessionLocal()
    try:
        report = evaluate_diagnosis_accuracy(db, "payment")
        assert report.flow_type == "payment"
        assert report.total_evaluated == 60
        assert 70.0 <= report.overall_accuracy_pct <= 90.0
        assert "insufficient_funds" in report.classes
        assert "bank_timeout" in report.classes
        assert report.confidence_stats.correlation_holds is True
        assert report.confidence_stats.mean_correct > report.confidence_stats.mean_incorrect
        
        # Check that confusion matrix contains realistic off-diagonal entries
        off_diagonal_sum = 0
        for act in report.classes:
            for pred in report.classes:
                if act != pred:
                    off_diagonal_sum += report.confusion_matrix[act].get(pred, 0)
        assert off_diagonal_sum > 0, "Expected realistic confusion entries in confusion matrix"
    finally:
        db.close()


def test_evaluator_mandate_accuracy_and_source_breakdown():
    db = SessionLocal()
    try:
        report = evaluate_diagnosis_accuracy(db, "mandate")
        assert report.flow_type == "mandate"
        assert report.total_evaluated == 20
        assert 70.0 <= report.overall_accuracy_pct <= 90.0
        assert report.fallback_breakdown.total == 3  # 3 customer_paused_mandate hard-stops
        assert report.fallback_breakdown.correct == 3
        assert report.gemini_breakdown.total == 17
        assert report.confidence_stats.correlation_holds is True
    finally:
        db.close()


def test_evaluator_receivable_accuracy():
    db = SessionLocal()
    try:
        report = evaluate_diagnosis_accuracy(db, "receivable")
        assert report.flow_type == "receivable"
        assert report.total_evaluated == 25
        assert 70.0 <= report.overall_accuracy_pct <= 90.0
        assert report.confidence_stats.correlation_holds is True
    finally:
        db.close()


def test_evaluate_all_flows_aggregate():
    db = SessionLocal()
    try:
        summary = evaluate_all_flows(db)
        assert summary.total_evaluated == 105
        assert 70.0 <= summary.overall_accuracy_pct <= 90.0
        assert summary.fallback_overall_accuracy_pct == 100.0
        assert summary.confidence_stats.correlation_holds is True
        assert summary.confidence_stats.mean_correct > summary.confidence_stats.mean_incorrect
        assert len(summary.flow_reports) == 3
    finally:
        db.close()

