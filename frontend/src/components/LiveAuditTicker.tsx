"use client";

import React, { useState, useEffect } from "react";
import { Shield, Activity, RefreshCw } from "lucide-react";

interface AuditLogEntry {
  id: number;
  timestamp: string;
  stage: string;
  actor: string;
  detail: string;
  confidence_score?: number | null;
  transaction_id?: string | null;
}

interface TickerItem {
  id: string | number;
  tag: string;
  actor: string;
  text: string;
  colorClass: string;
  timeStr: string;
}

const FALLBACK_TICKER_ITEMS: TickerItem[] = [
  {
    id: "f1",
    tag: "PAYMENT",
    actor: "system",
    text: "retry_payment → created live Razorpay test order order_TTG7IOtONKzd8V",
    colorClass: "text-[#2F6B4F] border-[#2F6B4F]/30 bg-[#2F6B4F]/10",
    timeStr: "LIVE",
  },
  {
    id: "f2",
    tag: "MANDATE",
    actor: "policy_engine",
    text: "permanently_stop → consent hard-stop enforced on paused subscription",
    colorClass: "text-[#9E2319] border-[#9E2319]/30 bg-[#9E2319]/10",
    timeStr: "LIVE",
  },
  {
    id: "f3",
    tag: "RECEIVABLES",
    actor: "policy_engine",
    text: "human_handoff → strategic enterprise tier account executive direct bypass",
    colorClass: "text-[#B8823D] border-[#B8823D]/30 bg-[#B8823D]/10",
    timeStr: "LIVE",
  },
  {
    id: "f4",
    tag: "CHECKOUT",
    actor: "policy_engine",
    text: "hold → cart value sub-₹300 margin protection hold enforced",
    colorClass: "text-[#6B7280] border-[#6B7280]/30 bg-[#6B7280]/10",
    timeStr: "LIVE",
  },
  {
    id: "f5",
    tag: "DIAGNOSE",
    actor: "gemini",
    text: "root cause: transient_network_timeout (confidence: 96.2%)",
    colorClass: "text-[#2F6B4F] border-[#2F6B4F]/30 bg-[#2F6B4F]/10",
    timeStr: "LIVE",
  },
];

function formatLogForTicker(log: AuditLogEntry): TickerItem {
  const detail = log.detail || "";
  let tag = (log.stage || "AUDIT").toUpperCase();
  let colorClass = "text-[#6B7280] border-[#C9C2B4] bg-[#DFD8CC]/40";

  if (detail.toLowerCase().includes("payment") || detail.includes("order_")) {
    tag = "PAYMENT";
    colorClass = "text-[#2F6B4F] border-[#2F6B4F]/40 bg-[#2F6B4F]/10";
  } else if (
    detail.toLowerCase().includes("mandate") ||
    detail.toLowerCase().includes("consent hard-stop") ||
    detail.toLowerCase().includes("permanently_stop")
  ) {
    tag = "MANDATE";
    colorClass = "text-[#9E2319] border-[#9E2319]/40 bg-[#9E2319]/10";
  } else if (
    detail.toLowerCase().includes("receivable") ||
    detail.toLowerCase().includes("invoice") ||
    detail.toLowerCase().includes("broken promise") ||
    detail.toLowerCase().includes("strategic")
  ) {
    tag = "RECEIVABLE";
    colorClass = "text-[#B8823D] border-[#B8823D]/40 bg-[#B8823D]/10";
  } else if (
    detail.toLowerCase().includes("checkout") ||
    detail.toLowerCase().includes("cart") ||
    detail.toLowerCase().includes("nudge")
  ) {
    tag = "CHECKOUT";
    colorClass = "text-[#1A2130] border-[#C9C2B4] bg-[#EAE4D9]";
  }

  if (log.actor === "human_operator") {
    tag = "OPERATOR";
    colorClass = "text-[#2F6B4F] border-[#2F6B4F]/50 bg-[#2F6B4F]/15";
  }

  // Compact summary text
  let summaryText = detail;
  if (detail.length > 95) {
    summaryText = detail.substring(0, 92) + "...";
  }

  let timeStr = "LIVE";
  if (log.timestamp) {
    try {
      const d = new Date(log.timestamp);
      timeStr = d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      timeStr = "LIVE";
    }
  }

  return {
    id: log.id,
    tag,
    actor: log.actor || "system",
    text: summaryText,
    colorClass,
    timeStr,
  };
}

