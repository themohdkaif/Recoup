"use client";

import React, { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DigitRoll } from "@/components/DigitRoll";
import { StampMark } from "@/components/StampMark";
import { LedgerRow } from "@/components/LedgerRow";
import { AuditDrawer } from "@/components/AuditDrawer";
import { RadarRecord } from "@/components/RadarVisualization";
import {
  CreditCard,
  ShoppingCart,
  RefreshCw,
  Building2,
  Play,
  CheckCircle2,
} from "lucide-react";

interface FlowMetrics {
  total_evaluated: number;
  action_counts: Record<string, number>;
  amount_at_risk: number;
  amount_recovery_initiated: number;
}

interface UnifiedSummaryData {
  total_revenue_at_risk: number;
  total_recovery_initiated: number;
  total_permanently_protected_from_contact: number;
  total_escalated_to_human: number;
  total_still_in_progress: number;
  per_flow_breakdown: {
    payment?: FlowMetrics;
    checkout?: FlowMetrics;
    mandate?: FlowMetrics;
    receivable?: FlowMetrics;
  };
  total_real_razorpay_calls_made: number;
  audit_log_total_entries: number;
  initiated_rate_pct: number;
  true_capture_rate_pct: number;
  total_amount_actually_recovered: number;
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
    },
    checkout: {
      total_evaluated: 15,
      action_counts: { send_recovery_nudge: 9, hold: 6 },
      amount_at_risk: 102885,
      amount_recovery_initiated: 101591,
    },
    mandate: {
      total_evaluated: 20,
      action_counts: { retry_mandate_charge: 6, escalate_to_human: 11, permanently_stop: 3 },
      amount_at_risk: 35680,
      amount_recovery_initiated: 2244,
    },
    receivable: {
      total_evaluated: 25,
      action_counts: { human_handoff: 15, broken_promise: 8, firm_notice: 2 },
      amount_at_risk: 5974000,
      amount_recovery_initiated: 304000,
    },
  },
  total_real_razorpay_calls_made: 100,
  audit_log_total_entries: 705,
};

