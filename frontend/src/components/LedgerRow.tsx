"use client";

import React from "react";

interface LedgerRowProps {
  left: React.ReactNode;
  right: React.ReactNode;
  stamp?: React.ReactNode;
  isBanded?: boolean;
  className?: string;
  onClick?: () => void;
  borderTop?: boolean;
}

export function LedgerRow({
  left,
  right,
  stamp,
  isBanded = false,
  className = "",
  onClick,
  borderTop = false,
}: LedgerRowProps) {
  return (
    <div
      onClick={onClick}
      className={`group relative w-full py-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors duration-150 border-b border-[#C9C2B4] ledger-row-item ${
        borderTop ? "border-t border-[#C9C2B4]" : ""
      } ${
        isBanded ? "bg-[#E8EDE4]" : "bg-[#F7F5F0]"
      } ${
        onClick ? "cursor-pointer hover:bg-[#DEE5D6]" : ""
      } ${className}`}
    >
      {/* Left Content with subtle pen underline hover effect */}
      <div className="flex-1 min-w-0 flex items-center gap-3 relative">
        <div className="relative inline-block min-w-0">
          {left}
          {/* Subtle 2px ink underline that draws on hover */}
          <span
            className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#1A2130]/35 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-150 ease-out pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Right Content & Optional Rubber Stamp */}
      <div className="flex items-center gap-4 sm:text-right flex-shrink-0">
        {stamp && <div className="flex-shrink-0">{stamp}</div>}
        <div className="font-mono text-sm text-[#1A2130] tabular-nums font-medium">
          {right}
        </div>
      </div>
    </div>
  );
}
