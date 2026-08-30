import json
import os
import sys
from datetime import datetime
from collections import Counter

# Ensure backend root is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import Base, engine, SessionLocal
from app.models import FailedPayment, CheckoutAbandonment, FailedMandate, OverdueInvoice, AuditLog
from app.data_generator import generate_and_save_all


def parse_datetime(val: str) -> datetime:
    return datetime.fromisoformat(val)


def seed_database():
    print("--- Starting Recoup Database Seeding ---")

    # 1. Generate/Refresh Seed JSON Data
    seed_dir = os.path.join(backend_dir, "app", "seed_data")
    failed_json_path, abandon_json_path, mandate_json_path, invoice_json_path = generate_and_save_all(
        seed_dir=seed_dir,
        failed_count=60,
        abandon_count=15,
        mandate_count=20,
        invoice_count=25,
    )
    print(f"✓ Seed JSON files generated in {seed_dir}")

    # 2. Create tables
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("✓ SQLite database tables created (failed_payments, checkout_abandonment, failed_mandates, overdue_invoices, audit_log)")

    db = SessionLocal()
    try:
        # 3. Load Failed Payments
        with open(failed_json_path, "r", encoding="utf-8") as f:
            failed_payments_data = json.load(f)

        for item in failed_payments_data:
            record = FailedPayment(
                transaction_id=item["transaction_id"],
                customer_id=item["customer_id"],
                amount=item["amount"],
                currency=item["currency"],
                failure_reason_code=item["failure_reason_code"],
                gateway_message=item.get("gateway_message"),
                payment_method=item["payment_method"],
                attempt_number=item["attempt_number"],
                created_at=parse_datetime(item["created_at"]),
                customer_contact_prefs=item["customer_contact_prefs"],
                previous_successful_payments=item["previous_successful_payments"],
                ground_truth_root_cause=item.get("ground_truth_root_cause"),
            )
            db.add(record)

        # 4. Load Checkout Abandonments
        with open(abandon_json_path, "r", encoding="utf-8") as f:
            abandonments_data = json.load(f)

        for item in abandonments_data:
            record = CheckoutAbandonment(
                session_id=item["session_id"],
                customer_id=item["customer_id"],
                cart_value=item["cart_value"],
                items_count=item["items_count"],
                abandoned_at_step=item["abandoned_at_step"],
                timestamp=parse_datetime(item["timestamp"]),
                recovery_attempted=item.get("recovery_attempted", False),
            )
            db.add(record)

        # 5. Load Failed Mandates
        with open(mandate_json_path, "r", encoding="utf-8") as f:
            mandates_data = json.load(f)

        for item in mandates_data:
            record = FailedMandate(
                mandate_id=item["mandate_id"],
                customer_id=item["customer_id"],
                subscription_plan=item["subscription_plan"],
                amount=item["amount"],
                currency=item["currency"],
                mandate_failure_code=item["mandate_failure_code"],
                retry_attempt_number=item["retry_attempt_number"],
                last_successful_charge_days_ago=item["last_successful_charge_days_ago"],
                created_at=parse_datetime(item["created_at"]),
                recovery_attempted=item.get("recovery_attempted", False),
                ground_truth_root_cause=item.get("ground_truth_root_cause"),
            )
            db.add(record)

        # 6. Load Overdue Invoices
        with open(invoice_json_path, "r", encoding="utf-8") as f:
            invoices_data = json.load(f)

        for item in invoices_data:
            record = OverdueInvoice(
                invoice_id=item["invoice_id"],
                business_customer_id=item["business_customer_id"],
                invoice_amount=item["invoice_amount"],
                currency=item["currency"],
                due_date=parse_datetime(item["due_date"]),
                days_overdue=item["days_overdue"],
                previous_payment_history=item["previous_payment_history"],
                escalation_stage=item["escalation_stage"],
                promise_to_pay_date=parse_datetime(item["promise_to_pay_date"]) if item.get("promise_to_pay_date") else None,
                relationship_value_tier=item["relationship_value_tier"],
                touch_count=item.get("touch_count", 0),
                recovery_attempted=item.get("recovery_attempted", False),
                ground_truth_root_cause=item.get("ground_truth_root_cause"),
            )
            db.add(record)

        db.commit()

        # 7. Initial Raw Ingestion Counts
        failed_count = db.query(FailedPayment).count()
        abandon_count = db.query(CheckoutAbandonment).count()
        mandate_count = db.query(FailedMandate).count()
        invoice_count = db.query(OverdueInvoice).count()

        print("\n--- Seed Verification Results ---")
        print(f"• failed_payments row count: {failed_count} (Expected: 60)")
        print(f"• checkout_abandonment row count: {abandon_count} (Expected: 15)")
        print(f"• failed_mandates row count: {mandate_count} (Expected: 20)")
        print(f"• overdue_invoices row count: {invoice_count} (Expected: 25)")

        assert failed_count == 60, f"Expected 60 failed payments, got {failed_count}"
        assert abandon_count == 15, f"Expected 15 checkout abandonments, got {abandon_count}"
        assert mandate_count == 20, f"Expected 20 failed mandates, got {mandate_count}"
        assert invoice_count == 25, f"Expected 25 overdue invoices, got {invoice_count}"

        # 8. Execute Initial Pipeline Batches across all 4 recovery vectors
        from app.engine.pipeline import (
            run_recovery_batch,
            run_abandonment_batch,
            run_mandate_batch,
            run_receivables_batch,
        )

        print("\n--- Executing Initial Pipeline Batches ---")
        p_res = run_recovery_batch(db)
        print(f"✓ Payments batch executed: {p_res['retried']} retried, {p_res['captured']} captured, ₹{p_res['total_amount_captured']:,.2f} settled")

        chk_res = run_abandonment_batch(db)
        print(f"✓ Checkout batch executed: {chk_res['nudged']} nudged, {chk_res['held']} held")

        m_res = run_mandate_batch(db)
        print(f"✓ Mandate batch executed: {m_res['retried']} retried, {m_res['permanently_stopped']} consent hard-stops")

        for cycle in [1, 2, 3]:
            r_res = run_receivables_batch(db, cycle_number=cycle)
            print(f"✓ Receivables cycle {cycle} executed: {r_res['reminders_sent']} reminders, {r_res['firm_notices_sent']} firm notices, {r_res['promises_captured']} promises")

        audit_count = db.query(AuditLog).count()
        print(f"• audit_log row count after batch runs: {audit_count} entries")

        # 8. Distribution Summary for Overdue Invoices
        invoices = db.query(OverdueInvoice).all()

        # Days overdue aging buckets
        b_5_15 = sum(1 for inv in invoices if 5 <= inv.days_overdue <= 15)
        b_16_30 = sum(1 for inv in invoices if 16 <= inv.days_overdue <= 30)
        b_31_60 = sum(1 for inv in invoices if 31 <= inv.days_overdue <= 60)
        b_61_90 = sum(1 for inv in invoices if 61 <= inv.days_overdue <= 90)

        print("\n--- Overdue Invoices Aging Buckets (Days Overdue) ---")
        print(f"  5-15 days   (Early Delinquency)   : {b_5_15:>2} ({(b_5_15/invoice_count)*100:>5.1f}%) {'█' * int(b_5_15 * 2)}")
        print(f"  16-30 days  (Moderate Past-Due)   : {b_16_30:>2} ({(b_16_30/invoice_count)*100:>5.1f}%) {'█' * int(b_16_30 * 2)}")
        print(f"  31-60 days  (Severe Aging)        : {b_31_60:>2} ({(b_31_60/invoice_count)*100:>5.1f}%) {'█' * int(b_31_60 * 2)}")
        print(f"  61-90 days  (Critical / Default)  : {b_61_90:>2} ({(b_61_90/invoice_count)*100:>5.1f}%) {'█' * int(b_61_90 * 2)}")

        # Relationship Value Tier Distribution
        tier_counts = Counter(inv.relationship_value_tier for inv in invoices)
        print("\n--- Relationship Value Tier Distribution ---")
        for tier, count in tier_counts.most_common():
            percentage = (count / invoice_count) * 100
            print(f"  {tier:<16} : {count:>2} ({percentage:>5.1f}%) {'█' * int(percentage // 2)}")

        # Payment History Distribution
        history_counts = Counter(inv.previous_payment_history for inv in invoices)
        print("\n--- Previous Payment History Distribution ---")
        for hist, count in history_counts.most_common():
            percentage = (count / invoice_count) * 100
            print(f"  {hist:<18} : {count:>2} ({percentage:>5.1f}%) {'█' * int(percentage // 2)}")

        print("\n✓ Database successfully seeded at backend/recoup.db\n")

    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
