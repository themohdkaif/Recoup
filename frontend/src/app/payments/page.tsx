"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { AuditDrawer } from "@/components/AuditDrawer";
import { StampMark } from "@/components/StampMark";
import { LedgerRow } from "@/components/LedgerRow";
import { RadarRecord } from "@/components/RadarVisualization";
import { HumanActionModal, HumanActionTarget } from "@/components/HumanActionModal";
import {
  CreditCard,
  Smartphone,
  Building2,
  Wallet,
  Search,
  ArrowUpDown,
  Copy,
  Check,
  UserCheck,
} from "lucide-react";

interface PaymentDetail {
  transaction_id: string;
  customer_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  failure_reason_code: string;
  attempt_number: number;
  diagnosed_root_cause: string;
  confidence_score: number | null;
  action: string;
  execution_status: string;
  razorpay_order_id: string | null;
  created_at: string | null;
}

type SortField = "amount" | "confidence" | "attempt";
type SortOrder = "desc" | "asc";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("amount");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<RadarRecord | null>(null);
  const [humanActionTarget, setHumanActionTarget] = useState<HumanActionTarget | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchPayments = () => {
    fetch("http://127.0.0.1:8000/api/payments")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PaymentDetail[]) => {
        if (data && data.length > 0) {
          setPayments(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPayments();
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
    { scope: containerRef, dependencies: [loading] }
  );

  const failureDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    payments.forEach((p) => {
      counts[p.failure_reason_code] = (counts[p.failure_reason_code] || 0) + 1;
    });

    const total = payments.length || 1;
    return Object.entries(counts)
      .map(([code, count]) => {
        const pct = (count / total) * 100;
        let variant: "approved" | "hardstop" | "caution" = "caution";
        if (code === "risk_check_failed" || code.toLowerCase().includes("risk")) {
          variant = "hardstop";
        } else if (["insufficient_funds", "GATEWAY_ERROR", "network_timeout"].includes(code)) {
          variant = "approved";
        }
        return { code, count, pct, variant };
      })
      .sort((a, b) => b.count - a.count);
  }, [payments]);

  const filteredPayments = useMemo(() => {
    let list = payments.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        p.transaction_id.toLowerCase().includes(q) ||
        p.failure_reason_code.toLowerCase().includes(q) ||
        p.diagnosed_root_cause.toLowerCase().includes(q) ||
        p.payment_method.toLowerCase().includes(q) ||
        (p.razorpay_order_id && p.razorpay_order_id.toLowerCase().includes(q))
      );
    });

    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "amount") {
        comparison = a.amount - b.amount;
      } else if (sortField === "confidence") {
        const confA = a.confidence_score ?? 0;
        const confB = b.confidence_score ?? 0;
        comparison = confA - confB;
      } else if (sortField === "attempt") {
        comparison = a.attempt_number - b.attempt_number;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    return list;
  }, [payments, searchQuery, sortField, sortOrder]);

  const handleCopyOrder = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(orderId);
    setCopiedOrderId(orderId);
    setTimeout(() => setCopiedOrderId(null), 1800);
  };

  const getMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case "upi":
        return <Smartphone className="w-3.5 h-3.5 text-[#2F6B4F]" />;
      case "card":
      case "credit_card":
        return <CreditCard className="w-3.5 h-3.5 text-[#2F6B4F]" />;
      case "netbanking":
        return <Building2 className="w-3.5 h-3.5 text-[#6B7280]" />;
      default:
        return <Wallet className="w-3.5 h-3.5 text-[#6B7280]" />;
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
              Payment Failure Ledger
            </h1>
            <span className="font-mono text-xs text-[#6B7280]">
              60 MONITORED RECORDS
            </span>
          </div>
          <p className="text-sm text-[#6B7280] font-sans">
            Diagnostic telemetry and automated retry order generation for payment gateway dropoffs.
          </p>
        </div>

        <div className="ledger-title-rule w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4]" />
      </div>

      {/* 2. FAILURE REASON SPECTRUM BANDS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between ledger-row-animate">
          <h2 className="font-serif text-xl font-bold text-[#1A2130]">
            Failure Signal Breakdown
          </h2>
          <span className="font-mono text-xs text-[#6B7280]">
            {failureDistribution.length} REASON SIGNATURES
          </span>
        </div>

        <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
          {failureDistribution.map((item, idx) => (
            <div
              key={item.code}
              className={`py-3 px-4 flex items-center justify-between gap-4 font-mono text-xs ledger-row-animate ${
                idx % 2 === 1 ? "bg-[#E8EDE4]" : "bg-[#F7F5F0]"
              }`}
            >
              <div className="flex items-center gap-3">
                <StampMark text={item.variant === "approved" ? "RETRY" : item.variant === "hardstop" ? "RISK STOP" : "HELD"} variant={item.variant} size="sm" />
                <span className="font-bold text-[#1A2130]">{item.code}</span>
              </div>
              <div className="flex items-center gap-4 text-right">
                <span className="text-[#6B7280]">{item.count} records</span>
                <span className="font-bold text-[#1A2130] tabular-nums">
                  {item.pct.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. SEARCH & SORT CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 ledger-row-animate">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by transaction ID, failure code, root cause..."
            className="w-full bg-[#EAE4D9] border border-[#C9C2B4] rounded-[2px] pl-8 pr-3 py-1.5 text-xs font-mono text-[#1A2130] placeholder-[#6B7280] focus:outline-none focus:border-[#2F6B4F]"
          />
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-[#6B7280]">
          <span className="text-[10px] uppercase">Sort by:</span>
          {(
            [
              { id: "amount", label: "Amount" },
              { id: "confidence", label: "Confidence" },
              { id: "attempt", label: "Attempt" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (sortField === item.id) {
                  setSortOrder(sortOrder === "desc" ? "asc" : "desc");
                } else {
                  setSortField(item.id);
                  setSortOrder("desc");
                }
              }}
              className={`px-2.5 py-1 rounded-[2px] border transition-colors flex items-center gap-1 cursor-pointer ${
                sortField === item.id
                  ? "bg-[#E8EDE4] text-[#2F6B4F] border-[#2F6B4F]/40 font-bold"
                  : "bg-[#EAE4D9] text-[#6B7280] border-[#C9C2B4] hover:text-[#1A2130]"
              }`}
            >
              <span>{item.label}</span>
              {sortField === item.id && <ArrowUpDown className="w-3 h-3 ml-0.5 opacity-80" />}
            </button>
          ))}
        </div>
      </div>

      {/* 4. SCROLLABLE PAYMENT LEDGER FEED */}
      <section className="space-y-1">
        <div className="flex items-center justify-between text-xs font-mono text-[#6B7280] pb-1 border-b border-[#C9C2B4] ledger-row-animate">
          <span>Showing {filteredPayments.length} of {payments.length} Payments</span>
          <span>Click any line to inspect audit trail</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs font-mono text-[#6B7280]">
            Fetching payment records...
          </div>
        ) : (
          <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
            {filteredPayments.map((p, idx) => {
              const isEscalated = p.action === "escalate_to_human" || p.diagnosed_root_cause === "risk_flagged";

              return (
                <div key={p.transaction_id} className="ledger-row-animate">
                  <LedgerRow
                    isBanded={idx % 2 === 1}
                    onClick={() =>
                      setSelectedRecord({
                        id: p.transaction_id,
                        type: "payment",
                        status: isEscalated ? "Escalated to human review" : "Retry order created (Razorpay)",
                        statusCategory: isEscalated ? "escalated" : "active",
                        amount: p.amount,
                        customerOrReason: p.diagnosed_root_cause,
                      })
                    }
                    left={
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="p-1 rounded-[2px] bg-[#EAE4D9] border border-[#C9C2B4] flex-shrink-0">
                          {getMethodIcon(p.payment_method)}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#1A2130] truncate">
                              {p.transaction_id}
                            </span>
                            <span className="font-mono text-[9px] px-1 py-0.2 rounded-[1px] bg-[#DFD8CC] text-[#6B7280]">
                              Att {p.attempt_number}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-[#6B7280]">
                            Signal: <span className="text-[#1A2130]">{p.failure_reason_code}</span> · {p.diagnosed_root_cause}
                          </div>
                        </div>
                      </div>
                    }
                    stamp={
                      <StampMark
                        text={isEscalated ? "ESCALATED" : "RETRIED"}
                        variant={isEscalated ? "caution" : "approved"}
                        size="sm"
                      />
                    }
                    right={
                      <div className="space-y-1 text-right flex flex-col items-end">
                        <div className="font-mono text-sm font-bold text-[#1A2130]">
                          ₹{p.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        {p.razorpay_order_id ? (
                          <button
                            onClick={(e) => handleCopyOrder(p.razorpay_order_id!, e)}
                            className="flex items-center gap-1 font-mono text-[10px] text-[#2F6B4F] hover:underline cursor-pointer"
                          >
                            <span>{p.razorpay_order_id}</span>
                            {copiedOrderId === p.razorpay_order_id ? (
                              <Check className="w-2.5 h-2.5" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 opacity-60" />
                            )}
                          </button>
                        ) : isEscalated ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setHumanActionTarget({
                                recordType: "payment",
                                recordId: p.transaction_id,
                                amount: p.amount,
                                currentStatus: p.action,
                                reason: p.diagnosed_root_cause,
                              });
                            }}
                            className="px-2 py-0.5 text-[10px] font-mono font-bold bg-[#EAE4D9] text-[#1A2130] border border-[#C9C2B4] hover:bg-[#DFD8CC] rounded-[2px] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <UserCheck className="w-2.5 h-2.5 text-[#1A2130]" />
                            <span>Operator Action</span>
                          </button>
                        ) : null}
                      </div>
                    }
                  />
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
        onSuccess={fetchPayments}
        onOpenAuditDrawer={(id, type) =>
          setSelectedRecord({
            id,
            type: type as any,
            status: "Inspecting",
            statusCategory: "active",
            amount: 0,
          })
        }
      />
    </div>
  );
}