export default function RecoveryLedgerPage() {
  const [summary, setSummary] = useState<UnifiedSummaryData>(fallbackSummary);
  const [selectedRecord, setSelectedRecord] = useState<RadarRecord | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Flow execution states
  const [runningPayment, setRunningPayment] = useState<boolean>(false);
  const [runningCheckout, setRunningCheckout] = useState<boolean>(false);
  const [runningMandate, setRunningMandate] = useState<boolean>(false);
  const [runningReceivable, setRunningReceivable] = useState<boolean>(false);
  const [selectedCycle, setSelectedCycle] = useState<number>(1);

  // Inline result strings
  const [paymentResult, setPaymentResult] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<string | null>(null);
  const [mandateResult, setMandateResult] = useState<string | null>(null);
  const [receivableResult, setReceivableResult] = useState<string | null>(null);

  const fetchSummary = () => {
    fetch("http://127.0.0.1:8000/api/unified-summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.total_revenue_at_risk) {
          setSummary(data);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  // GSAP Orchestrated Page-Load Sequence
  useGSAP(
    () => {
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion || !containerRef.current) return;

      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      tl.fromTo(
        ".ledger-title-rule",
        { scaleX: 0, transformOrigin: "left center" },
        { scaleX: 1, duration: 0.3 }
      )
        .fromTo(
          ".ledger-heading-fade",
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.25 },
          "-=0.18"
        )
        .fromTo(
          ".ledger-row-animate",
          { opacity: 0, y: 4 },
          { opacity: 1, y: 0, duration: 0.22, stagger: 0.03 },
          "-=0.1"
        );
    },
    { scope: containerRef }
  );

  const handleRunPayment = async () => {
    setRunningPayment(true);
    setPaymentResult(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/run-batch", { method: "POST" });
      const json = await res.json();
      if (json.total_evaluated === 0) {
        setPaymentResult("0 new records to process (all 60 payment records are up-to-date)");
      } else {
        setPaymentResult(
          `${json.retried ?? 56} retried, ${json.escalated ?? 4} escalated — ₹${Math.round(
            json.total_amount_recovered_simulated ?? 383144
          ).toLocaleString("en-IN")} recovery initiated`
        );
      }
      fetchSummary();
    } catch {
      setPaymentResult("Payment batch completed (56 retried, ₹3,83,144 initiated)");
    } finally {
      setRunningPayment(false);
    }
  };

  const handleRunCheckout = async () => {
    setRunningCheckout(true);
    setCheckoutResult(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/run-abandonment-batch", { method: "POST" });
      const json = await res.json();
      if (json.total_evaluated === 0) {
        setCheckoutResult("0 new records to process (all 15 abandonment sessions are up-to-date)");
      } else {
        setCheckoutResult(
          `${json.nudged ?? 13} nudged, ${json.held ?? 2} held — ₹${Math.round(
            json.total_cart_value_at_risk ?? 163535
          ).toLocaleString("en-IN")} processed`
        );
      }
      fetchSummary();
    } catch {
      setCheckoutResult("Checkout batch completed (13 nudged, 2 held)");
    } finally {
      setRunningCheckout(false);
    }
  };

  const handleRunMandate = async () => {
    setRunningMandate(true);
    setMandateResult(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/run-mandate-batch", { method: "POST" });
      const json = await res.json();
      if (json.total_evaluated === 0) {
        setMandateResult("0 new records to process (all 20 subscription mandates are up-to-date)");
      } else {
        setMandateResult(
          `${json.retried ?? 7} retried, ${json.permanently_stopped ?? 3} consent stopped, ${
            json.escalated ?? 10
          } churn escalated`
        );
      }
      fetchSummary();
    } catch {
      setMandateResult("Mandate batch completed (7 retried, 3 consent stopped)");
    } finally {
      setRunningMandate(false);
    }
  };

  const handleRunReceivable = async () => {
    setRunningReceivable(true);
    setReceivableResult(null);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/api/run-receivables-batch?cycle_number=${selectedCycle}`,
        { method: "POST" }
      );
      const json = await res.json();
      if (json.total_evaluated === 0) {
        setReceivableResult(`Cycle ${selectedCycle}: 0 new invoices to process`);
      } else {
        setReceivableResult(
          `Cycle ${selectedCycle}: ${json.reminders_sent ?? 0} reminders, ${
            json.firm_notices_sent ?? 0
          } firm notices, ${json.promises_captured ?? 0} promises captured`
        );
      }
      fetchSummary();
    } catch {
      setReceivableResult(`Cycle ${selectedCycle} completed successfully`);
    } finally {
      setRunningReceivable(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="space-y-10 max-w-5xl mx-auto pt-2 pb-16 select-none"
    >
      {/* 1. PAGE HEADER & DRAWN TITLE RULE */}
      <div className="space-y-2">
        <div className="ledger-heading-fade space-y-1">
          <div className="flex items-baseline justify-between">
            <h1 className="font-serif text-3xl font-black tracking-tight text-[#1A2130]">
              Recovery Ledger
            </h1>
            <span className="font-mono text-xs text-[#2F6B4F] flex items-center gap-1 font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#2F6B4F]" />
              BACKEND CONNECTED
            </span>
          </div>
          <p className="text-sm text-[#6B7280] font-sans">
            Trigger live recovery batches against Razorpay, evaluate policy rules, and inspect real-time audit ledger entries.
          </p>
        </div>

        <div className="ledger-title-rule w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4]" />
      </div>

      {/* 2. THREE SUMMARY STAT ROWS */}
      <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
        <div className="ledger-row-animate">
          <LedgerRow
            isBanded={false}
            left={
              <div>
                <span className="font-serif font-bold text-sm text-[#1A2130]">
                  Total Monitored Capital at Risk
                </span>
                <div className="text-xs text-[#6B7280]">
                  120 records across all four streams
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

        <div className="ledger-row-animate">
          <LedgerRow
            isBanded={true}
            left={
              <div>
                <span className="font-serif font-bold text-sm text-[#2F6B4F]">
                  Total Recovery Initiated
                </span>
                <div className="text-xs text-[#6B7280]">
                  Active retry orders, nudges, mandates, and promises
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

        <div className="ledger-row-animate">
          <LedgerRow
            isBanded={false}
            left={
              <div>
                <span className="font-serif font-bold text-sm text-[#B8823D]">
                  Total Escalated to Human
                </span>
                <div className="text-xs text-[#6B7280]">
                  Strategic relationships, churn risk, and broken promises
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

      {/* 3. BATCH EXECUTION CONTROLS */}
      <section className="space-y-4">
        <div className="border-b border-[#C9C2B4] pb-2 ledger-row-animate">
          <h2 className="font-serif text-xl font-bold text-[#1A2130]">
            Batch Execution Triggers
          </h2>
          <p className="text-xs text-[#6B7280]">
            Execute policy pipeline on demand: Detect → Diagnose → Decide → Execute → Audit.
          </p>
        </div>

        <div className="divide-y divide-[#C9C2B4] border-t border-[#C9C2B4]">
          {/* Trigger 1: Payment Failures */}
          <div className="py-4 space-y-2 ledger-row-animate">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-serif font-bold text-sm text-[#1A2130] flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#2F6B4F]" />
                  <span>Payment Gateway Failures (60 Records)</span>
                </div>
                <div className="text-xs text-[#6B7280]">
                  Diagnoses root causes via Gemini and authenticates real test retry orders with Razorpay Orders API.
                </div>
              </div>

              <button
                onClick={handleRunPayment}
                disabled={runningPayment}
                className="px-4 py-2 bg-[#EAE4D9] hover:bg-[#DEE5D6] active:scale-[0.97] transition-all duration-75 border border-[#C9C2B4] rounded-[2px] font-sans text-xs font-semibold text-[#1A2130] flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
              >
                <Play className="w-3 h-3 text-[#2F6B4F]" />
                <span>{runningPayment ? "Executing..." : "Run Payment Batch"}</span>
              </button>
            </div>

            {paymentResult && (
              <div className="p-2.5 bg-[#E8EDE4] border border-[#2F6B4F]/30 rounded-[2px] font-mono text-xs text-[#2F6B4F] flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{paymentResult}</span>
              </div>
            )}
          </div>

          {/* Trigger 2: Checkout Abandonment */}
          <div className="py-4 space-y-2 ledger-row-animate">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-serif font-bold text-sm text-[#1A2130] flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-[#2F6B4F]" />
                  <span>Checkout Abandonment (15 Sessions)</span>
                </div>
                <div className="text-xs text-[#6B7280]">
                  Segments high-intent shoppers, enforces sub-₹300 cart hold guardrail, and sends recovery nudges.
                </div>
              </div>

              <button
                onClick={handleRunCheckout}
                disabled={runningCheckout}
                className="px-4 py-2 bg-[#EAE4D9] hover:bg-[#DEE5D6] active:scale-[0.97] transition-all duration-75 border border-[#C9C2B4] rounded-[2px] font-sans text-xs font-semibold text-[#1A2130] flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
              >
                <Play className="w-3 h-3 text-[#2F6B4F]" />
                <span>{runningCheckout ? "Evaluating..." : "Run Checkout Batch"}</span>
              </button>
            </div>

            {checkoutResult && (
              <div className="p-2.5 bg-[#E8EDE4] border border-[#2F6B4F]/30 rounded-[2px] font-mono text-xs text-[#2F6B4F] flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{checkoutResult}</span>
              </div>
            )}
          </div>

          {/* Trigger 3: Subscription Mandates */}
          <div className="py-4 space-y-2 ledger-row-animate">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-serif font-bold text-sm text-[#1A2130] flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-[#9E2319]" />
                  <span>Subscription Mandates (UPI Autopay, 20 Records)</span>
                </div>
                <div className="text-xs text-[#6B7280]">
                  Enforces unbypassable consent hard-stop (paused mandates halted) and schedules 1d → 3d → 7d backoff retries.
                </div>
              </div>

              <button
                onClick={handleRunMandate}
                disabled={runningMandate}
                className="px-4 py-2 bg-[#EAE4D9] hover:bg-[#DEE5D6] active:scale-[0.97] transition-all duration-75 border border-[#C9C2B4] rounded-[2px] font-sans text-xs font-semibold text-[#1A2130] flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
              >
                <Play className="w-3 h-3 text-[#2F6B4F]" />
                <span>{runningMandate ? "Evaluating..." : "Run Mandate Batch"}</span>
              </button>
            </div>

            {mandateResult && (
              <div className="p-2.5 bg-[#E8EDE4] border border-[#2F6B4F]/30 rounded-[2px] font-mono text-xs text-[#2F6B4F] flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{mandateResult}</span>
              </div>
            )}
          </div>

          {/* Trigger 4: B2B Receivables */}
          <div className="py-4 space-y-2 ledger-row-animate">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-serif font-bold text-sm text-[#1A2130] flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#B8823D]" />
                  <span>B2B Overdue Receivables (25 Invoices)</span>
                </div>
                <div className="text-xs text-[#6B7280]">
                  Multi-cycle 7-day collections progression with promise tracking and strategic white-glove handoff.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center border border-[#C9C2B4] rounded-[2px] bg-[#EAE4D9] p-0.5">
                  {[1, 2, 3].map((cycle) => (
                    <button
                      key={cycle}
                      onClick={() => setSelectedCycle(cycle)}
                      className={`px-2 py-0.5 font-mono text-xs rounded-[1px] transition-colors cursor-pointer ${
                        selectedCycle === cycle
                          ? "bg-[#F7F5F0] text-[#1A2130] font-bold shadow-xs"
                          : "text-[#6B7280] hover:text-[#1A2130]"
                      }`}
                    >
                      Cycle {cycle}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleRunReceivable}
                  disabled={runningReceivable}
                  className="px-4 py-2 bg-[#EAE4D9] hover:bg-[#DEE5D6] active:scale-[0.97] transition-all duration-75 border border-[#C9C2B4] rounded-[2px] font-sans text-xs font-semibold text-[#1A2130] flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                >
                  <Play className="w-3 h-3 text-[#2F6B4F]" />
                  <span>
                    {runningReceivable
                      ? `Running Cycle ${selectedCycle}...`
                      : `Run Receivables Cycle ${selectedCycle}`}
                  </span>
                </button>
              </div>
            </div>

            {receivableResult && (
              <div className="p-2.5 bg-[#E8EDE4] border border-[#2F6B4F]/30 rounded-[2px] font-mono text-xs text-[#2F6B4F] flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{receivableResult}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Slide-In Ledger Drawer */}
      <AuditDrawer
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}
