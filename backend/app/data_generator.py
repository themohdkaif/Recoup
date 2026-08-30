import json
import os
import random
import uuid
from datetime import datetime, timedelta

# Realistic failure reasons with weights reflecting prompt requirements:
# insufficient_funds and GATEWAY_ERROR are most common, risk_check_failed is ~5% (3/60)
FAILURE_REASONS = [
    "insufficient_funds",
    "GATEWAY_ERROR",
    "BAD_REQUEST_ERROR",
    "network_error",
    "card_expired",
    "risk_check_failed",
]

FAILURE_WEIGHTS = [
    0.35,  # insufficient_funds (~35%)
    0.28,  # GATEWAY_ERROR (~28%)
    0.17,  # BAD_REQUEST_ERROR (~17%)
    0.10,  # network_error (~10%)
    0.05,  # card_expired (~5%)
    0.05,  # risk_check_failed (~5%)
]

PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet"]
PAYMENT_METHOD_WEIGHTS = [0.45, 0.35, 0.12, 0.08]

# Explicit ground truth mappings for evaluation harness (EVALUATION-ONLY, NEVER PASSED TO GEMINI)
PAYMENT_GROUND_TRUTH_MAP = {
    "insufficient_funds": "insufficient_funds",
    "GATEWAY_ERROR": "bank_timeout",
    "BAD_REQUEST_ERROR": "card_issue",
    "card_expired": "card_issue",
    "network_error": "network_issue",
    "risk_check_failed": "risk_flagged",
}

MANDATE_GROUND_TRUTH_MAP = {
    "insufficient_balance": "temporary_balance_issue",
    "mandate_expired": "mandate_needs_renewal",
    "bank_declined": "bank_rejection",
    "customer_paused_mandate": "customer_declined_consent",
    "max_amount_exceeded": "bank_rejection",
    "technical_error": "technical_glitch",
}


def get_receivable_ground_truth(history: str, days_overdue: int) -> str:
    """
    Deterministic evaluation-only ground truth mapping for overdue B2B receivables:
    - always_on_time + early overdue (<=30d): likely_oversight (routine administrative delay)
    - always_on_time + prolonged (>30d): dispute_risk (prompt payer suddenly withholding payment signals commercial dispute)
    - occasionally_late: reliable_but_slow (standard delayed payment cadence)
    - chronically_late + moderate (<=45d): cashflow_stress (acute working capital shortfall)
    - chronically_late + critical (>45d): high_default_risk (chronic aging approaching bad debt)
    - first_invoice + early (<=20d): likely_oversight (new vendor setup delay)
    - first_invoice + severe (>20d): dispute_risk (new vendor dispute / contract terms mismatch)
    """
    if history == "always_on_time":
        return "dispute_risk" if days_overdue > 30 else "likely_oversight"
    elif history == "occasionally_late":
        return "reliable_but_slow"
    elif history == "chronically_late":
        return "high_default_risk" if days_overdue > 45 else "cashflow_stress"
    elif history == "first_invoice":
        return "dispute_risk" if days_overdue > 20 else "likely_oversight"
    return "likely_oversight"


ABANDONMENT_STEPS = ["shipping_info", "payment_method", "otp_verification", "review"]
ABANDONMENT_STEP_WEIGHTS = [0.25, 0.40, 0.20, 0.15]

SUBSCRIPTION_PLANS = ["Basic Monthly", "Pro Monthly", "Pro Annual", "Team Plan"]
SUBSCRIPTION_PLAN_WEIGHTS = [0.35, 0.35, 0.15, 0.15]

MANDATE_FAILURE_CODES = [
    "insufficient_balance",
    "technical_error",
    "bank_declined",
    "customer_paused_mandate",
    "mandate_expired",
    "max_amount_exceeded",
]
MANDATE_FAILURE_WEIGHTS = [0.35, 0.25, 0.15, 0.15, 0.05, 0.05]

