import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Send, 
  FileText, 
  Github, 
  Cpu, 
  Bot, 
  Loader2,
  CheckCircle,
  HelpCircle,
  BrainCircuit,
  UploadCloud,
  Globe,
  Wrench,
  Paperclip,
  Database,
  ArrowRight,
  ChevronDown,
  Check,
  Zap
} from "lucide-react";
import { ResourceType, CaptureStage } from "../types";

interface CaptureBarProps {
  onCapture: (input: string, explicitType?: ResourceType) => Promise<boolean>;
  isAnalyzing: boolean;
  captureStage?: CaptureStage;
  captureStageMessage?: string;
  onOpenKnowledgeUpload?: () => void;
  onOpenDiagnostic?: () => void;
  onOpenGoogleDrive?: () => void;
  onUploadRawFile?: (file: File) => Promise<boolean>;
}

export const CaptureBar: React.FC<CaptureBarProps> = ({
  onCapture,
  isAnalyzing,
  captureStage = "idle",
  captureStageMessage,
  onOpenKnowledgeUpload,
  onUploadRawFile,
}) => {
  const [input, setInput] = useState("");
  const [selectedType, setSelectedType] = useState<ResourceType | "auto">("auto");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  // Close type dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
    };
    if (isTypeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTypeDropdownOpen]);

  // Auto-resize textarea based on content (1 to 4 lines)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 36), 130)}px`;
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
        textareaRef.current.style.height = "36px";
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

  const typeOptions: { 
    id: ResourceType | "auto"; 
    label: string; 
    icon: React.ReactNode;
    color: string;
    description: string;
  }[] = [
    { id: "auto", label: "Auto-Detect (OKF v0.2)", icon: <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />, color: "text-[#C5A059]", description: "Classificazione automatica ed estrazione ontologia OKF v0.2" },
    { id: "knowledge", label: "Note & Doc (.md)", icon: <BrainCircuit className="w-3.5 h-3.5 text-[#C5A059]" />, color: "text-[#C5A059]", description: "Specifiche tecniche, architetture, guide e file Markdown" },
    { id: "troubleshooting", label: "Problemi & Fix", icon: <Wrench className="w-3.5 h-3.5 text-[#F97316]" />, color: "text-[#F97316]", description: "Cause radice, diagnostica errori e checklist di risoluzione" },
    { id: "mcp_server", label: "MCP Server", icon: <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />, color: "text-[#38BDF8]", description: "Server Model Context Protocol, tools e snippet JSON" },
    { id: "github_repo", label: "GitHub Repo", icon: <Github className="w-3.5 h-3.5 text-[#A855F7]" />, color: "text-[#A855F7]", description: "Repository open-source, codice sorgente e pacchetti" },
    { id: "ai_skill", label: "AI Skill & Prompt", icon: <Bot className="w-3.5 h-3.5 text-[#10B981]" />, color: "text-[#10B981]", description: "Prompt di sistema e regole comportamentali per agenti" },
    { id: "article", label: "Articolo & Guida", icon: <FileText className="w-3.5 h-3.5 text-[#F59E0B]" />, color: "text-[#F59E0B]", description: "Guide tecniche, saggi e documentazione generale" },
    { id: "link", label: "Link & Web Tool", icon: <Globe className="w-3.5 h-3.5 text-[#06B6D4]" />, color: "text-[#06B6D4]", description: "Risorse online, tool web e link di consultazione" },
  ];

  const currentOption = typeOptions.find((t) => t.id === selectedType) || typeOptions[0];

  const getStageLabel = () => {
    if (captureStageMessage) return captureStageMessage;
    switch (captureStage) {
      case "sending":
        return "Invio richiesta...";
      case "analyzing":
        return "Elaborazione AI...";
      case "saving":
        return "Salvataggio nel Vault...";
      case "success":
        return "Completato!";
      default:
        return "Elaborazione in corso...";
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="bg-[#0A0A0A]/95 backdrop-blur-md border border-[#1F1F1F] hover:border-[#2A2A2A] focus-within:border-[#C5A059]/70 focus-within:ring-1 focus-within:ring-[#C5A059]/30 rounded-2xl p-2.5 shadow-2xl transition-all space-y-2">
          
          {/* Top Control Bar: Contextual Chips & Engine Indicators */}
          <div className="flex items-center justify-between gap-2 px-1 text-xs">
            
            {/* Left: Smart Type Selector Dropdown (Replaces static 8-button row) */}
            <div className="relative" ref={typeDropdownRef}>
              <button
                type="button"
                onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#1A1A1A] border border-[#252525] hover:border-[#383838] text-[11px] font-mono text-[#DDD] transition-all cursor-pointer shadow-xs"
                title="Seleziona tipologia di classificazione AI"
              >
                {currentOption.icon}
                <span className="font-medium text-white">{currentOption.label}</span>
                <ChevronDown className={`w-3 h-3 text-[#777] transition-transform ${isTypeDropdownOpen ? "rotate-180 text-[#C5A059]" : ""}`} />
              </button>

              {/* Type Dropdown Popover */}
              {isTypeDropdownOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-72 bg-[#0F0F0F] border border-[#262626] rounded-xl shadow-2xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2.5 py-1 text-[10px] font-mono text-[#666] uppercase tracking-wider border-b border-[#1A1A1A] mb-1">
                    Tipo di Risorsa per l'Agente
                  </div>
                  <div className="space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar">
                    {typeOptions.map((opt) => {
                      const isSelected = selectedType === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setSelectedType(opt.id);
                            setIsTypeDropdownOpen(false);
                          }}
                          className={`w-full flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all ${
                            isSelected
                              ? "bg-[#1F180E] border border-[#C5A059]/40 text-[#E5C170]"
                              : "hover:bg-[#161616] text-[#BBB] hover:text-white"
                          }`}
                        >
                          <span className="mt-0.5 shrink-0">{opt.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between text-xs font-mono font-medium">
                              <span>{opt.label}</span>
                              {isSelected && <Check className="w-3 h-3 text-[#C5A059]" />}
                            </div>
                            <p className="text-[10px] text-[#666] truncate mt-0.2">
                              {opt.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Engine Indicator & Helper Hints */}
            <div className="flex items-center gap-2 text-[10.5px] font-mono text-[#666] shrink-0">
              {showSuccess ? (
                <span className="text-emerald-400 flex items-center gap-1 font-semibold animate-fade-in">
                  <CheckCircle className="w-3 h-3" /> Salvato nel Vault!
                </span>
              ) : (
                <>
                  <div className="hidden sm:flex items-center gap-1 text-[#888] bg-[#121212] px-2 py-0.5 rounded-md border border-[#202020]">
                    <Zap className="w-2.5 h-2.5 text-[#C5A059]" />
                    <span>Gemini 3.7 Flash</span>
                  </div>

                  <span className="hidden lg:inline text-[#555]">
                    Invio per analizzare • Shift+Invio per a capo
                  </span>
                </>
              )}

              {onOpenKnowledgeUpload && (
                <button
                  type="button"
                  onClick={onOpenKnowledgeUpload}
                  className="flex items-center gap-1 text-[#C5A059] hover:underline text-[10.5px] ml-1 bg-[#1A1408] border border-[#C5A059]/30 px-2 py-0.5 rounded-md hover:bg-[#261E0E] transition-colors"
                  title="Importa file .md, note o documentazione tecnica direttamente nello standard OKF v0.2"
                >
                  <UploadCloud className="w-3 h-3" />
                  <span>Uploader File / .md</span>
                </button>
              )}
            </div>
          </div>

          {/* Stepper Feedback when Analyzing */}
          {isAnalyzing && (
            <div className="mx-0.5 px-3 py-1.5 bg-[#12110D] border border-[#C5A059]/30 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-[#DDD] animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C5A059] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C5A059]"></span>
                </span>
                <span className="font-medium text-[#E5C170] text-xs">
                  {getStageLabel()}
                </span>
              </div>

              <div className="flex items-center gap-1 text-[10px] font-mono">
                <span className={`flex items-center gap-1 px-1.5 py-0.2 rounded ${
                  captureStage === 'sending' 
                    ? 'bg-[#C5A059] text-black font-semibold' 
                    : 'text-emerald-400 bg-emerald-950/40'
                }`}>
                  1. Invio
                </span>
                <ArrowRight className="w-2.5 h-2.5 text-[#555]" />
                <span className={`flex items-center gap-1 px-1.5 py-0.2 rounded ${
                  captureStage === 'analyzing' 
                    ? 'bg-[#C5A059] text-black font-semibold' 
                    : captureStage === 'saving' || captureStage === 'success'
                    ? 'text-emerald-400 bg-emerald-950/40'
                    : 'text-[#666]'
                }`}>
                  2. AI Parsing
                </span>
                <ArrowRight className="w-2.5 h-2.5 text-[#555]" />
                <span className={`flex items-center gap-1 px-1.5 py-0.2 rounded ${
                  captureStage === 'saving' 
                    ? 'bg-[#C5A059] text-black font-semibold' 
                    : captureStage === 'success'
                    ? 'text-emerald-400 bg-emerald-950/40'
                    : 'text-[#666]'
                }`}>
                  3. Vault
                </span>
              </div>
            </div>
          )}

          {/* Hidden File Input for Direct Attachments */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={async (e) => {
              if (e.target.files && e.target.files.length > 0 && onUploadRawFile) {
                const file = e.target.files[0];
                try {
                  setIsUploadingFile(true);
                  const ok = await onUploadRawFile(file);
                  if (ok) {
                    setShowSuccess(true);
                    setTimeout(() => setShowSuccess(false), 3000);
                  }
                } catch (err) {
                  console.error("File upload error:", err);
                } finally {
                  setIsUploadingFile(false);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }
              }
            }}
            className="hidden"
            accept=".pdf,.txt,.md,.markdown,.json,.yaml,.yml,.csv,.log,.png,.jpg,.jpeg,.webp,.svg,.ts,.js,.py,.rs,.go,.mp3,.wav,.m4a,.ogg,.aac,.flac,.opus,.webm,audio/*,image/*"
          />

          {/* Main Agentic Input Row */}
          <div className="flex items-end gap-2 px-1 pt-0.5">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedType === "knowledge"
                  ? "Incolla testo, specifiche, guide o note .md da strutturare nello standard OKF v0.2..."
                  : selectedType === "troubleshooting"
                  ? "Descrivi l'errore, incolla il messaggio o il codice per estrarre la procedura di fix..."
                  : "Chiedi all'agente o incolla link, repo GitHub, server MCP o file .md (elaborati in OKF v0.2)..."
              }
              disabled={isAnalyzing || isUploadingFile}
              className="bg-transparent border-none text-xs sm:text-sm w-full text-[#E0E0E0] focus:outline-none placeholder-[#555] disabled:opacity-50 resize-none py-1.5 max-h-32 overflow-y-auto leading-relaxed custom-scrollbar font-sans"
            />

            {/* Quick File Attachment Button */}
            {onUploadRawFile && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing || isUploadingFile}
                className="p-2 text-[#777] hover:text-[#E5C170] hover:bg-[#181818] rounded-xl border border-transparent hover:border-[#282828] transition-colors shrink-0 mb-0.5 cursor-pointer"
                title="Allega file per staging (Audio, PDF, TXT, MD, Immagini fino a 50MB)"
              >
                {isUploadingFile ? (
                  <Loader2 className="w-4 h-4 text-[#C5A059] animate-spin" />
                ) : (
                  <Paperclip className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={!input.trim() || isAnalyzing || isUploadingFile}
              className="bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#1A1A1A] disabled:text-[#444] text-black font-semibold text-xs py-2 px-4 rounded-xl transition-all flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95 self-end mb-0.5 cursor-pointer disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="hidden sm:inline">Analisi...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span className="hidden sm:inline font-medium">Cattura</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
