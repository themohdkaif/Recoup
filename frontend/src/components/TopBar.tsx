"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { useLedgerIntro } from "@/context/IntroContext";

interface TopBarProps {
  isLandingPage?: boolean;
}

export function TopBar({ isLandingPage = false }: TopBarProps) {
  const { openLedger, transitionState } = useLedgerIntro();
  const [timeUtc, setTimeUtc] = useState<string>("");
  const [timeIst, setTimeIst] = useState<string>("");

  useEffect(() => {
    const updateTimes = () => {
      const now = new Date();
      setTimeUtc(
        now.toLocaleTimeString("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
      setTimeIst(
        now.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };

    updateTimes();
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="w-full bg-[#F7F5F0] border-b border-[#C9C2B4] select-none sticky top-0 z-40">
      {/* Title Plate (Letterpress Header) */}
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: RECOUP Wordmark in Fraunces */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="font-serif font-black text-2xl tracking-tight text-[#1A2130] letterpress hover:opacity-90 transition-opacity"
            >
              RECOUP
            </Link>
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#EAE4D9] text-[#6B7280] border border-[#C9C2B4] rounded-[1px] hidden sm:inline-block">
              FOLIO 2026
            </span>
          </div>
          <p className="text-[11px] text-[#6B7280] font-sans">
            Continuous capital defense, policy enforcement & verifiable audit trail
          </p>
        </div>

        {/* Right: Actions, Wax Seal Status Indicator & Live Ledger Clock */}
        <div className="flex items-center gap-4 font-mono text-xs text-[#1A2130]">
          {isLandingPage ? (
            <button
              type="button"
              onClick={openLedger}
              disabled={transitionState !== "idle"}
              aria-busy={transitionState !== "idle"}
              className={`flex items-center gap-1.5 px-3 py-1.5 bg-[#2F6B4F] text-white rounded-[2px] hover:bg-[#25543E] transition-all font-bold text-xs shadow-xs select-none ${
                transitionState !== "idle"
                  ? "opacity-75 cursor-not-allowed pointer-events-none"
                  : "cursor-pointer active:scale-95"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{transitionState === "idle" ? "Open Ledger" : "Opening..."}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          ) : (
            <Link
              href="/"
              className="font-mono text-[11px] text-[#6B7280] hover:text-[#1A2130] underline underline-offset-2 hidden sm:inline-block"
            >
              Cover / Story
            </Link>
          )}

          {/* Wax-seal style status stamp */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-[#E8EDE4] border border-[#2F6B4F]/40 rounded-[2px] shadow-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2F6B4F] shadow-[0_0_4px_rgba(47,107,79,0.5)]" />
            <span className="text-[11px] font-bold text-[#2F6B4F] uppercase tracking-wider">
              LEDGER ACTIVE
            </span>
          </div>

          {/* Clocks */}
          <div className="text-right text-[11px] text-[#6B7280] tabular-nums hidden md:block">
            <div>
              UTC: <span className="text-[#1A2130] font-medium">{timeUtc || "--:--:--"}</span>
            </div>
            <div>
              IST: <span className="text-[#1A2130] font-medium">{timeIst || "--:--:--"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Classic Double-Rule Line Beneath Title Plate */}
      <div className="w-full border-t border-[#C9C2B4] pt-[2px] border-b border-b-[#C9C2B4]" />
    </header>
  );
}
