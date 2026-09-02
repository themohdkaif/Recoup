"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DigitRoll } from "@/components/DigitRoll";
import { StampMark } from "@/components/StampMark";
import { LedgerRow } from "@/components/LedgerRow";
import { useLedgerIntro } from "@/context/IntroContext";
import { ArrowRight, CheckCircle2, Play } from "lucide-react";

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

const fallbackSummary: UnifiedSummaryData = {
  total_revenue_at_risk: 6781907,
  total_recovery_initiated: 1023936,
  total_amount_actually_recovered: 460358,
  total_permanently_protected_from_contact: 10791,
  total_escalated_to_human: 5744936,
  total_still_in_progress: 2244,
  initiated_rate_pct: 15.1,
  true_capture_rate_pct: 6.8,
  per_flow_breakdown: {
    payment: {
      total_evaluated: 60,
      action_counts: { retry_payment: 57, escalate_to_human: 3 },
      amount_at_risk: 669342,
      amount_recovery_initiated: 618345,
      amount_actually_recovered: 460358,
    },
    checkout: {
      total_evaluated: 15,
      action_counts: { send_recovery_nudge: 9, hold: 6 },
      amount_at_risk: 102885,
      amount_recovery_initiated: 101591,
      amount_actually_recovered: 0,
    },
    mandate: {
      total_evaluated: 20,
      action_counts: { retry_mandate_charge: 6, escalate_to_human: 11, permanently_stop: 3 },
      amount_at_risk: 35680,
      amount_recovery_initiated: 2244,
      amount_actually_recovered: 0,
    },
    receivable: {
      total_evaluated: 25,
      action_counts: { human_handoff: 15, broken_promise: 8, firm_notice: 2 },
      amount_at_risk: 5974000,
      amount_recovery_initiated: 304000,
      amount_actually_recovered: 0,
    },
  },
  total_real_razorpay_calls_made: 100,
  audit_log_total_entries: 705,
};

interface CounterfactualTypeStats {
  guardrail_type: string;
  count_fired: number;
  additional_contacts_prevented: number;
  compliance_risks_avoided: number;
  amount_shielded: number;
  reasoning: string;
  example_record_id?: string;
  example_reasoning?: string;
  naive_action: string;
}

interface CounterfactualSummaryData {
  total_guardrails_fired: number;
  total_additional_contacts_prevented: number;
  total_compliance_risks_avoided: number;
  total_amount_shielded_from_unwanted_contact: number;
  breakdown_by_guardrail_type: Record<string, CounterfactualTypeStats>;
}

interface HumanActionStats {
  total_actions: number;
  approved_contact_count: number;
  marked_resolved_count: number;
  override_retry_count: number;
  reassigned_count: number;
  overrides_blocked_by_guardrails: number;
}

