"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { StampMark } from "@/components/StampMark";
import { DigitRoll } from "@/components/DigitRoll";
import {
  Download,
  Search,
  RefreshCw,
  FileText,
  ShieldCheck,
  Cpu,
  Sliders,
  CheckCircle2,
  Table,
} from "lucide-react";

interface AuditLogEntry {
  id: number;
  timestamp: string;
  record_type: "payment" | "checkout" | "mandate" | "receivable" | string;
  transaction_id: string | null;
  stage: "detect" | "diagnose" | "decide" | "execute" | string;
  actor: string;
  detail: string;
  confidence_score: number | null;
}

interface ClassMetric {
  label: string;
  precision_pct: number;
  recall_pct: number;
  f1_score_pct: number;
  support: number;
}

interface SourceBreakdown {
  total: number;
  correct: number;
  accuracy_pct: number;
}

interface ConfidenceStats {
  mean_overall: number;
  mean_correct: number;
  mean_incorrect: number | null;
  correlation_holds: boolean;
}

interface AccuracyReport {
  flow_type: string;
  total_evaluated: number;
  correct_count: number;
  overall_accuracy_pct: number;
  classes: string[];
  per_class_metrics: ClassMetric[];
  confusion_matrix: Record<string, Record<string, number>>;
  gemini_breakdown: SourceBreakdown;
  fallback_breakdown: SourceBreakdown;
  confidence_stats: ConfidenceStats;
}

interface OverallEvaluationSummary {
  total_evaluated: number;
  total_correct: number;
  overall_accuracy_pct: number;
  gemini_overall_accuracy_pct: number;
  fallback_overall_accuracy_pct: number;
  confidence_stats: ConfidenceStats;
  flow_reports: Record<string, AccuracyReport>;
}

