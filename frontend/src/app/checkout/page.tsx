"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { AuditDrawer } from "@/components/AuditDrawer";
import { StampMark } from "@/components/StampMark";
import { LedgerRow } from "@/components/LedgerRow";
import { DigitRoll } from "@/components/DigitRoll";
import { RadarRecord } from "@/components/RadarVisualization";
import { HinglishVoiceNudge } from "@/components/HinglishVoiceNudge";
import { ShoppingCart, MessageSquare } from "lucide-react";

interface CheckoutDetail {
  session_id: string;
  customer_id: string;
  cart_value: number;
  items_count: number;
  abandoned_at_step: string;
  timestamp: string | null;
  recovery_attempted: boolean;
  diagnosed_root_cause: string;
  confidence_score: number | null;
  action: string;
  execution_status: string;
  nudge_message: string | null;
}

function formatINR(val: number): string {
  return "₹" + Math.round(val).toLocaleString("en-IN");
}

export default function CheckoutPage() {
  const [checkouts, setCheckouts] = useState<CheckoutDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRecord, setSelectedRecord] = useState<RadarRecord | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/checkouts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CheckoutDetail[]) => {
        if (data && data.length > 0) {
          setCheckouts(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
    { scope: containerRef, dependencies: [loading] }
  );

  const funnelStages = useMemo(() => {
    const stageMap: Record<string, { count: number; totalValue: number }> = {
      shipping_info: { count: 0, totalValue: 0 },
      payment_method: { count: 0, totalValue: 0 },
      otp_verification: { count: 0, totalValue: 0 },
      review: { count: 0, totalValue: 0 },
    };

    checkouts.forEach((c) => {
      const step = c.abandoned_at_step.toLowerCase();
      if (stageMap[step]) {
        stageMap[step].count += 1;
        stageMap[step].totalValue += c.cart_value;
      } else {
        stageMap.review.count += 1;
        stageMap.review.totalValue += c.cart_value;
      }
    });

    return [
      { step: "shipping_info", label: "Step 1: Shipping Info", count: stageMap.shipping_info.count, value: stageMap.shipping_info.totalValue, variant: "caution" as const },
      { step: "payment_method", label: "Step 2: Payment Method Selection", count: stageMap.payment_method.count, value: stageMap.payment_method.totalValue, variant: "caution" as const },
      { step: "otp_verification", label: "Step 3: OTP Verification / 3DS", count: stageMap.otp_verification.count, value: stageMap.otp_verification.totalValue, variant: "approved" as const },
      { step: "review", label: "Step 4: Final Order Review", count: stageMap.review.count, value: stageMap.review.totalValue, variant: "approved" as const },
    ];
  }, [checkouts]);

  const nudgedCount = checkouts.filter((c) => c.action === "send_recovery_nudge").length;
  const heldCount = checkouts.filter((c) => c.action === "hold").length;
  const totalCartRisk = checkouts.reduce((acc, c) => acc + c.cart_value, 0);

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
              Checkout Abandonment Ledger
            </h1>
            <span className="font-mono text-xs text-[#6B7280]">
              15 SESSIONS AUDITED
            </span>
          </div>
          <p className="text-sm text-[#6B7280] font-sans">
            Conversion funnel dropoff segmentation and single-touch recovery dispatch.
          </p>
        </div>

        <div className="ledger-title-rule w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4]" />
      </div>

      {/* 2. STAT ROW (Ruled Line Items) */}
      <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
        <div className="ledger-row-animate">
          <LedgerRow
            isBanded={false}
            left={
              <span className="font-serif font-bold text-sm text-[#1A2130]">
                Total Cart Capital at Risk
              </span>
            }
            right={
              <span className="text-base font-bold text-[#1A2130]">
                <DigitRoll value={totalCartRisk} prefix="₹" />
              </span>
            }
          />
        </div>
        <div className="ledger-row-animate">
          <LedgerRow
            isBanded={true}
            left={
              <span className="font-serif font-bold text-sm text-[#2F6B4F]">
                Recovery Nudges Dispatched
              </span>
            }
            stamp={<StampMark text="NUDGED" variant="approved" size="sm" />}
            right={`${nudgedCount} sessions`}
          />
        </div>
        <div className="ledger-row-animate">
          <LedgerRow
            isBanded={false}
            left={
              <span className="font-serif font-bold text-sm text-[#B8823D]">
                Low Cart Value Holds (&lt; ₹300)
              </span>
            }
            stamp={<StampMark text="HELD" variant="caution" size="sm" />}
            right={`${heldCount} sessions protected`}
          />
        </div>
      </div>

      {/* 3. FUNNEL STEPS AS RULED LEDGER ROWS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between ledger-row-animate">
          <h2 className="font-serif text-xl font-bold text-[#1A2130]">
            Abandonment Step Proportions
          </h2>
          <span className="font-mono text-xs text-[#6B7280]">
            4 CONVERSION FUNNEL STAGES
          </span>
        </div>

        <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
          {funnelStages.map((stage, idx) => (
            <div
              key={stage.step}
              className={`py-3 px-4 flex items-center justify-between gap-4 font-mono text-xs ledger-row-animate ${
                idx % 2 === 1 ? "bg-[#E8EDE4]" : "bg-[#F7F5F0]"
              }`}
            >
              <div className="flex items-center gap-3">
                <StampMark text={stage.variant === "approved" ? "HIGH INTENT" : "EARLY"} variant={stage.variant} size="sm" />
                <span className="font-bold text-[#1A2130] font-sans">{stage.label}</span>
              </div>
              <div className="flex items-center gap-4 text-right">
                <span className="text-[#6B7280]">{stage.count} sessions</span>
                <span className="font-bold text-[#1A2130] tabular-nums">
                  {formatINR(stage.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. SCROLLABLE SESSIONS LIST */}
      <section className="space-y-1">
        <div className="flex items-center justify-between text-xs font-mono text-[#6B7280] pb-1 border-b border-[#C9C2B4] ledger-row-animate">
          <span>Showing {checkouts.length} Abandonment Sessions</span>
          <span>Click any line to inspect audit trail</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs font-mono text-[#6B7280]">
            Fetching checkout abandonment records...
          </div>
        ) : (
          <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
            {checkouts.map((c, idx) => {
              const isHeld = c.action === "hold" || c.cart_value < 300;

              return (
                <div
                  key={c.session_id}
                  onClick={() =>
                    setSelectedRecord({
                      id: c.session_id,
                      type: "checkout",
                      status: isHeld ? "Held (cart under ₹300)" : "Recovery nudge sent (SMS/Email)",
                      statusCategory: isHeld ? "protected" : "active",
                      amount: c.cart_value,
                      customerOrReason: c.abandoned_at_step,
                    })
                  }
                  className={`p-4 cursor-pointer hover:bg-[#DEE5D6] transition-colors space-y-2 border-b border-[#C9C2B4] ledger-row-animate group ${
                    idx % 2 === 1 ? "bg-[#E8EDE4]" : "bg-[#F7F5F0]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 relative">
                      <div className="p-1 rounded-[2px] bg-[#EAE4D9] border border-[#C9C2B4]">
                        <ShoppingCart className="w-3.5 h-3.5 text-[#2F6B4F]" />
                      </div>
                      <div className="space-y-0.5 font-mono text-xs relative">
                        <div className="font-bold text-[#1A2130]">
                          {c.session_id} ({c.items_count} items)
                        </div>
                        <div className="text-[11px] text-[#6B7280]">
                          Dropped at: <span className="text-[#1A2130]">{c.abandoned_at_step}</span> · {c.diagnosed_root_cause}
                        </div>
                        <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#1A2130]/35 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-150 ease-out pointer-events-none" />
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <StampMark
                        text={isHeld ? "HELD" : "NUDGED"}
                        variant={isHeld ? "caution" : "approved"}
                        size="sm"
                      />
                      <div className="font-mono text-sm font-bold text-[#1A2130]">
                        ₹{c.cart_value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {c.nudge_message && (
                    <div className="ml-7 p-2 bg-[#F7F5F0] border border-[#C9C2B4] rounded-[2px] font-mono text-xs text-[#2F6B4F] flex items-start gap-2">
                      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 opacity-80" />
                      <div className="text-[11px] text-[#1A2130] leading-relaxed">
                        &ldquo;{c.nudge_message}&rdquo;
                      </div>
                    </div>
                  )}

                  {/* Hinglish Voice Recovery Action */}
                  {!isHeld && (
                    <div className="ml-7 pt-1">
                      <HinglishVoiceNudge recordId={c.session_id} flowType="checkout" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Slide-In Ledger Drawer */}
      <AuditDrawer
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}
