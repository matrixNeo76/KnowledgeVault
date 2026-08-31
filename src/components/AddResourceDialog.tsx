import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  Sparkles, 
  Plus, 
  BookOpen, 
  Github, 
  Cpu, 
  Bot, 
  Loader2,
  Wand2,
  Layers,
  FileText,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ListPlus,
  ArrowRight,
  ExternalLink,
  Tag,
  Trash2,
  Play,
  Check,
  HelpCircle,
  Database,
  Globe,
  BrainCircuit,
  Wrench
} from "lucide-react";
import { ResourceItem, ResourceType } from "../types";

interface AddResourceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (newResource: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<boolean>;
  onAnalyzeWithAI: (input: string, explicitType?: ResourceType) => Promise<any>;
  onAddLog?: (level: any, category: any, message: string, details?: any) => void;
}

interface BulkItem {
  id: string;
  rawText: string;
  status: "idle" | "analyzing" | "saving" | "success" | "error";
  errorMessage?: string;
  analyzedData?: {
    type: ResourceType;
    title: string;
    url?: string;
    summary: string;
    tags: string[];
    metadata?: any;
  };
}

export const AddResourceDialog: React.FC<AddResourceDialogProps> = ({
  isOpen,
  onClose,
  onAdd,
  onAnalyzeWithAI,
  onAddLog,
}) => {
  // Modal Mode: Single Resource vs. Bulk Import
  const [modalMode, setModalMode] = useState<"single" | "bulk">("single");

  // Single Add Form State
  const [type, setType] = useState<ResourceType>("github_repo");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [mcpConfig, setMcpConfig] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [installCommand, setInstallCommand] = useState("");
  const [affectedSystem, setAffectedSystem] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [attemptedFixesStr, setAttemptedFixesStr] = useState("");
  const [solutionStepsStr, setSolutionStepsStr] = useState("");
  const [userNotes, setUserNotes] = useState("");

  const [aiInputPrompt, setAiInputPrompt] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk Import State
  const [bulkRawText, setBulkRawText] = useState("");
  const [bulkSplitMode, setBulkSplitMode] = useState<"lines" | "paragraphs">("lines");
  const [bulkDefaultType, setBulkDefaultType] = useState<ResourceType | "auto">("auto");
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProgressIndex, setBulkProgressIndex] = useState(0);
  const cancelBulkRef = useRef(false);

  // Parse bulk text into items whenever bulkRawText or bulkSplitMode changes
  useEffect(() => {
    if (isBulkProcessing) return; // Do not overwrite while in-flight
    const text = bulkRawText.trim();
    if (!text) {
      setBulkItems([]);
      return;
    }

    let chunks: string[] = [];
    if (bulkSplitMode === "lines") {
      chunks = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    } else {
      // Split by double newline or delimiter '---'
      chunks = text
        .split(/(?:\r?\n\s*\r?\n|(?:\r?\n)?---\s*(?:\r?\n)?)/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
    }

    const items: BulkItem[] = chunks.map((chunk, idx) => ({
      id: `item-${idx}-${Date.now()}`,
      rawText: chunk,
      status: "idle",
    }));

    setBulkItems(items);
  }, [bulkRawText, bulkSplitMode, isBulkProcessing]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting && !isBulkProcessing) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isSubmitting, isBulkProcessing]);

  if (!isOpen) return null;

  // Single Auto-Fill Helper
  const handleAIAutoFill = async () => {
    if (!aiInputPrompt.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const data = await onAnalyzeWithAI(aiInputPrompt.trim(), type);
      if (data) {
        if (data.title) setTitle(data.title);
        if (data.url) setUrl(data.url);
        if (data.summary) setSummary(data.summary);
        if (data.tags && Array.isArray(data.tags)) setTagsStr(data.tags.join(", "));
        if (data.type) setType(data.type);

        if (data.metadata?.configSnippet) setMcpConfig(data.metadata.configSnippet);
        if (data.metadata?.systemPrompt) setSystemPrompt(data.metadata.systemPrompt);
        if (data.metadata?.installCommand) setInstallCommand(data.metadata.installCommand);
        if (data.metadata?.affectedSystem) setAffectedSystem(data.metadata.affectedSystem);
        if (data.metadata?.rootCause) setRootCause(data.metadata.rootCause);
        if (Array.isArray(data.metadata?.attemptedFixes)) setAttemptedFixesStr(data.metadata.attemptedFixes.join("\n"));
        if (Array.isArray(data.metadata?.solutionSteps)) setSolutionStepsStr(data.metadata.solutionSteps.join("\n"));
        if (data.metadata?.userNotes) setUserNotes(data.metadata.userNotes);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Single Form Submit
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim() || isSubmitting) return;

    setIsSubmitting(true);
    let cleanUrl = url.trim();
    if (cleanUrl.startsWith("github.com/")) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const tagsArray = tagsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const metadata: Record<string, any> = {};
    if (type === "troubleshooting") {
      if (affectedSystem) metadata.affectedSystem = affectedSystem;
      if (rootCause) metadata.rootCause = rootCause;
      if (attemptedFixesStr) {
        metadata.attemptedFixes = attemptedFixesStr
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
      if (solutionStepsStr) {
        metadata.solutionSteps = solutionStepsStr
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
      metadata.okfVersion = "0.2";
      metadata.docType = "guide";
    }
    if (type === "mcp_server" && mcpConfig) metadata.configSnippet = mcpConfig;
    if (type === "ai_skill" && systemPrompt) metadata.systemPrompt = systemPrompt;
    if (userNotes.trim()) metadata.userNotes = userNotes.trim();
    if (type === "github_repo") {
      const ghRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/i;
      const matchGh = (cleanUrl || title).match(ghRegex);
      if (matchGh) {
        metadata.owner = matchGh[1];
        metadata.repoName = matchGh[2].replace(/\.git$/, "").replace(/[#?].*$/, "");
        if (!installCommand) {
          metadata.installCommand = `git clone https://github.com/${metadata.owner}/${metadata.repoName}.git`;
        }
      }
      if (installCommand) metadata.installCommand = installCommand;
      if (!tagsArray.includes("github")) tagsArray.push("github");
    }

    const success = await onAdd({
      type,
      title: title.trim(),
      url: cleanUrl || "",
      summary: summary.trim(),
      tags: tagsArray,
      isFavorite: false,
      metadata,
    });

    setIsSubmitting(false);
    if (success) {
      onClose();
    }
  };

  // Sample Data for Quick Bulk Import Testing
  const loadBulkSamples = () => {
    const samples = [
      "https://github.com/anthropics/anthropic-quickstarts",
      "https://github.com/modelcontextprotocol/servers",
      "PostgreSQL MCP Server: Configurazione e tool per interrogare database relazionali con Claude",
      "Prompt Skill: Senior Software Architect persona per revisione architettura microservizi e cloud",
      "https://news.ycombinator.com/item?id=38870123"
    ].join("\n");
    setBulkSplitMode("lines");
    setBulkRawText(samples);
  };

  // Process a single bulk item through AI and save to Firestore
  const processSingleBulkItem = async (item: BulkItem, explicitType?: ResourceType): Promise<boolean> => {
    try {
      // Step 1: AI Analysis
      const targetType = explicitType || (bulkDefaultType === "auto" ? undefined : bulkDefaultType);
      const analyzed = await onAnalyzeWithAI(item.rawText, targetType);

      if (!analyzed || !analyzed.title) {
        throw new Error("L'analisi AI non ha restituito un titolo valido");
      }

      let resolvedType: ResourceType = analyzed.type || targetType || "article";
      if (
        (item.rawText.includes("github.com/") || (analyzed.url && analyzed.url.includes("github.com/"))) &&
        targetType !== "mcp_server" &&
        targetType !== "knowledge" &&
        resolvedType !== "mcp_server"
      ) {
        resolvedType = "github_repo";
      }

      let resolvedUrl = (analyzed.url && typeof analyzed.url === "string") ? analyzed.url.trim() : (item.rawText.startsWith("http") ? item.rawText.trim() : "");
      if (!resolvedUrl && item.rawText.includes("github.com/")) {
        const ghMatch = item.rawText.match(/github\.com\/[^\s]+/i);
        if (ghMatch) resolvedUrl = `https://${ghMatch[0]}`;
      }

      const analyzedPayload = {
        type: resolvedType,
        title: analyzed.title || "Risorsa Senza Titolo",
        url: resolvedUrl,
        summary: analyzed.summary || item.rawText,
        tags: Array.isArray(analyzed.tags) ? analyzed.tags : ["imported"],
        metadata: analyzed.metadata || {},
      };

      // Step 2: Update state to saving
      setBulkItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: "saving", analyzedData: analyzedPayload }
            : i
        )
      );

      // Step 3: Save to Firestore via onAdd
      const saved = await onAdd({
        type: analyzedPayload.type,
        title: analyzedPayload.title,
        url: analyzedPayload.url || "",
        summary: analyzedPayload.summary,
        tags: analyzedPayload.tags,
        isFavorite: false,
        metadata: analyzedPayload.metadata,
        rawInput: item.rawText,
      });

      if (!saved) {
        throw new Error("Salvataggio nel database Firestore non riuscito");
      }

      // Step 4: Mark item as success
      setBulkItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: "success", analyzedData: analyzedPayload }
            : i
        )
      );

      return true;
    } catch (err: any) {
      console.error("Bulk item error:", err);
      setBulkItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: "error",
                errorMessage: err.message || "Errore durante l'analisi",
              }
            : i
        )
      );
      return false;
    }
  };

  // Run Bulk Processing for all items sequentially
  const handleStartBulkProcessing = async () => {
    if (bulkItems.length === 0 || isBulkProcessing) return;

    setIsBulkProcessing(true);
    cancelBulkRef.current = false;
    setBulkProgressIndex(0);

    if (onAddLog) {
      onAddLog(
        "info",
        "CAPTURE",
        `Avvio importazione in blocco di ${bulkItems.length} elementi con analisi AI Gemini...`
      );
    }

    let successCount = 0;
    let failCount = 0;

    for (let idx = 0; idx < bulkItems.length; idx++) {
      if (cancelBulkRef.current) {
        if (onAddLog) {
          onAddLog("warn", "CAPTURE", "Importazione in blocco interrotta dall'utente.");
        }
        break;
      }

      const item = bulkItems[idx];
      // Skip already succeeded items
      if (item.status === "success") {
        successCount++;
        continue;
      }

      setBulkProgressIndex(idx + 1);

      // Mark current as analyzing
      setBulkItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "analyzing", errorMessage: undefined } : i))
      );

      const ok = await processSingleBulkItem(item);
      if (ok) {
        successCount++;
      } else {
        failCount++;
      }

      // Small delay between calls to preserve UI responsiveness
      await new Promise((r) => setTimeout(r, 200));
    }

    setIsBulkProcessing(false);

    if (onAddLog) {
      onAddLog(
        successCount > 0 ? "success" : "warn",
        "CAPTURE",
        `Importazione in blocco completata: ${successCount} salvate con successo, ${failCount} errori.`,
        { successCount, failCount, total: bulkItems.length }
      );
    }
  };

  // Retry a single failed item
  const handleRetrySingleItem = async (item: BulkItem) => {
    setBulkItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: "analyzing", errorMessage: undefined } : i))
    );
    await processSingleBulkItem(item);
  };

  // Remove a specific item from bulk list
  const handleRemoveBulkItem = (id: string) => {
    setBulkItems((prev) => prev.filter((i) => i.id !== id));
  };

  const completedCount = bulkItems.filter((i) => i.status === "success").length;
  const errorCount = bulkItems.filter((i) => i.status === "error").length;
  const progressPercent = bulkItems.length > 0 ? Math.round((completedCount / bulkItems.length) * 100) : 0;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-[#0D0D0D] border border-[#222] rounded-2xl w-full max-w-2xl max-h-[94vh] sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-[#1C1C1C] flex items-center justify-between gap-2.5 bg-[#0A0A0A]">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-[#161616] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shrink-0">
              {modalMode === "single" ? <Plus className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-serif text-white font-medium truncate">
                {modalMode === "single" ? "Aggiungi Risorsa al Vault" : "Importazione in Blocco Multi-URL & Snippet"}
              </h2>
              <p className="text-[11px] text-[#777] hidden sm:block">
                {modalMode === "single"
                  ? "Inserisci manualmente o usa l'auto-fill AI per arricchire la risorsa."
                  : "Incolla più URL o snippet per analizzarli e salvarli automaticamente con l'AI."}
              </p>
            </div>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex items-center bg-[#141414] border border-[#262626] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => !isBulkProcessing && setModalMode("single")}
              disabled={isBulkProcessing}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                modalMode === "single"
                  ? "bg-[#C5A059] text-black font-semibold shadow-xs"
                  : "text-[#888] hover:text-[#CCC]"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Singola</span>
            </button>
            <button
              type="button"
              onClick={() => setModalMode("bulk")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                modalMode === "bulk"
                  ? "bg-[#C5A059] text-black font-semibold shadow-xs"
                  : "text-[#888] hover:text-[#CCC]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>In Blocco</span>
              <span className="text-[9px] bg-black/40 px-1 py-0.2 rounded font-sans">
                {bulkItems.length > 0 ? bulkItems.length : "Bulk"}
              </span>
            </button>
          </div>

          <button
            onClick={onClose}
            aria-label="Chiudi finestra"
            disabled={isBulkProcessing}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1C1C1C] hover:bg-[#2A2A2A] text-[#EEE] hover:text-white border border-[#333] transition-colors shrink-0 cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
          {modalMode === "single" ? (
            /* ========================================================================= */
            /* SINGLE RESOURCE MODE                                                      */
            /* ========================================================================= */
            <>
              {/* AI Auto-Fill Helper Box */}
              <div className="bg-[#111] border border-[#222] rounded-xl p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Fill Intelligente con Gemini</span>
                  </div>
                  <span className="text-[10px] text-[#666] font-mono">OKF v0.2 + AI Extractor</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiInputPrompt}
                    onChange={(e) => setAiInputPrompt(e.target.value)}
                    placeholder="Incolla un URL o testo grezzo da analizzare automaticamente..."
                    className="w-full bg-[#080808] border border-[#262626] rounded-lg px-3 py-2 text-xs text-[#E0E0E0] placeholder-[#555] focus:outline-none focus:border-[#C5A059]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAIAutoFill();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAIAutoFill}
                    disabled={!aiInputPrompt.trim() || isAnalyzing}
                    className="bg-[#1C1C1C] hover:bg-[#252525] border border-[#333] text-[#C5A059] hover:text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    <span>Auto-Fill</span>
                  </button>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSingleSubmit} className="space-y-4 text-xs">
                {/* Category Selector */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1.5">
                    Categoria Risorsa *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: "troubleshooting", label: "Problema & Fix", icon: <Wrench className="w-3.5 h-3.5 text-[#F97316]" /> },
                      { id: "knowledge", label: "Knowledge (OKF)", icon: <BrainCircuit className="w-3.5 h-3.5 text-[#C5A059]" /> },
                      { id: "github_repo", label: "GitHub Repo", icon: <Github className="w-3.5 h-3.5 text-[#A855F7]" /> },
                      { id: "mcp_server", label: "MCP Server", icon: <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" /> },
                      { id: "ai_skill", label: "AI Skill", icon: <Bot className="w-3.5 h-3.5 text-[#10B981]" /> },
                      { id: "article", label: "Articolo", icon: <BookOpen className="w-3.5 h-3.5 text-[#F59E0B]" /> },
                      { id: "link", label: "Link Web", icon: <Globe className="w-3.5 h-3.5 text-[#06B6D4]" /> },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setType(cat.id as ResourceType)}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs transition-colors ${
                          type === cat.id
                            ? "bg-[#181818] border-[#C5A059] text-[#C5A059] font-medium"
                            : "bg-[#0A0A0A] border-[#222] text-[#777] hover:text-white"
                        }`}
                      >
                        {cat.icon}
                        <span>{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Titolo *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="es. PostgreSQL MCP Server o nomerepo/framework"
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                {/* URL */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    URL / Link Risorsa (opzionale)
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://github.com/..."
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                {/* Summary */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Descrizione / Sommario *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Descrivi lo scopo, funzionalità o caratteristiche principali..."
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                {/* Optional Custom User Notes */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#C5A059] mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Note & Commenti Personali (Opzionale)
                  </label>
                  <textarea
                    rows={2}
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="Aggiungi appunti personali, istruzioni o dettagli d'uso su questa risorsa..."
                    className="w-full bg-[#111] border border-[#2A2315] rounded-lg p-2.5 text-xs text-[#E5C170] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                {/* Specific fields */}
                {type === "troubleshooting" && (
                  <div className="space-y-3 bg-[#141414] border border-[#262626] rounded-xl p-3">
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#F97316] mb-1">
                        Sistema / Software Coinvolto
                      </label>
                      <input
                        type="text"
                        value={affectedSystem}
                        onChange={(e) => setAffectedSystem(e.target.value)}
                        placeholder="es. PriMus-Av.usBIM (ACCA) / Windows 11 KB5121003"
                        className="w-full bg-[#0A0A0A] border border-[#333] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#F97316]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#F97316] mb-1">
                        Causa Scatenante / Diagnosi Tecnica
                      </label>
                      <textarea
                        rows={2}
                        value={rootCause}
                        onChange={(e) => setRootCause(e.target.value)}
                        placeholder="es. Lo Smart App Control (SAC) di Windows ha bloccato borlndmm.dll..."
                        className="w-full bg-[#0A0A0A] border border-[#333] rounded-lg p-2 text-xs text-[#E0E0E0] focus:outline-none focus:border-[#F97316]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#888] mb-1">
                        Tentativi Non Risolutivi (uno per riga)
                      </label>
                      <textarea
                        rows={2}
                        value={attemptedFixesStr}
                        onChange={(e) => setAttemptedFixesStr(e.target.value)}
                        placeholder="es. Rigenerazione cartella .Common&#10;Scansione SFC / DISM"
                        className="w-full font-mono bg-[#0A0A0A] border border-[#333] rounded-lg p-2 text-xs text-[#AAA] focus:outline-none focus:border-[#F97316]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono uppercase text-[#10B981] mb-1">
                        Procedura Risolutiva Definitiva (un passaggio per riga)
                      </label>
                      <textarea
                        rows={3}
                        value={solutionStepsStr}
                        onChange={(e) => setSolutionStepsStr(e.target.value)}
                        placeholder="es. 1. Aprire Sicurezza di Windows&#10;2. Controllo app e browser > Impostazioni Controllo app intelligente&#10;3. Disattivare e riavviare"
                        className="w-full font-mono bg-[#0A0A0A] border border-[#333] rounded-lg p-2 text-xs text-[#34D399] focus:outline-none focus:border-[#10B981]"
                      />
                    </div>
                  </div>
                )}
                {type === "mcp_server" && (
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                      Configurazione JSON per Claude / Host MCP
                    </label>
                    <textarea
                      rows={3}
                      value={mcpConfig}
                      onChange={(e) => setMcpConfig(e.target.value)}
                      placeholder='{"mcpServers": { ... }}'
                      className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#C5A059] focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                )}

                {type === "ai_skill" && (
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                      System Prompt / Istruzioni della Skill
                    </label>
                    <textarea
                      rows={4}
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Sei un assistente specializzato in..."
                      className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                )}

                {type === "github_repo" && (
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                      Comando Clone / Install
                    </label>
                    <input
                      type="text"
                      value={installCommand}
                      onChange={(e) => setInstallCommand(e.target.value)}
                      placeholder="git clone https://github.com/..."
                      className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                )}

                {/* Tags */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Tag Tematici (separati da virgola)
                  </label>
                  <input
                    type="text"
                    value={tagsStr}
                    onChange={(e) => setTagsStr(e.target.value)}
                    placeholder="mcp, agents, typescript, react"
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                {/* Submit buttons */}
                <div className="pt-3 border-t border-[#1C1C1C] flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-xs text-[#888] hover:text-white bg-[#141414] hover:bg-[#1C1C1C] border border-[#262626] transition-colors"
                  >
                    Annulla
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || !title.trim() || !summary.trim()}
                    className="px-5 py-2 rounded-lg text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#C5A059]/10"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Salvataggio nel DB...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Aggiungi al Vault</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* ========================================================================= */
            /* BULK IMPORT MODE                                                          */
            /* ========================================================================= */
            <div className="space-y-4">
              {/* Top Controls & Explanation */}
              <div className="bg-[#111] border border-[#222] rounded-xl p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#C5A059]" />
                    <span className="text-xs font-mono font-medium text-white">
                      Importazione Multi-Risorsa Intelligente
                    </span>
                  </div>
                  
                  {/* Action Presets */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadBulkSamples}
                      disabled={isBulkProcessing}
                      className="text-[10px] font-mono px-2 py-1 bg-[#1A1A1A] hover:bg-[#252525] border border-[#333] text-[#C5A059] rounded hover:text-white transition-colors flex items-center gap-1"
                      title="Carica un set di esempio con URL GitHub, server MCP e note rapide"
                    >
                      <ListPlus className="w-3 h-3" />
                      <span>Carica Esempi</span>
                    </button>
                    {bulkRawText && (
                      <button
                        type="button"
                        onClick={() => {
                          setBulkRawText("");
                          setBulkItems([]);
                        }}
                        disabled={isBulkProcessing}
                        className="text-[10px] font-mono px-2 py-1 bg-[#1A1A1A] hover:bg-[#252525] border border-[#333] text-[#888] hover:text-red-400 rounded transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Pulisci</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Configuration Row: Splitting mode & Category Default */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#1C1C1C] text-xs">
                  {/* Splitting Strategy */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#777] mb-1">
                      Modalità di Separazione:
                    </label>
                    <div className="flex items-center gap-1 bg-[#0A0A0A] p-1 rounded-lg border border-[#222]">
                      <button
                        type="button"
                        onClick={() => setBulkSplitMode("lines")}
                        disabled={isBulkProcessing}
                        className={`flex-1 py-1 px-2 rounded text-[11px] font-mono text-center transition-colors ${
                          bulkSplitMode === "lines"
                            ? "bg-[#222] text-[#C5A059] font-medium"
                            : "text-[#777] hover:text-[#CCC]"
                        }`}
                      >
                        Una riga per elemento
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkSplitMode("paragraphs")}
                        disabled={isBulkProcessing}
                        className={`flex-1 py-1 px-2 rounded text-[11px] font-mono text-center transition-colors ${
                          bulkSplitMode === "paragraphs"
                            ? "bg-[#222] text-[#C5A059] font-medium"
                            : "text-[#777] hover:text-[#CCC]"
                        }`}
                        title="Ideale per blocchi di testo o snippet separati da una riga vuota o '---'"
                      >
                        Blocchi / Snippet (---)
                      </button>
                    </div>
                  </div>

                  {/* Target Category Preset */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#777] mb-1">
                      Categoria di Destinazione:
                    </label>
                    <select
                      value={bulkDefaultType}
                      onChange={(e) => setBulkDefaultType(e.target.value as any)}
                      disabled={isBulkProcessing}
                      className="w-full bg-[#0A0A0A] border border-[#222] rounded-lg py-1.5 px-2 text-[11px] text-[#DDD] focus:outline-none focus:border-[#C5A059] font-mono"
                    >
                      <option value="auto">✨ Rilevamento Automatico con AI</option>
                      <option value="github_repo">🐙 GitHub Repository</option>
                      <option value="link">🌐 Link & Web Tool</option>
                      <option value="mcp_server">⚡ MCP Server</option>
                      <option value="ai_skill">🤖 AI Skill / Prompt</option>
                      <option value="article">📖 Articolo / Guida</option>
                      <option value="knowledge">🧠 Knowledge (OKF v0.2)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Multi-line Textarea */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-mono text-[#777] mb-1">
                  <span>Incolla URL o snippet di testo ({bulkItems.length} elementi rilevati):</span>
                  <span className="text-[#C5A059]">{bulkSplitMode === "lines" ? "1 riga = 1 risorsa" : "Separatore: riga vuota"}</span>
                </div>
                <textarea
                  rows={5}
                  value={bulkRawText}
                  onChange={(e) => setBulkRawText(e.target.value)}
                  disabled={isBulkProcessing}
                  placeholder={`https://github.com/owner/repository\nhttps://github.com/modelcontextprotocol/servers\nPostgreSQL MCP Server: config per Claude...\nhttps://news.ycombinator.com/...`}
                  className="w-full font-mono bg-[#080808] border border-[#262626] rounded-xl p-3 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#C5A059] leading-relaxed resize-y"
                />
              </div>

              {/* Live Batch Progress Bar & Stats */}
              {(isBulkProcessing || completedCount > 0 || errorCount > 0) && (
                <div className="bg-[#0F0F0F] border border-[#222] rounded-xl p-3.5 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#AAA] flex items-center gap-1.5">
                      {isBulkProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />}
                      <span>
                        {isBulkProcessing
                          ? `Analisi elemento ${bulkProgressIndex} di ${bulkItems.length}...`
                          : `Processo completato: ${completedCount} su ${bulkItems.length} salvate`}
                      </span>
                    </span>
                    <span className="text-[#C5A059] font-bold">{progressPercent}%</span>
                  </div>

                  {/* Visual Bar */}
                  <div className="w-full h-2 bg-[#1A1A1A] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-[#C5A059] to-emerald-400 transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Summary badges */}
                  <div className="flex items-center gap-3 text-[11px] font-mono text-[#888]">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{completedCount} Importate</span>
                    </span>
                    {errorCount > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{errorCount} Errori</span>
                      </span>
                    )}
                    <span className="text-[#666]">
                      {bulkItems.length - completedCount - errorCount} In attesa
                    </span>
                  </div>
                </div>
              )}

              {/* Detected Items List Preview */}
              {bulkItems.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-mono uppercase text-[#777] flex items-center justify-between">
                    <span>Lista Elementi da Importare ({bulkItems.length}):</span>
                    {isBulkProcessing && (
                      <button
                        type="button"
                        onClick={() => {
                          cancelBulkRef.current = true;
                        }}
                        className="text-red-400 hover:text-red-300 text-[10px] font-mono underline"
                      >
                        Interrompi Importazione
                      </button>
                    )}
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {bulkItems.map((item, idx) => {
                      const isItemAnalyzing = item.status === "analyzing";
                      const isItemSaving = item.status === "saving";
                      const isItemSuccess = item.status === "success";
                      const isItemError = item.status === "error";

                      return (
                        <div
                          key={item.id}
                          className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2.5 transition-all ${
                            isItemSuccess
                              ? "bg-emerald-950/20 border-emerald-900/60"
                              : isItemError
                              ? "bg-red-950/20 border-red-900/60"
                              : isItemAnalyzing || isItemSaving
                              ? "bg-[#16140E] border-[#C5A059]/50 shadow-xs"
                              : "bg-[#111] border-[#1F1F1F]"
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <span className="font-mono text-[10px] text-[#666] pt-0.5 shrink-0">
                              #{idx + 1}
                            </span>

                            <div className="min-w-0 flex-1 space-y-0.5">
                              {/* Title or Raw preview */}
                              <div className="font-medium text-white truncate text-[11px]">
                                {item.analyzedData?.title || item.rawText}
                              </div>

                              {/* Subtitle / Details */}
                              <div className="text-[10px] text-[#777] truncate flex items-center gap-2 font-mono">
                                {item.analyzedData ? (
                                  <>
                                    <span className="text-[#C5A059] uppercase">
                                      {item.analyzedData.type}
                                    </span>
                                    {item.analyzedData.tags?.length > 0 && (
                                      <span>· {item.analyzedData.tags.slice(0, 3).join(", ")}</span>
                                    )}
                                  </>
                                ) : (
                                  <span className="truncate">{item.rawText}</span>
                                )}
                              </div>

                              {/* Error message */}
                              {item.errorMessage && (
                                <div className="text-[10px] text-red-400 font-mono flex items-center gap-1 mt-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>{item.errorMessage}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Status Badge & Action */}
                          <div className="flex items-center gap-2 shrink-0">
                            {isItemSuccess && (
                              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                                <Check className="w-3 h-3 stroke-[2.5]" />
                                <span>Salvato</span>
                              </span>
                            )}

                            {isItemAnalyzing && (
                              <span className="flex items-center gap-1 text-[10px] font-mono text-[#C5A059] bg-[#1C170E] border border-[#C5A059]/40 px-2 py-0.5 rounded-full">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Analisi AI...</span>
                              </span>
                            )}

                            {isItemSaving && (
                              <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded-full">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Salvataggio...</span>
                              </span>
                            )}

                            {isItemError && (
                              <button
                                type="button"
                                onClick={() => handleRetrySingleItem(item)}
                                className="flex items-center gap-1 text-[10px] font-mono text-red-300 hover:text-white bg-red-950/80 hover:bg-red-900 border border-red-800 px-2 py-0.5 rounded-full transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Riprova</span>
                              </button>
                            )}

                            {item.status === "idle" && (
                              <button
                                type="button"
                                onClick={() => handleRemoveBulkItem(item.id)}
                                disabled={isBulkProcessing}
                                className="text-[#555] hover:text-red-400 p-1 transition-colors"
                                title="Rimuovi questo elemento"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bulk Footer Actions */}
              <div className="pt-3 border-t border-[#1C1C1C] flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] text-[#666] font-mono flex items-center gap-1">
                  <Database className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>
                    {completedCount === bulkItems.length && bulkItems.length > 0
                      ? "Tutte le risorse sono state salvate nel Vault."
                      : `${bulkItems.length} risorse in coda di elaborazione.`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isBulkProcessing}
                    className="px-4 py-2 rounded-lg text-xs text-[#888] hover:text-white bg-[#141414] hover:bg-[#1C1C1C] border border-[#262626] transition-colors disabled:opacity-50"
                  >
                    {completedCount > 0 ? "Chiudi" : "Annulla"}
                  </button>

                  <button
                    type="button"
                    onClick={handleStartBulkProcessing}
                    disabled={
                      isBulkProcessing ||
                      bulkItems.length === 0 ||
                      (completedCount === bulkItems.length && errorCount === 0)
                    }
                    className="px-5 py-2 rounded-lg text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#C5A059]/10 active:scale-95"
                  >
                    {isBulkProcessing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Analisi in Corso...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-black" />
                        <span>
                          {errorCount > 0 && completedCount > 0
                            ? `Riprova Errori (${errorCount})`
                            : `Avvia Importazione (${bulkItems.length})`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
