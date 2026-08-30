"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface LedgerTabProps {
  href: string;
  label: string;
  tabNumber?: string;
  count?: number | string;
  index: number;
}

export function LedgerTab({
  href,
  label,
  tabNumber,
  count,
  index,
}: LedgerTabProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  // Staggered z-index for physical overlapping card-index look
  const zIndex = isActive ? 30 : 20 - index;

  return (
    <Link
      href={href}
      style={{ zIndex }}
      className={`group relative block w-full text-left transition-all duration-150 ${
        index > 0 ? "-mt-[3px]" : ""
      } ${
        isActive
          ? "translate-x-1.5 mr-[-1px]"
          : "hover:translate-x-0.5"
      }`}
    >
      <div
        className={`py-3 px-4 rounded-l-[4px] border-t border-b border-l border-[#C9C2B4] transition-all flex items-center justify-between gap-2 ${
          isActive
            ? "bg-[#F7F5F0] border-r-transparent shadow-[-3px_2px_6px_rgba(30,25,15,0.06)] text-[#1A2130]"
            : "bg-[#EAE3D6] text-[#6B7280] hover:text-[#1A2130] hover:bg-[#F2ECE0] border-r border-r-[#C9C2B4]"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {tabNumber && (
            <span className="font-mono text-[11px] text-[#8E8472] font-semibold flex-shrink-0">
              §{tabNumber}
            </span>
          )}
          <span
            className={`text-xs uppercase tracking-wider truncate font-sans ${
              isActive ? "font-bold text-[#1A2130]" : "font-medium"
            }`}
          >
            {label}
          </span>
        </div>

        {count !== undefined && (
          <span
            className={`font-mono text-[10px] tabular-nums px-1.5 py-0.2 rounded-[1px] border ${
              isActive
                ? "bg-[#E8EDE4] text-[#2F6B4F] border-[#2F6B4F]/30 font-bold"
                : "bg-[#DFD8CC] text-[#6B7280] border-[#C9C2B4]"
            }`}
          >
            {count}
          </span>
        )}
      </div>
    </Link>
  );
}
