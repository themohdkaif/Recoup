"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

export interface RadarRecord {
  id: string;
  type: "payment" | "checkout" | "mandate" | "receivable";
  status: string;
  statusCategory: "active" | "escalated" | "protected";
  amount: number;
  customerOrReason?: string;
}

export interface RadarVisualizationProps {
  recoveryCount?: number;
  escalatedCount?: number;
  protectedCount?: number;
  totalEvaluated?: number;
  size?: number;
  className?: string;
  realRecords?: RadarRecord[];
  filterType?: "all" | "payment" | "checkout" | "mandate" | "receivable";
  onNodeClick?: (record: RadarRecord) => void;
}

interface RadarPoint {
  id: string;
  cx: number;
  cy: number;
  angleDeg: number; // 0-360 deg
  radiusPct: number;
  color: string;
  category: "active" | "escalated" | "protected";
  baseRadius: number;
  record: RadarRecord;
}

// Sample fallback records generator to provide rich real-looking data on hover
function generateSampleRecords(): RadarRecord[] {
  return [
    { id: "pay_88f92a1e90b", type: "payment", status: "Retry order created (Razorpay)", statusCategory: "active", amount: 4850, customerOrReason: "bank_timeout" },
    { id: "pay_21c99b4d12a", type: "payment", status: "Retry order created (Razorpay)", statusCategory: "active", amount: 12400, customerOrReason: "card_issue" },
    { id: "pay_54e112d88fa", type: "payment", status: "Escalated for risk review", statusCategory: "escalated", amount: 3499, customerOrReason: "risk_flagged" },
    { id: "chk_77a90f12c98", type: "checkout", status: "Recovery nudge sent", statusCategory: "active", amount: 14999, customerOrReason: "shipping_info" },
    { id: "chk_32d88ab776e", type: "checkout", status: "Held (cart under ₹300)", statusCategory: "protected", amount: 249, customerOrReason: "low_value" },
    { id: "mdt_9b47faad488", type: "mandate", status: "1d backoff retry order created", statusCategory: "active", amount: 999, customerOrReason: "insufficient_balance" },
    { id: "mdt_3bd852aadc6", type: "mandate", status: "Consent hard-stop enforced", statusCategory: "protected", amount: 199, customerOrReason: "customer_paused_mandate" },
    { id: "mdt_77c1299ef01", type: "mandate", status: "Escalated: sequence exhausted", statusCategory: "escalated", amount: 2499, customerOrReason: "sequence_exhausted" },
    { id: "inv_98deb08f877", type: "receivable", status: "Firm notice sent (Cycle 3)", statusCategory: "active", amount: 550000, customerOrReason: "Bharat Industrial Corp" },
    { id: "inv_43e168bd157", type: "receivable", status: "Firm notice sent (Cycle 3)", statusCategory: "active", amount: 85000, customerOrReason: "Acme Traders Pvt Ltd" },
    { id: "inv_12a8844cc90", type: "receivable", status: "Escalated: strategic account", statusCategory: "escalated", amount: 750000, customerOrReason: "Zenith Logistics (Strategic)" },
    { id: "inv_66b1990dfaa", type: "receivable", status: "Escalated: broken promise", statusCategory: "escalated", amount: 320000, customerOrReason: "Delta Commerce Ltd" },
    { id: "pay_339a11ef002", type: "payment", status: "Retry order created (Razorpay)", statusCategory: "active", amount: 6999, customerOrReason: "network_issue" },
    { id: "chk_8820f129aa1", type: "checkout", status: "Recovery nudge sent", statusCategory: "active", amount: 8490, customerOrReason: "payment_step" },
    { id: "mdt_44b0091ef77", type: "mandate", status: "3d backoff retry order created", statusCategory: "active", amount: 499, customerOrReason: "bank_rejection" },
    { id: "inv_77d129988bc", type: "receivable", status: "Active promise captured", statusCategory: "active", amount: 420000, customerOrReason: "Apex Retail Solutions" },
  ];
}

