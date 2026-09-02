"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { IntroProvider } from "@/context/IntroContext";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/";

  return (
    <IntroProvider>
      <div className="min-h-screen bg-[#F7F5F0] text-[#1A2130] flex flex-col font-sans relative">
        {/* Top Title Plate Header */}
        <TopBar isLandingPage={isLandingPage} />

      {/* Main Layout: Full-width for Landing Page, Two-Column for App Pages */}
      {isLandingPage ? (
        <main className="flex-1 w-full bg-[#F7F5F0] relative overflow-x-hidden">
          {children}
        </main>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto relative">
          {/* Left Manila Overlapping Ledger Tabs Sidebar */}
          <Sidebar />

          {/* Main Ruled Ledger Paper Content */}
          <main className="flex-1 p-6 md:p-8 overflow-y-auto bg-[#F7F5F0] relative">
            {/* Subtle physical aging detail: faint foxed corner in top right */}
            <div
              className="absolute top-0 right-0 w-44 h-44 pointer-events-none select-none z-0"
              style={{
                background:
                  "radial-gradient(circle at 95% 5%, rgba(139, 109, 67, 0.038) 0%, rgba(139, 109, 67, 0.015) 45%, transparent 70%)",
              }}
              aria-hidden="true"
            />

            <div className="relative z-10">{children}</div>
          </main>
        </div>
      )}
      </div>
    </IntroProvider>
  );
}