# Expanded pool of 35+ realistic Indian B2B company names across diverse industries
B2B_COMPANY_NAMES = [
    "Nova Techworks Pvt Ltd",
    "Apex Infra Solutions Pvt Ltd",
    "Zenith Logistics LLP",
    "Kaveri Enterprises",
    "Skyline Retailers Ltd",
    "Bharat Industrial Corp",
    "Om Dynamics Pvt Ltd",
    "Sunbeam Polymers LLP",
    "Vanguard Cloud Systems",
    "Trinity Healthcare Pvt Ltd",
    "BluePeak Distribution",
    "Sterling Capital Partners",
    "Matrix Precision Tools",
    "Horizon Digital Agency",
    "Surya Agro Commodities",
    "Paramount Steel & Tube Ltd",
    "Pinnacle BioPharma",
    "Acme Engineering Works",
    "Garuda Aerospace Logistics",
    "Indus Valley Textiles Ltd",
    "Falcon Heavy Fabworks",
    "Saffron Cybernetics LLP",
    "Everest Cold Chain Solutions",
    "Deccan Mineral Refineries",
    "Vyom Robotics Pvt Ltd",
    "Trikon Renewable Energy",
    "GreenRoot Agro Processing",
    "Aditi Logistics & Freight",
    "Alokik Media & Networks",
    "Samarth Packaging Industries",
    "Crestline Automotive Components",
    "Kalyani Precision Castings",
    "Vayu Renewables Pvt Ltd",
    "Sudarshan Chemicals India",
    "Pratham Edutech Systems",
]

PAYMENT_HISTORIES = ["always_on_time", "occasionally_late", "chronically_late", "first_invoice"]
PAYMENT_HISTORY_WEIGHTS = [0.35, 0.40, 0.15, 0.10]

RELATIONSHIP_TIERS = ["standard", "high_value", "strategic"]
RELATIONSHIP_TIER_WEIGHTS = [0.50, 0.30, 0.20]


def get_random_timestamp(days_back: int = 14) -> datetime:
    """Generate a random timestamp within the last `days_back` days."""
    now = datetime.utcnow()
    random_seconds = random.randint(0, days_back * 24 * 3600)
    return now - timedelta(seconds=random_seconds)


def get_realistic_amount() -> float:
    """Generate realistic amounts from ₹199 to ₹45,000 with realistic pricing patterns."""
    tier = random.choices(
        population=["micro", "standard", "mid", "high"],
        weights=[0.30, 0.45, 0.18, 0.07],
        k=1,
    )[0]

    if tier == "micro":
        return float(random.choice([199, 249, 299, 499, 799, 999]))
    elif tier == "standard":
        return float(random.choice([1299, 1499, 1999, 2499, 3499, 4999, 5999, 7499, 8999]))
    elif tier == "mid":
        return float(random.choice([10499, 12999, 14999, 18999, 22499, 24999]))
    else:  # high
        return float(random.choice([29999, 34999, 39999, 42999, 45000]))


def get_subscription_amount(plan: str) -> float:
    """Generate realistic pricing based on subscription plan tier."""
    if plan == "Basic Monthly":
        return float(random.choice([99, 149, 199, 299]))
    elif plan == "Pro Monthly":
        return float(random.choice([499, 699, 799, 999]))
    elif plan == "Pro Annual":
        return float(random.choice([2499, 3499, 3999, 4999]))
    else:  # Team Plan
        return float(random.choice([1499, 1999, 2999, 4999]))


def get_b2b_invoice_amount(tier: str = "standard") -> float:
    """Generate realistic B2B invoice amounts from ₹15,000 to ₹8,50,000."""
    if tier == "strategic":
        return float(random.choice([450000, 550000, 650000, 750000, 850000]))
    elif tier == "high_value":
        return float(random.choice([180000, 220000, 280000, 350000, 420000]))
    else:  # standard
        return float(random.choice([15000, 24000, 38000, 55000, 85000, 120000]))


STANDARD_GATEWAY_MESSAGES = {
    "insufficient_funds": "Declined by issuer (51): Insufficient funds in account",
    "GATEWAY_ERROR": "Bank switch timeout (91): Issuer gateway did not respond within 30s",
    "BAD_REQUEST_ERROR": "Card verification failed (14): Invalid card number or checksum",
    "card_expired": "Card expired (54): Expiry date passed prior to auth challenge",
    "risk_check_failed": "Risk engine velocity score 94: High fraud risk pattern flagged",
    "network_error": "Socket drop during 3DS verification handshake with card network",
}


