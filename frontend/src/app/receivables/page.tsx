"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { AuditDrawer } from "@/components/AuditDrawer";
import { StampMark } from "@/components/StampMark";
import { LedgerRow } from "@/components/LedgerRow";
import { LedgerLoading } from "@/components/LedgerLoading";
import { DigitRoll } from "@/components/DigitRoll";
import { RadarRecord } from "@/components/RadarVisualization";
import { HumanActionModal, HumanActionTarget } from "@/components/HumanActionModal";
import { Building2, Shield, UserCheck } from "lucide-react";

interface ReceivableDetail {
  invoice_id: string;
  business_customer_id: string;
  invoice_amount: number;
  currency: string;
  due_date: string | null;
  days_overdue: number;
  previous_payment_history: string;
  escalation_stage: string;
  promise_to_pay_date: string | null;
  relationship_value_tier: string;
  touch_count: number;
  diagnosed_root_cause: string;
  confidence_score: number | null;
  action: string;
  execution_status: string;
}

function formatINR(val: number): string {
  return "₹" + Math.round(val).toLocaleString("en-IN");
}

export default function ReceivablesPage() {
  const [invoices, setInvoices] = useState<ReceivableDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCycle, setSelectedCycle] = useState<number>(3);
  const [selectedRecord, setSelectedRecord] = useState<RadarRecord | null>(null);
  const [humanActionTarget, setHumanActionTarget] = useState<HumanActionTarget | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchInvoices = () => {
    fetch("http://127.0.0.1:8000/api/receivables")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ReceivableDetail[]) => {
        if (data && data.length > 0) {
          setInvoices(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInvoices();
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

  const ladderData = useMemo(() => {
    const strategicBypass = invoices.filter(
      (inv) => inv.relationship_value_tier === "strategic"
    );

    const rungs = [
      {
        id: "reminder_sent",
        title: "Stage 1: Friendly Reminder",
        subtitle: "Gentle automated notification (1 touch)",
        stamp: "REMINDER",
        variant: "approved" as const,
        items: invoices.filter(
          (inv) =>
            inv.escalation_stage === "reminder_sent" &&
            inv.relationship_value_tier !== "strategic"
        ),
      },
      {
        id: "firm_notice",
        title: "Stage 2: Firm Past-Due Notice",
        subtitle: "Formal demand notice to Finance Director (2–3 touches)",
        stamp: "FIRM NOTICE",
        variant: "caution" as const,
        items: invoices.filter(
          (inv) =>
            inv.escalation_stage === "firm_notice" &&
            inv.relationship_value_tier !== "strategic"
        ),
      },
      {
        id: "promise_captured",
        title: "Stage 3: Promise Captured",
        subtitle: "Customer registered payment commitment date",
        stamp: "PROMISED",
        variant: "approved" as const,
        items: invoices.filter(
          (inv) =>
            inv.escalation_stage === "promise_captured" &&
            inv.relationship_value_tier !== "strategic"
        ),
      },
      {
        id: "human_handoff",
        title: "Stage 4: Enterprise Human Handoff",
        subtitle: "Account Executive / Credit Control assignment",
        stamp: "ESCALATED",
        variant: "caution" as const,
        items: invoices.filter(
          (inv) =>
            inv.escalation_stage === "human_handoff" &&
            inv.relationship_value_tier !== "strategic"
        ),
      },
    ];

    return { rungs, strategicBypass };
  }, [invoices]);

  const totalReceivables = invoices.reduce((acc, inv) => acc + inv.invoice_amount, 0);

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
              B2B Receivables Ledger
            </h1>
            <span className="font-mono text-xs text-[#6B7280]">
              25 ENTERPRISE INVOICES
            </span>
          </div>
          <p className="text-sm text-[#6B7280] font-sans">
            Multi-cycle 7-day collections progression, promise-to-pay tracking & strategic white-glove routing.
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
                Total Overdue Receivables Capital
              </span>
            }
            right={
              <span className="text-base font-bold text-[#1A2130]">
                <DigitRoll value={totalReceivables} prefix="₹" />
              </span>
            }
          />
        </div>
        <div className="ledger-row-animate">
          <LedgerRow
            isBanded={true}
            left={
              <span className="font-serif font-bold text-sm text-[#B8823D]">
                Strategic Relationship Accounts Protected
              </span>
            }
            stamp={<StampMark text="WHITE GLOVE" variant="caution" size="sm" />}
            right={`${ladderData.strategicBypass.length} accounts`}
          />
        </div>
      </div>

      {/* 3. SIMULATED 3-CYCLE PROGRESSION */}
      <section className="space-y-3">
        <div className="flex items-center justify-between ledger-row-animate">
          <h2 className="font-serif text-xl font-bold text-[#1A2130]">
            Simulated 7-Day Cycle Timeline
          </h2>
          <span className="font-mono text-xs text-[#6B7280]">
            CYCLE 3 CURRENT STATE (+21 DAYS)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          <div
            onClick={() => setSelectedCycle(1)}
            className={`p-4 border border-[#C9C2B4] rounded-[2px] cursor-pointer transition-all duration-150 ledger-row-animate ${
              selectedCycle === 1 ? "bg-[#E8EDE4] font-bold" : "bg-[#F7F5F0] hover:bg-[#EAE4D9]"
            }`}
          >
            <div className="text-xs font-bold text-[#1A2130] pb-1 border-b border-[#C9C2B4]">
              CYCLE 1 (+7 DAYS)
            </div>
            <div className="pt-2 space-y-1 text-[11px] text-[#6B7280]">
              <div>• 14 Friendly reminders sent</div>
              <div>• 4 Strategic accounts bypassed</div>
              <div className="text-[#2F6B4F] font-semibold">• 7 Promises captured</div>
            </div>
          </div>

          <div
            onClick={() => setSelectedCycle(2)}
            className={`p-4 border border-[#C9C2B4] rounded-[2px] cursor-pointer transition-all duration-150 ledger-row-animate ${
              selectedCycle === 2 ? "bg-[#E8EDE4] font-bold" : "bg-[#F7F5F0] hover:bg-[#EAE4D9]"
            }`}
          >
            <div className="text-xs font-bold text-[#1A2130] pb-1 border-b border-[#C9C2B4]">
              CYCLE 2 (+14 DAYS)
            </div>
            <div className="pt-2 space-y-1 text-[11px] text-[#6B7280]">
              <div>• 7 Reminders dispatched</div>
              <div className="text-[#9E2319] font-semibold">• 7 Broken promises caught</div>
              <div>• 11 Human handoffs assigned</div>
            </div>
          </div>

          <div
            onClick={() => setSelectedCycle(3)}
            className={`p-4 border border-[#C9C2B4] rounded-[2px] cursor-pointer transition-all duration-150 ledger-row-animate ${
              selectedCycle === 3 ? "bg-[#E8EDE4] font-bold" : "bg-[#F7F5F0] hover:bg-[#EAE4D9]"
            }`}
          >
            <div className="text-xs font-bold text-[#1A2130] pb-1 border-b border-[#C9C2B4]">
              CYCLE 3 (+21 DAYS)
            </div>
            <div className="pt-2 space-y-1 text-[11px] text-[#6B7280]">
              <div className="text-[#B8823D] font-semibold">• 10 Firm notices dispatched</div>
              <div>• 1 Active promise maintained</div>
              <div className="text-[#2F6B4F] font-semibold">• ₹41,54,000 active recovery</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. ESCALATION LADDER RUNGS & STRATEGIC BYPASS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#C9C2B4] pb-2 ledger-row-animate">
          <h2 className="font-serif text-xl font-bold text-[#1A2130]">
            Escalation Ladder Ledger
          </h2>
          <span className="font-mono text-xs text-[#6B7280]">
            CLICK ANY INVOICE TO INSPECT LIFECYCLE
          </span>
        </div>

        {loading ? (
          <LedgerLoading message="Retrieving B2B receivables escalation ladder..." rows={6} />
        ) : (
          <div className="space-y-6">
            {/* Ladder Rungs */}
            <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4]">
              {ladderData.rungs.map((rung, idx) => (
                <div
                  key={rung.id}
                  className={`p-4 space-y-2.5 ledger-row-animate ${
                    idx % 2 === 1 ? "bg-[#E8EDE4]" : "bg-[#F7F5F0]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-serif font-bold text-sm text-[#1A2130]">
                        {rung.title}
                      </div>
                      <div className="text-xs text-[#6B7280]">
                        {rung.subtitle}
                      </div>
                    </div>
                    <StampMark text={rung.stamp} variant={rung.variant} size="sm" />
                  </div>

                  {rung.items.length === 0 ? (
                    <div className="text-xs font-mono text-[#6B7280] italic pl-2">
                      No invoices currently at this rung
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {rung.items.map((inv) => (
                        <div
                          key={inv.invoice_id}
                          onClick={() =>
                            setSelectedRecord({
                              id: inv.invoice_id,
                              type: "receivable",
                              status: `Stage: ${inv.escalation_stage} (${inv.touch_count} touches)`,
                              statusCategory:
                                inv.escalation_stage === "human_handoff"
                                  ? "escalated"
                                  : "active",
                              amount: inv.invoice_amount,
                              customerOrReason: inv.business_customer_id,
                            })
                          }
                          className="flex items-center gap-2 px-3 py-1.5 bg-[#F7F5F0] hover:bg-[#DEE5D6] border border-[#C9C2B4] rounded-[2px] cursor-pointer font-mono text-xs transition-all duration-150 relative group"
                        >
                          <Building2 className="w-3 h-3 text-[#6B7280]" />
                          <span className="font-medium text-[#1A2130] relative">
                            {inv.business_customer_id}
                            <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#1A2130]/35 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-150 ease-out pointer-events-none" />
                          </span>
                          <span className="font-bold text-[#2F6B4F]">
                            {formatINR(inv.invoice_amount)}
                          </span>
                          <span className="text-[10px] text-[#6B7280]">
                            ({inv.days_overdue}d)
                          </span>
                          {inv.escalation_stage === "human_handoff" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setHumanActionTarget({
                                  recordType: "receivable",
                                  recordId: inv.invoice_id,
                                  amount: inv.invoice_amount,
                                  currentStatus: inv.escalation_stage,
                                  reason: inv.diagnosed_root_cause,
                                  customerOrCompany: inv.business_customer_id,
                                });
                              }}
                              className="ml-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-[#EAE4D9] text-[#1A2130] border border-[#C9C2B4] hover:bg-[#DFD8CC] rounded-[1px] transition-colors flex items-center gap-0.5"
                            >
                              <UserCheck className="w-2.5 h-2.5" />
                              <span>Act</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Strategic White-Glove Bypass Section */}
            <div className="p-4 bg-[#EAE4D9] border border-[#C9C2B4] rounded-[2px] space-y-3 ledger-row-animate">
              <div className="flex items-center justify-between border-b border-[#C9C2B4] pb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#B8823D]" />
                  <span className="font-serif font-bold text-sm text-[#1A2130]">
                    Strategic Account Direct Bypass Trajectory
                  </span>
                </div>
                <StampMark text="WHITE GLOVE" variant="caution" size="sm" />
              </div>
              <p className="text-xs text-[#6B7280]">
                High-value strategic clients bypass automated digital notices straight to Account Executives.
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                {ladderData.strategicBypass.map((inv) => (
                  <div
                    key={inv.invoice_id}
                    onClick={() =>
                      setSelectedRecord({
                        id: inv.invoice_id,
                        type: "receivable",
                        status: "Strategic tier: Direct white-glove handoff",
                        statusCategory: "escalated",
                        amount: inv.invoice_amount,
                        customerOrReason: `${inv.business_customer_id} (Strategic)`,
                      })
                    }
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#F7F5F0] hover:bg-[#DEE5D6] border border-[#C9C2B4] rounded-[2px] cursor-pointer font-mono text-xs transition-all duration-150 relative group"
                  >
                    <span className="font-bold text-[#1A2130] relative">
                      {inv.business_customer_id}
                      <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#1A2130]/35 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-150 ease-out pointer-events-none" />
                    </span>
                    <span className="font-bold text-[#B8823D]">
                      {formatINR(inv.invoice_amount)}
                    </span>
                    <span className="text-[10px] text-[#6B7280]">
                      (Strategic Bypass)
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHumanActionTarget({
                          recordType: "receivable",
                          recordId: inv.invoice_id,
                          amount: inv.invoice_amount,
                          currentStatus: "strategic_bypass",
                          reason: "Strategic account executive bypass",
                          customerOrCompany: inv.business_customer_id,
                        });
                      }}
                      className="ml-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-[#EAE4D9] text-[#1A2130] border border-[#C9C2B4] hover:bg-[#DFD8CC] rounded-[1px] transition-colors flex items-center gap-0.5"
                    >
                      <UserCheck className="w-2.5 h-2.5" />
                      <span>Act</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
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
        onSuccess={fetchInvoices}
        onOpenAuditDrawer={(id, type) =>
          setSelectedRecord({
            id,
            type: type as any,
            status: "Inspecting",
            statusCategory: "escalated",
            amount: 0,
          })
        }
      />
    </div>
  );
}
