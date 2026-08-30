"use client";

import React, { useMemo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

export type StampVariant = "approved" | "hardstop" | "caution";

interface StampMarkProps {
  text: string;
  variant?: StampVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
  rotationSeed?: number;
}

export function StampMark({
  text,
  variant = "approved",
  size = "md",
  className = "",
  rotationSeed,
}: StampMarkProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Deterministic rotation angle between -4.2deg and -7.4deg
  const rotation = useMemo(() => {
    let hash = 0;
    const str = text + (rotationSeed ?? "");
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const normalized = Math.abs(hash % 1000) / 1000;
    return -4.2 - normalized * 3.2; // [-4.2deg, -7.4deg]
  }, [text, rotationSeed]);

  const colorConfig: Record<
    StampVariant,
    { border: string; text: string; bg: string; filterId: string }
  > = {
    approved: {
      border: "#2F6B4F",
      text: "#2F6B4F",
      bg: "rgba(47, 107, 79, 0.05)",
      filterId: "stamp-ink-bleed-approved",
    },
    hardstop: {
      border: "#9E2319",
      text: "#9E2319",
      bg: "rgba(158, 35, 25, 0.07)",
      filterId: "stamp-ink-bleed-hardstop",
    },
    caution: {
      border: "#B8823D",
      text: "#B8823D",
      bg: "rgba(184, 130, 61, 0.05)",
      filterId: "stamp-ink-bleed-caution",
    },
  };

  const current = colorConfig[variant];

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[9px] tracking-wider border-[1.5px]",
    md: "px-3 py-1 text-[11px] tracking-widest border-[2px]",
    lg: "px-4 py-1.5 text-xs tracking-widest border-[2.5px]",
  };

  const isHardStop = variant === "hardstop";

  // Stamp impact animation: scale down sharply with flash on mount
  useGSAP(
    () => {
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion || !containerRef.current) return;

      const targetScale = isHardStop ? 1.04 : 1.0;
      const targetOpacity = isHardStop ? 0.96 : 0.88;

      gsap.fromTo(
        containerRef.current,
        {
          scale: targetScale * 1.22,
          opacity: 0.25,
          rotation: rotation - 2.5,
        },
        {
          scale: targetScale,
          opacity: targetOpacity,
          rotation: rotation,
          duration: 0.16,
          ease: "power4.out",
        }
      );
    },
    { scope: containerRef, dependencies: [text, variant] }
  );

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center justify-center select-none ${
        isHardStop ? "scale-[1.04]" : ""
      } ${className}`}
      style={{
        transform: `rotate(${rotation}deg)`,
        opacity: isHardStop ? 0.94 : 0.88,
      }}
    >
      {/* SVG Ink-Bleed & Displacement Filter */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <filter
            id={current.filterId}
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
            filterUnits="objectBoundingBox"
          >
            {/* Ink roughness & fiber bleed */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.09"
              numOctaves="4"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={isHardStop ? 2.4 : 1.8}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            {/* Slight uneven ink density */}
            <feComponentTransfer in="displaced">
              <feFuncA type="linear" slope="0.92" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      {/* For hardstop: Double-stamp misalignment ghost effect */}
      {isHardStop && (
        <div
          className={`absolute pointer-events-none font-serif font-black uppercase text-center whitespace-nowrap opacity-30 select-none ${sizeClasses[size]}`}
          style={{
            transform: "translate(1.5px, 1.2px) rotate(0.6deg)",
            color: "#9E2319",
            borderColor: "#9E2319",
            filter: `url(#${current.filterId})`,
          }}
          aria-hidden="true"
        >
          {text}
        </div>
      )}

      {/* Primary Ink Stamp Body with Uneven Ink Bleed */}
      <div
        className={`font-serif font-black uppercase text-center whitespace-nowrap transition-transform ${sizeClasses[size]}`}
        style={{
          color: current.text,
          borderColor: current.border,
          backgroundColor: current.bg,
          filter: `url(#${current.filterId})`,
          boxShadow: `inset 0 0 5px ${current.border}25, 0 0 1px ${current.border}40`,
        }}
      >
        {text}
      </div>
    </div>
  );
}
