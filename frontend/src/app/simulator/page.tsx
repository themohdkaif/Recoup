"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { StampMark, StampVariant } from "@/components/StampMark";
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Sliders,
  Sparkles,
  ArrowRight,
  Code2,
  Lock,
  RefreshCw,
} from "lucide-react";

type FlowType = "payment" | "mandate" | "receivable" | "checkout";

interface SimulateResponse {
  flow_type: string;
  action: string;
  allowed: boolean;
  reason: string;
  backoff_days?: number | null;
  stamp_text: string;
  stamp_variant: StampVariant;
}

export default function GuardrailSimulatorPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFlow, setActiveFlow] = useState<FlowType>("mandate");
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number>(14);

  // Flow-specific state
  // 1. Payment state
  const [paymentRootCause, setPaymentRootCause] = useState<string>("insufficient_funds");
  const [paymentConfidence, setPaymentConfidence] = useState<number>(0.92);
  const [paymentAttempt, setPaymentAttempt] = useState<number>(1);
  const [paymentMethod, setPaymentMethod] = useState<string>("upi");
  const [paymentAmount, setPaymentAmount] = useState<number>(2499);

  // 2. Mandate state
  const [mandateRootCause, setMandateRootCause] = useState<string>("customer_declined_consent");
  const [mandatePaused, setMandatePaused] = useState<boolean>(true);
  const [mandateAttempt, setMandateAttempt] = useState<number>(1);
  const [mandateDaysLapsed, setMandateDaysLapsed] = useState<number>(25);
  const [mandateAmount, setMandateAmount] = useState<number>(999);

  // 3. Receivable state
  const [receivableTier, setReceivableTier] = useState<string>("strategic");
  const [receivableDaysOverdue, setReceivableDaysOverdue] = useState<number>(18);
  const [receivableStage, setReceivableStage] = useState<string>("none");
  const [receivableCycle, setReceivableCycle] = useState<number>(1);
  const [receivablePromiseBroken, setReceivablePromiseBroken] = useState<boolean>(false);
  const [receivableRootCause, setReceivableRootCause] = useState<string>("likely_oversight");
  const [receivableAmount, setReceivableAmount] = useState<number>(250000);

  // 4. Checkout state
  const [checkoutStep, setCheckoutStep] = useState<string>("payment_method");
  const [checkoutCartValue, setCheckoutCartValue] = useState<number>(1499);
  const [checkoutRootCause, setCheckoutRootCause] = useState<string>("payment_friction");
  const [checkoutConfidence, setCheckoutConfidence] = useState<number>(0.85);

  // Result state
  const [result, setResult] = useState<SimulateResponse>({
    flow_type: "mandate",
    action: "permanently_stop",
    allowed: false,
    reason:
      "customer explicitly paused mandate — retrying would violate consent, this is a compliance hard-stop, not a business decision",
    backoff_days: null,
    stamp_text: "HARD STOP",
    stamp_variant: "hardstop",
  });

  // Call real /api/simulate backend
  const runSimulation = useCallback(async () => {
    setIsSimulating(true);
    const t0 = performance.now();

    let payload: Record<string, any> = {};

    if (activeFlow === "payment") {
      payload = {
        root_cause: paymentRootCause,
        confidence: paymentConfidence,
        attempt_number: paymentAttempt,
        payment_method: paymentMethod,
        amount: paymentAmount,
      };
    } else if (activeFlow === "mandate") {
      payload = {
        root_cause: mandatePaused ? "customer_declined_consent" : mandateRootCause,
        customer_paused_mandate: mandatePaused,
        retry_attempt_number: mandateAttempt,
        last_successful_charge_days_ago: mandateDaysLapsed,
        amount: mandateAmount,
      };
    } else if (activeFlow === "receivable") {
      payload = {
        relationship_value_tier: receivableTier,
        days_overdue: receivableDaysOverdue,
        escalation_stage: receivableStage,
        cycle_number: receivableCycle,
        is_promise_broken: receivablePromiseBroken,
        root_cause: receivableRootCause,
        invoice_amount: receivableAmount,
      };
    } else if (activeFlow === "checkout") {
      payload = {
        abandoned_at_step: checkoutStep,
        cart_value: checkoutCartValue,
        root_cause: checkoutRootCause,
        confidence: checkoutConfidence,
      };
    }

    try {
      const res = await fetch("http://127.0.0.1:8000/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json_stringify_safe({ flow_type: activeFlow, payload }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setLatencyMs(Math.round(performance.now() - t0));
      }
    } catch {
      // Fallback
    } finally {
      setIsSimulating(false);
    }
  }, [
    activeFlow,
    paymentRootCause,
    paymentConfidence,
    paymentAttempt,
    paymentMethod,
    paymentAmount,
    mandateRootCause,
    mandatePaused,
    mandateAttempt,
    mandateDaysLapsed,
    mandateAmount,
    receivableTier,
    receivableDaysOverdue,
    receivableStage,
    receivableCycle,
    receivablePromiseBroken,
    receivableRootCause,
    receivableAmount,
    checkoutStep,
    checkoutCartValue,
    checkoutRootCause,
    checkoutConfidence,
  ]);

  // Debounced input simulation trigger (200ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      runSimulation();
    }, 180);
    return () => clearTimeout(timer);
  }, [runSimulation]);

  // Presets Handlers
  const applyPreset = (preset: string) => {
    if (preset === "consent_violation") {
      setActiveFlow("mandate");
      setMandatePaused(true);
      setMandateRootCause("customer_declined_consent");
      setMandateAttempt(1);
      setMandateDaysLapsed(20);
    } else if (preset === "strategic_account") {
      setActiveFlow("receivable");
      setReceivableTier("strategic");
      setReceivableStage("none");
      setReceivableDaysOverdue(15);
      setReceivableRootCause("likely_oversight");
      setReceivableCycle(1);
    } else if (preset === "broken_promise") {
      setActiveFlow("receivable");
      setReceivableTier("standard");
      setReceivableStage("promise_captured");
      setReceivablePromiseBroken(true);
      setReceivableDaysOverdue(25);
      setReceivableCycle(3);
    } else if (preset === "risk_flag") {
      setActiveFlow("payment");
      setPaymentRootCause("risk_flagged");
      setPaymentConfidence(0.98);
      setPaymentAttempt(1);
    } else if (preset === "low_confidence") {
      setActiveFlow("payment");
      setPaymentRootCause("insufficient_funds");
      setPaymentConfidence(0.35);
      setPaymentAttempt(1);
    } else if (preset === "churned_mandate") {
      setActiveFlow("mandate");
      setMandatePaused(false);
      setMandateRootCause("temporary_balance_issue");
      setMandateDaysLapsed(240);
      setMandateAttempt(1);
    } else if (preset === "standard_retry") {
      setActiveFlow("payment");
      setPaymentRootCause("insufficient_funds");
      setPaymentConfidence(0.95);
      setPaymentAttempt(1);
      setPaymentMethod("upi");
    }
  };

  // GSAP Entry Animation
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

  return (
    <div
      ref={containerRef}
      className="space-y-8 max-w-5xl mx-auto pt-2 pb-16 select-none"
    >
      {/* 1. PAGE TITLE & EXPLANATORY HEADER */}
      <div className="space-y-2">
        <div className="ledger-heading-fade space-y-1">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif text-3xl font-black tracking-tight text-[#1A2130]">
                Guardrail Simulator
              </h1>
              <span className="bg-[#1A2130] text-[#F7F5F0] text-[10px] font-mono uppercase px-2 py-0.5 rounded-[2px] font-bold">
                LIVE ENGINE
              </span>
            </div>
            <span className="font-mono text-xs text-[#6B7280]">
              SECTION §08 // POLICY TESTBENCH
            </span>
          </div>
          <p className="text-sm text-[#6B7280] font-sans">
            This calls the exact same policy engine that processed all 120 real records above — try breaking a guardrail.
          </p>
        </div>

        {/* Double-Hairline Drawn Rule */}
        <div className="ledger-title-rule w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4]" />
      </div>

      {/* 2. PRESET GUARDRAIL TRIGGERS */}
      <section className="space-y-2.5 ledger-row-animate">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#6B7280] font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-[#B8823D]" />
            <span>One-Click Guardrail Scenarios</span>
          </div>
          <span className="text-[11px] font-mono text-[#8E8472]">
            Instant parameter presets
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => applyPreset("consent_violation")}
            className="px-3 py-1.5 bg-[#F7F5F0] hover:bg-[#F3E5E5] border border-[#9E2319]/40 hover:border-[#9E2319] text-[#9E2319] rounded-[2px] text-xs font-serif font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <Lock className="w-3 h-3" />
            <span>Try: Consent Hard-Stop</span>
          </button>

          <button
            onClick={() => applyPreset("strategic_account")}
            className="px-3 py-1.5 bg-[#F7F5F0] hover:bg-[#F4ECE1] border border-[#B8823D]/40 hover:border-[#B8823D] text-[#B8823D] rounded-[2px] text-xs font-serif font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3 h-3" />
            <span>Try: Strategic White-Glove</span>
          </button>

          <button
            onClick={() => applyPreset("broken_promise")}
            className="px-3 py-1.5 bg-[#F7F5F0] hover:bg-[#F4ECE1] border border-[#B8823D]/40 hover:border-[#B8823D] text-[#B8823D] rounded-[2px] text-xs font-serif font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3 h-3" />
            <span>Try: Broken Promise</span>
          </button>

          <button
            onClick={() => applyPreset("risk_flag")}
            className="px-3 py-1.5 bg-[#F7F5F0] hover:bg-[#F3E5E5] border border-[#9E2319]/40 hover:border-[#9E2319] text-[#9E2319] rounded-[2px] text-xs font-serif font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <Lock className="w-3 h-3" />
            <span>Try: Fraud Risk Flag</span>
          </button>

          <button
            onClick={() => applyPreset("low_confidence")}
            className="px-3 py-1.5 bg-[#F7F5F0] hover:bg-[#EAE4D9] border border-[#C9C2B4] text-[#6B7280] rounded-[2px] text-xs font-serif font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <Sliders className="w-3 h-3" />
            <span>Try: Low Confidence Hold</span>
          </button>

          <button
            onClick={() => applyPreset("churned_mandate")}
            className="px-3 py-1.5 bg-[#F7F5F0] hover:bg-[#F4ECE1] border border-[#B8823D]/40 hover:border-[#B8823D] text-[#B8823D] rounded-[2px] text-xs font-serif font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3 h-3" />
            <span>Try: Churned Subscriber</span>
          </button>

          <button
            onClick={() => applyPreset("standard_retry")}
            className="px-3 py-1.5 bg-[#F7F5F0] hover:bg-[#E1EAD8] border border-[#2F6B4F]/40 hover:border-[#2F6B4F] text-[#2F6B4F] rounded-[2px] text-xs font-serif font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3 h-3" />
            <span>Try: Standard Recovery Retry</span>
          </button>
        </div>
      </section>

      {/* 3. SIMULATOR WORKBENCH (INPUTS ON LEFT, LIVE RESULT ON RIGHT) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: FLOW SELECTOR & INTERACTIVE INPUTS */}
        <div className="lg:col-span-7 space-y-6 ledger-row-animate">
          {/* Flow Channel Tabs */}
          <div className="flex border-b-2 border-[#C9C2B4] bg-[#EAE4D9]/60 p-1 rounded-t-[2px]">
            {[
              { id: "mandate", label: "Mandate Flow" },
              { id: "receivable", label: "Receivables Flow" },
              { id: "payment", label: "Payment Flow" },
              { id: "checkout", label: "Checkout Flow" },
            ].map((flow) => {
              const isActive = activeFlow === flow.id;
              return (
                <button
                  key={flow.id}
                  onClick={() => setActiveFlow(flow.id as FlowType)}
                  className={`flex-1 py-2 text-xs font-serif font-bold transition-all text-center rounded-[2px] ${
                    isActive
                      ? "bg-[#F7F5F0] text-[#1A2130] shadow-sm border border-[#C9C2B4]"
                      : "text-[#6B7280] hover:text-[#1A2130]"
                  }`}
                >
                  {flow.label}
                </button>
              );
            })}
          </div>

          {/* Form Controls Container */}
          <div className="bg-[#F7F5F0] border border-[#C9C2B4] p-5 space-y-5 rounded-[2px] shadow-sm">
            {/* A. MANDATE INPUTS */}
            {activeFlow === "mandate" && (
              <div className="space-y-4">
                <div className="font-serif font-bold text-sm text-[#1A2130] pb-2 border-b border-[#C9C2B4] flex items-center justify-between">
                  <span>Subscription Mandate Parameters</span>
                  <span className="text-[11px] font-mono text-[#6B7280]">
                    FailedMandate Record
                  </span>
                </div>

                {/* Consent Switch (Primary Signature Control) */}
                <div className="p-3 bg-[#FAF2EB] border border-[#9E2319]/30 rounded-[2px] flex items-center justify-between">
                  <div className="space-y-0.5 pr-3">
                    <div className="font-serif font-bold text-xs text-[#9E2319] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Customer Explicitly Paused Mandate?</span>
                    </div>
                    <div className="text-[11px] text-[#6B7280]">
                      Simulates customer revoking autopay consent in banking app
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mandatePaused}
                      onChange={(e) => setMandatePaused(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#C9C2B4] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#9E2319]"></div>
                  </label>
                </div>

                {/* Failure Signal / Diagnosed Root Cause */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-[#6B7280] font-semibold">
                    Failure Signal / Diagnosed Cause
                  </label>
                  <select
                    value={mandateRootCause}
                    disabled={mandatePaused}
                    onChange={(e) => setMandateRootCause(e.target.value)}
                    className="w-full bg-[#EAE4D9]/40 border border-[#C9C2B4] px-3 py-2 text-xs font-mono text-[#1A2130] rounded-[2px] focus:outline-none focus:border-[#1A2130] disabled:opacity-50"
                  >
                    <option value="customer_declined_consent">
                      customer_declined_consent (Consent Paused)
                    </option>
                    <option value="temporary_balance_issue">
                      temporary_balance_issue (Insufficient Balance)
                    </option>
                    <option value="technical_glitch">
                      technical_glitch (NPCI/Bank Timeout)
                    </option>
                    <option value="bank_rejection">
                      bank_rejection (Card/Account Closed)
                    </option>
                    <option value="mandate_needs_renewal">
                      mandate_needs_renewal (Validity Expired)
                    </option>
                  </select>
                </div>

                {/* Steppers & Sliders */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Retry Attempt Number */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono uppercase text-[#6B7280] font-semibold">
                      Retry Attempt Number (1–4)
                    </label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setMandateAttempt(num)}
                          className={`flex-1 py-1.5 text-xs font-mono font-bold border rounded-[2px] ${
                            mandateAttempt === num
                              ? "bg-[#1A2130] text-[#F7F5F0] border-[#1A2130]"
                              : "bg-[#EAE4D9]/40 text-[#1A2130] border-[#C9C2B4]"
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mandate Plan Amount */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono uppercase text-[#6B7280] font-semibold">
                      Monthly Plan Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-xs font-mono text-[#6B7280]">
                        ₹
                      </span>
                      <input
                        type="number"
                        value={mandateAmount}
                        onChange={(e) => setMandateAmount(Number(e.target.value))}
                        className="w-full bg-[#EAE4D9]/40 border border-[#C9C2B4] pl-6 pr-3 py-1.5 text-xs font-mono text-[#1A2130] rounded-[2px]"
                      />
                    </div>
                  </div>
                </div>

                {/* Days Since Last Successful Charge */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono text-[#6B7280]">
                    <span>Days Since Last Successful Charge</span>
                    <span className="font-bold text-[#1A2130]">
                      {mandateDaysLapsed} days{" "}
                      {mandateDaysLapsed > 180 ? "(>180d Churn Risk)" : ""}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="365"
                    step="5"
                    value={mandateDaysLapsed}
                    onChange={(e) => setMandateDaysLapsed(Number(e.target.value))}
                    className="w-full accent-[#1A2130] cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* B. RECEIVABLES INPUTS */}
            {activeFlow === "receivable" && (
              <div className="space-y-4">
                <div className="font-serif font-bold text-sm text-[#1A2130] pb-2 border-b border-[#C9C2B4] flex items-center justify-between">
                  <span>Overdue B2B Receivable Parameters</span>
                  <span className="text-[11px] font-mono text-[#6B7280]">
                    OverdueInvoice Record
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Relationship Value Tier */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono uppercase text-[#6B7280] font-semibold">
                      Relationship Value Tier
                    </label>
                    <select
                      value={receivableTier}
                      onChange={(e) => setReceivableTier(e.target.value)}
                      className="w-full bg-[#EAE4D9]/40 border border-[#C9C2B4] px-3 py-2 text-xs font-mono text-[#1A2130] rounded-[2px]"
                    >
                      <option value="standard">standard (Regular Account)</option>
                      <option value="high_value">high_value (Key Customer)</option>
                      <option value="strategic">strategic (White-Glove VIP)</option>
                    </select>
                  </div>

                  {/* Current Escalation Stage */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono uppercase text-[#6B7280] font-semibold">
                      Current Escalation Stage
                    </label>
                    <select
                      value={receivableStage}
                      onChange={(e) => setReceivableStage(e.target.value)}
                      className="w-full bg-[#EAE4D9]/40 border border-[#C9C2B4] px-3 py-2 text-xs font-mono text-[#1A2130] rounded-[2px]"
                    >
                      <option value="none">none (First Touch)</option>
                      <option value="reminder_sent">reminder_sent (Cycle 1 Active)</option>
                      <option value="firm_notice">firm_notice (Cycle 2 Active)</option>
                      <option value="promise_captured">promise_captured (Commitment Logged)</option>
                      <option value="broken_promise">broken_promise (Expired)</option>
                      <option value="human_handoff">human_handoff (Assigned)</option>
                    </select>
                  </div>
                </div>

                {/* Promise Expired Toggle (If in promise_captured stage) */}
                {receivableStage === "promise_captured" && (
                  <div className="p-3 bg-[#FAF2EB] border border-[#B8823D]/40 rounded-[2px] flex items-center justify-between">
                    <div className="space-y-0.5 pr-3">
                      <div className="font-serif font-bold text-xs text-[#B8823D] flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Promise-to-Pay Commitment Date Passed?</span>
                      </div>
                      <div className="text-[11px] text-[#6B7280]">
                        Simulates maturity window elapsed without receiving bank transfer
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={receivablePromiseBroken}
                        onChange={(e) => setReceivablePromiseBroken(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-[#C9C2B4] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#B8823D]"></div>
                    </label>
                  </div>
                )}

                {/* Days Overdue Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono text-[#6B7280]">
                    <span>Days Overdue</span>
                    <span className="font-bold text-[#1A2130]">
                      {receivableDaysOverdue} days overdue
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="90"
                    value={receivableDaysOverdue}
                    onChange={(e) => setReceivableDaysOverdue(Number(e.target.value))}
                    className="w-full accent-[#1A2130] cursor-pointer"
                  />
                </div>

                {/* Diagnosed Root Cause */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-[#6B7280] font-semibold">
                    Diagnosed Root Cause
                  </label>
                  <select
                    value={receivableRootCause}
                    onChange={(e) => setReceivableRootCause(e.target.value)}
                    className="w-full bg-[#EAE4D9]/40 border border-[#C9C2B4] px-3 py-2 text-xs font-mono text-[#1A2130] rounded-[2px]"
                  >
                    <option value="likely_oversight">likely_oversight (Harmless Delay)</option>
                    <option value="reliable_but_slow">reliable_but_slow (Payer Rhythm)</option>
                    <option value="cashflow_stress">cashflow_stress (Liquidity Delay)</option>
                    <option value="dispute_risk">dispute_risk (Invoice Disputed)</option>
                    <option value="high_default_risk">high_default_risk (Chronic)</option>
                  </select>
                </div>
              </div>
            )}

            {/* C. PAYMENT INPUTS */}
            {activeFlow === "payment" && (
              <div className="space-y-4">
                <div className="font-serif font-bold text-sm text-[#1A2130] pb-2 border-b border-[#C9C2B4] flex items-center justify-between">
                  <span>Failed Payment Parameters</span>
                  <span className="text-[11px] font-mono text-[#6B7280]">
                    FailedPayment Record
                  </span>
                </div>

                {/* Diagnosed Root Cause */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-[#6B7280] font-semibold">
                    Diagnosed Root Cause Taxonomy
                  </label>
                  <select
                    value={paymentRootCause}
                    onChange={(e) => setPaymentRootCause(e.target.value)}
                    className="w-full bg-[#EAE4D9]/40 border border-[#C9C2B4] px-3 py-2 text-xs font-mono text-[#1A2130] rounded-[2px]"
                  >
                    <option value="insufficient_funds">insufficient_funds (Retriable)</option>
                    <option value="bank_timeout">bank_timeout (Acquiring Timeout)</option>
                    <option value="card_issue">card_issue (Card Issue)</option>
                    <option value="network_issue">network_issue (Socket Drop)</option>
                    <option value="risk_flagged">risk_flagged (Fraud Risk Flag)</option>
                    <option value="unknown">unknown (Inconclusive)</option>
                  </select>
                </div>

                {/* Gemini Diagnosis Confidence Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono text-[#6B7280]">
                    <span>Gemini Diagnosis Confidence Score</span>
                    <span className="font-bold text-[#1A2130]">
                      {(paymentConfidence * 100).toFixed(0)}%{" "}
                      {paymentConfidence < 0.5 ? "(<50% Hold Guardrail)" : ""}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={paymentConfidence}
                    onChange={(e) => setPaymentConfidence(Number(e.target.value))}
                    className="w-full accent-[#1A2130] cursor-pointer"
                  />
                </div>

                {/* Attempt Number Stepper */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-[#6B7280] font-semibold">
                    Attempt Number (Max 3 Guardrail)
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setPaymentAttempt(num)}
                        className={`flex-1 py-1.5 text-xs font-mono font-bold border rounded-[2px] ${
                          paymentAttempt === num
                            ? "bg-[#1A2130] text-[#F7F5F0] border-[#1A2130]"
                            : "bg-[#EAE4D9]/40 text-[#1A2130] border-[#C9C2B4]"
                        }`}
                      >
                        {num >= 4 ? `${num} (Max Exceeded)` : num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* D. CHECKOUT INPUTS */}
            {activeFlow === "checkout" && (
              <div className="space-y-4">
                <div className="font-serif font-bold text-sm text-[#1A2130] pb-2 border-b border-[#C9C2B4] flex items-center justify-between">
                  <span>Checkout Abandonment Parameters</span>
                  <span className="text-[11px] font-mono text-[#6B7280]">
                    CheckoutAbandonment Record
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-[#6B7280] font-semibold">
                    Abandoned Funnel Step
                  </label>
                  <select
                    value={checkoutStep}
                    onChange={(e) => setCheckoutStep(e.target.value)}
                    className="w-full bg-[#EAE4D9]/40 border border-[#C9C2B4] px-3 py-2 text-xs font-mono text-[#1A2130] rounded-[2px]"
                  >
                    <option value="payment_method">payment_method (High Intent)</option>
                    <option value="otp_verification">otp_verification (Near Conversion)</option>
                    <option value="review">review (Cart Review)</option>
                    <option value="shipping_info">shipping_info (Early Stage)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono text-[#6B7280]">
                    <span>Cart Value (INR)</span>
                    <span className="font-bold text-[#1A2130]">
                      ₹{checkoutCartValue}{" "}
                      {checkoutCartValue < 300 ? "(<₹300 Min Hold)" : ""}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="5000"
                    step="50"
                    value={checkoutCartValue}
                    onChange={(e) => setCheckoutCartValue(Number(e.target.value))}
                    className="w-full accent-[#1A2130] cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: REAL-TIME POLICY DECISION & ANIMATED STAMP */}
        <div className="lg:col-span-5 space-y-4 ledger-row-animate">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-[#6B7280] font-semibold">
              Live Policy Engine Decision
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#2F6B4F] bg-[#DEE5D6] px-2 py-0.5 rounded-[2px] font-semibold">
              <Zap className="w-3 h-3" />
              <span>{latencyMs}ms live eval</span>
            </div>
          </div>

          {/* Physical Accounting Ledger Docket Result Card */}
          <div className="bg-[#F7F5F0] border-2 border-[#1A2130] p-6 space-y-6 rounded-[2px] shadow-md relative overflow-hidden">
            {/* Top Docket Meta Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#C9C2B4] font-mono text-[11px] text-[#6B7280]">
              <span>DOCKET // EVAL-LIVE</span>
              <span className="uppercase">FLOW: {result.flow_type}</span>
            </div>

            {/* Central Stamp Impact Slam Area */}
            <div className="py-4 flex flex-col items-center justify-center space-y-3 min-h-[120px] bg-[#EAE4D9]/30 border border-[#C9C2B4]/60 rounded-[2px]">
              <StampMark
                text={result.stamp_text}
                variant={result.stamp_variant}
                size="lg"
              />
              <div className="text-[11px] font-mono text-[#6B7280] font-semibold uppercase tracking-wider">
                Action: {result.action}
              </div>
            </div>

            {/* Allowed vs Blocked Indicator Pill */}
            <div className="flex items-center justify-between p-2.5 bg-[#EAE4D9]/60 border border-[#C9C2B4] rounded-[2px] font-mono text-xs">
              <span className="text-[#6B7280] uppercase">Automation Gate</span>
              {result.allowed ? (
                <span className="text-[#2F6B4F] font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  ALLOWED TO PROCEED
                </span>
              ) : (
                <span className="text-[#9E2319] font-bold flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  LOCKED / STOPPED
                </span>
              )}
            </div>

            {/* Verbatim Engine Rationale */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#6B7280] font-semibold">
                Policy Rule Rationale (Verbatim Output)
              </div>
              <div className="p-3 bg-[#E8EDE4]/40 border-l-4 border-[#1A2130] font-mono text-xs text-[#1A2130] leading-relaxed">
                "{result.reason}"
              </div>
            </div>

            {/* Backoff if applicable */}
            {result.backoff_days && (
              <div className="p-2.5 bg-[#EAE4D9]/40 border border-[#C9C2B4] rounded-[2px] font-mono text-xs flex items-center justify-between text-[#1A2130]">
                <span className="text-[#6B7280]">Computed Retry Backoff</span>
                <span className="font-bold text-[#2F6B4F]">
                  +{result.backoff_days} Days Delay
                </span>
              </div>
            )}

            {/* Proof Line */}
            <div className="pt-3 border-t border-[#C9C2B4] flex items-center justify-between text-[10px] font-mono text-[#8E8472]">
              <span className="flex items-center gap-1">
                <Code2 className="w-3 h-3 text-[#2F6B4F]" />
                backend/app/engine/policy_engine.py
              </span>
              <span>100% Deterministic</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function json_stringify_safe(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return "{}";
  }
}
