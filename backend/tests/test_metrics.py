import pytest
import os
from unittest.mock import MagicMock, patch
from app.database import SessionLocal, Base, engine
from scripts.seed import seed_database
from app.engine.pipeline import (
    run_recovery_batch,
    run_abandonment_batch,
    run_mandate_batch,
    run_receivables_batch,
)
from app.engine.metrics import get_unified_summary


def test_unified_summary_structure_and_calculation():
    db = SessionLocal()
    try:
        # Seed test database cleanly
        seed_database()

        mock_client = MagicMock()
        mock_client.order.create.return_value = {"id": "order_MockedTest123", "status": "created"}
        mock_client.payment.capture.return_value = {"id": "pay_MockedTest123", "status": "captured"}

        # Patch Gemini, Razorpay, time.sleep, and dotenv to run fast offline unit tests
        with patch("app.engine.executor._get_razorpay_client", return_value=mock_client), \
             patch("time.sleep", return_value=None), \
             patch("app.engine.diagnoser.load_dotenv", return_value=None), \
             patch("app.engine.executor.load_dotenv", return_value=None), \
             patch.dict(os.environ, {"GEMINI_API_KEY": "", "RAZORPAY_KEY_ID": "", "RAZORPAY_KEY_SECRET": ""}):
            # Run batches across all flows
            run_recovery_batch(db)
            run_abandonment_batch(db)
            run_mandate_batch(db)
            run_receivables_batch(db, cycle_number=1)
            run_receivables_batch(db, cycle_number=2)
            run_receivables_batch(db, cycle_number=3)

        summary = get_unified_summary(db)

        # Assert key fields exist and are non-negative
        assert summary.total_revenue_at_risk > 0
        assert summary.total_recovery_initiated >= 0
        assert summary.total_amount_actually_recovered >= 0
        assert summary.total_permanently_protected_from_contact >= 0
        assert summary.total_escalated_to_human >= 0
        assert summary.total_still_in_progress >= 0
        assert 0.0 <= summary.initiated_rate_pct <= 100.0
        assert 0.0 <= summary.true_capture_rate_pct <= 100.0
        assert summary.audit_log_total_entries > 0

        # Assert per-flow breakdown completeness
        assert "payment" in summary.per_flow_breakdown
        assert "checkout" in summary.per_flow_breakdown
        assert "mandate" in summary.per_flow_breakdown
        assert "receivable" in summary.per_flow_breakdown

        assert summary.per_flow_breakdown["payment"].total_evaluated == 60
        assert summary.per_flow_breakdown["checkout"].total_evaluated == 15
        assert summary.per_flow_breakdown["mandate"].total_evaluated == 20
        assert summary.per_flow_breakdown["receivable"].total_evaluated == 25

        # CRITICAL ASSERTION: The four partitions MUST sum exactly to total_revenue_at_risk
        four_buckets_sum = round(
            summary.total_recovery_initiated
            + summary.total_permanently_protected_from_contact
            + summary.total_escalated_to_human
            + summary.total_still_in_progress,
            2,
        )
        assert four_buckets_sum == round(summary.total_revenue_at_risk, 2), (
            f"Expected 4 buckets to sum to {summary.total_revenue_at_risk}, got {four_buckets_sum}"
        )

        # Confirm per-flow amount_at_risk sums to total_revenue_at_risk
        sum_breakdown_risk = sum(
            flow.amount_at_risk for flow in summary.per_flow_breakdown.values()
        )
        assert round(sum_breakdown_risk, 2) == round(summary.total_revenue_at_risk, 2)

    finally:
        db.close()
