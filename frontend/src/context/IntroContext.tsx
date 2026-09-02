"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LedgerBookIntro } from "@/components/LedgerBookIntro";

export type TransitionState = "idle" | "intro-playing" | "navigating";

interface IntroContextValue {
  transitionState: TransitionState;
  isIntroActive: boolean;
  openLedger: () => void;
}

const IntroContext = createContext<IntroContextValue>({
  transitionState: "idle",
  isIntroActive: false,
  openLedger: () => {},
});

export function useLedgerIntro() {
  return useContext(IntroContext);
}

export function IntroProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [transitionState, setTransitionState] = useState<TransitionState>("idle");
  const [introKey, setIntroKey] = useState<number>(1);

  // Prefetch /overview on load so navigation is instantaneous
  useEffect(() => {
    if (typeof window !== "undefined") {
      router.prefetch("/overview");
    }
  }, [router]);

  // Auto-trigger intro if ?intro=1 is in URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("intro") === "1" || urlParams.get("intro") === "true") {
      setIntroKey((k) => k + 1);
      setTransitionState("intro-playing");
    }
  }, []);

  const handleIntroComplete = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("recoup_intro_seen", "true");
    }
    setTransitionState("navigating");
    router.push("/overview");
  }, [router]);

  // Reset transition state if user navigates away from landing page
  useEffect(() => {
    if (pathname !== "/") {
      setTransitionState("idle");
    }
  }, [pathname]);

  // Safety fallback guard: if GSAP onComplete does not fire within 4.8s, force navigation
  useEffect(() => {
    if (transitionState === "intro-playing") {
      const fallbackTimer = setTimeout(() => {
        handleIntroComplete();
      }, 4800);
      return () => clearTimeout(fallbackTimer);
    }
  }, [transitionState, handleIntroComplete]);

  const openLedger = useCallback(() => {
    if (transitionState !== "idle") return; // Strict idempotency guard against multi-clicks
    setTransitionState("intro-playing");
    setIntroKey((k) => k + 1);
  }, [transitionState]);

  const isIntroActive = transitionState === "intro-playing" || transitionState === "navigating";

  return (
    <IntroContext.Provider
      value={{
        transitionState,
        isIntroActive,
        openLedger,
      }}
    >
      {/* 3D Ledger Book Intro Sequence (Rendered cleanly at shell root when active) */}
      {isIntroActive && (
        <LedgerBookIntro
          key={introKey}
          onComplete={handleIntroComplete}
        />
      )}
      {children}
    </IntroContext.Provider>
  );
}