def generate_failed_payments(count: int = 60) -> list[dict]:
    """Generate synthetic failed payment records with realistic signal ambiguity."""
    records = []
    customer_pool = [f"cust_{uuid.uuid4().hex[:8]}" for _ in range(50)]

    for _ in range(count):
        cust_id = random.choice(customer_pool)
        failure_code = random.choices(FAILURE_REASONS, weights=FAILURE_WEIGHTS, k=1)[0]
        payment_method = random.choices(PAYMENT_METHODS, weights=PAYMENT_METHOD_WEIGHTS, k=1)[0]
        
        if failure_code == "card_expired":
            payment_method = "card"

        created_dt = get_random_timestamp(days_back=14)
        msg = STANDARD_GATEWAY_MESSAGES.get(failure_code, "Transaction processing failure")

        record = {
            "transaction_id": f"txn_{uuid.uuid4().hex}",
            "customer_id": cust_id,
            "amount": get_realistic_amount(),
            "currency": "INR",
            "failure_reason_code": failure_code,
            "gateway_message": msg,
            "payment_method": payment_method,
            "attempt_number": 1,
            "created_at": created_dt.isoformat(),
            "customer_contact_prefs": {
                "allow_sms": random.choice([True, True, False]),
                "allow_email": random.choice([True, True, True, False]),
                "allow_call": random.choice([True, False, False]),
                "quiet_hours": "22:00-08:00",
            },
            "previous_successful_payments": random.randint(0, 20),
            "ground_truth_root_cause": PAYMENT_GROUND_TRUTH_MAP.get(failure_code, "unknown"),
        }
        records.append(record)

    # Ensure realistic risk_check_failed distribution (approx 3-4 records)
    risk_count = sum(1 for r in records if r["failure_reason_code"] == "risk_check_failed")
    if risk_count < 3:
        for r in records:
            if r["failure_reason_code"] != "risk_check_failed" and risk_count < 3:
                r["failure_reason_code"] = "risk_check_failed"
                r["gateway_message"] = STANDARD_GATEWAY_MESSAGES["risk_check_failed"]
                r["ground_truth_root_cause"] = "risk_flagged"
                risk_count += 1
    elif risk_count > 5:
        for r in records:
            if r["failure_reason_code"] == "risk_check_failed" and risk_count > 4:
                r["failure_reason_code"] = "insufficient_funds"
                r["gateway_message"] = STANDARD_GATEWAY_MESSAGES["insufficient_funds"]
                r["ground_truth_root_cause"] = "insufficient_funds"
                risk_count -= 1

    # Inject realistic production ambiguity across ~20% of payment records (12/60 records)
    ambiguous_payment_indices = [4, 9, 14, 19, 24, 29, 34, 39, 44, 49, 54, 59]
    for idx, r_idx in enumerate(ambiguous_payment_indices):
        if r_idx < len(records):
            rec = records[r_idx]
            if idx % 4 == 0:
                # Bank reported generic gateway error, but underlying issue was customer balance timeout
                rec["failure_reason_code"] = "GATEWAY_ERROR"
                rec["gateway_message"] = "Issuer switch 91: timeout awaiting balance check confirmation"
                rec["ground_truth_root_cause"] = "insufficient_funds"
            elif idx % 4 == 1:
                # Network packet drop during acquirer communication
                rec["failure_reason_code"] = "network_error"
                rec["gateway_message"] = "Connection reset by acquiring server during bank authorization"
                rec["ground_truth_root_cause"] = "bank_timeout"
            elif idx % 4 == 2:
                # High-value transaction OTP challenge dropped by bank switch
                rec["failure_reason_code"] = "insufficient_funds"
                rec["gateway_message"] = "High value transfer authorization challenged and interrupted"
                rec["ground_truth_root_cause"] = "bank_timeout"
            else:
                # Bad request error due to malformed TCP packet in transit
                rec["failure_reason_code"] = "BAD_REQUEST_ERROR"
                rec["gateway_message"] = "Payload truncated during network transmission"
                rec["ground_truth_root_cause"] = "network_issue"

    return records


