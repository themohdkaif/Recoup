"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { StampMark } from "./StampMark";

export const INTRO_TIMING = {
  scene1_closedDuration: 0.8, // 0 - 0.8s: Closed book rests & ambient scale-in
  scene2_openDuration: 1.4,   // 0.8s - 2.2s: Cover opens, spine centers & tagline writes
  scene3_stampDuration: 0.6,  // 2.2s - 2.8s: SYSTEM ACTIVE stamp impact mark
  scene4_transitionDuration: 0.6, // 2.8s - 3.4s: Cross-fade into Overview app
  totalDuration: 3.4,
};

interface LedgerBookIntroProps {
  onComplete: () => void;
}

export function LedgerBookIntro({ onComplete }: LedgerBookIntroProps) {
  const [showSkip, setShowSkip] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const masterTlRef = useRef<gsap.core.Timeline | null>(null);

  const tagline = "Continuous capital defense, policy enforcement & verifiable audit trail";
  const taglineWords = useMemo(() => tagline.split(" "), [tagline]);

  useGSAP(
    () => {
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion) {
        onComplete();
        return;
      }

      if (!containerRef.current) return;

      // Clean up any existing tweens to guarantee 100% replay reliability
      gsap.killTweensOf([
        containerRef.current,
        ".book-spread-container",
        ".book-cover-hinge",
        ".book-left-page",
        ".book-gutter-shadow",
        ".tagline-word",
        ".tagline-stroke",
        ".intro-stamp-wrapper",
      ]);

      const tl = gsap.timeline({
        onComplete: () => {
          onComplete();
        },
      });
      masterTlRef.current = tl;

      // Show Skip button after 0.8s
      gsap.delayedCall(0.8, () => setShowSkip(true));

      // ─── INITIAL DETERMINISTIC SETUP (Scene 1: Closed State) ──────────────
      // Single page width is 50% of the book spread container.
      // When closed, the book container is shifted left by 25% of spread (so the right-side cover is perfectly centered).
      tl.set(".book-spread-container", {
        opacity: 0,
        scale: 0.92,
        xPercent: -25, // Centers the closed right-half book on screen
        rotateX: 3,
        rotateY: -1,
      })
        .set(".book-cover-hinge", {
          rotateY: 0,
          transformOrigin: "left center",
          transformStyle: "preserve-3d",
        })
        .set(".book-left-page", {
          opacity: 0,
        })
        .set(".book-gutter-shadow", {
          opacity: 0,
        })
        .set(".intro-stamp-wrapper", {
          opacity: 0,
          scale: 1.45,
        })
        .set(".tagline-word", {
          opacity: 0,
          y: 4,
          filter: "blur(2px)",
        })
        .set(".tagline-stroke", {
          strokeDashoffset: 420,
        })
        .set(".book-inner-lighting", {
          opacity: 0.75,
        });

      // ─── SCENE 1: Closed Book Ambient Entrance (0.0s - 0.8s) ─────────────
      tl.to(".book-spread-container", {
        opacity: 1,
        scale: 1,
        rotateX: 0,
        rotateY: 0,
        duration: 0.65,
        ease: "power2.out",
      });

      // ─── SCENE 2: The 3D Hinge Open & Spine Centering (0.8s - 2.2s) ───────
      // 1. Cover rotates open from 0 to -178 degrees (swings to the left)
      tl.to(
        ".book-cover-hinge",
        {
          rotateY: -178,
          duration: 1.35,
          ease: "power3.inOut",
        },
        0.8
      );

      // 2. Concurrently shift the spread container from -25% to 0% so the spine aligns dead-center!
      tl.to(
        ".book-spread-container",
        {
          xPercent: 0,
          duration: 1.35,
          ease: "power3.inOut",
        },
        0.8
      );

      // 3. Left page (inside cover) becomes visible as it turns past 90 degrees
      tl.to(
        ".book-left-page",
        {
          opacity: 1,
          duration: 0.3,
          ease: "power1.inOut",
        },
        1.3
      );

      // 4. Gutter shadow deepens down the center binding seam
      tl.to(
        ".book-gutter-shadow",
        {
          opacity: 1,
          duration: 1.0,
          ease: "power2.out",
        },
        1.0
      );

      // 5. Light washes across the right page as cover lifts
      tl.to(
        ".book-inner-lighting",
        {
          opacity: 0,
          duration: 1.1,
          ease: "power2.out",
        },
        0.9
      );

      // 6. Ink writes itself onto the revealed right page
      tl.to(
        ".tagline-word",
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.26,
          stagger: 0.07,
          ease: "power2.out",
        },
        1.35
      );

      // 7. Flourish pen underline stroke
      tl.to(
        ".tagline-stroke",
        {
          strokeDashoffset: 0,
          duration: 0.65,
          ease: "power2.inOut",
        },
        1.65
      );

      // ─── SCENE 3: The Stamp Impact (2.2s - 2.8s) ─────────────────────────
      tl.to(
        ".intro-stamp-wrapper",
        {
          opacity: 1,
          scale: 1,
          duration: 0.22,
          ease: "back.out(2.5)",
        },
        2.2
      );

      // Ambient book shock vibration on stamp impact
      tl.to(
        ".book-spread-container",
        {
          y: 1.5,
          duration: 0.04,
          yoyo: true,
          repeat: 1,
          ease: "power1.inOut",
        },
        2.22
      );

      // Ink impact flash
      tl.fromTo(
        ".stamp-impact-flash",
        { opacity: 0.35 },
        { opacity: 0, duration: 0.35, ease: "power2.out" },
        2.22
      );

      // ─── SCENE 4: Transition to App (2.8s - 3.4s) ─────────────────────────
      tl.to(
        containerRef.current,
        {
          opacity: 0,
          scale: 1.03,
          duration: 0.55,
          ease: "power2.inOut",
        },
        2.85
      );
    },
    { scope: containerRef }
  );

  const handleSkip = () => {
    if (masterTlRef.current) {
      masterTlRef.current.kill();
    }
    gsap.to(containerRef.current, {
      opacity: 0,
      duration: 0.25,
      ease: "power2.out",
      onComplete: () => {
        onComplete();
      },
    });
  };

  return (
    <div
      ref={containerRef}
      className="book-intro-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-[#0E1219] select-none overflow-hidden cursor-default"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 50% 45%, rgba(35, 48, 66, 0.65) 0%, rgba(11, 14, 20, 0.98) 100%)",
      }}
    >
      {/* Subtle desk ambient dust/grain texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* 3D Perspective Stage Container */}
      <div
        className="relative w-[92vw] max-w-[840px] h-[380px] sm:h-[420px] flex items-center justify-center"
        style={{ perspective: "1500px" }}
      >
        {/* Shadow cast beneath the entire book block onto desk */}
        <div
          className="absolute -bottom-8 left-10 right-10 h-14 rounded-full pointer-events-none"
          style={{
            background: "rgba(0, 0, 0, 0.85)",
            filter: "blur(26px)",
          }}
        />

        {/* ── THE 2-PAGE SPREAD 3D BOOK CONTAINER ─────────────────────────── */}
        {/* Total width = 2 * PageWidth. Left Page is left 50%, Right Page is right 50% */}
        <div
          className="book-spread-container relative w-full h-full rounded-[4px]"
          style={{
            transformStyle: "preserve-3d",
          }}
        >
          {/* ── 1. LEFT HALF: INSIDE FRONT COVER (The Base Under Swung Cover) ─ */}
          <div
            className="book-left-page absolute top-0 bottom-0 left-0 w-[50%] rounded-l-[4px] bg-[#EDE6D9] p-6 sm:p-7 flex flex-col justify-between border-y-2 border-l-2 border-[#18382B] shadow-2xl overflow-hidden"
            style={{
              transform: "translateZ(0px)",
              boxShadow: "inset 0 0 30px rgba(0,0,0,0.22)",
              backgroundImage:
                "linear-gradient(to left, rgba(0,0,0,0.12) 0px, transparent 24px, transparent 100%), radial-gradient(circle at 40% 50%, rgba(160, 130, 90, 0.12) 0%, transparent 80%)",
            }}
          >
            {/* Left Page Fore-Edge Paper Block (Left outer edge) */}
            <div
              className="absolute top-1 bottom-1 -left-2.5 w-3 rounded-l-[2px] pointer-events-none"
              style={{
                background:
                  "repeating-linear-gradient(to bottom, #E8E0D2 0px, #E8E0D2 1.5px, #CFC6B5 2px, #CFC6B5 3px)",
                boxShadow: "inset -2px 0 3px rgba(0,0,0,0.35)",
              }}
            />

            {/* Inside Leather Turn-in Trim */}
            <div className="absolute inset-1.5 border-[4px] border-[#132A20] rounded-[2px] pointer-events-none opacity-85" />

            <div className="relative z-10 text-left pl-2">
              <span className="font-mono text-[9px] text-[#6B7280] uppercase tracking-wider">
                INSIDE COVER // EX LIBRIS
              </span>
            </div>

            <div className="relative z-10 my-auto text-center space-y-1.5 px-4">
              <div className="font-serif text-base sm:text-lg font-bold text-[#1A2130]">
                RECOUP SYSTEM LEDGER
              </div>
              <div className="font-mono text-[10px] text-[#6B7280]">
                DEFENSE TELEMETRY CORP · FISCAL FOLIO 2026
              </div>
              <div className="pt-2">
                <div className="w-16 h-[1px] bg-[#C9C2B4] mx-auto" />
              </div>
            </div>

            <div className="relative z-10 text-center">
              <span className="font-mono text-[8px] text-[#8C8275] tracking-widest uppercase">
                VERIFIED DEPLOYMENT · ZERO-DRIFT AUDIT LOGS
              </span>
            </div>
          </div>

          {/* ── 2. RIGHT HALF: REVEALED FIRST FOLIO PAGE ───────────────────── */}
          <div
            className="absolute top-0 bottom-0 right-0 w-[50%] rounded-r-[4px] bg-[#F7F5F0] p-6 sm:p-7 flex flex-col justify-between border-y-2 border-r-2 border-[#C9C2B4] shadow-inner overflow-hidden"
            style={{
              transform: "translateZ(0px)",
              backgroundImage:
                "linear-gradient(to right, rgba(0,0,0,0.15) 0px, transparent 28px, transparent 100%), radial-gradient(ellipse at center, transparent 70%, rgba(185, 168, 140, 0.08) 100%)",
            }}
          >
            {/* Right Page Fore-Edge Paper Block (Right outer edge) */}
            <div
              className="absolute top-1 bottom-1 -right-2.5 w-3 rounded-r-[2px] pointer-events-none"
              style={{
                background:
                  "repeating-linear-gradient(to bottom, #E8E0D2 0px, #E8E0D2 1.5px, #CFC6B5 2px, #CFC6B5 3px)",
                boxShadow: "inset 2px 0 3px rgba(0,0,0,0.35)",
              }}
            />

            {/* Dynamic shadow that lifts when cover opens */}
            <div className="book-inner-lighting absolute inset-0 bg-[#101720] pointer-events-none z-20" />

            {/* Impact flash overlay */}
            <div className="stamp-impact-flash absolute inset-0 bg-[#2F6B4F] pointer-events-none opacity-0 z-30 mix-blend-multiply" />

            {/* Page Header Rule & Metadata */}
            <div className="relative z-10 space-y-1.5">
              <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono tracking-widest text-[#6B7280] uppercase">
                <span>FOLIO // NO. 001</span>
                <span>VOL. 2026 · INITIALIZATION</span>
              </div>
              <div className="w-full h-[2.5px] border-b border-t border-[#C9C2B4]" />
            </div>

            {/* Center Content: Tagline Ink Writing & Central Stamp */}
            <div className="relative z-10 my-auto text-center space-y-3 py-1">
              <div className="font-serif text-lg sm:text-xl font-bold text-[#1A2130] leading-snug tracking-tight max-w-xs mx-auto">
                {taglineWords.map((word, i) => (
                  <span
                    key={i}
                    className="tagline-word inline-block mr-1.5"
                    style={{ willChange: "transform, opacity, filter" }}
                  >
                    {word}
                  </span>
                ))}
              </div>

              {/* Ink-drawn flourish stroke underline */}
              <div className="w-40 sm:w-52 mx-auto overflow-hidden h-2.5">
                <svg
                  className="w-full h-full text-[#1A2130]/60"
                  viewBox="0 0 240 12"
                  fill="none"
                >
                  <path
                    className="tagline-stroke"
                    d="M 4 6 Q 60 1 120 6 T 236 6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeDasharray="420"
                    strokeDashoffset="420"
                  />
                </svg>
              </div>

              {/* Central SYSTEM ACTIVE Stamp Impact Mark */}
              <div className="intro-stamp-wrapper pt-1 flex justify-center">
                <div className="scale-105 sm:scale-115">
                  <StampMark
                    text="SYSTEM ACTIVE"
                    variant="approved"
                    size="md"
                    rotationSeed={42}
                  />
                </div>
              </div>
            </div>

            {/* Page Footer double-rule */}
            <div className="relative z-10 space-y-1.5">
              <div className="w-full h-[2.5px] border-b border-t border-[#C9C2B4]" />
              <div className="flex items-center justify-between text-[8px] sm:text-[9px] font-mono text-[#6B7280] uppercase tracking-wider">
                <span>RECOUP ENGINE</span>
                <span>AUTHENTICATED AUDIT STATE</span>
              </div>
            </div>
          </div>

          {/* ── 3. CENTER BINDING SPINE & VERTICAL GUTTER SHADOW ───────────── */}
          {/* Dark Spine Strip at exact center seam */}
          <div
            className="absolute top-0 bottom-0 left-[50%] -translate-x-[50%] w-[10px] bg-[#0A1610] z-25 pointer-events-none shadow-md"
            style={{
              borderLeft: "1px dashed rgba(212,175,55,0.35)",
              borderRight: "1px dashed rgba(212,175,55,0.35)",
              transform: "translateZ(1px)",
            }}
          />

          {/* Deep Gutter Shadow fading out 34px on both sides */}
          <div
            className="book-gutter-shadow absolute top-0 bottom-0 left-[50%] -translate-x-[50%] w-[68px] z-26 pointer-events-none"
            style={{
              background:
                "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.38) 44%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.38) 56%, rgba(0,0,0,0) 100%)",
              transform: "translateZ(2px)",
            }}
          />

          {/* ── 4. THE 3D HINGED LEATHER COVER (Starts over the Right Page) ─── */}
          {/* Positioned at right: 0 (the right half), with transformOrigin: left center (the spine!) */}
          <div
            className="book-cover-hinge absolute top-0 bottom-0 right-0 w-[50%] rounded-r-[4px] cursor-pointer z-30"
            style={{
              transformOrigin: "left center", // Swings around the center spine seam
              transformStyle: "preserve-3d",
              transform: "translateZ(3px)",
            }}
          >
            {/* FRONT LEATHER FACE (Closed Cover facing camera initially) */}
            <div
              className="absolute inset-0 rounded-r-[4px] p-6 sm:p-7 flex flex-col justify-between shadow-2xl border-2 border-[#1E4332] overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #18382B 0%, #10261D 50%, #08160F 100%)",
                backfaceVisibility: "hidden",
                boxShadow:
                  "inset 0 0 35px rgba(0,0,0,0.7), 10px 14px 28px rgba(0,0,0,0.65)",
              }}
            >
              {/* Gold Foil Double Hairline Border */}
              <div className="absolute inset-3 sm:inset-3.5 rounded-[2px] border border-[#D4AF37]/35 pointer-events-none">
                <div className="absolute inset-1 rounded-[1px] border border-[#D4AF37]/20" />
                <div className="absolute top-1 left-1 w-2 h-2 border-t-2 border-l-2 border-[#D4AF37]/60" />
                <div className="absolute top-1 right-1 w-2 h-2 border-t-2 border-r-2 border-[#D4AF37]/60" />
                <div className="absolute bottom-1 left-1 w-2 h-2 border-b-2 border-l-2 border-[#D4AF37]/60" />
                <div className="absolute bottom-1 right-1 w-2 h-2 border-b-2 border-r-2 border-[#D4AF37]/60" />
              </div>

              {/* Spine Crease Line on Left Edge */}
              <div
                className="absolute top-0 bottom-0 left-2 w-[2px] pointer-events-none"
                style={{
                  background:
                    "linear-gradient(to right, rgba(0,0,0,0.7), rgba(255,255,255,0.1), rgba(0,0,0,0.7))",
                }}
              />

              {/* Cover Header */}
              <div className="relative z-10 text-center pl-2">
                <div
                  className="font-mono text-[9px] tracking-[0.25em] uppercase text-[#D4AF37]/80"
                  style={{
                    textShadow:
                      "0 1px 1px rgba(0,0,0,0.9), 0 -1px 0 rgba(255,235,170,0.3)",
                  }}
                >
                  EST. 2026 · CONFIDENTIAL RECORD
                </div>
              </div>

              {/* Center Embossed Brand Plate */}
              <div className="relative z-10 text-center my-auto pl-2 space-y-1.5">
                <div
                  className="font-serif text-3xl sm:text-4xl font-black tracking-widest text-[#E6C66E] uppercase"
                  style={{
                    letterSpacing: "0.18em",
                    textShadow:
                      "1px 1px 1px rgba(255, 240, 190, 0.45), -1.5px -1.5px 2px rgba(0, 0, 0, 0.95), 0 3px 6px rgba(0, 0, 0, 0.8)",
                  }}
                >
                  RECOUP
                </div>

                <div
                  className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.18em] text-[#D4AF37]/90 max-w-xs mx-auto"
                  style={{
                    textShadow:
                      "0.5px 0.5px 1px rgba(255, 235, 170, 0.35), -1px -1px 1px rgba(0, 0, 0, 0.9)",
                  }}
                >
                  Autonomous Revenue Recovery Ledger
                </div>

                {/* Subtle Gold Embossed Seal Emblem */}
                <div className="pt-1.5 flex justify-center">
                  <div
                    className="w-7 h-7 rounded-full border border-[#D4AF37]/40 flex items-center justify-center font-serif text-[10px] text-[#D4AF37]/80 font-bold"
                    style={{
                      boxShadow:
                        "inset 0 0 5px rgba(0,0,0,0.8), 0 1px 2px rgba(255,255,255,0.1)",
                    }}
                  >
                    §
                  </div>
                </div>
              </div>

              {/* Cover Footer */}
              <div className="relative z-10 text-center pl-2">
                <div
                  className="font-mono text-[8px] tracking-[0.2em] uppercase text-[#D4AF37]/60"
                  style={{
                    textShadow: "0 1px 1px rgba(0,0,0,0.9)",
                  }}
                >
                  CAPITAL DEFENSE & AUDIT TELEMETRY
                </div>
              </div>
            </div>

            {/* BACK LEATHER FACE (Inside Facing Sheet when opened) */}
            <div
              className="absolute inset-0 rounded-l-[4px] bg-[#EDE6D9] p-6 sm:p-7 border-y-2 border-l-2 border-[#18382B] shadow-2xl flex flex-col justify-between overflow-hidden"
              style={{
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
                boxShadow: "inset 0 0 28px rgba(0,0,0,0.25)",
              }}
            >
              <div className="absolute inset-1.5 border-[4px] border-[#132A20] rounded-[2px] pointer-events-none opacity-85" />

              <div className="relative z-10 text-right pr-2">
                <span className="font-mono text-[9px] text-[#6B7280] uppercase tracking-wider">
                  INSIDE COVER // EX LIBRIS
                </span>
              </div>

              <div className="relative z-10 my-auto text-center space-y-1.5 px-4">
                <div className="font-serif text-base sm:text-lg font-bold text-[#1A2130]">
                  RECOUP SYSTEM LEDGER
                </div>
                <div className="font-mono text-[10px] text-[#6B7280]">
                  DEFENSE TELEMETRY CORP · FISCAL FOLIO 2026
                </div>
              </div>

              <div className="relative z-10 text-center">
                <span className="font-mono text-[8px] text-[#8C8275] tracking-widest uppercase">
                  VERIFIED DEPLOYMENT · ZERO-DRIFT AUDIT LOGS
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SKIP BUTTON (Bottom-Right, subtle & accessible) ───────────────── */}
      {showSkip && (
        <button
          onClick={handleSkip}
          className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 font-mono text-xs text-[#D4AF37]/80 hover:text-[#E6C66E] transition-colors py-1.5 px-3 rounded-[2px] border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 bg-[#131B24]/75 backdrop-blur-sm cursor-pointer z-50 flex items-center gap-1.5 group select-none"
          title="Skip intro to Overview"
        >
          <span>Skip Intro</span>
          <span className="group-hover:translate-x-0.5 transition-transform">
            →
          </span>
        </button>
      )}
    </div>
  );
}
