import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Recoup — Revenue Recovery Ledger",
  description: "Autonomous capital recovery and ledger telemetry system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${ibmPlexMono.variable} ${inter.variable} antialiased bg-[#F7F5F0] text-[#1A2130] selection:bg-[#E8EDE4] selection:text-[#1A2130] min-h-screen`}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