def generate_checkout_abandonments(count: int = 15) -> list[dict]:
    """Generate synthetic checkout abandonment records."""
    records = []
    for i in range(count):
        session_dt = get_random_timestamp(days_back=14)
        step = random.choices(ABANDONMENT_STEPS, weights=ABANDONMENT_STEP_WEIGHTS, k=1)[0]
        items = random.randint(1, 6)
        
        # Ensure 2 records have cart_value < 300 to showcase sub-₹300 cart hold policy
        if i == 0:
            cart_value = 199.0
        elif i == 1:
            cart_value = 249.0
        else:
            cart_value = get_realistic_amount()

        record = {
            "session_id": f"sess_{uuid.uuid4().hex[:12]}",
            "customer_id": f"cust_{uuid.uuid4().hex[:8]}",
            "cart_value": cart_value,
            "items_count": items,
            "abandoned_at_step": step,
            "timestamp": session_dt.isoformat(),
            "recovery_attempted": False,
        }
        records.append(record)
    return records


def generate_failed_mandates(count: int = 20) -> list[dict]:
    """Generate synthetic failed subscription mandate records with signal ambiguity."""
    records = []
    for _ in range(count):
        mandate_dt = get_random_timestamp(days_back=7)
        plan = random.choices(SUBSCRIPTION_PLANS, weights=SUBSCRIPTION_PLAN_WEIGHTS, k=1)[0]
        failure_code = random.choices(MANDATE_FAILURE_CODES, weights=MANDATE_FAILURE_WEIGHTS, k=1)[0]
        amount = get_subscription_amount(plan)
        days_ago = random.randint(5, 400)

        record = {
            "mandate_id": f"mdt_{uuid.uuid4().hex}",
            "customer_id": f"cust_{uuid.uuid4().hex[:8]}",
            "subscription_plan": plan,
            "amount": amount,
            "currency": "INR",
            "mandate_failure_code": failure_code,
            "retry_attempt_number": random.choice([1, 1, 1, 2, 2, 3]),
            "last_successful_charge_days_ago": days_ago,
            "created_at": mandate_dt.isoformat(),
            "recovery_attempted": False,
            "ground_truth_root_cause": MANDATE_GROUND_TRUTH_MAP.get(failure_code, "technical_glitch"),
        }
        records.append(record)

    # Ensure exactly 3 customer_paused_mandate records for consent hard-stop policy demonstration
    paused_count = sum(1 for r in records if r["mandate_failure_code"] == "customer_paused_mandate")
    if paused_count < 3:
        for r in records:
            if r["mandate_failure_code"] != "customer_paused_mandate" and paused_count < 3:
                r["mandate_failure_code"] = "customer_paused_mandate"
                r["ground_truth_root_cause"] = "customer_declined_consent"
                paused_count += 1
    elif paused_count > 3:
        for r in records:
            if r["mandate_failure_code"] == "customer_paused_mandate" and paused_count > 3:
                r["mandate_failure_code"] = "insufficient_balance"
                r["ground_truth_root_cause"] = "temporary_balance_issue"
                paused_count -= 1

    # Inject realistic mandate ambiguity in ~20% of records (4/20 records)
    ambiguous_mandate_indices = [3, 7, 11, 15]
    for idx, m_idx in enumerate(ambiguous_mandate_indices):
        if m_idx < len(records):
            rec = records[m_idx]
            if rec["mandate_failure_code"] != "customer_paused_mandate":
                if idx % 3 == 0:
                    # Bank reported technical_error, but underlying cause was temporary insufficient balance
                    rec["mandate_failure_code"] = "technical_error"
                    rec["ground_truth_root_cause"] = "temporary_balance_issue"
                elif idx % 3 == 1:
                    # Bank reported bank_declined due to transient switch timeout
                    rec["mandate_failure_code"] = "bank_declined"
                    rec["ground_truth_root_cause"] = "technical_glitch"
                else:
                    # Mandate failed with insufficient balance, but account is closed / inactive
                    rec["mandate_failure_code"] = "insufficient_balance"
                    rec["last_successful_charge_days_ago"] = 320
                    rec["ground_truth_root_cause"] = "bank_rejection"

    return records


