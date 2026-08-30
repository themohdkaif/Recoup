"use client";

import React from "react";
import { LedgerTab } from "./LedgerTab";
import { Shield } from "lucide-react";

export function Sidebar() {
  const tabs = [
    { href: "/overview", label: "Overview", tabNumber: "01" },
    { href: "/radar", label: "Recovery Ledger", tabNumber: "02" },
    { href: "/payments", label: "Payment Flow", tabNumber: "03", count: 60 },
    { href: "/checkout", label: "Checkout Flow", tabNumber: "04", count: 15 },
    { href: "/mandates", label: "Mandate Flow", tabNumber: "05", count: 20 },
    { href: "/receivables", label: "Receivables Flow", tabNumber: "06", count: 25 },
    { href: "/audit", label: "Audit Ledger", tabNumber: "07" },
    { href: "/simulator", label: "Simulator", tabNumber: "08" },
  ];

  return (
    <aside className="w-full lg:w-64 flex-shrink-0 select-none bg-[#DFD8CC]/40 border-r border-[#C9C2B4] flex flex-col justify-between min-h-[calc(100vh-80px)] py-4 relative z-20">
      {/* Overlapping Manila Card-Index Tabs Stack */}
      <div className="space-y-0 pr-0">
        <div className="px-4 pb-3 text-[10px] font-mono uppercase tracking-widest text-[#6B7280]">
          Folio Sections
        </div>
        <nav className="flex flex-col">
          {tabs.map((tab, idx) => (
            <LedgerTab
              key={tab.href}
              href={tab.href}
              label={tab.label}
              tabNumber={tab.tabNumber}
              count={tab.count}
              index={idx}
            />
          ))}
        </nav>
      </div>

      {/* Bottom Folio Metadata Box */}
      <div className="p-4 mx-3 mt-8 bg-[#EAE4D9] border border-[#C9C2B4] rounded-[2px] space-y-2 font-mono text-[11px] text-[#6B7280]">
        <div className="flex items-center gap-1.5 text-[#1A2130] font-semibold">
          <Shield className="w-3.5 h-3.5 text-[#2F6B4F]" />
          <span>GUARDRAIL LOCKOUTS</span>
        </div>
        <div className="text-[10px] leading-tight space-y-1">
          <div>• Consent hard-stops: ACTIVE</div>
          <div>• Strategic bypass: ACTIVE</div>
          <div>• Minimum cart hold: ₹300</div>
        </div>
        <div className="pt-1.5 border-t border-[#C9C2B4] text-[9px] text-[#8E8472] uppercase tracking-wider">
          Ledger Book Ref: 2026-REC-V1
        </div>
      </div>
    </aside>
  );
}
