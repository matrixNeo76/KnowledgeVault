import React from "react";
import { BrainCircuit, Sparkles } from "lucide-react";

interface VaultIntelligenceFabProps {
  isOpen: boolean;
  onToggle: () => void;
  resourceCount: number;
}

export const VaultIntelligenceFab: React.FC<VaultIntelligenceFabProps> = ({
  isOpen,
  onToggle,
  resourceCount,
}) => {
  return (
    <div className="fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2 select-none print:hidden">
      <button
        id="vault-intelligence-fab"
        onClick={onToggle}
        aria-label="Apri Vault Intelligence - Interroga con Multi-Agent Orchestrator"
        title="Interroga il Vault con Multi-Agent Orchestrator (Cmd/Ctrl + K)"
        className={`group relative flex items-center gap-2 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-full border shadow-xl transition-all duration-300 cursor-pointer ${
          isOpen
            ? "bg-[#C5A059] border-[#E5C170] text-black shadow-[#C5A059]/30 scale-95 ring-2 ring-[#C5A059]/50"
            : "bg-[#141008]/95 hover:bg-[#1C160B] border-[#C5A059]/40 hover:border-[#C5A059] text-[#E5C170] hover:text-white shadow-black/80 hover:shadow-[#C5A059]/20 hover:scale-105"
        }`}
      >
        {/* Glow halo */}
        <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-[#C5A059]/20 to-[#E5C170]/10 blur-sm opacity-50 group-hover:opacity-100 transition-opacity" />

        {/* Icon with mini sparkle */}
        <div className="relative flex items-center justify-center">
          <BrainCircuit className={`w-5 h-5 transition-transform duration-300 ${isOpen ? "rotate-90 text-black" : "text-[#C5A059] group-hover:rotate-12"}`} />
          <Sparkles className={`w-2.5 h-2.5 absolute -top-1 -right-1 ${isOpen ? "text-black" : "text-[#E5C170] animate-pulse"}`} />
        </div>

        {/* Label & Shortcut */}
        <div className="relative flex items-center gap-1.5 font-sans">
          <span className="text-xs font-semibold tracking-wide hidden sm:inline">
            Vault Intelligence
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
              isOpen
                ? "bg-black/20 text-black font-bold"
                : "bg-[#221C10] text-[#D5B069] border border-[#C5A059]/30 group-hover:border-[#C5A059]/60"
            }`}
          >
            ⌘K
          </span>
        </div>

        {/* Status Dot */}
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      </button>
    </div>
  );
};
