import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  Link as LinkIcon, 
  FileText, 
  Github, 
  Cpu, 
  Bot, 
  Loader2,
  CheckCircle,
  HelpCircle,
  BrainCircuit,
  UploadCloud,
  Terminal
} from "lucide-react";
import { ResourceType } from "../types";

interface CaptureBarProps {
  onCapture: (input: string, explicitType?: ResourceType) => Promise<boolean>;
  isAnalyzing: boolean;
  onOpenKnowledgeUpload?: () => void;
  onOpenDiagnostic?: () => void;
}

export const CaptureBar: React.FC<CaptureBarProps> = ({
  onCapture,
  isAnalyzing,
  onOpenKnowledgeUpload,
  onOpenDiagnostic,
}) => {
  const [input, setInput] = useState("");
  const [selectedType, setSelectedType] = useState<ResourceType | "auto">("auto");
  const [showSuccess, setShowSuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 38), 160)}px`;
    }
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isAnalyzing) return;

    const success = await onCapture(
      input.trim(), 
      selectedType === "auto" ? undefined : selectedType
    );

    if (success) {
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "38px";
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const typeButtons: { id: ResourceType | "auto"; label: string; icon: React.ReactNode }[] = [
    { id: "auto", label: "Auto AI", icon: <Sparkles className="w-3 h-3 text-[#C5A059]" /> },
    { id: "knowledge", label: "Knowledge (OKF)", icon: <BrainCircuit className="w-3 h-3 text-[#C5A059]" /> },
    { id: "mcp_server", label: "MCP", icon: <Cpu className="w-3 h-3 text-[#38BDF8]" /> },
    { id: "github_repo", label: "GitHub", icon: <Github className="w-3 h-3 text-[#A855F7]" /> },
    { id: "ai_skill", label: "Skill", icon: <Bot className="w-3 h-3 text-[#10B981]" /> },
    { id: "article", label: "Articolo", icon: <FileText className="w-3 h-3 text-[#F59E0B]" /> },
  ];

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="bg-[#0A0A0A] border border-[#1F1F1F] hover:border-[#333] focus-within:border-[#C5A059]/80 focus-within:ring-1 focus-within:ring-[#C5A059]/40 rounded-2xl p-2.5 shadow-2xl transition-all">
          {/* Top selection chips */}
          <div className="flex items-center justify-between px-2 pb-2 border-b border-[#141414]">
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
              <span className="text-[10px] uppercase font-mono text-[#555] mr-1 hidden sm:inline">
                Tipo:
              </span>
              {typeButtons.map((btn) => {
                const isSelected = selectedType === btn.id;
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => setSelectedType(btn.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors whitespace-nowrap ${
                      isSelected
                        ? "bg-[#1F1F1F] text-[#C5A059] font-medium border border-[#C5A059]/30"
                        : "text-[#666] hover:text-[#BBB] hover:bg-[#111]"
                    }`}
                  >
                    {btn.icon}
                    <span>{btn.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-[10px] text-[#555] font-mono shrink-0 pl-2">
              {showSuccess ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Salvato nel Vault!
                </span>
              ) : selectedType === "knowledge" && onOpenKnowledgeUpload ? (
                <button
                  type="button"
                  onClick={onOpenKnowledgeUpload}
                  className="flex items-center gap-1 text-[#C5A059] hover:underline"
                >
                  <UploadCloud className="w-3 h-3" />
                  <span>Apri Uploader File OKF</span>
                </button>
              ) : (
                <span className="hidden sm:flex items-center gap-1 text-[#666]">
                  <HelpCircle className="w-3 h-3 text-[#444]" />
                  Incolla URL o markdown (Invio per salvare, Shift+Invio per a capo)
                </span>
              )}

              {onOpenDiagnostic && (
                <button
                  type="button"
                  onClick={onOpenDiagnostic}
                  className="hidden md:flex items-center gap-1 text-[#888] hover:text-[#C5A059] px-1.5 py-0.5 rounded border border-[#222] bg-[#111]"
                  title="Apri Console Log"
                >
                  <Terminal className="w-2.5 h-2.5" />
                  <span>Log</span>
                </button>
              )}
            </div>
          </div>

          {/* Main Input Row (Multiline auto-growing Textarea) */}
          <div className="flex items-end pt-2 px-1 gap-2">
            <div className="text-[#444] pb-2 px-1 shrink-0">
              <LinkIcon className="w-4 h-4" />
            </div>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedType === "knowledge"
                  ? "Incolla testo markdown, specifiche o documentazione per la conversione OKF v0.2..."
                  : "Incolla un link GitHub, repo MCP, doc OKF o prompt skill..."
              }
              disabled={isAnalyzing}
              className="bg-transparent border-none text-xs sm:text-sm w-full text-[#E0E0E0] focus:outline-none placeholder-[#444] disabled:opacity-50 resize-none py-1.5 max-h-40 overflow-y-auto leading-relaxed scrollbar-thin scrollbar-thumb-[#222]"
            />

            <button
              type="submit"
              disabled={!input.trim() || isAnalyzing}
              className="bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#222] disabled:text-[#555] text-black font-semibold text-xs py-2 px-4 sm:px-6 rounded-xl transition-all uppercase tracking-widest flex items-center gap-2 shrink-0 shadow-md shadow-[#C5A059]/20 self-end mb-0.5"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="hidden sm:inline">Analisi AI...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span className="hidden sm:inline">Cattura</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
