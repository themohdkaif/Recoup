# Recoup: Autonomous Revenue Recovery with Invariant Guardrails

[![CI](https://github.com/themohdkaif/Recoup/actions/workflows/ci.yml/badge.svg)](https://github.com/themohdkaif/Recoup/actions/workflows/ci.yml)

Recoup is an autonomous revenue recovery agent built for the Razorpay ecosystem that detects revenue slipping away across four transaction surfaces, diagnoses the root cause of failure, and executes recovery actions inside strict, deterministic safety guardrails. Built for the Razorpay AI Agents Hackathon, Recoup replaces blunt, indiscriminate retry scripts with an explainable pipeline where language models diagnose failures and deterministic code enforces non-negotiable business rules.

---

## The Problem

Revenue leakage in digital commerce and B2B workflows is fragmented and hard to recover without causing customer harm:
1. **Payment Gateway Failures**: Blind retries during bank downtime compound failure rates and degrade merchant trust.
2. **Checkout Abandonment**: Aggressive messaging on low-value carts destroys unit economics when notification costs exceed gross margin.
3. **Subscription Mandates**: Retrying recurring debits after a customer pauses or revokes authorization breaches customer consent.
4. **B2B Receivables**: Automated dunning sent to strategic accounts threatens enterprise relationships, while chronic small-invoice delays starve operational cash flow.

---

## What Recoup Does: Four Recovery Vectors

Recoup continuously monitors four core transaction surfaces with tailored policies per vector:

| Surface | Dataset | Primary Recovery Mechanism | Distinctive Policy Invariant |
|---|:---:|---|---|
| **01. Payment Failures** | 60 transactions | Real Razorpay Orders API creates a retry order; a probabilistic subset of retried orders receive a real Payments API capture based on customer payment history. | **Zero Blind Retries**: Transactions flagged with risk or fraud suspicion are quarantined for human review. |
| **02. Checkout Abandonment** | 15 sessions | Single personalized recovery nudge with optional on-demand Hinglish localization and discount incentive. | **Margin Protection**: Carts below ₹300 are suppressed from contact because notification costs exceed gross margin. |
| **03. Subscription Mandates** | 20 mandates | Sequenced 1-day → 3-day → 7-day exponential backoff retry schedule. | **Consent Hard-Stop**: If a customer pauses a mandate or revokes recurring consent, retries are halted permanently. |
| **04. B2B Receivables** | 25 invoices | Tiered multi-stage dunning (polite reminder, firm notice, executive escalation) tracked against payment promises. | **Strategic Tier Exemption**: Enterprise accounts (Tier A / Strategic) are exempt from automated contact. |

---

## What Makes Recoup Different

Recoup is built around two architectural principles:

### 1. Action Taken vs. Money Actually Captured
Most recovery systems count every triggered retry or message as won revenue. Recoup separates these stages:
- **Recovery Initiated**: Capital where recovery actions have been triggered.
- **Actually Recovered**: Capital verified by real Razorpay test-mode Payment and Order IDs settled into the merchant ledger.
- Zero assumed recoveries. Every rupee marked as recovered corresponds to a verified Razorpay test transaction identifier.

### 2. Guardrails That Bind Even the Human Operator
Safety constraints in Recoup are not soft system prompts that can be bypassed with a dashboard override:
- When a customer revokes recurring debit consent on an e-mandate, the policy engine marks the record as `permanently_stopped`.
- If an operator clicks **"Override & Force Retry"** from the human-in-the-loop dashboard, the backend policy engine **refuses the action**, stamps the record as `REFUSED_BY_GUARDRAIL`, and appends an entry to the audit log.
- Guardrails protect customer consent above all operator actions.

---

## System Architecture

Recoup enforces a strict architectural boundary: **AI diagnoses root causes; deterministic code executes decisions.**

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           RECOUP PIPELINE ARCHITECTURE                         │
└────────────────────────────────────────────────────────────────────────────────┘

  [1. DETECT]
       │  Ingests failed API payments, abandoned carts, broken mandates & invoices
       ▼
  [2. DIAGNOSE] ──▶ Google Gemini 2.5 Flash (with Deterministic Rule-Based Fallback)
       │             • Classifies root cause with calibrated confidence score (0.0 - 1.0)
       │             • Rule-based fallback activates automatically if API key is omitted
       ▼
  [3. DECIDE]   ──▶ Deterministic Policy Engine (Pure Python)
       │             • Evaluates 6 distinct guardrail rule categories (margin checks, consent, tiers)
       │             • Selects concrete action: retry_payment, send_recovery_nudge, hold, stop
       ▼
  [4. EXECUTE]  ──▶ Razorpay SDK & Execution Handlers
       │             • Creates real Razorpay test-mode Orders & Payments
       │             • Optional: On-demand Hinglish nudge generation triggered via UI
       ▼
  [5. AUDIT]    ──▶ Sequential SQLite Audit Log (Write-Ahead Logging)
                     • Application logic only ever appends — never mutates or deletes past entries
                     • Enforces full counterfactual tracking across all recovery paths
```

---

## Live System Telemetry

Directly evaluated across the seed ledger database:

- **Total Revenue at Risk**: ₹60,76,455.00 across 120 evaluated records
- **True Capital Captured**: ₹3,61,657.00 (verifiable Razorpay test-mode settlements)
- **Permanently Protected (Consent Hard-Stop)**: ₹3,092.00
- **Escalated to Human Operators**: ₹49,72,388.00 (large B2B invoices & high-risk transactions)
- **Model Diagnostic Accuracy**: 80.0% benchmarked against 105 ground-truth evaluation cases
- **Distinct Guardrail Rule Types**: 6 named categories (Consent Hard-Stop, Strategic Tier Bypass, Low Cart Value Hold, Risk-Flagged Escalation, Low-Confidence Hold, Broken Promise / Touch Limit)
- **Guardrail Events Fired**: 32 guardrail interventions on current seed dataset
- **Audit Log Entries**: 700+ sequential SQLite audit events

---

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.10+)
- **ORM & Database**: SQLAlchemy 2.0 with SQLite in Write-Ahead Logging (WAL) mode
- **Intelligence**: Google Gemini API (`gemini-2.5-flash` for diagnostic inference & on-demand Hinglish generation)
- **Payment Gateway**: Official Razorpay Python SDK (`razorpay>=1.4.1`)
- **Testing**: pytest (`pytest>=8.0.0`)

### Frontend
- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI & Styling**: React 19, TypeScript, Tailwind CSS v4
- **Motion & Visuals**: GSAP (GreenSock Animation Platform) + `@gsap/react` for 3D ledger book opening sequence and letterpress typography
- **Icons**: Lucide React

---

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── engine/
│   │   │   ├── detector.py          # Failure detection & signal normalization
│   │   │   ├── diagnoser.py         # Gemini-powered diagnosis with deterministic fallback
│   │   │   ├── policy_engine.py     # Deterministic invariant policy guardrails
│   │   │   ├── executor.py          # Razorpay SDK order creation & payment capture
│   │   │   ├── pipeline.py          # Unified detect-diagnose-decide-execute pipeline
│   │   │   ├── evaluator.py         # Precision, recall, and confusion matrix benchmarking
│   │   │   ├── counterfactual.py    # Counterfactual impact & risk prevention math
│   │   │   ├── hinglish_nudge.py    # On-demand Gemini Hinglish localization engine
│   │   │   └── metrics.py           # 4-bucket financial partition calculations
│   │   ├── data_generator.py        # Seed dataset synthesis with signal noise
│   │   ├── database.py              # SQLite WAL engine configuration
│   │   ├── models.py                # SQLAlchemy ORM models
│   │   └── main.py                  # FastAPI REST endpoints
│   ├── scripts/
│   │   ├── seed.py                  # Database initialization & seeding script
│   │   └── evaluate_report.py       # Terminal benchmark evaluation report
│   ├── tests/                       # 57 automated unit and integration tests
│   ├── main.py                      # Application entrypoint
│   └── requirements.txt             # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # Cover / Landing page with live audit ticker
│   │   │   ├── overview/            # §01 Recovery Summary & Human Action Center
│   │   │   ├── radar/               # §02 Recovery Ledger (Batch Trigger Hub & Flow Telemetry)
│   │   │   ├── payments/            # §03 Payment Failure Flow (60 records)
│   │   │   ├── checkout/            # §04 Checkout Abandonment Flow (15 records)
│   │   │   ├── mandates/            # §05 Subscription Mandate Flow (20 records)
│   │   │   ├── receivables/         # §06 B2B Receivables Flow (25 records)
│   │   │   ├── audit/               # §07 Immutable Audit Ledger & Model Benchmark
│   │   │   └── simulator/           # §08 Diagnostics Simulator & Policy Sandbox
│   │   └── components/              # Physical stationery ledger design system
│   ├── package.json                 # Frontend dependencies
│   └── tsconfig.json                # TypeScript configuration
├── shared/                          # Shared JSON schemas
└── README.md                        # Project documentation
```

---

## Setup & Execution Guide

### Quick Setup (One Command)

For macOS and Linux environments, use the automated setup and launcher scripts:

```bash
# 1. Initialize environment, install dependencies, and seed database
./setup.sh

# 2. Start both backend (FastAPI) and frontend (Next.js) servers concurrently
./start.sh
```

- **Backend API**: [http://127.0.0.1:8000](http://127.0.0.1:8000) (Interactive Swagger Docs: `/docs`)
- **Frontend App**: [http://localhost:3000](http://localhost:3000)

---

### Manual Step-by-Step Setup

If you prefer to inspect and run each step manually:

#### 1. Backend Setup

```bash
# 1. Navigate to repository root and create virtual environment
python3 -m venv backend/venv
source backend/venv/bin/activate

# 2. Install backend dependencies
pip install -r backend/requirements.txt

# 3. Configure environment variables (Optional)
# Note: SQLite path resolution is fully automatic and resolves relative to database.py.
# If keys are omitted, the engine runs with simulated Razorpay responses and deterministic diagnostic fallbacks.
cat <<EOF > backend/.env
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=placeholder_secret
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=sqlite:///./recoup.db
EOF

# 4. Seed the database with 120 records and run initial diagnostic pipeline
python backend/scripts/seed.py

# 5. Start the FastAPI backend server
./backend/venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

The backend will be live at `http://127.0.0.1:8000` with Swagger docs available at `http://127.0.0.1:8000/docs`.

#### 2. Frontend Setup

```bash
# 1. Install frontend dependencies
cd frontend
npm install

# 2. Launch the Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Running the Automated Test Suite

Run the full pytest test suite from repository root:

```bash
PYTHONPATH=backend ./backend/venv/bin/pytest backend/tests/ -v
```

**Test Coverage Status**:
- `test_abandonment.py`: 6 tests passing
- `test_counterfactual.py`: 5 tests passing
- `test_evaluator.py`: 4 tests passing
- `test_executor.py`: 4 tests passing
- `test_hinglish_nudge.py`: 3 tests passing
- `test_human_actions.py`: 4 tests passing
- `test_mandate.py`: 10 tests passing
- `test_metrics.py`: 1 test passing
- `test_policy_engine.py`: 10 tests passing
- `test_receivables.py`: 10 tests passing
- **Total**: **57 passed (100% pass rate)**

---

## Notes on Scope

1. **Razorpay Integration**:
   - Razorpay Order creation and Payment capture verification interact with Razorpay's test-mode sandbox (`https://api.razorpay.com/v1`).
   - Every recovered transaction generates real, queryable `order_...` and `pay_...` identifiers recorded in the audit log.
2. **Notification Dispatches**:
   - Customer communications (WhatsApp messages, SMS nudges, dunning emails) generate complete, localized copy with on-demand Hinglish voice synthesis. Actual telecom delivery is recorded to the database log rather than dispatched to real carrier networks.
3. **Audit Log Persistence**:
   - The application logic only ever appends new audit entries — it never edits or deletes past records. All state transitions and policy decisions are stored with ISO UTC execution timestamps.


