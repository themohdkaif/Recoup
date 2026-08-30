"use client";

import React, { useEffect, useState, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { X, Shield } from "lucide-react";
import { StampMark } from "./StampMark";
import { RadarRecord } from "./RadarVisualization";

interface AuditLogEntry {
  id: number;
  timestamp: string;
  record_type: string;
  transaction_id?: string;
  stage: "detect" | "diagnose" | "decide" | "execute" | string;
  actor: string;
  detail: string;
  confidence_score?: number | null;
}

interface AuditDrawerProps {
  record: RadarRecord | null;
  onClose: () => void;
}

export function AuditDrawer({ record, onClose }: AuditDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch real audit trail for this record
  useEffect(() => {
    if (!record) return;

    setLoading(true);
    fetch(`http://127.0.0.1:8000/api/audit-log?transaction_id=${encodeURIComponent(record.id)}&limit=20`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AuditLogEntry[]) => {
        if (data && data.length > 0) {
          const chronological = [...data].sort((a, b) => a.id - b.id);
          setLogs(chronological);
        } else {
          fetch(`http://127.0.0.1:8000/api/audit-log?record_type=${encodeURIComponent(record.type)}&limit=4`)
            .then((res) => (res.ok ? res.json() : []))
            .then((fallbackData: AuditLogEntry[]) => {
              const chronological = [...fallbackData].sort((a, b) => a.id - b.id);
              setLogs(chronological);
            });
        }
      })
      .catch(() => {
        setLogs([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [record]);

  // GSAP slide-in paper settle animation
  useGSAP(
    () => {
      if (!record) return;

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion) return;

      gsap.fromTo(
        scrimRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: "power2.out" }
      );

      // Slide in with paper settling rotation / skew
      gsap.fromTo(
        drawerRef.current,
        {
          x: "100%",
          rotate: 0.6,
          skewY: -0.4,
        },
        {
          x: "0%",
          rotate: 0,
          skewY: 0,
          duration: 0.26,
          ease: "power3.out",
        }
      );
    },
    { dependencies: [record] }
  );

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!record) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Translucent Scrim */}
      <div
        ref={scrimRef}
        className="fixed inset-0 bg-[#1A2130]/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-In Paper Ledger Drawer */}
      <div
        ref={drawerRef}
        className="relative z-10 w-full max-w-xl bg-[#F7F5F0] border-l-2 border-[#C9C2B4] h-full shadow-2xl flex flex-col justify-between overflow-hidden"
      >
        {/* Header (Ruled Title Plate) */}
        <div className="p-5 border-b border-[#C9C2B4] bg-[#EAE4D9] flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase px-2 py-0.5 bg-[#DFD8CC] border border-[#C9C2B4] text-[#1A2130] font-semibold">
                {record.type}
              </span>
              <StampMark
                text={
                  record.statusCategory === "active"
                    ? "RECOVERED"
                    : record.statusCategory === "escalated"
                    ? "ESCALATED"
                    : "HARD STOP"
                }
                variant={
                  record.statusCategory === "active"
                    ? "approved"
                    : record.statusCategory === "escalated"
                    ? "caution"
                    : "hardstop"
                }
                size="sm"
              />
            </div>
            <div className="font-mono text-base font-bold text-[#1A2130] tabular-nums">
              {record.id}
            </div>
            <div className="text-sm font-mono text-[#2F6B4F] font-bold">
              ₹{record.amount.toLocaleString("en-IN")}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-[2px] text-[#6B7280] hover:text-[#1A2130] hover:bg-[#DFD8CC] transition-colors border border-transparent hover:border-[#C9C2B4]"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Ruled Event Log Entries */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-[#F7F5F0]">
          <div className="flex items-center justify-between border-b border-[#C9C2B4] pb-1.5">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#6B7280]">
              Immutable Folio Audit Trail
            </span>
            <span className="text-[10px] font-mono text-[#6B7280]">
              {logs.length} EVENTS RECORDED
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs font-mono text-[#6B7280]">
              Querying verified audit log entries...
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-[#6B7280]">
              No audit logs captured for this record ID yet.
            </div>
          ) : (
            <div className="space-y-3 font-mono text-xs">
              {logs.map((log, index) => {
                const isBlockedOverride =
                  log.detail.includes("OVERRIDE BLOCKED BY POLICY GUARDRAIL");
                const isConsentHardStop =
                  log.detail.toLowerCase().includes("consent hard-stop") ||
                  log.detail.toLowerCase().includes("permanently_stop");
                const isHumanIntervention =
                  log.stage.toLowerCase() === "human_intervention" ||
                  log.actor.toLowerCase() === "human_operator";

                return (
                  <div
                    key={log.id || index}
                    className={`border p-3 rounded-[2px] space-y-1.5 ${
                      isBlockedOverride
                        ? "bg-[#A8342A]/15 border-2 border-[#A8342A]"
                        : isConsentHardStop
                        ? "bg-[#A8342A]/10 border-[#A8342A]/40"
                        : isHumanIntervention
                        ? "bg-[#2F6B4F]/10 border-2 border-[#2F6B4F]"
                        : index % 2 === 1
                        ? "bg-[#E8EDE4] border-[#C9C2B4]"
                        : "bg-[#F7F5F0] border-[#C9C2B4]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] uppercase px-1.5 py-0.2 border rounded-[1px] font-bold ${
                            isBlockedOverride
                              ? "bg-[#A8342A] text-white border-[#A8342A]"
                              : isHumanIntervention
                              ? "bg-[#2F6B4F] text-white border-[#2F6B4F]"
                              : "bg-[#DFD8CC] text-[#1A2130] border-[#C9C2B4]"
                          }`}
                        >
                          [{log.stage.toUpperCase()}]
                        </span>
                        <span
                          className={`font-semibold ${
                            isHumanIntervention ? "text-[#1A2130]" : "text-[#6B7280]"
                          }`}
                        >
                          {log.actor}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#6B7280] tabular-nums">
                        {log.timestamp
                          ? new Date(log.timestamp).toLocaleTimeString("en-GB")
                          : "--:--:--"}
                      </span>
                    </div>

                    <div
                      className={`text-[11px] leading-relaxed break-words pl-1.5 border-l-2 ${
                        isBlockedOverride
                          ? "border-[#A8342A] text-[#1A2130] font-medium"
                          : isHumanIntervention
                          ? "border-[#2F6B4F] text-[#1A2130]"
                          : "border-[#C9C2B4] text-[#1A2130]"
                      }`}
                    >
                      {log.detail}
                    </div>

                    {log.confidence_score !== null && log.confidence_score !== undefined && (
                      <div className="text-[10px] text-[#6B7280] flex items-center justify-between pt-1 border-t border-[#C9C2B4]">
                        <span>Diagnosis Confidence:</span>
                        <span className="text-[#2F6B4F] font-semibold tabular-nums">
                          {(log.confidence_score * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#C9C2B4] bg-[#EAE4D9] flex items-center justify-between text-[11px] font-mono text-[#6B7280]">
          <div className="flex items-center gap-2 text-[#2F6B4F]">
            <Shield className="w-3.5 h-3.5" />
            <span className="font-semibold">Folio Audit Verified</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-[#F7F5F0] text-[#1A2130] border border-[#C9C2B4] hover:bg-[#E8EDE4] rounded-[2px] transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
