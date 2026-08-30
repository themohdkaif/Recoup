"use client";

import React, { useState, useEffect, useRef } from "react";
import { Volume2, VolumeX, Sparkles, Loader2, MessageSquare, Play, Square } from "lucide-react";
import { StampMark } from "@/components/StampMark";

interface HinglishVoiceNudgeProps {
  recordId: string;
  flowType: "checkout" | "mandate" | "payment" | "receivable";
  initialHinglish?: string | null;
  initialEnglish?: string | null;
  compact?: boolean;
}

export function HinglishVoiceNudge({
  recordId,
  flowType,
  initialHinglish = null,
  initialEnglish = null,
  compact = false,
}: HinglishVoiceNudgeProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [hinglishText, setHinglishText] = useState<string | null>(initialHinglish);
  const [englishReference, setEnglishReference] = useState<string | null>(initialEnglish);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [voiceName, setVoiceName] = useState<string>("");

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen && hinglishText) {
      // Toggle accordion / view
      setIsOpen(!isOpen);
      return;
    }

    setIsOpen(true);
    if (hinglishText) return;

    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/generate-hinglish-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_id: recordId, flow_type: flowType }),
      });
      if (res.ok) {
        const data = await res.json();
        setHinglishText(data.hinglish_text);
        setEnglishReference(data.english_reference);
      } else {
        setHinglishText("Arre! Aapka payment pending hai. Kripya link se 1-minute mein complete karein!");
        setEnglishReference("Hey! Your payment is pending. Please complete it in 1 minute using the link!");
      }
    } catch {
      setHinglishText("Arre! Aapka payment pending hai. Kripya link se 1-minute mein complete karein!");
      setEnglishReference("Hey! Your payment is pending. Please complete it in 1 minute using the link!");
    } finally {
      setLoading(false);
    }
  };

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!synthRef.current || !hinglishText) return;

    if (isSpeaking) {
      synthRef.current.cancel();
      setIsSpeaking(false);
      return;
    }

    // Cancel any previous speech
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(hinglishText);
    utteranceRef.current = utterance;

    // Search for Hindi or Indian English voice
    const voices = synthRef.current.getVoices();
    const hindiVoice = voices.find(
      (v) =>
        v.lang.toLowerCase().includes("hi-in") ||
        v.lang.toLowerCase().includes("hi") ||
        v.name.toLowerCase().includes("hindi") ||
        v.lang.toLowerCase().includes("en-in") ||
        v.name.toLowerCase().includes("india")
    );

    if (hindiVoice) {
      utterance.voice = hindiVoice;
      setVoiceName(hindiVoice.name);
    } else if (voices.length > 0) {
      utterance.voice = voices[0];
      setVoiceName(voices[0].name);
    }

    utterance.rate = 0.92; // Natural, conversational speed
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(utterance);
  };

  return (
    <div className="w-full space-y-2" onClick={(e) => e.stopPropagation()}>
      {/* Trigger Button */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-semibold bg-[#EAE4D9] hover:bg-[#DEE5D6] text-[#1A2130] border border-[#C9C2B4] rounded-[2px] shadow-sm transition-all group"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin text-[#B8823D]" />
          ) : (
            <Sparkles className="w-3 h-3 text-[#B8823D] group-hover:rotate-12 transition-transform" />
          )}
          <span>{isOpen && hinglishText ? "Hide Hinglish Nudge" : "Generate Hinglish Voice Nudge"}</span>
        </button>
      </div>

      {/* Message Bubble Card */}
      {isOpen && (
        <div className="p-3 bg-[#F7F5F0] border-2 border-[#C9C2B4] rounded-[2px] space-y-2 relative transition-all shadow-sm">
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-xs font-mono text-[#6B7280]">
              <Loader2 className="w-4 h-4 animate-spin text-[#B8823D]" />
              <span>Prompting Gemini 2.5 for authentic Hinglish code-switching...</span>
            </div>
          ) : hinglishText ? (
            <div className="space-y-2">
              {/* Header Badge */}
              <div className="flex items-center justify-between border-b border-[#C9C2B4]/60 pb-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#2F6B4F] uppercase tracking-wider">
                  <MessageSquare className="w-3 h-3 text-[#2F6B4F]" />
                  <span>Hinglish Voice Recovery Nudge (Latin Script)</span>
                </div>
                <StampMark text="VOICE READY" variant="approved" size="sm" />
              </div>

              {/* Hinglish Text + Speaker Button */}
              <div className="flex items-start justify-between gap-3 bg-[#E8EDE4]/80 p-2.5 rounded-[2px] border border-[#C9C2B4]/80">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-[#1A2130] leading-relaxed font-sans">
                    &ldquo;{hinglishText}&rdquo;
                  </p>
                  {englishReference && (
                    <p className="text-[11px] text-[#6B7280] font-mono italic">
                      Ref: &ldquo;{englishReference}&rdquo;
                    </p>
                  )}
                </div>

                {/* Audio Playback Controls */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleSpeak}
                    title={isSpeaking ? "Stop Speaking" : "Play Hinglish Voice"}
                    className={`p-2 rounded-full border transition-all ${
                      isSpeaking
                        ? "bg-[#9E2319] text-white border-[#9E2319] animate-pulse scale-105"
                        : "bg-[#2F6B4F] text-white border-[#2F6B4F] hover:bg-[#25553e]"
                    }`}
                  >
                    {isSpeaking ? (
                      <Square className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <span className="text-[9px] font-mono text-[#6B7280] uppercase tracking-tighter">
                    {isSpeaking ? "Playing..." : "Speak"}
                  </span>
                </div>
              </div>

              {/* Web Speech Engine Footer */}
              <div className="flex items-center justify-between text-[10px] font-mono text-[#6B7280]">
                <span>Engine: Web Speech API (speechSynthesis)</span>
                {voiceName && <span>Voice: {voiceName}</span>}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
