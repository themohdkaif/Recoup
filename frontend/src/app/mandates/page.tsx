"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { AuditDrawer } from "@/components/AuditDrawer";
import { StampMark } from "@/components/StampMark";
import { LedgerRow } from "@/components/LedgerRow";
import { LedgerLoading } from "@/components/LedgerLoading";
import { RadarRecord } from "@/components/RadarVisualization";
import { HinglishVoiceNudge } from "@/components/HinglishVoiceNudge";
import { HumanActionModal, HumanActionTarget } from "@/components/HumanActionModal";
import { RefreshCw, Lock, Copy, Check, UserCheck } from "lucide-react";

interface MandateDetail {
  mandate_id: string;
  customer_id: string;
  subscription_plan: string;
  amount: number;
  currency: string;
  mandate_failure_code: string;
  retry_attempt_number: number;
  last_successful_charge_days_ago: number;
  created_at: string | null;
  recovery_attempted: boolean;
  diagnosed_root_cause: string;
  confidence_score: number | null;
  action: string;
  execution_status: string;
  razorpay_order_id: string | null;
  backoff_days: number;
}

type MandateFilter = "all" | "active" | "stopped" | "escalated";

export default function MandatesPage() {
  const [mandates, setMandates] = useState<MandateDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<MandateFilter>("all");
  const [selectedRecord, setSelectedRecord] = useState<RadarRecord | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [humanActionTarget, setHumanActionTarget] = useState<HumanActionTarget | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchMandates = () => {
    fetch("http://127.0.0.1:8000/api/mandates")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: MandateDetail[]) => {
        if (data && data.length > 0) {
          setMandates(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMandates();
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
          { opacity: 1, y: 0, duration: 0.22, stagger: 0.02 },
          "-=0.1"
        );
    },
    { scope: containerRef, dependencies: [loading, filter] }
  );

  const filteredMandates = useMemo(() => {
    return mandates.filter((m) => {
      if (filter === "active") return m.action === "retry_mandate_charge";
      if (filter === "stopped") return m.action === "permanently_stop";
      if (filter === "escalated") return m.action === "escalate_to_human";
      return true;
    });
  }, [mandates, filter]);

  const activeCount = mandates.filter((m) => m.action === "retry_mandate_charge").length;
  const stoppedCount = mandates.filter((m) => m.action === "permanently_stop").length;
  const escalatedCount = mandates.filter((m) => m.action === "escalate_to_human").length;

  const handleCopyOrder = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(orderId);
    setCopiedOrderId(orderId);
    setTimeout(() => setCopiedOrderId(null), 1800);
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
              Subscription Mandate Ledger
            </h1>
            <span className="font-mono text-xs text-[#6B7280]">
              20 AUTOPAY MANDATES
            </span>
          </div>
          <p className="text-sm text-[#6B7280] font-sans">
            Exponential backoff retry scheduling (1d → 3d → 7d) and unbypassable consent lockouts.
          </p>
        </div>

        <div className="ledger-title-rule w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4]" />
      </div>

      {/* 2. FILTER CONTROLS */}
      <div className="flex items-center gap-2 flex-wrap font-mono text-xs text-[#6B7280] ledger-row-animate">
        <span className="text-[10px] uppercase mr-1">Filter:</span>
        {(
          [
            { id: "all", label: "All Mandates", count: mandates.length },
            { id: "active", label: "Active Sequences", count: activeCount },
            { id: "stopped", label: "Permanently Stopped", count: stoppedCount },
            { id: "escalated", label: "Human Escalated", count: escalatedCount },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`px-2.5 py-1 rounded-[2px] border transition-colors cursor-pointer ${
              filter === item.id
                ? "bg-[#E8EDE4] text-[#2F6B4F] border-[#2F6B4F]/40 font-bold"
                : "bg-[#EAE4D9] text-[#6B7280] border-[#C9C2B4] hover:text-[#1A2130]"
            }`}
          >
            <span>{item.label}</span> ({item.count})
          </button>
        ))}
      </div>

      {/* 3. SCROLLABLE MANDATE RETRY SEQUENCES LIST */}
      <section className="space-y-1">
        <div className="flex items-center justify-between text-xs font-mono text-[#6B7280] pb-1 border-b border-[#C9C2B4] ledger-row-animate">
          <span>Showing {filteredMandates.length} of {mandates.length} Subscription Mandates</span>
          <span>Click any line to inspect audit trail</span>
        </div>

        {loading ? (
          <LedgerLoading message="Retrieving subscription mandate sequences..." rows={5} />
        ) : (
          <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
            {filteredMandates.map((m, idx) => {
              const isStopped = m.action === "permanently_stop";
              const isEscalated = m.action === "escalate_to_human";

              return (
                <div
                  key={m.mandate_id}
                  onClick={() =>
                    setSelectedRecord({
                      id: m.mandate_id,
                      type: "mandate",
                      status: isStopped
                        ? "Consent hard-stop enforced (Paused)"
                        : isEscalated
                        ? "Escalated to human review"
                        : `Attempt ${m.retry_attempt_number} scheduled (+${m.backoff_days}d backoff)`,
                      statusCategory: isStopped ? "protected" : isEscalated ? "escalated" : "active",
                      amount: m.amount,
                      customerOrReason: m.mandate_failure_code,
                    })
                  }
                  className={`p-4 cursor-pointer hover:bg-[#DEE5D6] transition-colors space-y-3 border-b border-[#C9C2B4] ledger-row-animate group ${
                    isStopped
                      ? "bg-[#9E2319]/5"
                      : idx % 2 === 1
                      ? "bg-[#E8EDE4]"
                      : "bg-[#F7F5F0]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5 font-mono text-xs relative">
                      <div className="flex items-center gap-2">
                        <span className="font-serif font-bold text-sm text-[#1A2130]">
                          {m.subscription_plan}
                        </span>
                        <span className="text-[11px] text-[#6B7280]">
                          ({m.mandate_id})
                        </span>
                      </div>
                      <div className="text-[11px] text-[#6B7280]">
                        Signal: <span className="text-[#1A2130]">{m.mandate_failure_code}</span> · Last success: {m.last_successful_charge_days_ago}d ago
                      </div>
                      <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#1A2130]/35 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-150 ease-out pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <StampMark
                        text={
                          isStopped
                            ? "HARD STOP"
                            : isEscalated
                            ? "ESCALATED"
                            : `RETRY +${m.backoff_days}D`
                        }
                        variant={
                          isStopped ? "hardstop" : isEscalated ? "caution" : "approved"
                        }
                        size="sm"
                      />
                      <div className="font-mono text-sm font-bold text-[#1A2130]">
                        ₹{m.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {/* Horizontal Sequence Bar */}
                  {isStopped ? (
                    <div className="p-2 bg-[#9E2319]/10 border border-[#9E2319]/30 rounded-[2px] flex items-center justify-between font-mono text-xs text-[#9E2319]">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5" />
                        <span className="font-bold">CONSENT HARD-STOP // ZERO RETRIES PERMITTED</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setHumanActionTarget({
                              recordType: "mandate",
                              recordId: m.mandate_id,
                              amount: m.amount,
                              currentStatus: m.action,
                              reason: m.diagnosed_root_cause,
                              customerOrCompany: m.subscription_plan,
                            });
                          }}
                          className="px-2 py-0.5 text-[10px] font-mono font-bold bg-[#F7F5F0] text-[#9E2319] border border-[#9E2319]/40 hover:bg-[#9E2319]/20 rounded-[2px] transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <UserCheck className="w-2.5 h-2.5" />
                          <span>Operator Action</span>
                        </button>
                        <span className="text-[10px] font-semibold">POLICY LOCKED</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between font-mono text-[11px] text-[#6B7280] pt-1 border-t border-[#C9C2B4]">
                      <span className="text-[#1A2130] font-medium">
                        {isEscalated
                          ? "Sequence Exhausted // Escalated to Human Review"
                          : `Retry Sequence: Attempt ${m.retry_attempt_number} Active (+${m.backoff_days}d gap)`}
                      </span>
                      <div className="flex items-center gap-2">
                        {isEscalated && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setHumanActionTarget({
                                recordType: "mandate",
                                recordId: m.mandate_id,
                                amount: m.amount,
                                currentStatus: m.action,
                                reason: m.diagnosed_root_cause,
                                customerOrCompany: m.subscription_plan,
                              });
                            }}
                            className="px-2 py-0.5 text-[10px] font-mono font-bold bg-[#EAE4D9] text-[#1A2130] border border-[#C9C2B4] hover:bg-[#DFD8CC] rounded-[2px] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <UserCheck className="w-2.5 h-2.5 text-[#1A2130]" />
                            <span>Operator Action</span>
                          </button>
                        )}
                        {m.razorpay_order_id && (
                          <button
                            onClick={(e) => handleCopyOrder(m.razorpay_order_id!, e)}
                            className="flex items-center gap-1 font-mono text-[10px] text-[#2F6B4F] hover:underline cursor-pointer"
                          >
                            <span className="font-bold">{m.razorpay_order_id}</span>
                            {copiedOrderId === m.razorpay_order_id ? (
                              <Check className="w-2.5 h-2.5" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 opacity-60" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Hinglish Voice Recovery Action (for retriable mandates) */}
                  {!isStopped && (
                    <div className="pt-1">
                      <HinglishVoiceNudge recordId={m.mandate_id} flowType="mandate" />
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

      {/* Human-in-the-Loop Action Modal */}
      <HumanActionModal
        target={humanActionTarget}
        onClose={() => setHumanActionTarget(null)}
        onSuccess={fetchMandates}
        onOpenAuditDrawer={(id, type) =>
          setSelectedRecord({
            id,
            type: type as any,
            status: "Inspecting",
            statusCategory: "protected",
            amount: 0,
          })
        }
      />
    </div>
  );
}