export function RadarVisualization({
  recoveryCount = 76,
  escalatedCount = 36,
  protectedCount = 8,
  totalEvaluated = 120,
  size = 420,
  className = "",
  realRecords,
  filterType = "all",
  onNodeClick,
}: RadarVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<SVGGElement>(null);
  const sweepAngleRef = useRef<number>(0);
  const nodeRefs = useRef<(SVGCircleElement | null)[]>([]);
  const flashStates = useRef<number[]>([]);

  const [hoveredNode, setHoveredNode] = useState<{
    point: RadarPoint;
    x: number;
    y: number;
  } | null>(null);

  const center = size / 2;
  const maxRadius = center - 16;

  // Generate deterministic points with metadata
  const points = useMemo<RadarPoint[]>(() => {
    const pts: RadarPoint[] = [];
    const sampleRecords = realRecords && realRecords.length > 0 ? realRecords : generateSampleRecords();

    const pseudoRandom = (seed: number) => {
      const x = Math.sin(seed * 9999.123) * 10000;
      return x - Math.floor(x);
    };

    let seedCounter = 1;

    const addCategoryPoints = (
      count: number,
      category: "active" | "escalated" | "protected",
      color: string,
      baseRadius: number
    ) => {
      const categoryRecords = sampleRecords.filter((r) => r.statusCategory === category);

      for (let i = 0; i < count; i++) {
        const rawAngle = pseudoRandom(seedCounter++) * 2 * Math.PI;
        const angleDeg = (rawAngle * 180) / Math.PI; // 0-360 deg
        const radius = 28 + pseudoRandom(seedCounter++) * (maxRadius - 42);
        const cx = center + radius * Math.cos(rawAngle);
        const cy = center + radius * Math.sin(rawAngle);

        const fallbackType: ("payment" | "checkout" | "mandate" | "receivable")[] = [
          "payment",
          "checkout",
          "mandate",
          "receivable",
        ];
        const assignedType = fallbackType[i % fallbackType.length];

        const record =
          categoryRecords[i % categoryRecords.length] || {
            id: `rec_${seedCounter}`,
            type: assignedType,
            status: category === "active" ? "Recovery in progress" : category === "escalated" ? "Escalated to human" : "Protected from contact",
            statusCategory: category,
            amount: Math.round(1000 + pseudoRandom(seedCounter) * 50000),
            customerOrReason: "Automated engine trace",
          };

        pts.push({
          id: `pt-${seedCounter}`,
          cx,
          cy,
          angleDeg: (angleDeg + 360) % 360,
          radiusPct: radius / maxRadius,
          color,
          category,
          baseRadius,
          record,
        });
      }
    };

    const greenToDisplay = Math.min(Math.max(Math.round((recoveryCount / (totalEvaluated || 1)) * 40), 16), 32);
    const amberToDisplay = Math.min(Math.max(Math.round((escalatedCount / (totalEvaluated || 1)) * 40), 8), 18);
    const grayToDisplay = Math.min(Math.max(Math.round((protectedCount / (totalEvaluated || 1)) * 40), 4), 10);

    addCategoryPoints(greenToDisplay, "active", "#00FF9C", 3);
    addCategoryPoints(amberToDisplay, "escalated", "#FFB020", 2.8);
    addCategoryPoints(grayToDisplay, "protected", "#4A555C", 2.5);

    return pts;
  }, [recoveryCount, escalatedCount, protectedCount, totalEvaluated, realRecords, center, maxRadius]);

  // Track flash cooldowns per node
  useEffect(() => {
    flashStates.current = new Array(points.length).fill(0);
  }, [points]);

  // GSAP Orchestrated Entrance and Continuous Sweep
  useGSAP(
    () => {
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion) return;

      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      // 1. Concentric rings draw/scale up with back ease (0.3-0.7s)
      tl.from(".radar-ring-outer", {
        scale: 0,
        transformOrigin: "center center",
        duration: 0.55,
        ease: "back.out(1.4)",
      })
        .from(
          ".radar-ring-inner",
          {
            scale: 0,
            transformOrigin: "center center",
            duration: 0.5,
            stagger: 0.08,
            ease: "back.out(1.2)",
          },
          "-=0.35"
        )
        .from(
          ".radar-axis",
          {
            opacity: 0,
            scale: 0.5,
            transformOrigin: "center center",
            duration: 0.4,
          },
          "-=0.3"
        );

      // 2. Nodes pop in with slight stagger & jitter (0.5-1.2s)
      tl.from(
        ".radar-node",
        {
          scale: 0,
          opacity: 0,
          transformOrigin: "center center",
          duration: 0.35,
          stagger: {
            each: 0.02,
            from: "random",
          },
          ease: "back.out(2)",
        },
        "-=0.2"
      );

      // 3. Sweep line fades in and starts continuous rotation
      tl.fromTo(
        sweepRef.current,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.4,
          onComplete: () => {
            // Continuous smooth GSAP rotation
            gsap.to(sweepRef.current, {
              rotation: 360,
              duration: 4,
              repeat: -1,
              ease: "none",
              transformOrigin: `${center}px ${center}px`,
              onUpdate: function () {
                const currentRot = (this.progress() * 360) % 360;
                sweepAngleRef.current = currentRot;

                const now = Date.now();
                points.forEach((pt, idx) => {
                  const nodeEl = nodeRefs.current[idx];
                  if (!nodeEl) return;

                  let diff = Math.abs(currentRot - pt.angleDeg);
                  if (diff > 180) diff = 360 - diff;

                  if (diff < 14 && now - (flashStates.current[idx] || 0) > 2500) {
                    flashStates.current[idx] = now;

                    gsap.fromTo(
                      nodeEl,
                      {
                        r: pt.baseRadius * 1.8,
                        fill: "#FFFFFF",
                        opacity: 1,
                      },
                      {
                        r: pt.baseRadius,
                        fill: pt.color,
                        opacity: pt.category === "protected" ? 0.65 : 0.9,
                        duration: 0.45,
                        ease: "power2.out",
                      }
                    );
                  }
                });
              },
            });
          },
        },
        "-=0.1"
      );

      // 4. Ambient breathing pulse for green active nodes
      const activeNodeEls = document.querySelectorAll(".radar-node-active");
      activeNodeEls.forEach((el, i) => {
        gsap.to(el, {
          scale: 1.15,
          opacity: 1,
          repeat: -1,
          yoyo: true,
          duration: 2.2 + (i % 5) * 0.3,
          delay: (i % 7) * 0.25,
          ease: "sine.inOut",
          transformOrigin: "center center",
        });
      });
    },
    { scope: containerRef, dependencies: [points, center] }
  );

  return (
    <div
      ref={containerRef}
      className={`relative select-none ${className}`}
      onMouseLeave={() => setHoveredNode(null)}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        <defs>
          {/* Faint Conic Sweep Gradient */}
          <radialGradient id="radarSweepGlowLarge" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00FF9C" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#00FF9C" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer Perimeter Ring */}
        <circle
          cx={center}
          cy={center}
          r={maxRadius}
          fill="none"
          stroke="#1F262B"
          strokeWidth="1.2"
          className="radar-ring-outer"
        />

        {/* Concentric Range Rings */}
        <circle
          cx={center}
          cy={center}
          r={maxRadius * 0.75}
          fill="none"
          stroke="#161E23"
          strokeWidth="1"
          strokeDasharray="4 4"
          className="radar-ring-inner"
        />
        <circle
          cx={center}
          cy={center}
          r={maxRadius * 0.5}
          fill="none"
          stroke="#161E23"
          strokeWidth="1"
          className="radar-ring-inner"
        />
        <circle
          cx={center}
          cy={center}
          r={maxRadius * 0.25}
          fill="none"
          stroke="#161E23"
          strokeWidth="1"
          strokeDasharray="2 4"
          className="radar-ring-inner"
        />

        {/* Crosshair Axes */}
        <line
          x1={center}
          y1={center - maxRadius}
          x2={center}
          y2={center + maxRadius}
          stroke="#182026"
          strokeWidth="1"
          className="radar-axis"
        />
        <line
          x1={center - maxRadius}
          y1={center}
          x2={center + maxRadius}
          y2={center}
          stroke="#182026"
          strokeWidth="1"
          className="radar-axis"
        />

        {/* Diagonal Crosshair Guidelines */}
        <line
          x1={center - maxRadius * 0.707}
          y1={center - maxRadius * 0.707}
          x2={center + maxRadius * 0.707}
          y2={center + maxRadius * 0.707}
          stroke="#141B20"
          strokeWidth="0.75"
          strokeDasharray="2 6"
          className="radar-axis"
        />
        <line
          x1={center - maxRadius * 0.707}
          y1={center + maxRadius * 0.707}
          x2={center + maxRadius * 0.707}
          y2={center - maxRadius * 0.707}
          stroke="#141B20"
          strokeWidth="0.75"
          strokeDasharray="2 6"
          className="radar-axis"
        />

        {/* Animated Sweeping Radar Cone & Leading Hairline */}
        <g
          ref={sweepRef}
          style={{ transformOrigin: `${center}px ${center}px` }}
          className="pointer-events-none"
        >
          <path
            d={`M ${center} ${center} L ${center} ${center - maxRadius} A ${maxRadius} ${maxRadius} 0 0 1 ${center + maxRadius * 0.5} ${center - maxRadius * 0.866} Z`}
            fill="url(#radarSweepGlowLarge)"
          />
          <line
            x1={center}
            y1={center}
            x2={center}
            y2={center - maxRadius}
            stroke="#00FF9C"
            strokeWidth="1.5"
            strokeOpacity="0.8"
          />
        </g>

        {/* Plotted Interactive Radar Nodes (dots) */}
        {points.map((pt, i) => {
          const isMatch = filterType === "all" || pt.record.type === filterType;
          const nodeOpacity = isMatch
            ? pt.category === "protected"
              ? 0.65
              : 0.9
            : 0.08;

          return (
            <g key={pt.id}>
              {/* Extended touch/click target */}
              <circle
                cx={pt.cx}
                cy={pt.cy}
                r={pt.baseRadius + 8}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onNodeClick?.(pt.record)}
                onMouseEnter={() => {
                  setHoveredNode({
                    point: pt,
                    x: pt.cx,
                    y: pt.cy,
                  });
                }}
              />
              {/* Visual Node */}
              <circle
                ref={(el) => {
                  nodeRefs.current[i] = el;
                }}
                cx={pt.cx}
                cy={pt.cy}
                r={pt.baseRadius}
                fill={pt.color}
                opacity={nodeOpacity}
                className={`radar-node cursor-pointer transition-opacity duration-200 ${
                  pt.category === "active" ? "radar-node-active" : ""
                }`}
                onClick={() => onNodeClick?.(pt.record)}
              />
            </g>
          );
        })}

        {/* Center Origin Point */}
        <circle cx={center} cy={center} r="2.5" fill="#00FF9C" opacity="0.8" />
      </svg>

      {/* Interactive Node Hover Tooltip */}
      {hoveredNode && (
        <div
          className="absolute z-40 pointer-events-none bg-[#0C1012] border border-[#1F262B] rounded-[2px] p-2.5 shadow-2xl text-xs font-mono text-[#E8ECEF] min-w-[210px] transition-opacity duration-150 animate-in fade-in"
          style={{
            left: `${Math.min(Math.max(hoveredNode.point.cx - 105, 10), size - 220)}px`,
            top: `${hoveredNode.point.cy > size / 2 ? hoveredNode.point.cy - 85 : hoveredNode.point.cy + 15}px`,
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#1F262B] pb-1 mb-1.5">
            <span className="text-[10px] text-[#8A9499] uppercase tracking-wider font-sans">
              {hoveredNode.point.record.type}
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hoveredNode.point.category === "active"
                  ? "bg-[#00FF9C]"
                  : hoveredNode.point.category === "escalated"
                  ? "bg-[#FFB020]"
                  : "bg-[#4A555C]"
              }`}
            />
          </div>
          <div className="font-bold text-[#E8ECEF] truncate">
            {hoveredNode.point.record.id}
          </div>
          <div className="text-[11px] text-[#8A9499] truncate mt-0.5">
            {hoveredNode.point.record.status}
          </div>
          <div className="text-[11px] font-bold text-[#00FF9C] mt-1 tabular-nums">
            ₹{hoveredNode.point.record.amount.toLocaleString("en-IN")}
          </div>
          <div className="text-[9px] text-[#8A9499]/70 mt-1 font-sans">
            Click to inspect full audit trace →
          </div>
        </div>
      )}
    </div>
  );
}
