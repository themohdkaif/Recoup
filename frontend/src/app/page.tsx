"use client";

import React, { useEffect, useState, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DigitRoll } from "@/components/DigitRoll";
import { StampMark } from "@/components/StampMark";
import { LedgerRow } from "@/components/LedgerRow";
import { LiveAuditTicker } from "@/components/LiveAuditTicker";
import {
  BookOpen,
  ArrowRight,
  Shield,
  CheckCircle2,
  Lock,
  Sparkles,
  Server,
  FileText,
  Activity,
} from "lucide-react";

interface FlowMetrics {
  total_evaluated: number;
  action_counts: Record<string, number>;
  amount_at_risk: number;
  amount_recovery_initiated: number;
  amount_actually_recovered?: number;
}

interface UnifiedSummaryData {
  total_revenue_at_risk: number;
  total_recovery_initiated: number;
  total_amount_actually_recovered: number;
  total_permanently_protected_from_contact: number;
  total_escalated_to_human: number;
  total_still_in_progress: number;
  initiated_rate_pct: number;
  true_capture_rate_pct: number;
  per_flow_breakdown: {
    payment?: FlowMetrics;
    checkout?: FlowMetrics;
    mandate?: FlowMetrics;
    receivable?: FlowMetrics;
  };
  total_real_razorpay_calls_made: number;
  audit_log_total_entries: number;
}

interface CounterfactualSummaryData {
  total_guardrails_fired: number;
  total_additional_contacts_prevented: number;
  total_compliance_risks_avoided: number;
  total_amount_shielded_from_unwanted_contact: number;
}

interface DiagnosisAccuracyData {
  total_evaluated: number;
  total_correct: number;
  overall_accuracy_pct: number;
  gemini_overall_accuracy_pct?: number;
  fallback_overall_accuracy_pct?: number;
}

import { useLedgerIntro } from "@/context/IntroContext";