export default function OverviewPage() {
  const { openLedger } = useLedgerIntro();
  const [summary, setSummary] = useState<UnifiedSummaryData>(fallbackSummary);
  const [cfSummary, setCfSummary] = useState<CounterfactualSummaryData | null>(null);
  const [humanStats, setHumanStats] = useState<HumanActionStats | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/unified-summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.total_revenue_at_risk) {
          setSummary(data);
        }
      })
      .catch(() => {});

    fetch("http://127.0.0.1:8000/api/counterfactual-summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setCfSummary(data);
        }
      })
      .catch(() => {});

    fetch("http://127.0.0.1:8000/api/human-actions/stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setHumanStats(data);
        }
      })
      .catch(() => {});
  }, []);

  // GSAP Orchestrated Page-Load Sequence (~0.8-1.2s total)
  useGSAP(
    () => {
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion || !containerRef.current) return;

      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      // 1. Double-hairline title rule draws left-to-right (0.3s)
      tl.fromTo(
        ".ledger-title-rule",
        { scaleX: 0, transformOrigin: "left center" },
        { scaleX: 1, duration: 0.3 }
      )
        // 2. Page heading fades up 8px
        .fromTo(
          ".ledger-heading-fade",
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.25 },
          "-=0.18"
        )
        // 3. Content rows stagger in with 4px upward settle (0.03s stagger)
        .fromTo(
          ".ledger-row-animate",
          { opacity: 0, y: 4 },
          { opacity: 1, y: 0, duration: 0.22, stagger: 0.03 },
          "-=0.1"
        );
    },
    { scope: containerRef, dependencies: [] }
  );

  return (
    <>
      <div
        ref={containerRef}
        className="space-y-10 max-w-5xl mx-auto pt-2 pb-16 select-none"
      >
        {/* 1. PAGE TITLE & DRAWN TITLE RULE */}
        <div className="space-y-2">
          <div className="ledger-heading-fade space-y-1">
            <div className="flex items-baseline justify-between">
              <h1 className="font-serif text-3xl font-black tracking-tight text-[#1A2130]">
                Recovery Summary
              </h1>
              <div className="flex items-center gap-3">
                <button
                  onClick={openLedger}
                  className="font-mono text-[10px] text-[#6B7280] hover:text-[#1A2130] transition-colors flex items-center gap-1 border border-[#C9C2B4] px-1.5 py-0.5 rounded-[1px] bg-[#EAE4D9] hover:bg-[#DFD8CC] cursor-pointer"
                  title="Replay 3D Book Intro (?intro=1)"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Replay Intro</span>
                </button>
                <span className="font-mono text-xs text-[#6B7280]">
                  FOLIO PERIOD: AUG 2026
                </span>
              </div>
            </div>
            <p className="text-sm text-[#6B7280] font-sans">
              Aggregate capital defense ledger across payment failures, checkout abandonments, subscription mandates, and B2B receivables.
            </p>
        </div>

        {/* Drawn Double-Hairline Rule */}
        <div className="ledger-title-rule w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4]" />
      </div>

      {/* 2. HERO: ACTUALLY RECOVERED & THREE MAIN LEDGER LINE ITEMS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center border-b border-[#C9C2B4] pb-8">
        {/* Hero Left: Large DigitRoll Actually Recovered Amount */}
        <div className="lg:col-span-5 space-y-2 text-left pr-4 ledger-row-animate">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-[#2F6B4F] font-bold">
              Actually Recovered
            </span>
            <StampMark text="VERIFIED VIA RAZORPAY" variant="approved" size="sm" />
          </div>

          <div className="font-serif font-black text-5xl sm:text-6xl text-[#1A2130] tracking-tight">
            <DigitRoll
              value={summary.total_amount_actually_recovered ?? 460358}
              prefix="₹"
              duration={1.2}
            />
          </div>

          <div className="font-serif text-sm sm:text-base text-[#2F6B4F] font-medium italic">
            {(summary.true_capture_rate_pct ?? 6.8).toFixed(1)}% of at-risk revenue — captured and settled via Razorpay, not just attempted.
          </div>
        </div>

        {/* Hero Right: Three Key Ledger Line Items */}
        <div className="lg:col-span-7 space-y-0 border-t lg:border-t-0 border-[#C9C2B4]">
          {/* Line Item 1: Total Revenue at Risk */}
          <div className="ledger-row-animate">
            <LedgerRow
              borderTop
              isBanded={false}
              left={
                <div className="space-y-0.5">
                  <span className="font-sans text-xs font-bold uppercase tracking-wider text-[#6B7280]">
                    Line 01 // Total Revenue at Risk
                  </span>
                  <div className="text-xs text-[#1A2130]">
                    Sum total across all 120 monitored records
                  </div>
                </div>
              }
              right={
                <span className="text-base font-bold text-[#1A2130]">
                  <DigitRoll value={summary.total_revenue_at_risk} prefix="₹" />
                </span>
              }
            />
          </div>

          {/* Line Item 2: Recovery Initiated */}
          <div className="ledger-row-animate">
            <LedgerRow
              isBanded={true}
              left={
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-xs font-bold uppercase tracking-wider text-[#2F6B4F]">
                      Line 02 // Recovery Initiated
                    </span>
                    <span className="font-mono text-[10px] text-[#6B7280] font-semibold">
                      ({(summary.initiated_rate_pct ?? 15.1).toFixed(1)}% throughput)
                    </span>
                  </div>
                  <div className="text-xs text-[#1A2130]">
                    Active payment retries, recovery nudges, mandate schedules, & firm notices
                  </div>
                </div>
              }
              stamp={<StampMark text="INITIATED" variant="approved" size="sm" />}
              right={
                <span className="text-base font-bold text-[#2F6B4F]">
                  <DigitRoll value={summary.total_recovery_initiated} prefix="₹" />
                </span>
              }
            />
          </div>

          {/* Line Item 3: Escalated to Human */}
          <div className="ledger-row-animate">
            <LedgerRow
              isBanded={false}
              left={
                <div className="space-y-0.5">
                  <span className="font-sans text-xs font-bold uppercase tracking-wider text-[#B8823D]">
                    Line 03 // Escalated to Human
                  </span>
                  <div className="text-xs text-[#1A2130]">
                    Strategic accounts, fraud risk flags, churned mandates, broken promises
                  </div>
                </div>
              }
              stamp={<StampMark text="ESCALATED" variant="caution" size="sm" />}
              right={
                <span className="text-base font-bold text-[#B8823D]">
                  <DigitRoll value={summary.total_escalated_to_human} prefix="₹" />
                </span>
              }
            />
          </div>
        </div>
      </section>

      {/* 3. ACTIVE FLOW STREAMS LEDGER TABLE */}
      <section className="space-y-3">
        <div className="flex items-center justify-between ledger-row-animate">
          <h2 className="font-serif text-xl font-bold text-[#1A2130]">
            Active Flow Streams
          </h2>
          <span className="font-mono text-xs text-[#6B7280]">
            4 AUDITED CHANNELS
          </span>
        </div>

        {/* Ledger Table */}
        <div className="w-full border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
          {/* Table Header */}
          <div className="bg-[#EAE4D9] py-2.5 px-4 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[#6B7280] font-semibold border-b border-[#C9C2B4] ledger-row-animate">
            <span className="w-1/3">Stream Name & Description</span>
            <span className="w-1/6 text-center">Evaluated</span>
            <span className="w-1/4 text-right">At Risk</span>
            <span className="w-1/4 text-right">Outcome & Stamp</span>
          </div>

          {/* Row 1: Payment Gateway Failures */}
          <Link href="/payments" className="block group ledger-row-animate">
            <div className="py-4 px-4 bg-[#F7F5F0] group-hover:bg-[#DEE5D6] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#C9C2B4]">
              <div className="w-full sm:w-1/3 space-y-0.5 relative">
                <div className="font-serif font-bold text-sm text-[#1A2130] flex items-center gap-1.5">
                  <span>Payment Gateway Failures</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[#2F6B4F]" />
                </div>
                <div className="text-[11px] text-[#6B7280]">
                  Razorpay retry orders & test captures
                </div>
                <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#1A2130]/35 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-150 ease-out pointer-events-none" />
              </div>

              <div className="w-full sm:w-1/6 sm:text-center font-mono text-xs text-[#1A2130]">
                {summary.per_flow_breakdown.payment?.total_evaluated ?? 60} records
              </div>

              <div className="w-full sm:w-1/4 sm:text-right font-mono text-sm font-semibold text-[#1A2130]">
                ₹{(summary.per_flow_breakdown.payment?.amount_at_risk ?? 669342).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>

              <div className="w-full sm:w-1/4 sm:text-right flex items-center justify-end gap-2.5 font-mono text-xs">
                <span className="text-[#2F6B4F] font-semibold">
                  {summary.per_flow_breakdown.payment?.action_counts?.retry_payment ?? 57}/60 Retried
                </span>
                <StampMark text="CAPTURED" variant="approved" size="sm" />
              </div>
            </div>
          </Link>

          {/* Row 2: Checkout Abandonment */}
          <Link href="/checkout" className="block group ledger-row-animate">
            <div className="py-4 px-4 bg-[#E8EDE4] group-hover:bg-[#DEE5D6] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#C9C2B4]">
              <div className="w-full sm:w-1/3 space-y-0.5 relative">
                <div className="font-serif font-bold text-sm text-[#1A2130] flex items-center gap-1.5">
                  <span>Checkout Abandonment</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[#2F6B4F]" />
                </div>
                <div className="text-[11px] text-[#6B7280]">
                  Behavioral cart recovery nudges
                </div>
                <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#1A2130]/35 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-150 ease-out pointer-events-none" />
              </div>

              <div className="w-full sm:w-1/6 sm:text-center font-mono text-xs text-[#1A2130]">
                {summary.per_flow_breakdown.checkout?.total_evaluated ?? 15} sessions
              </div>

              <div className="w-full sm:w-1/4 sm:text-right font-mono text-sm font-semibold text-[#1A2130]">
                ₹{(summary.per_flow_breakdown.checkout?.amount_at_risk ?? 102885).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>

              <div className="w-full sm:w-1/4 sm:text-right flex items-center justify-end gap-2.5 font-mono text-xs">
                <span className="text-[#2F6B4F] font-semibold">
                  {summary.per_flow_breakdown.checkout?.action_counts?.send_recovery_nudge ?? 9}/15 Nudged
                </span>
                <StampMark text="RECOVERED" variant="approved" size="sm" />
              </div>
            </div>
          </Link>

          {/* Row 3: Subscription Mandates */}
          <Link href="/mandates" className="block group ledger-row-animate">
            <div className="py-4 px-4 bg-[#F7F5F0] group-hover:bg-[#DEE5D6] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#C9C2B4]">
              <div className="w-full sm:w-1/3 space-y-0.5 relative">
                <div className="font-serif font-bold text-sm text-[#1A2130] flex items-center gap-1.5">
                  <span>Subscription Mandates</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[#9E2319]" />
                </div>
                <div className="text-[11px] text-[#6B7280]">
                  UPI Autopay backoff + consent lockouts
                </div>
                <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#1A2130]/35 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-150 ease-out pointer-events-none" />
              </div>

              <div className="w-full sm:w-1/6 sm:text-center font-mono text-xs text-[#1A2130]">
                {summary.per_flow_breakdown.mandate?.total_evaluated ?? 20} mandates
              </div>

              <div className="w-full sm:w-1/4 sm:text-right font-mono text-sm font-semibold text-[#1A2130]">
                ₹{(summary.per_flow_breakdown.mandate?.amount_at_risk ?? 35680).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>

              <div className="w-full sm:w-1/4 sm:text-right flex items-center justify-end gap-2.5 font-mono text-xs">
                <span className="text-[#9E2319] font-semibold">3 Consent Stops</span>
                <StampMark text="HARD STOP" variant="hardstop" size="sm" />
              </div>
            </div>
          </Link>

          {/* Row 4: B2B Receivables */}
          <Link href="/receivables" className="block group ledger-row-animate">
            <div className="py-4 px-4 bg-[#E8EDE4] group-hover:bg-[#DEE5D6] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#C9C2B4]">
              <div className="w-full sm:w-1/3 space-y-0.5 relative">
                <div className="font-serif font-bold text-sm text-[#1A2130] flex items-center gap-1.5">
                  <span>B2B Overdue Receivables</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[#B8823D]" />
                </div>
                <div className="text-[11px] text-[#6B7280]">
                  Multi-cycle promise & firm notice escalation
                </div>
                <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#1A2130]/35 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-150 ease-out pointer-events-none" />
              </div>

              <div className="w-full sm:w-1/6 sm:text-center font-mono text-xs text-[#1A2130]">
                {summary.per_flow_breakdown.receivable?.total_evaluated ?? 25} invoices
              </div>

              <div className="w-full sm:w-1/4 sm:text-right font-mono text-sm font-semibold text-[#1A2130]">
                ₹{(summary.per_flow_breakdown.receivable?.amount_at_risk ?? 5974000).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>

              <div className="w-full sm:w-1/4 sm:text-right flex items-center justify-end gap-2.5 font-mono text-xs">
                <span className="text-[#B8823D] font-semibold">15 Human · 8 Broken Promises</span>
                <StampMark text="ESCALATED" variant="caution" size="sm" />
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* 4. GUARDRAIL IMPACT & COUNTERFACTUAL ANALYSIS */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#C9C2B4] pb-2 gap-2 ledger-row-animate">
          <div>
            <h2 className="font-serif text-xl font-bold text-[#1A2130]">
              Guardrail Impact & Counterfactual Analysis
            </h2>
            <p className="text-xs text-[#6B7280]">
              Quantified prevention metrics comparing autonomous policy decisions against a naive &ldquo;always retry&rdquo; baseline
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#2F6B4F] flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {cfSummary?.total_compliance_risks_avoided ?? 9} COMPLIANCE VIOLATIONS AVOIDED
            </span>
          </div>
        </div>

        {/* Counterfactual Impact Scorecards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-[#F7F5F0] border border-[#C9C2B4] space-y-1">
            <div className="text-[10px] font-mono text-[#6B7280] uppercase tracking-wider">
              Additional Contacts Prevented
            </div>
            <div className="text-2xl font-bold font-mono text-[#1A2130]">
              <DigitRoll value={cfSummary?.total_additional_contacts_prevented ?? 306} duration={1.2} />
            </div>
            <div className="text-[11px] text-[#6B7280]">
              Harassment & message spam touches suppressed across all channels
            </div>
          </div>

          <div className="p-3.5 bg-[#F7F5F0] border border-[#C9C2B4] space-y-1">
            <div className="text-[10px] font-mono text-[#6B7280] uppercase tracking-wider">
              Regulatory & Compliance Risks Prevented
            </div>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold font-mono text-[#9E2319]">
                <DigitRoll value={cfSummary?.total_compliance_risks_avoided ?? 9} duration={1.2} />
              </div>
              <StampMark text="SHIELDED" variant="hardstop" size="sm" />
            </div>
            <div className="text-[11px] text-[#6B7280]">
              Customer consent revocations and high-risk payment re-attempts blocked
            </div>
          </div>

          <div className="p-3.5 bg-[#F7F5F0] border border-[#C9C2B4] space-y-1">
            <div className="text-[10px] font-mono text-[#6B7280] uppercase tracking-wider">
              Capital Shielded from Harassment
            </div>
            <div className="text-2xl font-bold font-mono text-[#1A2130]">
              <DigitRoll prefix="₹" value={Math.round(cfSummary?.total_amount_shielded_from_unwanted_contact ?? 10765587)} duration={1.4} />
            </div>
            <div className="text-[11px] text-[#6B7280]">
              Enterprise relationships & unconsented mandates protected
            </div>
          </div>
        </div>

        {/* Breakdown by Guardrail Type with Live Examples */}
        <div className="border-t border-[#C9C2B4] divide-y divide-[#C9C2B4]">
          {/* 1. Consent Hard-Stops */}
          <div className="ledger-row-animate">
            <LedgerRow
              isBanded={false}
              left={
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-[#9E2319]">
                      Consent Hard-Stops (Authorization Revocation)
                    </span>
                    <StampMark text="HARD STOP" variant="hardstop" size="sm" />
                  </div>
                  <div className="text-xs text-[#6B7280]">
                    {cfSummary?.breakdown_by_guardrail_type?.consent_hard_stop?.example_reasoning ??
                      "mdt_8f60... — 2 additional retry attempts prevented after user revoked consent via UPI app."}
                  </div>
                </div>
              }
              stamp={<StampMark text="COMPLIANCE SHIELD" variant="hardstop" size="sm" />}
              right={
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold text-[#1A2130]">
                    {cfSummary?.breakdown_by_guardrail_type?.consent_hard_stop?.additional_contacts_prevented ?? 4} Retries Blocked
                  </div>
                  <div className="text-[11px] text-[#9E2319] font-mono">
                    {cfSummary?.breakdown_by_guardrail_type?.consent_hard_stop?.compliance_risks_avoided ?? 3} Violations Avoided
                  </div>
                </div>
              }
            />
          </div>

          {/* 2. Risk-Flagged Escalations */}
          <div className="ledger-row-animate">
            <LedgerRow
              isBanded={true}
              left={
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-[#9E2319]">
                      Risk-Flagged Fraud & Risk Review Gate
                    </span>
                    <StampMark text="FRAUD SHIELD" variant="hardstop" size="sm" />
                  </div>
                  <div className="text-xs text-[#6B7280]">
                    {cfSummary?.breakdown_by_guardrail_type?.risk_flagged_escalation?.example_reasoning ??
                      "txn_a3e9... — Prevented automated retry on high-risk transaction; routed to human review."}
                  </div>
                </div>
              }
              stamp={<StampMark text="QUARANTINED" variant="caution" size="sm" />}
              right={
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold text-[#1A2130]">
                    {cfSummary?.breakdown_by_guardrail_type?.risk_flagged_escalation?.count_fired ?? 6} Risk Retries Blocked
                  </div>
                  <div className="text-[11px] text-[#9E2319] font-mono">
                    {cfSummary?.breakdown_by_guardrail_type?.risk_flagged_escalation?.compliance_risks_avoided ?? 6} Violations Avoided
                  </div>
                </div>
              }
            />
          </div>

          {/* 3. Strategic Tier Enterprise Protection */}
          <div className="ledger-row-animate">
            <LedgerRow
              isBanded={false}
              left={
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-[#B8823D]">
                      Strategic Tier Enterprise White-Glove Handoff
                    </span>
                    <StampMark text="WHITE GLOVE" variant="caution" size="sm" />
                  </div>
                  <div className="text-xs text-[#6B7280]">
                    {cfSummary?.breakdown_by_guardrail_type?.strategic_tier_bypass?.example_reasoning ??
                      "inv_strategic... — 3 automated dunning touches prevented per account; directly transferred to executive relationship owners."}
                  </div>
                </div>
              }
              stamp={<StampMark text="RELATIONSHIP SHIELD" variant="caution" size="sm" />}
              right={
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold text-[#1A2130]">
                    {cfSummary?.breakdown_by_guardrail_type?.strategic_tier_bypass?.additional_contacts_prevented ?? 12} Dunning Touches Saved
                  </div>
                  <div className="text-[11px] text-[#B8823D] font-mono">
                    ₹{(cfSummary?.breakdown_by_guardrail_type?.strategic_tier_bypass?.amount_shielded ?? 2800000).toLocaleString("en-IN")} Protected
                  </div>
                </div>
              }
            />
          </div>

          {/* 4. Broken Promise & Debtor Fatigue Limit */}
          <div className="ledger-row-animate">
            <LedgerRow
              isBanded={true}
              left={
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-[#B8823D]">
                      Broken Promise Escalation & Touch Saturation Cap
                    </span>
                    <StampMark text="ESCALATED" variant="caution" size="sm" />
                  </div>
                  <div className="text-xs text-[#6B7280]">
                    {cfSummary?.breakdown_by_guardrail_type?.broken_promise_limit?.example_reasoning ??
                      "inv_33dd... — Automated collections terminated after failed payment commitment; shifted to structured human negotiations."}
                  </div>
                </div>
              }
              stamp={<StampMark text="FATIGUE CAP" variant="caution" size="sm" />}
              right={
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold text-[#1A2130]">
                    {cfSummary?.breakdown_by_guardrail_type?.broken_promise_limit?.additional_contacts_prevented ?? 280} Spam Touches Prevented
                  </div>
                  <div className="text-[11px] text-[#6B7280] font-mono">
                    Cap enforced at 3 touches vs naive 8
                  </div>
                </div>
              }
            />
          </div>

          {/* 5. Low Cart Value Margin Hold */}
          <div className="ledger-row-animate">
            <LedgerRow
              isBanded={false}
              left={
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm text-[#1A2130]">
                      Low Cart Value Margin Preservation (&lt; ₹300)
                    </span>
                    <StampMark text="HOLD" variant="caution" size="sm" />
                  </div>
                  <div className="text-xs text-[#6B7280]">
                    {cfSummary?.breakdown_by_guardrail_type?.low_cart_value_hold?.example_reasoning ??
                      "sess_8abd... — Recovery nudge suppressed on sub-₹300 cart to avoid negative unit economics."}
                  </div>
                </div>
              }
              stamp={<StampMark text="MARGIN SAVER" variant="caution" size="sm" />}
              right={
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold text-[#1A2130]">
                    {cfSummary?.breakdown_by_guardrail_type?.low_cart_value_hold?.count_fired ?? 4} Nudges Suppressed
                  </div>
                  <div className="text-[11px] text-[#6B7280] font-mono">
                    Zero messaging spend on sub-margin carts
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </section>

      {/* 5. HUMAN-IN-THE-LOOP ACTION CENTER SCORECARD */}
      <section className="space-y-4 pt-4 border-t-2 border-[#C9C2B4]">
        <div className="flex items-baseline justify-between border-b border-[#C9C2B4] pb-2 ledger-row-animate">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[#2F6B4F] font-bold tracking-wider">
                §06 // HUMAN-IN-THE-LOOP ACTION CENTER
              </span>
              <StampMark text="OPERATIONS SHIELD" variant="approved" size="sm" />
            </div>
            <h2 className="font-serif text-xl font-bold text-[#1A2130] mt-0.5">
              Operator Interventions & Compliance Lock Proof
            </h2>
          </div>
          <span className="text-xs font-mono text-[#6B7280]">
            IMMUTABLE AUDIT FOLIO
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 ledger-row-animate">
          {/* Total Human Actions */}
          <div className="p-4 bg-[#F7F5F0] border border-[#C9C2B4] rounded-[2px] space-y-1">
            <div className="text-[10px] font-mono uppercase text-[#6B7280]">
              Total Actions Taken
            </div>
            <div className="text-2xl font-mono font-bold text-[#1A2130]">
              <DigitRoll value={humanStats?.total_actions ?? 3} />
            </div>
            <div className="text-[10px] font-mono text-[#6B7280]">
              Logged by human operators
            </div>
          </div>

          {/* Approved Contacts */}
          <div className="p-4 bg-[#F7F5F0] border border-[#C9C2B4] rounded-[2px] space-y-1">
            <div className="text-[10px] font-mono uppercase text-[#6B7280]">
              Manual Contacts Authorized
            </div>
            <div className="text-2xl font-mono font-bold text-[#2F6B4F]">
              <DigitRoll value={humanStats?.approved_contact_count ?? 0} />
            </div>
            <div className="text-[10px] font-mono text-[#6B7280]">
              Single high-touch outreach
            </div>
          </div>

          {/* Marked Resolved */}
          <div className="p-4 bg-[#F7F5F0] border border-[#C9C2B4] rounded-[2px] space-y-1">
            <div className="text-[10px] font-mono uppercase text-[#6B7280]">
              Marked Resolved
            </div>
            <div className="text-2xl font-mono font-bold text-[#1A2130]">
              <DigitRoll value={humanStats?.marked_resolved_count ?? 1} />
            </div>
            <div className="text-[10px] font-mono text-[#6B7280]">
              Offline settlements concluded
            </div>
          </div>

          {/* Overrides Blocked by Guardrails */}
          <div className="p-4 bg-[#A8342A]/10 border-2 border-[#A8342A] rounded-[2px] space-y-1">
            <div className="text-[10px] font-mono uppercase text-[#A8342A] font-bold flex items-center justify-between">
              <span>Overrides Blocked</span>
              <StampMark text="HARD-STOP" variant="hardstop" size="sm" />
            </div>
            <div className="text-2xl font-mono font-bold text-[#A8342A]">
              <DigitRoll value={humanStats?.overrides_blocked_by_guardrails ?? 1} />
            </div>
            <div className="text-[10px] font-mono text-[#A8342A]">
              Deterministic policy refused override
            </div>
          </div>
        </div>

        <div className="p-3 bg-[#EAE4D9] border border-[#C9C2B4] rounded-[2px] text-xs font-mono text-[#1A2130] flex items-center justify-between ledger-row-animate">
          <span>
            💡 <span className="font-bold">Human-in-the-Loop Guardrail Rule:</span> Operators can review risk escalations and authorize single outreach touches, but cannot bypass consent revocation hard-stops.
          </span>
          <Link
            href="/mandates"
            className="flex items-center gap-1 text-[#2F6B4F] hover:underline font-bold text-[11px] shrink-0 ml-4"
          >
            <span>Test Mandate Override</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </section>
      </div>
    </>
  );
}
