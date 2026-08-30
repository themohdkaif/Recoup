"use client";

import React, { useRef, useEffect } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

interface DigitRollProps {
  value: number | string;
  prefix?: string;
  suffix?: string;
  className?: string;
  digitClassName?: string;
  duration?: number;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function DigitRoll({
  value,
  prefix = "",
  suffix = "",
  className = "",
  digitClassName = "",
  duration = 1.1,
}: DigitRollProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const formattedString = `${prefix}${typeof value === "number" ? value.toLocaleString("en-IN") : value}${suffix}`;
  const chars = formattedString.split("");

  useGSAP(
    () => {
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion) return;

      const columns = containerRef.current?.querySelectorAll(".digit-drum-column");
      if (!columns || columns.length === 0) return;

      columns.forEach((col, idx) => {
        const targetDigit = parseInt(col.getAttribute("data-target") || "0", 10);
        if (isNaN(targetDigit)) return;

        // Mechanical odometer drum roll: calculate distance to target digit
        // Move from an offset state to the exact digit slot
        const digitHeightPercent = 10; // each digit is 10% of height (10 digits total)
        const targetY = -(targetDigit * digitHeightPercent);

        gsap.fromTo(
          col,
          { yPercent: 0 },
          {
            yPercent: targetY,
            duration: duration + (idx * 0.04),
            delay: idx * 0.035,
            ease: "back.out(1.2)",
          }
        );
      });
    },
    { scope: containerRef, dependencies: [formattedString] }
  );

  return (
    <span
      ref={containerRef}
      className={`inline-flex items-baseline font-mono tabular-nums select-none ${className}`}
    >
      {chars.map((char, i) => {
        const isDigit = /\d/.test(char);

        if (!isDigit) {
          return (
            <span key={i} className="inline-block flex-shrink-0">
              {char}
            </span>
          );
        }

        const digitVal = parseInt(char, 10);

        return (
          <span
            key={i}
            className="inline-block relative overflow-hidden h-[1.15em] leading-[1.15em] flex-shrink-0"
            style={{ width: "0.62em" }}
          >
            <span
              data-target={digitVal}
              className={`digit-drum-column absolute left-0 top-0 w-full flex flex-col text-center ${digitClassName}`}
            >
              {DIGITS.map((d) => (
                <span
                  key={d}
                  className="h-[1.15em] leading-[1.15em] flex items-center justify-center"
                >
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