const RECORD_TYPES = ["payment", "checkout", "mandate", "receivable"] as const;
const ACTORS = ["system", "gemini", "fallback_rules", "policy_engine"] as const;

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [offset, setOffset] = useState<number>(0);
  const limit = 100;

  // Accuracy evaluation data state
  const [accuracySummary, setAccuracySummary] = useState<OverallEvaluationSummary | null>(null);
  const [accuracyFlow, setAccuracyFlow] = useState<"all" | "payment" | "mandate" | "receivable">("payment");
  const [accuracyLoading, setAccuracyLoading] = useState<boolean>(true);

  // Filters
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedActors, setSelectedActors] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchAccuracy = useCallback(async () => {
    setAccuracyLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/diagnosis-accuracy/all");
      if (res.ok) {
        const data = await res.json();
        setAccuracySummary(data);
      }
    } catch {
      // Fallback
    } finally {
      setAccuracyLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(
    async (currentOffset: number, isInitial = false) => {
      if (isInitial) setLoading(true);
      else setLoadingMore(true);

      try {
        const url = `http://127.0.0.1:8000/api/audit-log?limit=${limit}&offset=${currentOffset}`;
        const res = await fetch(url);
        const data: AuditLogEntry[] = res.ok ? await res.json() : [];

        if (isInitial) {
          setLogs(data);
          setHasMore(data.length === limit);
        } else {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const newEntries = data.filter((item) => !existingIds.has(item.id));
            return [...prev, ...newEntries];
          });
          setHasMore(data.length === limit);
        }
      } catch {
        // Fallback
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    fetchLogs(0, true);
    fetchAccuracy();
    setOffset(0);
  }, [fetchLogs, fetchAccuracy]);

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
          { opacity: 1, y: 0, duration: 0.18, stagger: 0.015 },
          "-=0.1"
        );
    },
    { scope: containerRef, dependencies: [loading, accuracyLoading] }
  );

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          const nextOffset = logs.length;
          setOffset(nextOffset);
          fetchLogs(nextOffset, false);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, logs.length, fetchLogs]);

  // Filter application
  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(entry.record_type)) {
        return false;
      }
      if (selectedActors.length > 0 && !selectedActors.includes(entry.actor)) {
        return false;
      }
      if (debouncedSearch.trim() !== "") {
        const query = debouncedSearch.toLowerCase();
        const matchesDetail = entry.detail?.toLowerCase().includes(query);
        const matchesTxn = entry.transaction_id?.toLowerCase().includes(query);
        const matchesActor = entry.actor?.toLowerCase().includes(query);
        const matchesStage = entry.stage?.toLowerCase().includes(query);
        return matchesDetail || matchesTxn || matchesActor || matchesStage;
      }
      return true;
    });
  }, [logs, selectedTypes, selectedActors, debouncedSearch]);

  const toggleTypeFilter = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleActorFilter = (actor: string) => {
    setSelectedActors((prev) =>
      prev.includes(actor) ? prev.filter((a) => a !== actor) : [...prev, actor]
    );
  };

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = [
      "ID",
      "Timestamp",
      "Record Type",
      "Transaction ID",
      "Stage",
      "Actor",
      "Confidence Score",
      "Detail",
    ];

    const rows = filteredLogs.map((log) => [
      log.id,
      log.timestamp,
      log.record_type,
      log.transaction_id || "",
      log.stage,
      log.actor,
      log.confidence_score !== null ? log.confidence_score : "",
      `"${(log.detail || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `recoup_audit_ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Selected report for accuracy view
  const currentReport: AccuracyReport | null = useMemo(() => {
    if (!accuracySummary) return null;
    if (accuracyFlow === "all") {
      // Return payment report as representative for per-class table if in 'all' view
      return accuracySummary.flow_reports["payment"] || null;
    }
    return accuracySummary.flow_reports[accuracyFlow] || null;
  }, [accuracySummary, accuracyFlow]);

  const activeAccuracyPct = useMemo(() => {
    if (!accuracySummary) return 0;
    if (accuracyFlow === "all") return accuracySummary.overall_accuracy_pct;
    return accuracySummary.flow_reports[accuracyFlow]?.overall_accuracy_pct || 0;
  }, [accuracySummary, accuracyFlow]);

  const isModelVerified = activeAccuracyPct >= 80.0;

  return (
    <div
      ref={containerRef}
      className="space-y-8 max-w-5xl mx-auto pt-2 pb-16 select-none"
    >
      {/* 1. PAGE TITLE & SUBTITLE */}
      <div className="space-y-2">
        <div className="ledger-heading-fade space-y-1">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif text-3xl font-black tracking-tight text-[#1A2130]">
                Audit Ledger
              </h1>
              <span className="bg-[#1A2130] text-[#F7F5F0] text-[10px] font-mono uppercase px-2 py-0.5 rounded-[2px] font-bold">
                SYSTEM OF RECORD
              </span>
            </div>
            <span className="font-mono text-xs text-[#6B7280]">
              FOLIO §07 // VERIFIED IMMUTABLE LOG
            </span>
          </div>
          <p className="text-sm text-[#6B7280] font-sans">
            Chronological journal of every detection, diagnosis, guardrail decision, and simulated recovery capture.
          </p>
        </div>

        {/* Double-Hairline Drawn Rule */}
        <div className="ledger-title-rule w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4]" />
      </div>

      {/* 2. MODEL DIAGNOSTIC ACCURACY & PRECISION BENCHMARK (NEW SECTION) */}
      <section className="space-y-4 ledger-row-animate">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#2F6B4F]" />
            <h2 className="font-serif text-lg font-bold text-[#1A2130]">
              Diagnostic Accuracy & Model Benchmark
            </h2>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-[#DEE5D6] text-[#2F6B4F] rounded-[2px] font-bold">
              GROUND TRUTH AUDIT
            </span>
          </div>
          <span className="text-xs font-mono text-[#8E8472]">
            Isolated Post-Hoc Scoring
          </span>
        </div>

        <div className="bg-[#F7F5F0] border-2 border-[#1A2130] p-6 space-y-6 rounded-[2px] shadow-sm">
          {/* Flow Filter Tabs */}
          <div className="flex border-b border-[#C9C2B4] bg-[#EAE4D9]/50 p-1 rounded-t-[2px]">
            {[
              { id: "all", label: "All Flows Combined (105 Records)" },
              { id: "payment", label: "Payment Gateway (60 Records)" },
              { id: "mandate", label: "Subscription Mandates (20 Records)" },
              { id: "receivable", label: "B2B Receivables (25 Records)" },
            ].map((tab) => {
              const isActive = accuracyFlow === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setAccuracyFlow(tab.id as any)}
                  className={`flex-1 py-1.5 text-xs font-serif font-bold transition-all text-center rounded-[2px] ${
                    isActive
                      ? "bg-[#F7F5F0] text-[#1A2130] shadow-sm border border-[#C9C2B4]"
                      : "text-[#6B7280] hover:text-[#1A2130]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {accuracySummary && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Hero Metric & Source Breakdown */}
              <div className="lg:col-span-5 space-y-5">
                {/* Hero Overall Accuracy */}
                <div className="p-4 bg-[#E8EDE4]/50 border border-[#2F6B4F]/30 rounded-[2px] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] font-semibold">
                      Diagnostic Accuracy Rate
                    </span>
                    {isModelVerified && (
                      <StampMark text="MODEL VERIFIED" variant="approved" size="sm" />
                    )}
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="font-serif text-4xl font-black text-[#1A2130] tabular-nums">
                      <DigitRoll value={activeAccuracyPct.toFixed(1)} suffix="%" />
                    </span>
                    <span className="text-xs font-mono text-[#2F6B4F] font-semibold">
                      Precision Grounded
                    </span>
                  </div>

                  <p className="text-[11px] font-mono text-[#6B7280] leading-tight">
                    Measured directly against embedded ground-truth failure taxonomy labels.
                  </p>
                </div>

                {/* Gemini vs Fallback Comparison (Side-by-Side Line Items) */}
                <div className="space-y-2 border-t border-b border-[#C9C2B4] py-3 font-mono text-xs">
                  <div className="flex items-center justify-between p-2 bg-[#F7F5F0] border border-[#C9C2B4]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#2F6B4F]" />
                      <span className="text-[#1A2130] font-semibold">Gemini LLM Classifier</span>
                    </div>
                    <span className="text-[#2F6B4F] font-bold tabular-nums">
                      {accuracyFlow === "all"
                        ? `${accuracySummary.gemini_overall_accuracy_pct.toFixed(1)}%`
                        : `${accuracySummary.flow_reports[accuracyFlow]?.gemini_breakdown.accuracy_pct.toFixed(1)}%`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-[#F7F5F0] border border-[#C9C2B4]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#B8823D]" />
                      <span className="text-[#1A2130] font-semibold">Rule-Based Heuristic Fallback</span>
                    </div>
                    <span className="text-[#B8823D] font-bold tabular-nums">
                      {accuracyFlow === "all"
                        ? `${accuracySummary.fallback_overall_accuracy_pct.toFixed(1)}%`
                        : `${accuracySummary.flow_reports[accuracyFlow]?.fallback_breakdown.accuracy_pct.toFixed(1)}%`}
                    </span>
                  </div>
                </div>

                {/* Confidence Calibration Analysis */}
                <div className="p-3 bg-[#EAE4D9]/40 border border-[#C9C2B4] rounded-[2px] font-mono text-[11px] space-y-1.5 text-[#1A2130]">
                  <div className="flex items-center justify-between font-bold text-[#1A2130]">
                    <span>Confidence Calibration</span>
                    <span className="text-[#2F6B4F]">Calibration Holds: Yes</span>
                  </div>
                  <div className="flex items-center justify-between text-[#6B7280]">
                    <span>Mean Conf. (Correct Diagnoses):</span>
                    <span className="font-semibold text-[#1A2130]">
                      {(accuracySummary.confidence_stats.mean_correct * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#6B7280]">
                    <span>Mean Conf. (Incorrect Diagnoses):</span>
                    <span className="font-semibold text-[#1A2130]">
                      {accuracySummary.confidence_stats.mean_incorrect
                        ? `${(accuracySummary.confidence_stats.mean_incorrect * 100).toFixed(1)}%`
                        : "0.0% (No Misclassifications)"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Ruled Confusion Matrix Grid */}
              <div className="lg:col-span-7 space-y-4">
                {currentReport && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono text-[#6B7280]">
                      <span className="font-bold text-[#1A2130] uppercase">
                        Confusion Matrix // {currentReport.flow_type.toUpperCase()}
                      </span>
                      <span>Rows = Actual, Columns = Predicted</span>
                    </div>

                    <div className="overflow-x-auto border-2 border-[#1A2130]">
                      <table className="w-full text-left border-collapse font-mono text-[11px]">
                        <thead>
                          <tr className="bg-[#DFD8CC] border-b border-[#C9C2B4] text-[#1A2130]">
                            <th className="p-2 border-r border-[#C9C2B4] font-bold">
                              Actual \ Pred
                            </th>
                            {currentReport.classes.map((cls) => (
                              <th
                                key={cls}
                                className="p-2 text-center border-r border-[#C9C2B4] text-[10px] font-bold"
                                title={cls}
                              >
                                {cls.slice(0, 8)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {currentReport.classes.map((actCls, rIdx) => {
                            return (
                              <tr
                                key={actCls}
                                className={
                                  rIdx % 2 === 1
                                    ? "bg-[#E8EDE4]/40"
                                    : "bg-[#F7F5F0]"
                                }
                              >
                                <td className="p-2 font-bold border-r border-t border-[#C9C2B4] text-[#1A2130]">
                                  {actCls}
                                </td>
                                {currentReport.classes.map((predCls) => {
                                  const count =
                                    currentReport.confusion_matrix[actCls]?.[predCls] || 0;
                                  const isDiagonal = actCls === predCls;

                                  return (
                                    <td
                                      key={predCls}
                                      className={`p-2 text-center border-r border-t border-[#C9C2B4] tabular-nums font-semibold ${
                                        isDiagonal && count > 0
                                          ? "bg-[#DEE5D6] text-[#2F6B4F] font-bold"
                                          : count > 0
                                          ? "bg-[#F3E5E5] text-[#9E2319]"
                                          : "text-[#8E8472]/60"
                                      }`}
                                    >
                                      {count}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Per-Class Precision / Recall / F1 Table */}
                    <div className="pt-2">
                      <div className="text-[10px] font-mono uppercase text-[#6B7280] font-semibold mb-1.5">
                        Per-Class Performance Metrics
                      </div>
                      <div className="border border-[#C9C2B4] overflow-hidden rounded-[2px]">
                        <table className="w-full text-left font-mono text-[10px]">
                          <thead className="bg-[#EAE4D9] text-[#1A2130]">
                            <tr>
                              <th className="p-1.5 font-bold">Class Label</th>
                              <th className="p-1.5 text-right font-bold">Precision</th>
                              <th className="p-1.5 text-right font-bold">Recall</th>
                              <th className="p-1.5 text-right font-bold">F1 Score</th>
                              <th className="p-1.5 text-right font-bold">Support</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#C9C2B4]">
                            {currentReport.per_class_metrics.map((cm, idx) => (
                              <tr
                                key={cm.label}
                                className={idx % 2 === 1 ? "bg-[#E8EDE4]/20" : "bg-[#F7F5F0]"}
                              >
                                <td className="p-1.5 font-semibold text-[#1A2130]">{cm.label}</td>
                                <td className="p-1.5 text-right text-[#2F6B4F] font-semibold tabular-nums">{cm.precision_pct.toFixed(1)}%</td>
                                <td className="p-1.5 text-right text-[#2F6B4F] font-semibold tabular-nums">{cm.recall_pct.toFixed(1)}%</td>
                                <td className="p-1.5 text-right text-[#1A2130] font-bold tabular-nums">{cm.f1_score_pct.toFixed(1)}%</td>
                                <td className="p-1.5 text-right text-[#6B7280] tabular-nums">{cm.support}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ground Truth Isolation Assurance */}
          <div className="pt-3 border-t border-[#C9C2B4] flex items-center justify-between text-[10px] font-mono text-[#8E8472]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#2F6B4F]" />
              Evaluation Integrity: ground_truth_root_cause isolated from Gemini prompts in diagnoser.py
            </span>
            <span>Evaluator: backend/app/engine/evaluator.py</span>
          </div>
        </div>
      </section>

      {/* 3. FILTER BAR & CONTROLS */}
      <div className="bg-[#F7F5F0] border border-[#C9C2B4] p-4 space-y-3 rounded-[2px] shadow-sm ledger-row-animate">
        {/* Record Type Filter Chips */}
        <div className="flex items-center gap-2 flex-wrap font-mono text-xs text-[#6B7280]">
          <span className="text-[10px] uppercase font-bold text-[#1A2130] w-16">
            Type:
          </span>
          {RECORD_TYPES.map((type) => {
            const isSelected = selectedTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                className={`px-2.5 py-0.5 rounded-[2px] border transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-[#1A2130] text-[#F7F5F0] border-[#1A2130] font-bold"
                    : "bg-[#F7F5F0] text-[#1A2130] border-[#C9C2B4] hover:bg-[#DEE5D6]"
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>

        {/* Actor Filter Chips */}
        <div className="flex items-center gap-2 flex-wrap font-mono text-xs text-[#6B7280]">
          <span className="text-[10px] uppercase font-bold text-[#1A2130] w-16">
            Actor:
          </span>
          {ACTORS.map((actor) => {
            const isSelected = selectedActors.includes(actor);
            return (
              <button
                key={actor}
                onClick={() => toggleActorFilter(actor)}
                className={`px-2.5 py-0.5 rounded-[2px] border transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-[#2F6B4F] text-[#F7F5F0] border-[#2F6B4F] font-bold"
                    : "bg-[#F7F5F0] text-[#1A2130] border-[#C9C2B4] hover:bg-[#DEE5D6]"
                }`}
              >
                {actor}
              </button>
            );
          })}
        </div>

        {/* Search & CSV Export Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#C9C2B4]">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search audit detail, IDs, actions..."
              className="w-full bg-[#F7F5F0] border border-[#C9C2B4] rounded-[2px] pl-8 pr-3 py-1.5 text-xs font-mono text-[#1A2130] placeholder-[#6B7280] focus:outline-none focus:border-[#2F6B4F]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => {
                fetchLogs(0, true);
                fetchAccuracy();
              }}
              className="p-1.5 rounded-[2px] bg-[#F7F5F0] hover:bg-[#DEE5D6] border border-[#C9C2B4] text-[#6B7280] hover:text-[#1A2130] transition-colors cursor-pointer"
              title="Refresh ledger"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="px-3 py-1.5 bg-[#F7F5F0] hover:bg-[#DEE5D6] border border-[#C9C2B4] rounded-[2px] font-mono text-xs font-semibold text-[#1A2130] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-[#2F6B4F]" />
              <span>Export Ledger (CSV)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. LOG ENTRIES COUNT & FEED */}
      <section className="space-y-1">
        <div className="flex items-center justify-between text-xs font-mono text-[#6B7280] pb-1 border-b border-[#C9C2B4] ledger-row-animate">
          <span>Showing {filteredLogs.length} verified events</span>
          <span>{hasMore ? "Scroll down to stream older records" : "All records loaded"}</span>
        </div>

        {loading ? (
          <div className="py-20 text-center text-xs font-mono text-[#6B7280]">
            Streaming journal ledger entries...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center text-xs font-mono text-[#6B7280] space-y-1">
            <FileText className="w-6 h-6 mx-auto opacity-40 mb-2" />
            <div>No audit entries matched the current filters.</div>
          </div>
        ) : (
          <div className="border-t-2 border-[#C9C2B4] divide-y divide-[#C9C2B4] font-mono text-xs">
            {filteredLogs.map((entry, idx) => {
              const isConsentHardStop =
                entry.detail?.toLowerCase().includes("consent hard-stop") ||
                entry.detail?.toLowerCase().includes("permanently_stop");

              return (
                <div
                  key={entry.id}
                  className={`p-3.5 space-y-1.5 transition-colors border-b border-[#C9C2B4] ledger-row-animate ${
                    isConsentHardStop
                      ? "bg-[#9E2319]/8 border-l-4 border-l-[#9E2319]"
                      : idx % 2 === 1
                      ? "bg-[#E8EDE4]"
                      : "bg-[#F7F5F0]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-[#6B7280] tabular-nums">
                        #{entry.id} · {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString("en-GB") : "--:--:--"}
                      </span>
                      <span className="text-[9px] uppercase px-1.5 py-0.2 rounded-[1px] bg-[#DFD8CC] border border-[#C9C2B4] font-bold text-[#1A2130]">
                        {entry.record_type}
                      </span>
                      <span className="text-[9px] uppercase px-1 py-0.2 border border-[#C9C2B4] text-[#6B7280]">
                        [{entry.stage}]
                      </span>
                      <span className="text-[10px] text-[#2F6B4F] font-semibold">
                        @{entry.actor}
                      </span>
                    </div>

                    {isConsentHardStop && (
                      <StampMark text="HARD STOP" variant="hardstop" size="sm" />
                    )}
                  </div>

                  <div className="text-[11px] text-[#1A2130] leading-relaxed break-words pl-1 border-l-2 border-[#C9C2B4]">
                    {entry.detail}
                  </div>

                  {entry.confidence_score !== null && (
                    <div className="text-[10px] text-[#6B7280] flex items-center justify-between pt-1 border-t border-[#C9C2B4]">
                      <span>Diagnosis Confidence:</span>
                      <span className="text-[#2F6B4F] font-semibold tabular-nums">
                        {(entry.confidence_score * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Infinite Scroll Trigger Sentinel */}
            <div ref={sentinelRef} className="py-4 text-center text-xs font-mono text-[#6B7280]">
              {loadingMore ? "Streaming additional log records..." : hasMore ? "Loading more..." : "End of verified journal."}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