def generate_overdue_invoices(count: int = 25) -> list[dict]:
    """Generate synthetic overdue B2B receivables records with realistic delinquency overlap."""
    records = []
    now = datetime.utcnow()

    # Select 25 completely distinct company names without repetition
    selected_companies = random.sample(B2B_COMPANY_NAMES, count)

    buckets = [
        (5, 15),
        (16, 30),
        (31, 60),
        (61, 90),
    ]

    for i in range(count):
        company_name = selected_companies[i]
        
        # Ensure exactly 4 strategic accounts, 8 high_value accounts, 13 standard accounts
        if i < 4:
            tier = "strategic"
        elif i < 12:
            tier = "high_value"
        else:
            tier = "standard"

        amount = get_b2b_invoice_amount(tier)
        
        # Cycle through buckets to guarantee representation in each aging tier
        bucket_min, bucket_max = buckets[i % len(buckets)]
        days_overdue = random.randint(bucket_min, bucket_max)
        
        due_date = now - timedelta(days=days_overdue)
        history = random.choices(PAYMENT_HISTORIES, weights=PAYMENT_HISTORY_WEIGHTS, k=1)[0]

        record = {
            "invoice_id": f"inv_{uuid.uuid4().hex}",
            "business_customer_id": company_name,
            "invoice_amount": amount,
            "currency": "INR",
            "due_date": due_date.isoformat(),
            "days_overdue": days_overdue,
            "previous_payment_history": history,
            "escalation_stage": "none",
            "promise_to_pay_date": None,
            "relationship_value_tier": tier,
            "recovery_attempted": False,
            "ground_truth_root_cause": get_receivable_ground_truth(history, days_overdue),
        }
        records.append(record)

    # Inject realistic receivables ambiguity across ~24% of invoices (6/25 records)
    ambiguous_invoice_indices = [2, 6, 10, 14, 18, 22]
    for idx, inv_idx in enumerate(ambiguous_invoice_indices):
        if inv_idx < len(records):
            rec = records[inv_idx]
            if idx % 4 == 0:
                # Historically prompt payer slightly past 30d due to corporate accounting holiday, NOT dispute
                rec["previous_payment_history"] = "always_on_time"
                rec["days_overdue"] = 33
                rec["ground_truth_root_cause"] = "likely_oversight"
            elif idx % 4 == 1:
                # Occasionally late payer facing severe seasonal cashflow stress on large invoice
                rec["previous_payment_history"] = "occasionally_late"
                rec["days_overdue"] = 42
                rec["ground_truth_root_cause"] = "cashflow_stress"
            elif idx % 4 == 2:
                # Chronically late payer withholding payment due to commercial invoice discrepancy
                rec["previous_payment_history"] = "chronically_late"
                rec["days_overdue"] = 38
                rec["ground_truth_root_cause"] = "dispute_risk"
            else:
                # First invoice with extended onboarding delay, but clean contractual terms
                rec["previous_payment_history"] = "first_invoice"
                rec["days_overdue"] = 24
                rec["ground_truth_root_cause"] = "likely_oversight"

    return records


def generate_and_save_all(
    seed_dir: str = None,
    failed_count: int = 60,
    abandon_count: int = 15,
    mandate_count: int = 20,
    invoice_count: int = 25,
) -> tuple[str, str, str, str]:
    """Generate all datasets and save to JSON files."""
    if seed_dir is None:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        seed_dir = os.path.join(base_dir, "seed_data")

    os.makedirs(seed_dir, exist_ok=True)

    failed_payments = generate_failed_payments(failed_count)
    abandonments = generate_checkout_abandonments(abandon_count)
    mandates = generate_failed_mandates(mandate_count)
    invoices = generate_overdue_invoices(invoice_count)

    failed_file = os.path.join(seed_dir, "failed_payments.json")
    abandon_file = os.path.join(seed_dir, "checkout_abandonment.json")
    mandate_file = os.path.join(seed_dir, "failed_mandates.json")
    invoice_file = os.path.join(seed_dir, "overdue_invoices.json")

    with open(failed_file, "w", encoding="utf-8") as f:
        json.dump(failed_payments, f, indent=2)

    with open(abandon_file, "w", encoding="utf-8") as f:
        json.dump(abandonments, f, indent=2)

    with open(mandate_file, "w", encoding="utf-8") as f:
        json.dump(mandates, f, indent=2)

    with open(invoice_file, "w", encoding="utf-8") as f:
        json.dump(invoices, f, indent=2)

    return failed_file, abandon_file, mandate_file, invoice_file


if __name__ == "__main__":
    random.seed(42)
    f_path, a_path, m_path, i_path = generate_and_save_all()
    print(f"Generated failed payments at: {f_path}")
    print(f"Generated checkout abandonments at: {a_path}")
    print(f"Generated failed mandates at: {m_path}")
    print(f"Generated overdue invoices at: {i_path}")