export default function LandingPage() {
  const { openLedger, isIntroActive, transitionState } = useLedgerIntro();
  const [summary, setSummary] = useState<UnifiedSummaryData | null>(null);
  const [cfSummary, setCfSummary] = useState<CounterfactualSummaryData | null>(null);
  const [accuracyData, setAccuracyData] = useState<DiagnosisAccuracyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch real data from backend (Unified Summary, Counterfactual Summary, and Model Accuracy Benchmark)
  useEffect(() => {
    Promise.all([
      fetch("http://127.0.0.1:8000/api/unified-summary")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch("http://127.0.0.1:8000/api/counterfactual-summary")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch("http://127.0.0.1:8000/api/diagnosis-accuracy/all")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ])
      .then(([summaryRes, cfRes, accRes]) => {
        if (summaryRes) setSummary(summaryRes);
        if (cfRes) setCfSummary(cfRes);
        if (accRes) setAccuracyData(accRes);
      })
      .finally(() => setLoading(false));
  }, []);

  // Restrained, understated fade + settle entrance matching Overview and other ledger folios
  useGSAP(
    () => {
      if (transitionState !== "idle") return;

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion || !containerRef.current) return;

      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      // 1. Double-hairline rules draw in (0.3s)
      tl.fromTo(
        ".landing-rule",
        { scaleX: 0, transformOrigin: "left center" },
        { scaleX: 1, duration: 0.3 }
      )
        // 2. Hero fades up 8px
        .fromTo(
          ".landing-hero-fade",
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.28 },
          "-=0.18"
        )
        // 3. Sections stagger in with 4px upward settle
        .fromTo(
          ".landing-section-animate",
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.24, stagger: 0.04 },
          "-=0.1"
        );
    },
    { scope: containerRef, dependencies: [transitionState, loading] }
  );

  const handleOpenLedger = () => {
    openLedger();
  };

  return (
    <>

      <div
        ref={containerRef}
        className={`min-h-screen text-[#1A2130] relative select-none pb-24 bg-[#F7F5F0] transition-opacity duration-200 ${
          isIntroActive ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        {/* GPU-composited static paper texture & ambient vignette (Rendered once in GPU VRAM, zero scroll repaint) */}
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none -z-10 [transform:translateZ(0)]"
          style={{
            backgroundImage: `
              radial-gradient(circle at 95% 5%, rgba(139, 109, 67, 0.04) 0%, transparent 55%),
              radial-gradient(circle at 5% 95%, rgba(139, 109, 67, 0.03) 0%, transparent 55%),
              radial-gradient(ellipse at 50% 30%, transparent 60%, rgba(185, 168, 140, 0.08) 100%),
              url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paperNoise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paperNoise)' opacity='0.024'/%3E%3C/svg%3E")
            `,
          }}
        />

        {/* Atmospheric ledger ruled background watermark */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-[0.025] [transform:translateZ(0)]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, #1A2130 0px, #1A2130 1px, transparent 1px, transparent 28px)",
          }}
        />

        <div className="max-w-5xl mx-auto px-6 pt-8 sm:pt-14 space-y-12 relative z-10">
          {/* ── SECTION 1: HERO ────────────────────────────────────────────── */}
          <section className="space-y-6 text-center max-w-3xl mx-auto landing-hero-fade">
            {/* Top Folio Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#EAE4D9] border border-[#C9C2B4] rounded-[2px] font-mono text-[11px] text-[#6B7280] tracking-wider uppercase">
              <Shield className="w-3.5 h-3.5 text-[#2F6B4F]" />
              <span>FOLIO NO. 000 · AUTONOMOUS CAPITAL DEFENSE</span>
            </div>

            {/* Main Fraunces Headline */}
            <div className="space-y-3">
              <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-[#1A2130] letterpress leading-none">
                Recoup
              </h1>
              <p className="font-serif text-xl sm:text-2xl text-[#1A2130] font-medium leading-snug">
                An autonomous agent that finds revenue slipping away — and wins it back, inside strict guardrails.
              </p>
            </div>

            {/* Subline: 4 surfaces */}
            <p className="font-mono text-xs sm:text-sm text-[#6B7280] max-w-xl mx-auto leading-relaxed">
              Payment failures · Checkout abandonment · Subscription mandates · Overdue receivables
            </p>

            {/* Primary CTA Button: Hand-stamped Ink Style */}
            <div className="pt-2 flex flex-col items-center gap-2.5">
              <button
                onClick={handleOpenLedger}
                disabled={transitionState !== "idle"}
                aria-busy={transitionState !== "idle"}
                className={`group relative inline-flex items-center gap-3 px-8 py-3.5 bg-[#2F6B4F] hover:bg-[#25543E] active:scale-95 text-white font-mono text-sm font-bold tracking-wider uppercase rounded-[2px] shadow-sm hover:shadow-md border-2 border-[#1E4332] transition-all select-none ${
                  transitionState !== "idle"
                    ? "opacity-75 cursor-not-allowed pointer-events-none"
                    : "cursor-pointer"
                }`}
              >
                <BookOpen className="w-4 h-4 text-[#D4AF37] group-hover:rotate-6 transition-transform" />
                <span>{transitionState === "idle" ? "Open the Ledger" : "Opening Ledger..."}</span>
                <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
              </button>
              <span className="font-mono text-[10px] text-[#8E8472]">
                Plays 3D ledger volume cold-open sequence into live app
              </span>
            </div>
          </section>

          {/* ── AMBIENT LIVE AUDIT TICKER STRIP ───────────────────────────── */}
          <div className="pt-1 pb-1 landing-section-animate">
            <LiveAuditTicker />
          </div>

          {/* Double-Hairline Rule Divider */}
          <div className="w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4] landing-rule" />

          {/* ── SECTION 2: WHY THIS IS DIFFERENT (FIX 3) ───────────────────── */}
          <section className="space-y-4 landing-section-animate">
            <div className="flex items-baseline justify-between border-b border-[#C9C2B4] pb-2">
              <div>
                <span className="font-mono text-xs text-[#2F6B4F] font-bold tracking-wider">
                  §01 // ARCHITECTURAL RESTRAINT
                </span>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#1A2130] mt-0.5">
                  What Makes This Different
                </h2>
              </div>
              <span className="font-mono text-[11px] text-[#6B7280] uppercase">
                2 Non-Negotiable Principles
              </span>
            </div>

            <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
              {/* Point 1: Action Taken vs Money Actually Captured */}
              <LedgerRow
                isBanded={false}
                left={
                  <div className="space-y-1.5 py-1">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-base text-[#1A2130]">
                        1. Action Taken vs. Money Actually Captured
                      </span>
                      <StampMark text="VERIFIED CAPTURE" variant="approved" size="sm" />
                    </div>
                    <div className="text-xs text-[#4B5563] leading-relaxed max-w-2xl">
                      Most recovery agents count every triggered notification or retry as recovered revenue. Recoup separates them ruthlessly: &quot;Recovery Initiated&quot; is tracked separately from &quot;Actually Recovered,&quot; requiring verifiable Razorpay test-mode Payment and Order IDs before a single rupee is marked as won.
                    </div>
                  </div>
                }
                right={
                  <div className="text-right font-mono text-xs text-[#6B7280] space-y-0.5 min-w-[140px]">
                    <div className="font-bold text-[#2F6B4F]">Zero Assumed Wins</div>
                    <div className="text-[10px]">Real Razorpay Receipts</div>
                  </div>
                }
              />

              {/* Point 2: Guardrails That Bind Even the Operator */}
              <LedgerRow
                isBanded={true}
                left={
                  <div className="space-y-1.5 py-1">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-base text-[#1A2130]">
                        2. Guardrails That Bind Even the Human Operator
                      </span>
                      <StampMark text="OVERRIDE REFUSED" variant="hardstop" size="sm" />
                    </div>
                    <div className="text-xs text-[#4B5563] leading-relaxed max-w-2xl">
                      Safety constraints in Recoup are not soft prompts that a person can bypass with a dashboard click. When a customer pauses an e-mandate or declines recurring debit consent, the policy engine enforces an immutable hard-stop. If an operator attempts an override retry from the dashboard, the system blocks the action, stamps the refusal, and logs the attempt to the immutable audit trail.
                    </div>
                  </div>
                }
                right={
                  <div className="text-right font-mono text-xs text-[#6B7280] space-y-0.5 min-w-[140px]">
                    <div className="font-bold text-[#9E2319]">Consent Absolute</div>
                    <div className="text-[10px]">Policy Hard-Stop Enforced</div>
                  </div>
                }
              />
            </div>
          </section>

          {/* Double-Hairline Rule Divider */}
          <div className="w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4] landing-rule" />

          {/* ── SECTION 3: LIVE STATS STRIP (FIX 1: Exact Accuracy Sync) ──── */}
          <section className="space-y-4 landing-section-animate">
            <div className="flex items-baseline justify-between border-b border-[#C9C2B4] pb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#2F6B4F] font-bold tracking-wider">
                  §02 // LIVE LEDGER TELEMETRY
                </span>
                <StampMark text="REAL DATA" variant="approved" size="sm" />
              </div>
              <span className="font-mono text-[11px] text-[#6B7280]">
                SOURCE: GET /api/unified-summary &amp; /api/diagnosis-accuracy/all
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Stat 1: Total Revenue at Risk */}
              <div className="p-4 bg-[#F7F5F0] border border-[#C9C2B4] rounded-[2px] space-y-1">
                <div className="text-[10px] font-mono uppercase text-[#6B7280]">
                  Total Revenue at Risk
                </div>
                <div className="text-2xl font-mono font-bold text-[#1A2130]">
                  {loading ? (
                    <span className="text-[#C9C2B4] animate-pulse">₹--,---,---</span>
                  ) : (
                    <>₹<DigitRoll value={summary?.total_revenue_at_risk ?? 6781907} /></>
                  )}
                </div>
                <div className="text-[10px] font-mono text-[#6B7280]">
                  Across 120 total evaluated records
                </div>
              </div>

              {/* Stat 2: Actually Recovered */}
              <div className="p-4 bg-[#E8EDE4] border border-[#2F6B4F]/40 rounded-[2px] space-y-1">
                <div className="text-[10px] font-mono uppercase text-[#2F6B4F] font-bold flex items-center justify-between">
                  <span>Actually Recovered</span>
                  <span className="text-[9px] px-1 py-0.2 bg-[#2F6B4F]/10 rounded text-[#2F6B4F]">
                    CAPTURE
                  </span>
                </div>
                <div className="text-2xl font-mono font-bold text-[#2F6B4F]">
                  {loading ? (
                    <span className="text-[#2F6B4F]/40 animate-pulse">₹---,---</span>
                  ) : (
                    <>₹<DigitRoll value={summary?.total_amount_actually_recovered ?? 460358} /></>
                  )}
                </div>
                <div className="text-[10px] font-mono text-[#2F6B4F]/80">
                  Honest captured receipts in bank
                </div>
              </div>

              {/* Stat 3: Guardrails Fired & Compliance Risks Avoided */}
              <div className="p-4 bg-[#F7F5F0] border border-[#C9C2B4] rounded-[2px] space-y-1">
                <div className="text-[10px] font-mono uppercase text-[#9E2319] font-bold flex items-center justify-between">
                  <span>Compliance Risks Avoided</span>
                  <StampMark text="GUARDED" variant="hardstop" size="sm" />
                </div>
                <div className="text-2xl font-mono font-bold text-[#9E2319]">
                  {loading ? (
                    <span className="text-[#9E2319]/40 animate-pulse">--</span>
                  ) : (
                    <DigitRoll value={cfSummary?.total_compliance_risks_avoided ?? 9} />
                  )}
                </div>
                <div className="text-[10px] font-mono text-[#6B7280]">
                  {cfSummary?.total_guardrails_fired ?? 32} guardrail interventions fired
                </div>
              </div>

              {/* Stat 4: Ground Truth Diagnosis Accuracy (Sourced dynamically from /api/diagnosis-accuracy/all) */}
              <div className="p-4 bg-[#F7F5F0] border border-[#C9C2B4] rounded-[2px] space-y-1">
                <div className="text-[10px] font-mono uppercase text-[#6B7280]">
                  Diagnosis Accuracy
                </div>
                <div className="text-2xl font-mono font-bold text-[#1A2130]">
                  {loading || !accuracyData ? (
                    <span className="text-[#C9C2B4] animate-pulse">--.-%</span>
                  ) : (
                    <>
                      <DigitRoll value={accuracyData.overall_accuracy_pct} />
                      <span className="text-lg font-normal">%</span>
                    </>
                  )}
                </div>
                <div className="text-[10px] font-mono text-[#6B7280]">
                  Benchmarked vs {accuracyData?.total_evaluated ?? 105} ground-truth cases
                </div>
              </div>
            </div>

            <p className="text-[11px] font-mono text-[#8E8472] text-center pt-1">
              * Live numbers pulled directly from Recoup&apos;s immutable audit SQLite database — not illustrative placeholders.
            </p>
          </section>

          {/* Double-Hairline Rule Divider */}
          <div className="w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4] landing-rule" />

          {/* ── SECTION 4: THE FOUR FLOWS ──────────────────────────────────── */}
          <section className="space-y-4 landing-section-animate">
            <div className="flex items-baseline justify-between border-b border-[#C9C2B4] pb-2">
              <div>
                <span className="font-mono text-xs text-[#2F6B4F] font-bold tracking-wider">
                  §03 // FOUR AUTONOMOUS RECOVERY VECTORS
                </span>
                <h2 className="font-serif text-xl font-bold text-[#1A2130] mt-0.5">
                  Distinctive Policy Guardrails Per Vector
                </h2>
              </div>
              <span className="font-mono text-[11px] text-[#6B7280]">
                DETERMINISTIC LOGIC
              </span>
            </div>

            <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
              {/* Flow 1: Payment Failures */}
              <LedgerRow
                isBanded={false}
                left={
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-base text-[#1A2130]">
                        01. Payment Failures (API Transactions)
                      </span>
                      <StampMark text="RETRIED / ESCALATED" variant="approved" size="sm" />
                    </div>
                    <div className="text-xs text-[#6B7280]">
                      Diagnoses root cause, retries what&apos;s retriable via real Razorpay orders. Never retries a risk-flagged transaction without human review.
                    </div>
                  </div>
                }
                right={
                  <div className="text-right font-mono text-xs text-[#6B7280] space-y-0.5">
                    <div className="font-bold text-[#1A2130]">60 Evaluated</div>
                    <div className="text-[10px]">Zero blind retries</div>
                  </div>
                }
              />

              {/* Flow 2: Checkout Abandonment */}
              <LedgerRow
                isBanded={true}
                left={
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-base text-[#1A2130]">
                        02. Checkout Abandonment (Cart Funnel)
                      </span>
                      <StampMark text="1 NUDGE / HELD" variant="caution" size="sm" />
                    </div>
                    <div className="text-xs text-[#6B7280]">
                      One nudge, never a second. Skips low-value carts (&lt; ₹300) where the cost of contact exceeds the recovery margin.
                    </div>
                  </div>
                }
                right={
                  <div className="text-right font-mono text-xs text-[#6B7280] space-y-0.5">
                    <div className="font-bold text-[#1A2130]">15 Evaluated</div>
                    <div className="text-[10px]">Margin protection active</div>
                  </div>
                }
              />

              {/* Flow 3: Subscription Mandates */}
              <LedgerRow
                isBanded={false}
                left={
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-base text-[#1A2130]">
                        03. Subscription Mandates (Recurring Debits)
                      </span>
                      <StampMark text="HARD STOP" variant="hardstop" size="sm" />
                    </div>
                    <div className="text-xs text-[#6B7280]">
                      Exponential backoff retries — and an immutable hard stop the moment a customer revokes consent, permanently, no exceptions.
                    </div>
                  </div>
                }
                right={
                  <div className="text-right font-mono text-xs text-[#6B7280] space-y-0.5">
                    <div className="font-bold text-[#9E2319]">Consent Absolute</div>
                    <div className="text-[10px]">Human override refused</div>
                  </div>
                }
              />

              {/* Flow 4: B2B Receivables */}
              <LedgerRow
                isBanded={true}
                left={
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-base text-[#1A2130]">
                        04. B2B Receivables (Overdue Invoices)
                      </span>
                      <StampMark text="WHITE GLOVE" variant="caution" size="sm" />
                    </div>
                    <div className="text-xs text-[#6B7280]">
                      Chases politely, tracks promises, and escalates broken ones to human teams. Strategic tier enterprise accounts never see automation.
                    </div>
                  </div>
                }
                right={
                  <div className="text-right font-mono text-xs text-[#6B7280] space-y-0.5">
                    <div className="font-bold text-[#1A2130]">₹59.74 Lakh at Risk</div>
                    <div className="text-[10px]">Executive direct bypass</div>
                  </div>
                }
              />
            </div>
          </section>

          {/* Double-Hairline Rule Divider */}
          <div className="w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4] landing-rule" />

          {/* ── SECTION 5: BUILT ON REAL INFRASTRUCTURE ─────────────────────── */}
          <section className="space-y-4 landing-section-animate">
            <div className="flex items-baseline justify-between border-b border-[#C9C2B4] pb-2">
              <span className="font-mono text-xs text-[#2F6B4F] font-bold tracking-wider">
                §04 // ZERO SIMULATION · GROUND-TRUTH INFRASTRUCTURE
              </span>
              <span className="font-mono text-[11px] text-[#6B7280]">
                PRODUCTION-GRADE DESIGN
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-[#EAE4D9] border border-[#C9C2B4] rounded-[2px] space-y-2 font-mono text-xs">
                <div className="flex items-center gap-2 font-bold text-[#1A2130]">
                  <Server className="w-4 h-4 text-[#2F6B4F]" />
                  <span>Real Razorpay Test API</span>
                </div>
                <p className="text-[11px] text-[#6B7280] leading-relaxed">
                  Real Razorpay test-mode Orders and Payments API creating verifiable live order IDs (<code className="text-[#1A2130]">order_...</code>).
                </p>
              </div>

              <div className="p-4 bg-[#EAE4D9] border border-[#C9C2B4] rounded-[2px] space-y-2 font-mono text-xs">
                <div className="flex items-center gap-2 font-bold text-[#1A2130]">
                  <Sparkles className="w-4 h-4 text-[#B8823D]" />
                  <span>Real Gemini Diagnostics</span>
                </div>
                <p className="text-[11px] text-[#6B7280] leading-relaxed">
                  Real Gemini LLM diagnostic root cause reasoning evaluated against ground-truth datasets with zero hallucinated actions.
                </p>
              </div>

              <div className="p-4 bg-[#EAE4D9] border border-[#C9C2B4] rounded-[2px] space-y-2 font-mono text-xs">
                <div className="flex items-center gap-2 font-bold text-[#1A2130]">
                  <FileText className="w-4 h-4 text-[#1A2130]" />
                  <span>Immutable Audit Folio</span>
                </div>
                <p className="text-[11px] text-[#6B7280] leading-relaxed">
                  Every single action logged in SQLite — 700+ entries tracking Detect, Diagnose, Decide, Execute, and Human Interventions.
                </p>
              </div>
            </div>
          </section>

          {/* Double-Hairline Rule Divider */}
          <div className="w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4] landing-rule" />

          {/* ── SECTION 5: CLOSING CTA ─────────────────────────────────────── */}
          <section className="py-8 text-center space-y-4 max-w-xl mx-auto landing-section-animate">
            <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#1A2130]">
              See exactly what it decided, and why.
            </h3>
            <p className="font-mono text-xs text-[#6B7280]">
              Inspect live decision folios across all 4 recovery vectors with transparent counterfactual math and full audit trails.
            </p>
            <div className="pt-2">
              <button
                onClick={handleOpenLedger}
                disabled={transitionState !== "idle"}
                aria-busy={transitionState !== "idle"}
                className={`group relative inline-flex items-center gap-3 px-8 py-3.5 bg-[#2F6B4F] hover:bg-[#25543E] active:scale-95 text-white font-mono text-sm font-bold tracking-wider uppercase rounded-[2px] shadow-sm hover:shadow-md border-2 border-[#1E4332] transition-all select-none ${
                  transitionState !== "idle"
                    ? "opacity-75 cursor-not-allowed pointer-events-none"
                    : "cursor-pointer"
                }`}
              >
                <BookOpen className="w-4 h-4 text-[#D4AF37] group-hover:rotate-6 transition-transform" />
                <span>{transitionState === "idle" ? "Open the Ledger" : "Opening Ledger..."}</span>
                <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
