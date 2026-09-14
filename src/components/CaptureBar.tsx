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
  Zap,
  GraduationCap,
  Rss,
  StickyNote,
  Mic,
  Square,
  Trash2
} from "lucide-react";
import { ResourceType, CaptureStage, TransformationCategory } from "../types";

interface CaptureBarProps {
  onCapture: (input: string, explicitType?: ResourceType) => Promise<boolean>;
  isAnalyzing: boolean;
  captureStage?: CaptureStage;
  captureStageMessage?: string;
  transformationCategory?: TransformationCategory | null;
  onOpenKnowledgeUpload?: () => void;
  onOpenDiagnostic?: () => void;
  onOpenGoogleDrive?: () => void;
  onUploadRawFile?: (file: File) => Promise<boolean>;
  onOpenIntelligence?: (prefilledQuery?: string) => void;
  isIntelligenceOpen?: boolean;
  resourceCount?: number;
}

export const CaptureBar: React.FC<CaptureBarProps> = ({
  onCapture,
  isAnalyzing,
  captureStage = "idle",
  captureStageMessage,
  transformationCategory,
  onOpenKnowledgeUpload,
  onUploadRawFile,
  onOpenIntelligence,
  isIntelligenceOpen = false,
  resourceCount,
}) => {
  const [input, setInput] = useState("");
  const [selectedType, setSelectedType] = useState<ResourceType | "auto">("auto");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Audio Voice Memo Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioTimerRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  
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

  // Cleanup audio recorder on unmount
  useEffect(() => {
    return () => {
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleStartRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("La registrazione vocale richiede un browser con supporto MediaDevices.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/wav",
      ];
      let selectedMime = "";
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
        for (const m of mimeCandidates) {
          if (MediaRecorder.isTypeSupported(m)) {
            selectedMime = m;
            break;
          }
        }
      }

      const recorder = new MediaRecorder(
        stream,
        selectedMime ? { mimeType: selectedMime } : undefined
      );
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);

      audioTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn("Accesso microfono non consentito o errore:", err);
      alert("Impossibile accedere al microfono. Verifica le autorizzazioni nel browser.");
    }
  };

  const handleStopAndUploadRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

    if (audioTimerRef.current) clearInterval(audioTimerRef.current);

    const recorder = mediaRecorderRef.current;
    const stream = audioStreamRef.current;

    recorder.onstop = async () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setIsRecording(false);
      setRecordingDuration(0);

      if (audioChunksRef.current.length > 0 && onUploadRawFile) {
        const mime = recorder.mimeType || "audio/webm";
        const ext = mime.includes("ogg")
          ? "ogg"
          : mime.includes("mp4")
          ? "mp4"
          : mime.includes("wav")
          ? "wav"
          : "webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });

        if (audioBlob.size > 500) {
          const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
          const audioFile = new File(
            [audioBlob],
            `nota-vocale-${timestampStr}.${ext}`,
            { type: mime }
          );

          try {
            setIsUploadingFile(true);
            const ok = await onUploadRawFile(audioFile);
            if (ok) {
              setShowSuccess(true);
              setTimeout(() => setShowSuccess(false), 3000);
            }
          } catch (err) {
            console.error("Errore upload nota vocale:", err);
          } finally {
            setIsUploadingFile(false);
          }
        }
      }
    };

    recorder.stop();
  };

  const handleCancelRecording = () => {
    if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
    { id: "paper", label: "Paper Scientifico", icon: <GraduationCap className="w-3.5 h-3.5 text-[#818CF8]" />, color: "text-[#818CF8]", description: "Articoli accademici (arXiv, DOI, venue, PDF)" },
    { id: "rss", label: "Feed RSS", icon: <Rss className="w-3.5 h-3.5 text-[#FB923C]" />, color: "text-[#FB923C]", description: "Flussi di aggiornamento RSS e Atom da blog e lab AI" },
    { id: "note", label: "Nota Rapida", icon: <StickyNote className="w-3.5 h-3.5 text-[#FBBF24]" />, color: "text-[#FBBF24]", description: "Scratchpad veloce, idee per prompt o memo architetturali" },
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
      case "transforming":
        if (transformationCategory === "article") return "Data Transformation: Articolo & Guida...";
        if (transformationCategory === "web_link") return "Data Transformation: Web Link...";
        if (transformationCategory === "github_repo") return "Data Transformation: GitHub Repo...";
        if (transformationCategory === "okf_draft") return "Data Transformation: OKF Bozza (Draft)...";
        if (transformationCategory === "okf_document") return "Data Transformation: OKF Document...";
        return "Data Transformation in corso...";
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

            {/* Right: Engine Indicator & Helper Hints & Vault Intelligence CTA */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10.5px] font-mono text-[#666] shrink-0">
              {showSuccess ? (
                <span className="text-emerald-400 flex items-center gap-1 font-semibold animate-fade-in">
                  <CheckCircle className="w-3 h-3" /> Salvato nel Vault!
                </span>
              ) : (
                <>
                  <div className="hidden lg:flex items-center gap-1 text-[#888] bg-[#121212] px-2 py-0.5 rounded-md border border-[#202020]">
                    <Zap className="w-2.5 h-2.5 text-[#C5A059]" />
                    <span>Gemini 3.7 Flash</span>
                  </div>

                  <span className="hidden xl:inline text-[#555]">
                    Invio per analizzare • Shift+Invio per a capo
                  </span>
                </>
              )}

              {onOpenKnowledgeUpload && (
                <button
                  type="button"
                  onClick={onOpenKnowledgeUpload}
                  className="hidden md:flex items-center gap-1 text-[#C5A059] hover:underline text-[10.5px] bg-[#1A1408] border border-[#C5A059]/30 px-2 py-0.5 rounded-md hover:bg-[#261E0E] transition-colors cursor-pointer"
                  title="Importa file .md, note o documentazione tecnica direttamente nello standard OKF v0.2"
                >
                  <UploadCloud className="w-3 h-3" />
                  <span className="hidden lg:inline">Uploader</span> .md
                </button>
              )}

              {/* Unified Vault Intelligence Command Button */}
              {onOpenIntelligence && (
                <button
                  type="button"
                  id="capturebar-vault-intelligence-btn"
                  onClick={() => {
                    if (input.trim()) {
                      onOpenIntelligence(input.trim());
                      setInput("");
                    } else {
                      onOpenIntelligence();
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer border shrink-0 ${
                    isIntelligenceOpen
                      ? "bg-[#C5A059] text-black border-[#C5A059] font-bold shadow-[0_0_12px_rgba(197,160,89,0.4)]"
                      : "bg-[#18130B] hover:bg-[#241A0D] text-[#E5C170] hover:text-[#F8E2A8] border-[#C5A059]/60 hover:border-[#C5A059] shadow-xs active:scale-95"
                  }`}
                  title="Apri Vault Intelligence: Orquestratore Agenti Autonomi con Grounding Ontologico (Scorciatoia globale: ⌘K / Ctrl+K)"
                  aria-label="Apri Vault Intelligence"
                >
                  <BrainCircuit className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                  <span className="font-semibold text-[11px] sm:text-xs">Intelligence</span>
                  <span className="hidden sm:inline-block text-[9.5px] px-1 py-0.2 rounded bg-black/40 text-[#C5A059] border border-[#C5A059]/30 font-mono font-medium">
                    ⌘K
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Stepper Feedback when Analyzing */}
          {isAnalyzing && (
            <div className="mx-0.5 px-3 py-2 bg-[#12110D] border border-[#C5A059]/30 rounded-xl space-y-2 animate-fade-in shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs text-[#DDD]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-2 w-2 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C5A059] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C5A059]"></span>
                  </span>
                  <span className="font-medium text-[#E5C170] text-xs truncate">
                    {getStageLabel()}
                  </span>
                </div>

                {/* 4-Step Stepper: 1. Invio -> 2. AI Parsing -> 3. Data Transformation -> 4. Vault Storage */}
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                    captureStage === 'sending' 
                      ? 'bg-[#C5A059] text-black font-semibold' 
                      : 'text-emerald-400 bg-emerald-950/40'
                  }`}>
                    1. Invio
                  </span>
                  <ArrowRight className="w-2.5 h-2.5 text-[#555]" />
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                    captureStage === 'analyzing' 
                      ? 'bg-[#C5A059] text-black font-semibold' 
                      : captureStage === 'transforming' || captureStage === 'saving' || captureStage === 'success'
                      ? 'text-emerald-400 bg-emerald-950/40'
                      : 'text-[#666]'
                  }`}>
                    2. AI Parsing
                  </span>
                  <ArrowRight className="w-2.5 h-2.5 text-[#555]" />
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                    captureStage === 'transforming' 
                      ? 'bg-[#C5A059] text-black font-semibold ring-1 ring-[#C5A059]' 
                      : captureStage === 'saving' || captureStage === 'success'
                      ? 'text-emerald-400 bg-emerald-950/40'
                      : 'text-[#666]'
                  }`}>
                    3. Trasformazione
                  </span>
                  <ArrowRight className="w-2.5 h-2.5 text-[#555]" />
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                    captureStage === 'saving' 
                      ? 'bg-[#C5A059] text-black font-semibold' 
                      : captureStage === 'success'
                      ? 'text-emerald-400 bg-emerald-950/40'
                      : 'text-[#666]'
                  }`}>
                    4. Vault
                  </span>
                </div>
              </div>

              {/* Specific Visual Indicator during Intermediate 'Data Transformation' Phase */}
              {(captureStage === 'transforming' || transformationCategory) && (
                <div
                  id="capture-transformation-indicator"
                  className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border text-xs transition-all animate-fade-in ${
                    transformationCategory === "web_link"
                      ? "bg-sky-950/80 border-sky-500/60 text-sky-200"
                      : transformationCategory === "github_repo"
                      ? "bg-purple-950/80 border-purple-500/60 text-purple-200"
                      : transformationCategory === "okf_draft"
                      ? "bg-[#2A1808]/95 border-amber-500/70 text-amber-200"
                      : "bg-[#251A0A]/95 border-[#C5A059]/70 text-[#F5DE98]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-black/50 border border-white/10 shrink-0">
                      {transformationCategory === "web_link" && <Globe className="w-3.5 h-3.5 text-sky-400 animate-pulse" />}
                      {transformationCategory === "github_repo" && <Github className="w-3.5 h-3.5 text-purple-400 animate-pulse" />}
                      {transformationCategory === "okf_draft" && <FileText className="w-3.5 h-3.5 text-amber-400 animate-pulse" />}
                      {(transformationCategory === "okf_document" || !transformationCategory) && (
                        <FileText className="w-3.5 h-3.5 text-[#C5A059] animate-pulse" />
                      )}
                    </span>
                    <div className="flex items-baseline gap-1.5 truncate">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#999] shrink-0">
                        Data Transformation:
                      </span>
                      <span className="font-bold tracking-wide text-xs">
                        {transformationCategory === "web_link"
                          ? "Web Link"
                          : transformationCategory === "github_repo"
                          ? "GitHub Repo"
                          : transformationCategory === "okf_draft"
                          ? "OKF Bozza (Draft)"
                          : "OKF Document"}
                      </span>
                    </div>
                  </div>

                  <span className="text-[11px] opacity-85 hidden sm:inline text-right font-mono shrink-0">
                    {transformationCategory === "web_link"
                      ? "Escluso schema OKF v0.2 · Salvataggio come link web"
                      : transformationCategory === "github_repo"
                      ? "Repository codice open-source · Architettura tecnica"
                      : transformationCategory === "okf_draft"
                      ? "Campi OKF incompleti · Reindirizzato a Bozza / Uncategorized"
                      : "Schema OKF v0.2 · Frontmatter YAML & entità ontologiche"}
                  </span>
                </div>
              )}
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

          {/* Audio Recording Live State */}
          {isRecording ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[#160B0B] border border-red-900/50 rounded-xl animate-fade-in my-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-3 w-3 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                </span>
                <span className="font-mono font-bold text-xs text-red-400 shrink-0">
                  REC {formatDuration(recordingDuration)}
                </span>
                <span className="text-xs text-[#AAA] truncate hidden sm:inline">
                  Registrazione nota vocale in corso...
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCancelRecording}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-[#999] hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                  title="Annulla registrazione vocale"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Annulla</span>
                </button>

                <button
                  type="button"
                  onClick={handleStopAndUploadRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all cursor-pointer active:scale-95"
                  title="Ferma la registrazione e salva la nota nel Vault"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Salva Nota Vocale</span>
                </button>
              </div>
            </div>
          ) : (
            /* Main Agentic Input Row */
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
                    : "Incolla link, repository GitHub, server MCP o digita note da archiviare nel Vault..."
                }
                disabled={isAnalyzing || isUploadingFile}
                className="bg-transparent border-none text-xs sm:text-sm w-full text-[#E0E0E0] focus:outline-none placeholder-[#555] disabled:opacity-50 resize-none py-1.5 max-h-32 overflow-y-auto leading-relaxed custom-scrollbar font-sans"
              />

              {/* Voice Memo Direct Microphone Button */}
              {onUploadRawFile && (
                <button
                  type="button"
                  onClick={handleStartRecording}
                  disabled={isAnalyzing || isUploadingFile}
                  className="p-2 text-[#777] hover:text-[#E5C170] hover:bg-[#181818] rounded-xl border border-transparent hover:border-[#282828] transition-colors shrink-0 mb-0.5 cursor-pointer disabled:opacity-50"
                  title="Registra nota vocale (trascrizione automatica Gemini ed archiviazione in OKF v0.2)"
                  aria-label="Registra nota vocale"
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}

              {/* Quick File Attachment Button */}
              {onUploadRawFile && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzing || isUploadingFile}
                  className="p-2 text-[#777] hover:text-[#E5C170] hover:bg-[#181818] rounded-xl border border-transparent hover:border-[#282828] transition-colors shrink-0 mb-0.5 cursor-pointer disabled:opacity-50"
                  title="Allega file per staging (Audio, PDF, TXT, MD, Immagini fino a 50MB)"
                  aria-label="Allega file"
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
          )}
        </div>
      </form>
    </div>
  );
};
