"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, ShieldAlert, CheckCircle2, AlertTriangle, ArrowRight, UserCheck, RefreshCw, Send, Lock } from "lucide-react";
import { StampMark } from "./StampMark";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

export type HumanActionType = "marked_resolved" | "approved_contact" | "override_retry" | "reassigned";

export interface HumanActionTarget {
  recordType: "payment" | "mandate" | "receivable" | "checkout";
  recordId: string;
  amount: number;
  currentStatus: string;
  reason?: string;
  customerOrCompany?: string;
}

interface HumanActionResult {
  success: boolean;
  action_taken: string;
  resulting_status: string;
  blocked_by_guardrail: boolean;
  guardrail_reason?: string | null;
  stamp_text?: string | null;
  stamp_variant?: "approved" | "caution" | "hardstop" | null;
  operator_note?: string | null;
  timestamp: string;
  execution_detail?: string | null;
  razorpay_order_id?: string | null;
}

interface HumanActionModalProps {
  target: HumanActionTarget | null;
  onClose: () => void;
  onSuccess?: () => void;
  onOpenAuditDrawer?: (recordId: string, recordType: string) => void;
}

export function HumanActionModal({
  target,
  onClose,
  onSuccess,
  onOpenAuditDrawer,
}: HumanActionModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);

  const [selectedAction, setSelectedAction] = useState<HumanActionType>("approved_contact");
  const [operatorNote, setOperatorNote] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<HumanActionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // GSAP Entrance
  useGSAP(
    () => {
      if (!target) return;
      gsap.fromTo(
        scrimRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.18, ease: "power2.out" }
      );
      gsap.fromTo(
        modalRef.current,
        { scale: 0.96, opacity: 0, y: 8 },
        { scale: 1, opacity: 1, y: 0, duration: 0.22, ease: "power3.out" }
      );
    },
    { dependencies: [target] }
  );

  // Reset state when target changes
  useEffect(() => {
    if (target) {
      setSelectedAction("approved_contact");
      setOperatorNote("");
      setResult(null);
      setErrorMsg(null);
    }
  }, [target]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  if (!target) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/human-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_type: target.recordType,
          record_id: target.recordId,
          action: selectedAction,
          note: operatorNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned ${res.status}`);
      }

      const data: HumanActionResult = await res.json();
      setResult(data);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to execute human action");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Scrim */}
      <div
        ref={scrimRef}
        className="fixed inset-0 bg-[#1A2130]/50 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />

      {/* Modal Card */}
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-xl bg-[#F7F5F0] border-2 border-[#C9C2B4] shadow-2xl rounded-[2px] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-4 bg-[#EAE4D9] border-b border-[#C9C2B4] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#1A2130]" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#1A2130]">
              Human-in-the-Loop Action Center
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1 text-[#6B7280] hover:text-[#1A2130] hover:bg-[#DFD8CC] rounded-[2px] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Record Header Plate */}
        <div className="p-4 bg-[#DFD8CC]/40 border-b border-[#C9C2B4] flex items-center justify-between text-xs font-mono">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-[#DFD8CC] border border-[#C9C2B4] uppercase text-[10px] font-bold text-[#1A2130]">
                {target.recordType}
              </span>
              <span className="font-bold text-[#1A2130]">{target.recordId}</span>
            </div>
            {target.customerOrCompany && (
              <div className="text-[11px] text-[#6B7280] mt-0.5">{target.customerOrCompany}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-[#2F6B4F]">
              ₹{target.amount.toLocaleString("en-IN")}
            </div>
            <div className="text-[10px] text-[#6B7280] uppercase">
              Current: {target.currentStatus}
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 font-mono text-xs max-h-[70vh] overflow-y-auto">
          {result ? (
            /* Result Screen */
            <div className="space-y-4">
              {result.blocked_by_guardrail ? (
                /* Prominent Guardrail Refusal Proof Point */
                <div className="border-2 border-[#A8342A] bg-[#A8342A]/10 p-4 rounded-[2px] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#A8342A] font-bold">
                      <Lock className="w-4 h-4" />
                      <span className="uppercase text-xs tracking-wider">
                        Policy Engine Refusal
                      </span>
                    </div>
                    <StampMark
                      text="OVERRIDE BLOCKED — CONSENT HARD-STOP"
                      variant="hardstop"
                      size="sm"
                    />
                  </div>

                  <div className="p-3 bg-[#F7F5F0] border border-[#A8342A]/30 text-[#1A2130] text-[11px] leading-relaxed">
                    <div className="font-bold text-[#A8342A] mb-1">
                      Deterministic Compliance Lock Active:
                    </div>
                    {result.guardrail_reason ||
                      "Customer explicitly revoked auto-debit consent. Even human operators are firmly barred from overriding consent hard-stops."}
                  </div>

                  <div className="text-[10px] text-[#6B7280]">
                    ✓ Immutable incident logged under <span className="font-bold">actor="human_operator"</span> in the audit folio ledger.
                  </div>
                </div>
              ) : (
                /* Success Screen */
                <div className="border border-[#2F6B4F] bg-[#2F6B4F]/10 p-4 rounded-[2px] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#2F6B4F] font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="uppercase text-xs tracking-wider">
                        Action Executed & Verified
                      </span>
                    </div>
                    {result.stamp_text && (
                      <StampMark
                        text={result.stamp_text}
                        variant={result.stamp_variant || "approved"}
                        size="sm"
                      />
                    )}
                  </div>

                  <div className="p-3 bg-[#F7F5F0] border border-[#2F6B4F]/30 text-[#1A2130] text-[11px] leading-relaxed">
                    <div className="font-bold text-[#2F6B4F] mb-0.5">
                      Status: {result.resulting_status.toUpperCase()}
                    </div>
                    <div>{result.execution_detail || "Action recorded into system ledger."}</div>
                    {result.razorpay_order_id && (
                      <div className="mt-1 text-[10px] text-[#6B7280]">
                        Razorpay Order ID: <span className="font-bold text-[#1A2130]">{result.razorpay_order_id}</span>
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-[#6B7280]">
                    ✓ Logged in the permanent audit folio with timestamp and operator notes.
                  </div>
                </div>
              )}

              {/* Action Buttons Post-Execution */}
              <div className="flex items-center justify-between pt-2 border-t border-[#C9C2B4]">
                {onOpenAuditDrawer && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenAuditDrawer(target.recordId, target.recordType);
                    }}
                    className="px-3 py-1.5 bg-[#EAE4D9] text-[#1A2130] border border-[#C9C2B4] hover:bg-[#DFD8CC] rounded-[2px] transition-colors font-medium flex items-center gap-1.5 text-xs"
                  >
                    <span>View Record Audit Folio</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 bg-[#1A2130] text-[#F7F5F0] rounded-[2px] hover:bg-[#1A2130]/90 transition-colors font-medium ml-auto"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Action Selection Form */
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[#1A2130] uppercase tracking-wider block">
                  Select Intervention Action
                </label>

                <div className="grid grid-cols-1 gap-2">
                  {/* Option 1: Approve Contact */}
                  <label
                    className={`border p-2.5 rounded-[2px] flex items-start gap-2.5 cursor-pointer transition-colors ${
                      selectedAction === "approved_contact"
                        ? "bg-[#DFD8CC] border-[#1A2130]"
                        : "bg-[#F7F5F0] border-[#C9C2B4] hover:bg-[#EAE4D9]/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="human_action"
                      value="approved_contact"
                      checked={selectedAction === "approved_contact"}
                      onChange={() => setSelectedAction("approved_contact")}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-bold text-[#1A2130]">Approve 1 Manual Contact</div>
                      <div className="text-[10px] text-[#6B7280]">
                        Authorizes a single high-touch outreach attempt (e.g. for strategic accounts or broken promises). Does not re-enter automated loops.
                      </div>
                    </div>
                  </label>

                  {/* Option 2: Override & Retry */}
                  <label
                    className={`border p-2.5 rounded-[2px] flex items-start gap-2.5 cursor-pointer transition-colors ${
                      selectedAction === "override_retry"
                        ? "bg-[#A8342A]/10 border-[#A8342A]"
                        : "bg-[#F7F5F0] border-[#C9C2B4] hover:bg-[#EAE4D9]/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="human_action"
                      value="override_retry"
                      checked={selectedAction === "override_retry"}
                      onChange={() => setSelectedAction("override_retry")}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-bold text-[#1A2130] flex items-center gap-1.5">
                        <span>Override Escalation & Retry</span>
                        <span className="text-[9px] px-1 py-0.2 bg-[#A8342A] text-white rounded-[1px] uppercase">
                          Guardrail Checked
                        </span>
                      </div>
                      <div className="text-[10px] text-[#6B7280]">
                        Re-runs record through the policy engine to attempt recovery. If the record violates a hard compliance stop (e.g. consent revocation), this will be firmly blocked.
                      </div>
                    </div>
                  </label>

                  {/* Option 3: Mark Resolved */}
                  <label
                    className={`border p-2.5 rounded-[2px] flex items-start gap-2.5 cursor-pointer transition-colors ${
                      selectedAction === "marked_resolved"
                        ? "bg-[#2F6B4F]/10 border-[#2F6B4F]"
                        : "bg-[#F7F5F0] border-[#C9C2B4] hover:bg-[#EAE4D9]/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="human_action"
                      value="marked_resolved"
                      checked={selectedAction === "marked_resolved"}
                      onChange={() => setSelectedAction("marked_resolved")}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-bold text-[#1A2130]">Mark as Resolved</div>
                      <div className="text-[10px] text-[#6B7280]">
                        Concludes recovery workflow (e.g. payment was received offline via direct bank transfer or settlement).
                      </div>
                    </div>
                  </label>

                  {/* Option 4: Reassign */}
                  <label
                    className={`border p-2.5 rounded-[2px] flex items-start gap-2.5 cursor-pointer transition-colors ${
                      selectedAction === "reassigned"
                        ? "bg-[#DFD8CC] border-[#1A2130]"
                        : "bg-[#F7F5F0] border-[#C9C2B4] hover:bg-[#EAE4D9]/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="human_action"
                      value="reassigned"
                      checked={selectedAction === "reassigned"}
                      onChange={() => setSelectedAction("reassigned")}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-bold text-[#1A2130]">Reassign Queue</div>
                      <div className="text-[10px] text-[#6B7280]">
                        Routes the record to a specialized human review tier without changing transaction state.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Safety Warning Banner for Override */}
              {selectedAction === "override_retry" && (
                <div className="border border-[#A8342A]/40 bg-[#A8342A]/10 p-3 rounded-[2px] flex items-start gap-2.5 text-[#1A2130]">
                  <AlertTriangle className="w-4 h-4 text-[#A8342A] shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <span className="font-bold text-[#A8342A]">Deterministic Safety Note: </span>
                    This action executes through the live <span className="font-bold font-mono">policy_engine.py</span> graph. If this transaction has an active compliance hard-stop (such as customer-revoked consent), the system will firmly block this attempt and log the refusal.
                  </div>
                </div>
              )}

              {/* Operator Note */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#1A2130] uppercase tracking-wider block">
                  Operator Justification / Note (Optional)
                </label>
                <textarea
                  value={operatorNote}
                  onChange={(e) => setOperatorNote(e.target.value)}
                  placeholder="e.g. Verified customer KYC via phone, authorized manual settlement link..."
                  rows={2}
                  className="w-full bg-[#F7F5F0] border border-[#C9C2B4] p-2 text-xs text-[#1A2130] placeholder-[#9CA3AF] rounded-[2px] focus:outline-none focus:border-[#1A2130]"
                />
              </div>

              {errorMsg && (
                <div className="p-2 border border-[#A8342A] bg-[#A8342A]/10 text-[#A8342A] text-[11px] rounded-[2px]">
                  {errorMsg}
                </div>
              )}

              {/* Footer CTA */}
              <div className="flex items-center justify-between pt-3 border-t border-[#C9C2B4]">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-3 py-1.5 bg-[#EAE4D9] text-[#1A2130] border border-[#C9C2B4] hover:bg-[#DFD8CC] rounded-[2px] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={`px-4 py-1.5 rounded-[2px] font-bold transition-colors flex items-center gap-1.5 ${
                    selectedAction === "override_retry"
                      ? "bg-[#A8342A] hover:bg-[#8F2C23] text-white"
                      : "bg-[#1A2130] hover:bg-[#1A2130]/90 text-[#F7F5F0]"
                  } disabled:opacity-50`}
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Evaluating Policy...</span>
                    </>
                  ) : (
                    <>
                      <span>Execute Action</span>
                      <Send className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