export function LiveAuditTicker() {
  const [items, setItems] = useState<TickerItem[]>(FALLBACK_TICKER_ITEMS);
  const [isLive, setIsLive] = useState<boolean>(true);

  const fetchLatestLogs = () => {
    fetch("http://127.0.0.1:8000/api/audit-log")
      .then((res) => {
        if (!res.ok) throw new Error("Network error");
        return res.json();
      })
      .then((data: AuditLogEntry[]) => {
        if (Array.isArray(data) && data.length > 0) {
          // Take top 18 most recent logs
          const formatted = data.slice(0, 18).map(formatLogForTicker);
          setItems(formatted);
          setIsLive(true);
        }
      })
      .catch(() => {
        // Fallback gracefully without breaking UI
        setIsLive(false);
      });
  };

  useEffect(() => {
    fetchLatestLogs();
    // Lightweight polling every 18 seconds
    const interval = setInterval(fetchLatestLogs, 18000);
    return () => clearInterval(interval);
  }, []);

  // Duplicate items array once to ensure seamless infinite CSS marquee looping
  const loopItems = [...items, ...items];

  return (
    <div className="w-full border-y border-[#C9C2B4] bg-[#EDE7DB]/85 select-none relative overflow-hidden flex items-center h-8 sm:h-9 z-20">
      {/* Static Left Label Badge */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[#DFD8CC] border-r border-[#C9C2B4] text-[10px] font-mono font-bold text-[#1A2130] uppercase tracking-wider z-10 shadow-xs">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2F6B4F] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2F6B4F]" />
        </span>
        <span className="hidden sm:inline">LIVE LEDGER FEED</span>
        <span className="sm:hidden">FEED</span>
      </div>

      {/* Marquee Container with GPU edge fade overlays */}
      <div className="flex-1 overflow-hidden relative flex items-center h-full group [transform:translateZ(0)]">
        {/* Left & Right gradient edge fades (Zero mask rasterization overhead) */}
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[#EDE7DB] to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[#EDE7DB] to-transparent pointer-events-none z-10" />

        <div className="flex items-center gap-6 whitespace-nowrap animate-ticker group-hover:[animation-play-state:paused] cursor-default pl-6 [transform:translateZ(0)]">
          {loopItems.map((item, idx) => (
            <div
              key={`${item.id}-${idx}`}
              className="inline-flex items-center gap-2 font-mono text-[11px] text-[#6B7280] hover:text-[#1A2130] transition-colors"
            >
              <span
                className={`text-[9px] uppercase px-1.5 py-0.2 border rounded-[1px] font-bold ${item.colorClass}`}
              >
                [{item.tag}]
              </span>
              <span className="text-[#1A2130] font-medium max-w-[380px] sm:max-w-none truncate">
                {item.text}
              </span>
              <span className="text-[10px] text-[#8E8472] tabular-nums">
                · {item.timeStr}
              </span>
              <span className="text-[#C9C2B4] mx-1">/</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Edge Timestamp / Telemetry Tag */}
      <div className="hidden lg:flex flex-shrink-0 items-center gap-1.5 px-3 border-l border-[#C9C2B4] text-[9px] font-mono text-[#8E8472] uppercase tracking-wider bg-[#EDE7DB]">
        <Activity className="w-3 h-3 text-[#2F6B4F]" />
        <span>700+ ENTRIES</span>
      </div>
    </div>
  );
}
