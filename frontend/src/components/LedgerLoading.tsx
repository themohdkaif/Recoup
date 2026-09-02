"use client";

import React from "react";

interface LedgerLoadingProps {
  message?: string;
  rows?: number;
}

export function LedgerLoading({ message = "Retrieving ledger records...", rows = 4 }: LedgerLoadingProps) {
  return (
    <div className="py-8 space-y-4 font-mono text-xs select-none">
      <div className="flex items-center justify-between pb-1 border-b border-[#C9C2B4] text-[#6B7280]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#2F6B4F] animate-pulse shadow-[0_0_4px_rgba(47,107,79,0.5)]" />
          <span className="font-bold text-[#1A2130] uppercase tracking-wider text-[11px]">{message}</span>
        </div>
        <span className="text-[10px] text-[#8C8275] uppercase">Syncing Ledger...</span>
      </div>

      <div className="border border-[#C9C2B4] divide-y divide-[#C9C2B4] bg-[#F7F5F0] rounded-[1px] overflow-hidden">
        {Array.from({ length: rows }).map((_, idx) => (
          <div
            key={idx}
            className={`p-3.5 flex items-center justify-between gap-4 animate-pulse ${
              idx % 2 === 1 ? "bg-[#EAE4D9]/60" : "bg-[#F7F5F0]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-[2px] bg-[#D4AF37]/20 border border-[#C9C2B4]" />
              <div className="space-y-1.5">
                <div className="w-36 h-3 bg-[#C9C2B4]/60 rounded-[1px]" />
                <div className="w-48 h-2.5 bg-[#C9C2B4]/40 rounded-[1px]" />
              </div>
            </div>
            <div className="space-y-1.5 text-right flex flex-col items-end">
              <div className="w-20 h-3 bg-[#2F6B4F]/25 rounded-[1px]" />
              <div className="w-14 h-2.5 bg-[#C9C2B4]/40 rounded-[1px]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
