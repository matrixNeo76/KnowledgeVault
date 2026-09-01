import React, { useState } from "react";
import { 
  X, 
  BookOpen, 
  Github, 
  Cpu, 
  Sparkles, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Edit3, 
  Save, 
  Terminal,
  Code2,
  Calendar,
  Star,
  BrainCircuit,
  FileCode,
  Globe,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  Award,
  ThumbsUp,
  ThumbsDown,
  Target,
  Loader2,
  Languages,
  Zap,
  ListChecks,
  Users,
  RotateCcw,
  FileText,
  Wrench,
  AlertTriangle,
  Network,
  Share2,
  ArrowRight,
  ChevronRight,
  Tag,
  Plus,
  Download,
  Eye
} from "lucide-react";
import Markdown from "react-markdown";
import { ResourceItem, ResourceType } from "../types";
import { formatDate } from "../lib/dateUtils";
import { fetchOpenGraphData, OpenGraphResult } from "../lib/ogUtils";

interface ResourceModalProps {
  resource: ResourceItem | null;
  allResources?: ResourceItem[];
  onClose: () => void;
  onUpdate: (id: string, updatedData: Partial<ResourceItem>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onToggleFavorite?: (id: string, currentFav: boolean) => void;
  onNavigateToResource?: (resource: ResourceItem) => void;
}

export const ResourceModal: React.FC<ResourceModalProps> = ({
  resource,
  allResources = [],
  onClose,
  onUpdate,
  onDelete,
  onToggleFavorite,
  onNavigateToResource,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ogData, setOgData] = useState<OpenGraphResult | null>(null);
  const [faviconError, setFaviconError] = useState(false);

  // View language toggle: 'original' or 'italian'
  const [viewLanguage, setViewLanguage] = useState<"original" | "italian">("original");

  // AI action loadings & messages
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationMessage, setTranslationMessage] = useState<string | null>(null);

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);

  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [insightMessage, setInsightMessage] = useState<string | null>(null);

  const [isExpandingDoc, setIsExpandingDoc] = useState(false);
  const [expandDocMessage, setExpandDocMessage] = useState<string | null>(null);

  // Active view tab inside dialog: 'overview' | 'doc' | 'graph' | 'evaluation'
  const [activeModalTab, setActiveModalTab] = useState<"overview" | "doc" | "graph" | "evaluation">("overview");

  // Fetch OG if article and missing
  React.useEffect(() => {
    if (resource?.type === "article" && resource.url) {
      if (resource.metadata?.ogDescription && resource.metadata?.favicon) {
        return;
      }
      fetchOpenGraphData(resource.url).then((data) => {
        if (data) setOgData(data);
      });
    }
  }, [resource?.type, resource?.url, resource?.metadata?.ogDescription, resource?.metadata?.favicon]);

  // Editable form state
  const [title, setTitle] = useState(resource?.title || "");
  const [url, setUrl] = useState(resource?.url || "");
  const [summary, setSummary] = useState(resource?.summary || "");
  const [tagsStr, setTagsStr] = useState((resource?.tags || []).join(", "));
  const [type, setType] = useState<ResourceType>(resource?.type || "article");
  const [mcpConfig, setMcpConfig] = useState(resource?.metadata?.configSnippet || "");
  const [systemPrompt, setSystemPrompt] = useState(resource?.metadata?.systemPrompt || "");
  const [installCommand, setInstallCommand] = useState(resource?.metadata?.installCommand || "");
  const [affectedSystem, setAffectedSystem] = useState(resource?.metadata?.affectedSystem || "");
  const [rootCause, setRootCause] = useState(resource?.metadata?.rootCause || "");
  const [attemptedFixesStr, setAttemptedFixesStr] = useState((resource?.metadata?.attemptedFixes || []).join("\n"));
  const [solutionStepsStr, setSolutionStepsStr] = useState((resource?.metadata?.solutionSteps || []).join("\n"));
  const [markdownContent, setMarkdownContent] = useState(resource?.metadata?.markdownContent || "");
  const [readingProgress, setReadingProgress] = useState<number>(resource?.metadata?.readingProgress ?? (resource as any)?.readingProgress ?? 0);

  // Insights & Evaluation state
  const [useCasesStr, setUseCasesStr] = useState((resource?.metadata?.useCases || []).join("\n"));
  const [prosStr, setProsStr] = useState((resource?.metadata?.pros || []).join("\n"));
  const [consStr, setConsStr] = useState((resource?.metadata?.cons || []).join("\n"));
  const [score, setScore] = useState<number>(resource?.metadata?.score ?? 0);
  const [scoreRationale, setScoreRationale] = useState(resource?.metadata?.scoreRationale || "");

  // Translation & Summary state
  const [translatedTitle, setTranslatedTitle] = useState(resource?.metadata?.translatedTitle || "");
  const [translatedSummary, setTranslatedSummary] = useState(resource?.metadata?.translatedSummary || "");
  const [translatedContent, setTranslatedContent] = useState(resource?.metadata?.translatedContent || "");
  const [aiExecutiveSummary, setAiExecutiveSummary] = useState(resource?.metadata?.aiExecutiveSummary || "");
  const [aiKeyTakeawaysStr, setAiKeyTakeawaysStr] = useState((resource?.metadata?.aiKeyTakeaways || []).join("\n"));
  const [aiTargetAudience, setAiTargetAudience] = useState(resource?.metadata?.aiTargetAudience || "");
  const [aiActionItemsStr, setAiActionItemsStr] = useState((resource?.metadata?.aiActionItems || []).join("\n"));
  const [userNotes, setUserNotes] = useState(resource?.metadata?.userNotes || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Synchronize form when resource changes
  React.useEffect(() => {
    if (resource) {
      setTitle(resource.title || "");
      setUrl(resource.url || "");
      setSummary(resource.summary || "");
      setTagsStr((resource.tags || []).join(", "));
      setType(resource.type || "article");
      setMcpConfig(resource.metadata?.configSnippet || "");
      setSystemPrompt(resource.metadata?.systemPrompt || "");
      setInstallCommand(resource.metadata?.installCommand || "");
      setAffectedSystem(resource.metadata?.affectedSystem || "");
      setRootCause(resource.metadata?.rootCause || "");
      setAttemptedFixesStr((resource.metadata?.attemptedFixes || []).join("\n"));
      setSolutionStepsStr((resource.metadata?.solutionSteps || []).join("\n"));
      setMarkdownContent(resource.metadata?.markdownContent || "");
      setReadingProgress(resource.metadata?.readingProgress ?? (resource as any)?.readingProgress ?? 0);
      setUseCasesStr((resource.metadata?.useCases || []).join("\n"));
      setProsStr((resource.metadata?.pros || []).join("\n"));
      setConsStr((resource.metadata?.cons || []).join("\n"));
      setScore(resource.metadata?.score ?? 0);
      setScoreRationale(resource.metadata?.scoreRationale || "");
      setTranslatedTitle(resource.metadata?.translatedTitle || "");
      setTranslatedSummary(resource.metadata?.translatedSummary || "");
      setTranslatedContent(resource.metadata?.translatedContent || "");
      setAiExecutiveSummary(resource.metadata?.aiExecutiveSummary || "");
      setAiKeyTakeawaysStr((resource.metadata?.aiKeyTakeaways || []).join("\n"));
      setAiTargetAudience(resource.metadata?.aiTargetAudience || "");
      setAiActionItemsStr((resource.metadata?.aiActionItems || []).join("\n"));
      setUserNotes(resource.metadata?.userNotes || "");
      setIsEditing(false);
      setInsightMessage(null);
      setTranslationMessage(null);
      setSummaryMessage(null);

      // If translation is already available, default view to Italian if preferred, otherwise original
      if (resource.metadata?.translatedSummary || resource.metadata?.translatedContent) {
        setViewLanguage("italian");
      } else {
        setViewLanguage("original");
      }
    }
  }, [resource]);

  // Escape key handler
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!resource) return null;

  const handleCopy = (text: string, sectionKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // AI Translation Handler
  const handleTranslate = async (forceRegenerate = false) => {
    if (!resource) return;

    if (!forceRegenerate && resource.metadata?.translatedSummary && resource.metadata?.translatedContent) {
      setViewLanguage("italian");
      return;
    }

    setIsTranslating(true);
    setTranslationMessage(null);
    try {
      const res = await fetch("/api/translate-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource }),
      });
      const data = await res.json();
      if (data && data.translation) {
        const { translatedTitle: tTitle, translatedSummary: tSummary, translatedContent: tContent, language, translatedAt } = data.translation;
        const fetchedOrig = data.fetchedOriginalContent;

        setTranslatedTitle(tTitle || "");
        setTranslatedSummary(tSummary || "");
        setTranslatedContent(tContent || "");
        if (fetchedOrig && !markdownContent) {
          setMarkdownContent(fetchedOrig);
        }

        const newMeta: Record<string, any> = {
          ...resource.metadata,
          translatedTitle: tTitle,
          translatedSummary: tSummary,
          translatedContent: tContent,
          translationLanguage: language || "it",
          translatedAt: translatedAt || new Date().toISOString(),
        };

        if (fetchedOrig && (!resource.metadata?.markdownContent || resource.metadata.markdownContent.trim().length === 0)) {
          newMeta.markdownContent = fetchedOrig;
        }

        await onUpdate(resource.id, {
          metadata: newMeta,
        });

        setViewLanguage("italian");
        setTranslationMessage("🇮🇹 Traduzione integrale in italiano dell'articolo completata e salvata nel Vault!");
        setTimeout(() => setTranslationMessage(null), 4000);
      } else {
        setTranslationMessage("⚠️ Impossibile completare la traduzione.");
      }
    } catch (err: any) {
      console.error("Translation error:", err);
      setTranslationMessage("⚠️ Errore durante la traduzione: " + (err.message || ""));
    } finally {
      setIsTranslating(false);
    }
  };

  // AI Executive Summary Handler
  const handleSummarize = async () => {
    if (!resource) return;
    setIsSummarizing(true);
    setSummaryMessage(null);
    try {
      const res = await fetch("/api/summarize-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource }),
      });
      const data = await res.json();
      if (data && data.summaryResult) {
        const {
          executiveSummary,
          keyTakeaways = [],
          targetAudience,
          actionItems = [],
          estimatedReadingTime,
          summarizedAt,
        } = data.summaryResult;

        setAiExecutiveSummary(executiveSummary || "");
        setAiKeyTakeawaysStr(keyTakeaways.join("\n"));
        setAiTargetAudience(targetAudience || "");
        setAiActionItemsStr(actionItems.join("\n"));

        await onUpdate(resource.id, {
          metadata: {
            ...resource.metadata,
            aiExecutiveSummary: executiveSummary,
            aiKeyTakeaways: keyTakeaways,
            aiTargetAudience: targetAudience,
            aiActionItems: actionItems,
            aiSummarizedAt: summarizedAt || new Date().toISOString(),
            ...(estimatedReadingTime ? { readingTimeMin: estimatedReadingTime } : {}),
          },
        });

        setSummaryMessage("⚡ Riassunto Esecutivo & Key Takeaways AI memorizzati nel Vault!");
        setTimeout(() => setSummaryMessage(null), 4000);
      } else {
        setSummaryMessage("⚠️ Impossibile generare il riassunto esecutivo.");
      }
    } catch (err: any) {
      console.error("Summary error:", err);
      setSummaryMessage("⚠️ Errore durante la sintesi: " + (err.message || ""));
    } finally {
      setIsSummarizing(false);
    }
  };

  // AI Technical Insights Handler
  const handleGenerateInsights = async () => {
    if (!resource) return;
    setIsGeneratingInsights(true);
    setInsightMessage(null);
    try {
      const res = await fetch("/api/generate-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource }),
      });
      const data = await res.json();
      if (data && data.insights) {
        const { useCases = [], pros = [], cons = [], score: s = 85, scoreRationale: sRationale = "" } = data.insights;
        
        setUseCasesStr(useCases.join("\n"));
        setProsStr(pros.join("\n"));
        setConsStr(cons.join("\n"));
        setScore(s);
        setScoreRationale(sRationale);

        await onUpdate(resource.id, {
          metadata: {
            ...resource.metadata,
            useCases,
            pros,
            cons,
            score: s,
            scoreRationale: sRationale,
          },
        });
        setInsightMessage("✨ Valutazione AI (Casi d'Uso, Pro/Contro, Voto) completata e salvata!");
        setTimeout(() => setInsightMessage(null), 4000);
      } else {
        setInsightMessage("⚠️ Impossibile generare l'analisi.");
      }
    } catch (err: any) {
      console.error("AI Insights generation error:", err);
      setInsightMessage("⚠️ Errore durante la generazione dell'analisi.");
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  // AI Documentation Deepening & Expansion Handler
  const handleExpandDocumentation = async () => {
    if (!resource) return;
    setIsExpandingDoc(true);
    setExpandDocMessage(null);
    try {
      const res = await fetch("/api/expand-documentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource,
          existingResources: allResources?.slice(0, 25) || [],
        }),
      });
      const data = await res.json();
      if (data?.success && data?.data) {
        const { markdownContent: expandedMd, summary: newSummary, domain, docType, entities, relations } = data.data;

        setMarkdownContent(expandedMd);
        setSummary(newSummary || summary);

        await onUpdate(resource.id, {
          summary: newSummary || resource.summary,
          metadata: {
            ...resource.metadata,
            markdownContent: expandedMd,
            domain: domain || resource.metadata?.domain,
            docType: docType || resource.metadata?.docType,
            entities: entities || resource.metadata?.entities,
            relations: relations || resource.metadata?.relations,
          },
        });
        setExpandDocMessage("✨ Documentazione tecnica OKF v0.2 approfondita ed estesa con successo!");
        setActiveModalTab("doc");
        setTimeout(() => setExpandDocMessage(null), 4000);
      } else {
        setExpandDocMessage("⚠️ Impossibile espandere la documentazione.");
      }
    } catch (err: any) {
      console.error("Expand documentation error:", err);
      setExpandDocMessage("⚠️ Errore durante l'espansione della documentazione.");
    } finally {
      setIsExpandingDoc(false);
    }
  };

  const handleDownloadMarkdown = () => {
    const rawContent = resource.metadata?.markdownContent || markdownContent || `# ${resource.title}\n\n${resource.summary}`;
    const filename = `${resource.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.okf.md`;
    const blob = new Blob([rawContent], { type: "text/markdown;charset=utf-8;" });
    const urlBlob = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = urlBlob;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(urlBlob);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const tagsArray = tagsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const useCasesArr = useCasesStr
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•]\s*/, ""))
      .filter(Boolean);

    const prosArr = prosStr
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•]\s*/, ""))
      .filter(Boolean);

    const consArr = consStr
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•]\s*/, ""))
      .filter(Boolean);

    const takeawaysArr = aiKeyTakeawaysStr
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•\d.]\s*/, ""))
      .filter(Boolean);

    const actionItemsArr = aiActionItemsStr
      .split("\n")
      .map((s) => s.trim().replace(/^[-*•\d.]\s*/, ""))
      .filter(Boolean);

    const updatedMetadata = {
      ...resource.metadata,
      ...(affectedSystem ? { affectedSystem: affectedSystem.trim() } : {}),
      ...(rootCause ? { rootCause: rootCause.trim() } : {}),
      ...(attemptedFixesStr ? {
        attemptedFixes: attemptedFixesStr
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      } : {}),
      ...(solutionStepsStr ? {
        solutionSteps: solutionStepsStr
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      } : {}),
      ...(mcpConfig ? { configSnippet: mcpConfig } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(installCommand ? { installCommand } : {}),
      ...(markdownContent ? { markdownContent } : {}),
      ...(score > 0 ? { score } : { score: undefined }),
      ...(scoreRationale ? { scoreRationale: scoreRationale.trim() } : {}),
      useCases: useCasesArr.length > 0 ? useCasesArr : undefined,
      pros: prosArr.length > 0 ? prosArr : undefined,
      cons: consArr.length > 0 ? consArr : undefined,
      ...(translatedTitle ? { translatedTitle: translatedTitle.trim() } : {}),
      ...(translatedSummary ? { translatedSummary: translatedSummary.trim() } : {}),
      ...(translatedContent ? { translatedContent: translatedContent.trim() } : {}),
      ...(aiExecutiveSummary ? { aiExecutiveSummary: aiExecutiveSummary.trim() } : {}),
      ...(takeawaysArr.length > 0 ? { aiKeyTakeaways: takeawaysArr } : {}),
      ...(aiTargetAudience ? { aiTargetAudience: aiTargetAudience.trim() } : {}),
      ...(actionItemsArr.length > 0 ? { aiActionItems: actionItemsArr } : {}),
      ...(userNotes ? { userNotes: userNotes.trim() } : {}),
      ...(type === "article" ? {
        readingProgress: readingProgress,
        readingStatus: (readingProgress === 100 ? "completed" : readingProgress > 0 ? "in_progress" : "unread") as "unread" | "in_progress" | "completed",
      } : {}),
    };

    const success = await onUpdate(resource.id, {
      title: title.trim(),
      url: url.trim() || "",
      summary: summary.trim(),
      tags: tagsArray,
      type,
      metadata: updatedMetadata,
    });

    setIsSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    const success = await onDelete(resource.id);
    setIsDeleting(false);
    if (success) {
      onClose();
    }
  };

  const getTypeIcon = (t: ResourceType) => {
    switch (t) {
      case "troubleshooting":
        return <Wrench className="w-4 h-4 text-[#F97316]" />;
      case "knowledge":
        return <BrainCircuit className="w-4 h-4 text-[#C5A059]" />;
      case "github_repo":
        return <Github className="w-4 h-4 text-[#A855F7]" />;
      case "link":
        return <Globe className="w-4 h-4 text-[#06B6D4]" />;
      case "mcp_server":
        return <Cpu className="w-4 h-4 text-[#38BDF8]" />;
      case "ai_skill":
        return <Sparkles className="w-4 h-4 text-[#10B981]" />;
      case "article":
      default:
        return <BookOpen className="w-4 h-4 text-[#F59E0B]" />;
    }
  };

  const displayDate = formatDate(resource.createdAt || resource.updatedAt || new Date(), "full");

  // Determine active displayed text based on viewLanguage
  const hasTranslation = !!(resource.metadata?.translatedSummary || resource.metadata?.translatedContent || resource.metadata?.translatedTitle);
  const isItalianView = viewLanguage === "italian" && hasTranslation;

  const currentDisplayTitle = isItalianView && resource.metadata?.translatedTitle ? resource.metadata.translatedTitle : resource.title;
  const currentDisplaySummary = isItalianView && resource.metadata?.translatedSummary ? resource.metadata.translatedSummary : resource.summary;
  const currentDisplayMarkdown = isItalianView && resource.metadata?.translatedContent ? resource.metadata.translatedContent : resource.metadata?.markdownContent;

  const hasExecutiveSummary = !!(resource.metadata?.aiExecutiveSummary || (resource.metadata?.aiKeyTakeaways && resource.metadata.aiKeyTakeaways.length > 0));

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-[#0A0A0A] border border-[#242424] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="p-3.5 sm:p-5 border-b border-[#1C1C1C] flex items-center justify-between gap-2.5 bg-[#080808]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 flex-wrap">
            <span className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md bg-[#141414] border border-[#262626] text-[#C5A059] text-xs font-mono font-medium shrink-0">
              {getTypeIcon(resource.type)}
              <span className="capitalize">{resource.type === "knowledge" ? "OKF Knowledge" : resource.type.replace("_", " ")}</span>
            </span>

            {displayDate && (
              <span className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-[#777] truncate">
                <Calendar className="w-3 h-3 shrink-0 text-[#555]" />
                {displayDate}
              </span>
            )}

            {/* Favorite Star Button in Modal */}
            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => onToggleFavorite(resource.id, !!resource.isFavorite)}
                className={`p-1.5 rounded-lg border transition-all shrink-0 flex items-center gap-1.5 text-xs font-mono ${
                  resource.isFavorite
                    ? "bg-[#251D0C] border-[#C5A059]/50 text-[#C5A059]"
                    : "bg-[#141414] border-[#262626] text-[#666] hover:text-[#C5A059] hover:border-[#383838]"
                }`}
                title={resource.isFavorite ? "Rimuovi dai Preferiti" : "Aggiungi ai Preferiti"}
              >
                <Star className={`w-3.5 h-3.5 ${resource.isFavorite ? "fill-[#C5A059] text-[#C5A059]" : ""}`} />
                <span className="hidden md:inline">{resource.isFavorite ? "Preferito" : "Salva"}</span>
              </button>
            )}
          </div>

          {/* Quick AI & Utility Header Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            {/* AI Documentation Deepening Button */}
            <button
              type="button"
              onClick={handleExpandDocumentation}
              disabled={isExpandingDoc}
              className="flex items-center gap-1.5 text-xs font-mono px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold shadow-sm"
              title="Genera o approfondisci la documentazione tecnica OKF v0.2 con Google Gemini"
            >
              {isExpandingDoc ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                  <span className="hidden xs:inline">Espansione AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-black" />
                  <span className="hidden xs:inline">Approfondisci AI</span>
                </>
              )}
            </button>

            {/* AI Translation Button */}
            <button
              type="button"
              onClick={() => handleTranslate(false)}
              disabled={isTranslating}
              className={`flex items-center gap-1.5 text-xs font-mono px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
                hasTranslation
                  ? viewLanguage === "italian"
                    ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/60 shadow-sm"
                    : "bg-[#141414] text-[#AAA] hover:text-white border-[#2A2A2A]"
                  : "bg-[#161616] hover:bg-[#222] text-[#CCC] hover:text-white border-[#2D2D2D]"
              }`}
              title={hasTranslation ? "Visualizza o rigenera traduzione in italiano" : "Traduci articolo e note in italiano con Google Gemini"}
            >
              {isTranslating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span className="hidden xs:inline">Traduzione...</span>
                </>
              ) : (
                <>
                  <Languages className={`w-3.5 h-3.5 ${hasTranslation ? "text-emerald-400" : "text-[#C5A059]"}`} />
                  <span className="hidden xs:inline">{hasTranslation ? (viewLanguage === "italian" ? "🇮🇹 Italiano" : "Traduci (IT)") : "Traduci AI"}</span>
                </>
              )}
            </button>

            {/* AI Executive Summary Button */}
            <button
              type="button"
              onClick={handleSummarize}
              disabled={isSummarizing}
              className={`flex items-center gap-1.5 text-xs font-mono px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
                hasExecutiveSummary
                  ? "bg-[#251E0E] text-[#E5C170] border-[#C5A059]/50"
                  : "bg-[#161616] hover:bg-[#222] text-[#CCC] hover:text-white border-[#2D2D2D]"
              }`}
              title="Genera sintesi esecutiva, punti chiave e prossimi passi con Google Gemini"
            >
              {isSummarizing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />
                  <span className="hidden xs:inline">Sintesi AI...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span className="hidden xs:inline">{hasExecutiveSummary ? "⚡ Riassunto" : "Riassumi AI"}</span>
                </>
              )}
            </button>

            {/* Download .okf.md */}
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="p-1.5 sm:p-2 text-[#AAA] hover:text-white bg-[#141414] hover:bg-[#1E1E1E] border border-[#2B2B2B] rounded-lg transition-colors shrink-0"
              title="Scarica documento OKF in formato .okf.md"
            >
              <Download className="w-3.5 h-3.5 text-[#C5A059]" />
            </button>

            {resource.url && (
              <button
                type="button"
                onClick={() => handleCopy(resource.url!, "top_link")}
                className="flex items-center gap-1.5 text-xs text-[#888] hover:text-white bg-[#141414] hover:bg-[#1F1F1F] border border-[#262626] px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0"
                title="Copia link sorgente negli appunti"
              >
                {copiedSection === "top_link" ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 hidden xs:inline">Copiato!</span>
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span className="hidden xs:inline">Link</span>
                  </>
                )}
              </button>
            )}

            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 text-xs text-[#888] hover:text-white bg-[#141414] hover:bg-[#1F1F1F] border border-[#262626] px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Modifica</span>
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? "Salvataggio..." : "Salva"}</span>
              </button>
            )}

            <button
              onClick={() => setShowDeleteConfirm((prev) => !prev)}
              disabled={isDeleting}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors shrink-0 ${
                showDeleteConfirm
                  ? "bg-rose-950/80 text-rose-300 border border-rose-800/60"
                  : "text-[#666] hover:text-rose-400 hover:bg-rose-500/10"
              }`}
              title="Elimina risorsa"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              aria-label="Chiudi finestra"
              className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-[#1C1C1C] hover:bg-[#2A2A2A] text-[#EEE] hover:text-white border border-[#333] transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Delete Confirmation In-Modal Banner */}
        {showDeleteConfirm && (
          <div className="px-4 py-3 bg-rose-950/90 border-b border-rose-800/60 text-rose-200 text-xs flex flex-wrap items-center justify-between gap-2.5 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-sans font-medium">Sei sicuro di voler eliminare definitivamente questa risorsa dal database?</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-3 py-1 bg-[#141414] hover:bg-[#222] text-[#AAA] hover:text-white rounded-lg text-xs font-mono border border-[#333] transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeleting ? "Eliminazione..." : "Conferma Eliminazione"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Status / Feedback Banners */}
        {expandDocMessage && (
          <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-800/40 text-emerald-300 text-xs font-mono flex items-center justify-between gap-2 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{expandDocMessage}</span>
            </div>
            <button 
              onClick={() => setExpandDocMessage(null)}
              className="text-emerald-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {translationMessage && (
          <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-800/40 text-emerald-300 text-xs font-mono flex items-center justify-between gap-2 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{translationMessage}</span>
            </div>
            <button 
              onClick={() => setTranslationMessage(null)}
              className="text-emerald-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {summaryMessage && (
          <div className="px-4 py-2 bg-[#251D0C] border-b border-[#C5A059]/40 text-[#E5C170] text-xs font-mono flex items-center justify-between gap-2 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#C5A059] shrink-0" />
              <span>{summaryMessage}</span>
            </div>
            <button 
              onClick={() => setSummaryMessage(null)}
              className="text-[#C5A059] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Navigation Tabs */}
        {!isEditing && (
          <div className="px-4 sm:px-6 border-b border-[#1A1A1A] bg-[#0A0A0A] flex items-center gap-2 sm:gap-4 overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => setActiveModalTab("overview")}
              className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
                activeModalTab === "overview"
                  ? "border-[#C5A059] text-white font-semibold"
                  : "border-transparent text-[#777] hover:text-[#BBB]"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Panoramica</span>
            </button>

            <button
              onClick={() => setActiveModalTab("doc")}
              className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
                activeModalTab === "doc"
                  ? "border-[#C5A059] text-white font-semibold"
                  : "border-transparent text-[#777] hover:text-[#BBB]"
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Documentazione OKF .md</span>
              <span className="text-[10px] font-mono text-[#AAA] bg-[#161616] px-1.5 py-0.2 rounded border border-[#2A2A2A]">
                {((resource.metadata?.markdownContent || markdownContent || "").replace(/^---[\s\S]*?---\n*/, "").trim().split(/\s+/).filter(Boolean).length || 0)} parole
              </span>
            </button>

            <button
              onClick={() => setActiveModalTab("graph")}
              className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
                activeModalTab === "graph"
                  ? "border-[#C5A059] text-white font-semibold"
                  : "border-transparent text-[#777] hover:text-[#BBB]"
              }`}
            >
              <Network className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Connessioni & Grafo</span>
              {((resource.metadata?.relations?.length || 0) + (resource.metadata?.entities?.length || 0) > 0) && (
                <span className="text-[10px] font-mono text-[#AAA] bg-[#161616] px-1.5 py-0.2 rounded border border-[#2A2A2A]">
                  {(resource.metadata?.relations?.length || 0)} link
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveModalTab("evaluation")}
              className={`py-2.5 sm:py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
                activeModalTab === "evaluation"
                  ? "border-[#C5A059] text-white font-semibold"
                  : "border-transparent text-[#777] hover:text-[#BBB]"
              }`}
            >
              <Award className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Valutazione & Score</span>
              {typeof resource.metadata?.score === "number" && resource.metadata.score > 0 && (
                <span className="text-[10px] font-mono text-[#C5A059] bg-[#221A0C] px-1.5 py-0.2 rounded border border-[#C5A059]/40 font-bold">
                  {resource.metadata.score}/100
                </span>
              )}
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6 flex-1 text-[#CCC]">
          {isEditing ? (
            /* ================= EDITING FORM ================= */
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                  Titolo Originale
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-emerald-400 mb-1 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5" />
                  Titolo Tradotto in Italiano (Opzionale)
                </label>
                <input
                  type="text"
                  value={translatedTitle}
                  onChange={(e) => setTranslatedTitle(e.target.value)}
                  placeholder="Es. Introduzione ai Server MCP e Architetture Autonome..."
                  className="w-full bg-[#111] border border-emerald-900/40 rounded-lg p-2.5 text-sm text-emerald-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Categoria
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  >
                    <option value="troubleshooting">Problema & Soluzione (Troubleshooting)</option>
                    <option value="knowledge">Knowledge (OKF v0.2)</option>
                    <option value="link">Link & Web Tool</option>
                    <option value="article">Articolo</option>
                    <option value="github_repo">GitHub Repo</option>
                    <option value="mcp_server">MCP Server</option>
                    <option value="ai_skill">AI Skill</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    URL / Link
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                  Sommario / Descrizione Originale
                </label>
                <textarea
                  rows={4}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#C5A059] mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Note Personali & Commenti Utente
                </label>
                <textarea
                  rows={3}
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="Aggiungi annotazioni, appunti personali o note operative su questa risorsa..."
                  className="w-full bg-[#111] border border-[#2A2315] rounded-lg p-2.5 text-xs text-[#E5C170] focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-emerald-400 mb-1 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5" />
                  Sommario / Descrizione Tradotta in Italiano
                </label>
                <textarea
                  rows={4}
                  value={translatedSummary}
                  onChange={(e) => setTranslatedSummary(e.target.value)}
                  placeholder="Traduzione italiana generata da AI..."
                  className="w-full bg-[#111] border border-emerald-900/40 rounded-lg p-2.5 text-xs text-emerald-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* AI Executive Summary Editor */}
              <div className="bg-[#141009] border border-[#C5A059]/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059] font-medium">
                  <Zap className="w-4 h-4" />
                  <span>Riassunto Esecutivo AI & Punti Chiave</span>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-[#999] mb-1">
                    Sintesi Esecutiva (Executive Summary)
                  </label>
                  <textarea
                    rows={3}
                    value={aiExecutiveSummary}
                    onChange={(e) => setAiExecutiveSummary(e.target.value)}
                    placeholder="Sintesi ad alta densità informativa generata da AI..."
                    className="w-full bg-[#0D0D0D] border border-[#2C2314] rounded-lg p-2.5 text-xs text-[#E5C170] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#999] mb-1">
                      Punti Chiave (Key Takeaways - uno per riga)
                    </label>
                    <textarea
                      rows={3}
                      value={aiKeyTakeawaysStr}
                      onChange={(e) => setAiKeyTakeawaysStr(e.target.value)}
                      placeholder={"- Concetto fondamentale 1\n- Architettura modulare\n- Vantaggio operativo"}
                      className="w-full font-mono bg-[#0D0D0D] border border-[#2C2314] rounded-lg p-2 text-xs text-[#DDD] focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#999] mb-1">
                      Prossimi Passi (Action Items - uno per riga)
                    </label>
                    <textarea
                      rows={3}
                      value={aiActionItemsStr}
                      onChange={(e) => setAiActionItemsStr(e.target.value)}
                      placeholder={"- Testare il comando nel terminale\n- Integrare nel grafo Vault\n- Condividere col team"}
                      className="w-full font-mono bg-[#0D0D0D] border border-[#2C2314] rounded-lg p-2 text-xs text-[#DDD] focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-[#999] mb-1">
                    Profilo Destinatari (Target Audience)
                  </label>
                  <input
                    type="text"
                    value={aiTargetAudience}
                    onChange={(e) => setAiTargetAudience(e.target.value)}
                    placeholder="Es. Sviluppatori Backend, AI Engineers, Team Lead"
                    className="w-full bg-[#0D0D0D] border border-[#2C2314] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                  Tag (separati da virgola)
                </label>
                <input
                  type="text"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  placeholder="mcp, typescript, ai, okf..."
                  className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              {type === "troubleshooting" && (
                <div className="bg-[#140D07] border border-[#F97316]/30 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-mono uppercase text-[#F97316] font-semibold flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Dati Diagnostica & Risoluzione</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#F97316] mb-1">
                      Sistema / Software Coinvolto
                    </label>
                    <input
                      type="text"
                      value={affectedSystem}
                      onChange={(e) => setAffectedSystem(e.target.value)}
                      placeholder="es. PriMus-Av.usBIM (ACCA) / Windows 11"
                      className="w-full bg-[#0C0804] border border-[#331D0F] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#F97316]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#F97316] mb-1">
                      Causa Scatenante / Root Cause
                    </label>
                    <textarea
                      rows={2}
                      value={rootCause}
                      onChange={(e) => setRootCause(e.target.value)}
                      placeholder="es. Smart App Control (SAC) di Windows ha bloccato borlndmm.dll..."
                      className="w-full bg-[#0C0804] border border-[#331D0F] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#F97316]"
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
                      placeholder={"- Rigenerazione cartella .Common\n- Scansione SFC"}
                      className="w-full font-mono bg-[#0C0804] border border-[#331D0F] rounded-lg p-2.5 text-xs text-[#AAA] focus:outline-none focus:border-[#F97316]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-emerald-400 mb-1">
                      Procedura Risolutiva (un passaggio per riga)
                    </label>
                    <textarea
                      rows={3}
                      value={solutionStepsStr}
                      onChange={(e) => setSolutionStepsStr(e.target.value)}
                      placeholder={"1. Disattivare Smart App Control\n2. Riavviare il computer\n3. Verificare l'avvio"}
                      className="w-full font-mono bg-[#0C0804] border border-emerald-900/40 rounded-lg p-2.5 text-xs text-[#34D399] focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {(type === "knowledge" || type === "article") && (
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#AAA] mb-1 flex items-center justify-between">
                    <span>
                      {type === "knowledge" ? "Contenuto Markdown OKF v0.2" : "Testo Completo / Markdown dell'Articolo"}
                    </span>
                    <span className="text-[10px] text-[#666]">
                      {type === "article" ? "Utilizzato per la lettura integrale e traduzione" : "YAML Frontmatter supportato"}
                    </span>
                  </label>
                  <textarea
                    rows={8}
                    value={markdownContent}
                    onChange={(e) => setMarkdownContent(e.target.value)}
                    placeholder={type === "knowledge" ? "# Titolo OKF..." : "Incolla o modifica il testo completo dell'articolo in Markdown..."}
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              )}

              {type === "mcp_server" && (
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Configurazione JSON MCP
                  </label>
                  <textarea
                    rows={4}
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
                    System Prompt / Istruzioni Skill
                  </label>
                  <textarea
                    rows={5}
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
                    Comando di Installazione / Clone
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

              {type === "article" && (
                <div className="bg-[#121212] border border-[#222] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-mono uppercase text-[#888]">
                      Avanzamento Lettura: <span className="text-[#C5A059] font-bold">{readingProgress}%</span>
                    </label>
                    <span className="text-[10px] font-mono text-[#AAA]">
                      {readingProgress === 100 ? "Completato" : readingProgress > 0 ? "In lettura" : "Non iniziato"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={readingProgress}
                      onChange={(e) => setReadingProgress(Number(e.target.value))}
                      className="w-full accent-[#C5A059] cursor-pointer"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      {[0, 25, 50, 75, 100].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setReadingProgress(val)}
                          className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                            readingProgress === val
                              ? "bg-[#C5A059] text-black border-[#C5A059] font-bold"
                              : "bg-[#181818] text-[#AAA] border-[#2E2E2E] hover:bg-[#252525]"
                          }`}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Evaluation, Insights & Score Editor */}
              <div className="bg-[#12100C] border border-[#C5A059]/30 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059] font-medium">
                    <Award className="w-4 h-4" />
                    <span>Valutazione Tecnica, Casi d'Uso e Voto</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateInsights}
                    disabled={isGeneratingInsights}
                    className="flex items-center gap-1.5 text-xs font-mono bg-[#2A210F] hover:bg-[#3D2E14] text-[#E5C170] hover:text-white border border-[#C5A059]/40 px-2.5 py-1 rounded-md transition-colors"
                  >
                    {isGeneratingInsights ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generazione AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Compila con AI</span>
                      </>
                    )}
                  </button>
                </div>

                {insightMessage && (
                  <div className="text-xs font-mono text-[#E5C170] bg-[#1E170A] border border-[#C5A059]/30 px-3 py-2 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>{insightMessage}</span>
                  </div>
                )}

                {/* Score & Rationale Inputs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono uppercase text-[#AAA] flex items-center gap-1.5">
                      <span>Voto di Utilità (1-100):</span>
                      <span className={`font-bold font-mono px-2 py-0.5 rounded text-xs border ${
                        score >= 85 
                          ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/60"
                          : score >= 70
                          ? "bg-[#2A210F] text-[#E5C170] border-[#C5A059]/50"
                          : score > 0
                          ? "bg-[#1E1E1E] text-[#CCC] border-[#333]"
                          : "bg-transparent text-[#666] border-transparent"
                      }`}>
                        {score > 0 ? `${score} / 100` : "Non valutato"}
                      </span>
                    </label>

                    <div className="flex items-center gap-1">
                      {[50, 70, 85, 95, 100].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setScore(v)}
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                            score === v
                              ? "bg-[#C5A059] text-black border-[#C5A059] font-bold"
                              : "bg-[#181818] text-[#888] hover:text-white border-[#2A2A2A]"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    className="w-full accent-[#C5A059] cursor-pointer"
                  />

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#777] mb-1">
                      Motivazione Sintetica del Voto
                    </label>
                    <input
                      type="text"
                      value={scoreRationale}
                      onChange={(e) => setScoreRationale(e.target.value)}
                      placeholder="Es. Tool essenziale per il parsing ontologico con ottima documentazione..."
                      className="w-full bg-[#111] border border-[#262626] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>

                {/* Use Cases Input */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#AAA] mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-[#C5A059]" />
                      Casi di Utilizzo / Scenari (uno per riga)
                    </span>
                    <span className="text-[10px] text-[#666] lowercase">un punto per riga</span>
                  </label>
                  <textarea
                    rows={3}
                    value={useCasesStr}
                    onChange={(e) => setUseCasesStr(e.target.value)}
                    placeholder={"- Integrazione rapida con Claude Desktop\n- Pipeline di analisi ontologica automatizzata\n- Ricerca semantica avanzata"}
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                {/* Pros and Cons Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-emerald-400 mb-1 flex items-center gap-1.5">
                      <ThumbsUp className="w-3.5 h-3.5" />
                      Valutazioni Pro (uno per riga)
                    </label>
                    <textarea
                      rows={3}
                      value={prosStr}
                      onChange={(e) => setProsStr(e.target.value)}
                      placeholder={"- Facile da installare\n- Zero dipendenze esterne\n- Prestazioni eccellenti"}
                      className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-emerald-300 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#E5C170] mb-1 flex items-center gap-1.5">
                      <ThumbsDown className="w-3.5 h-3.5" />
                      Valutazioni Contro (uno per riga)
                    </label>
                    <textarea
                      rows={3}
                      value={consStr}
                      onChange={(e) => setConsStr(e.target.value)}
                      placeholder={"- Richiede Node >= 18\n- Documentazione minimale su Windows"}
                      className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#D5B069] focus:outline-none focus:border-[#C5A059]"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ================= READONLY DETAIL VIEW ================= */
            <>
              {/* Language Switcher Bar (if translation is available) */}
              {hasTranslation && (
                <div className="bg-[#0D1510] border border-emerald-800/40 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <Languages className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-mono text-emerald-300 font-medium">
                      Visualizzazione Lingua:
                    </span>
                    <div className="flex items-center bg-[#070B08] p-1 rounded-lg border border-emerald-900/60 gap-1">
                      <button
                        type="button"
                        onClick={() => setViewLanguage("italian")}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                          viewLanguage === "italian"
                            ? "bg-emerald-600 text-white font-bold shadow-sm"
                            : "text-[#888] hover:text-white"
                        }`}
                      >
                        🇮🇹 Italiano (AI)
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewLanguage("original")}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                          viewLanguage === "original"
                            ? "bg-[#222] text-white font-bold shadow-sm"
                            : "text-[#888] hover:text-white"
                        }`}
                      >
                        🌐 Originale
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTranslate(true)}
                      disabled={isTranslating}
                      className="flex items-center gap-1 text-[11px] font-mono text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/40 px-2.5 py-1 rounded-md transition-colors"
                      title="Rigenera la traduzione italiana con Gemini AI"
                    >
                      {isTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      <span>Rigenera Traduzione</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(resource.metadata?.translatedSummary || resource.metadata?.translatedContent || "", "it_trans")}
                      className="flex items-center gap-1 text-[11px] font-mono text-[#AAA] hover:text-white bg-[#141414] hover:bg-[#202020] border border-[#2A2A2A] px-2.5 py-1 rounded-md transition-colors"
                    >
                      {copiedSection === "it_trans" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-emerald-400" />}
                      <span>{copiedSection === "it_trans" ? "Copiato" : "Copia Traduzione"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Title & URL */}
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {isItalianView && (
                    <span className="text-[10px] bg-emerald-950/90 text-emerald-300 border border-emerald-700/60 px-2 py-0.5 rounded font-mono flex items-center gap-1">
                      <Languages className="w-3 h-3 text-emerald-400" />
                      Tradotto in Italiano
                    </span>
                  )}
                  {resource.metadata?.domain && (
                    <span className="text-[10px] bg-[#141414] text-[#888] px-2 py-0.5 rounded font-mono">
                      {resource.metadata.domain}
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-serif text-white font-medium leading-snug">
                  {currentDisplayTitle}
                </h2>

                {resource.url && (
                  <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#C5A059] hover:underline flex items-center gap-1.5 truncate max-w-[80%]"
                      title={resource.url}
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{resource.url}</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleCopy(resource.url!, "body_link")}
                      className="flex items-center gap-1 text-[11px] font-mono bg-[#141414] hover:bg-[#202020] text-[#AAA] hover:text-white border border-[#2A2A2A] px-2.5 py-1 rounded-md transition-colors shrink-0"
                      title="Copia link sorgente negli appunti"
                    >
                      {copiedSection === "body_link" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Link Copiato!</span>
                        </>
                      ) : (
                        <>
                          <LinkIcon className="w-3 h-3 text-[#C5A059]" />
                          <span>Copia Link</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* ================= AI EXECUTIVE SUMMARY BRIEF CARD ================= */}
              {hasExecutiveSummary ? (
                <div className="bg-[#120E07] border border-[#C5A059]/40 rounded-xl p-4 sm:p-5 space-y-4 shadow-lg shadow-black/40">
                  <div className="flex items-center justify-between gap-2 flex-wrap pb-3 border-b border-[#2C210E]">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#E5C170] font-semibold">
                      <Zap className="w-4 h-4 text-[#C5A059]" />
                      <span>Sintesi Esecutiva & Key Takeaways AI</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSummarize}
                        disabled={isSummarizing}
                        className="flex items-center gap-1 text-[11px] font-mono text-[#E5C170] hover:text-white bg-[#261E0F] hover:bg-[#382B14] border border-[#C5A059]/40 px-2.5 py-1 rounded-md transition-colors"
                        title="Rigenera il riassunto con Gemini AI"
                      >
                        {isSummarizing ? <Loader2 className="w-3 h-3 animate-spin text-[#C5A059]" /> : <RotateCcw className="w-3 h-3 text-[#C5A059]" />}
                        <span>Rigenera</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(
                          `${resource.metadata?.aiExecutiveSummary || ""}\n\nKey Takeaways:\n${(resource.metadata?.aiKeyTakeaways || []).map((t) => `• ${t}`).join("\n")}`,
                          "exec_summary"
                        )}
                        className="flex items-center gap-1 text-[11px] font-mono text-[#AAA] hover:text-white bg-[#141414] hover:bg-[#202020] border border-[#2A2A2A] px-2.5 py-1 rounded-md transition-colors"
                      >
                        {copiedSection === "exec_summary" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#C5A059]" />}
                        <span>{copiedSection === "exec_summary" ? "Copiato" : "Copia Brief"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Executive Overview */}
                  {resource.metadata?.aiExecutiveSummary && (
                    <div className="text-xs sm:text-sm text-[#E2D2B5] leading-relaxed font-sans bg-[#1A140A] p-3.5 rounded-lg border border-[#332611]">
                      {resource.metadata.aiExecutiveSummary}
                    </div>
                  )}

                  {/* Key Takeaways */}
                  {resource.metadata?.aiKeyTakeaways && resource.metadata.aiKeyTakeaways.length > 0 && (
                    <div>
                      <div className="text-[11px] font-mono uppercase text-[#A89060] mb-2 flex items-center gap-1.5 font-medium tracking-wider">
                        <ListChecks className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Punti Chiave & Approfondimenti:</span>
                      </div>
                      <div className="space-y-1.5">
                        {resource.metadata.aiKeyTakeaways.map((takeaway, idx) => (
                          <div
                            key={idx}
                            className="bg-[#18130B] border border-[#2A2011] p-2.5 rounded-lg flex items-start gap-2.5 text-xs text-[#DDD]"
                          >
                            <span className="text-[#C5A059] font-mono font-bold text-xs mt-0.5 shrink-0">
                              0{idx + 1}.
                            </span>
                            <span className="leading-relaxed">{takeaway}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Target Audience & Action Items in Columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {resource.metadata?.aiTargetAudience && (
                      <div className="bg-[#151008] border border-[#2D2110] rounded-lg p-3 space-y-1.5">
                        <div className="text-[11px] font-mono uppercase text-[#C5A059] flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          <span>Profilo Destinatari</span>
                        </div>
                        <p className="text-xs text-[#CCC] leading-relaxed">
                          {resource.metadata.aiTargetAudience}
                        </p>
                      </div>
                    )}

                    {resource.metadata?.aiActionItems && resource.metadata.aiActionItems.length > 0 && (
                      <div className="bg-[#151008] border border-[#2D2110] rounded-lg p-3 space-y-1.5">
                        <div className="text-[11px] font-mono uppercase text-emerald-400 flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5" />
                          <span>Prossimi Passi (Action Items)</span>
                        </div>
                        <ul className="space-y-1 text-xs text-[#CCC]">
                          {resource.metadata.aiActionItems.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Unsummarized Prompt Box */
                <div className="bg-[#0E0C08] border border-[#261E10] rounded-xl p-3.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#C5A059] shrink-0" />
                    <p className="text-xs text-[#AAA]">
                      Vuoi estrarre i punti chiave e l'executive brief di questa risorsa?
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSummarize}
                    disabled={isSummarizing}
                    className="flex items-center gap-1.5 text-xs font-mono bg-[#2A200F] hover:bg-[#3D2E14] text-[#E5C170] hover:text-white border border-[#C5A059]/40 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    {isSummarizing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />
                        <span>Generazione Brief...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Genera Riassunto Esecutivo AI</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Reading Progress Indicator for Article Type in Modal */}
              {resource.type === "article" && (() => {
                const prog = resource.metadata?.readingProgress ?? (resource as any).readingProgress ?? 0;
                return (
                  <div className="bg-[#0D0D0D] border border-[#222] rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        {prog === 100 ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : prog > 0 ? (
                          <Clock className="w-4 h-4 text-[#C5A059]" />
                        ) : (
                          <BookOpen className="w-4 h-4 text-[#666]" />
                        )}
                        <span className={prog === 100 ? "text-emerald-400 font-semibold" : prog > 0 ? "text-[#C5A059] font-semibold" : "text-[#888]"}>
                          Stato Lettura: {prog === 100 ? "Completato (100%)" : prog > 0 ? `In lettura (${prog}%)` : "Da leggere (0%)"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {prog === 100 ? (
                          <button
                            type="button"
                            onClick={() => onUpdate(resource.id, {
                              metadata: { ...resource.metadata, readingProgress: 0, readingStatus: "unread" }
                            })}
                            className="text-xs font-mono text-[#888] hover:text-white bg-[#161616] hover:bg-[#222] px-2.5 py-1 rounded-md border border-[#2A2A2A] transition-colors"
                          >
                            Reimposta a 0%
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onUpdate(resource.id, {
                              metadata: { ...resource.metadata, readingProgress: 100, readingStatus: "completed" }
                            })}
                            className="text-xs font-mono text-emerald-300 hover:text-emerald-200 bg-emerald-950/60 hover:bg-emerald-950/90 px-3 py-1 rounded-md border border-emerald-700/50 transition-colors flex items-center gap-1.5 font-medium"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Segna come Completato</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative">
                      <div className="h-2.5 w-full bg-[#181818] rounded-full overflow-hidden border border-[#282828]">
                        <div
                          className={`h-full transition-[width] duration-500 ease-out rounded-full ${
                            prog === 100
                              ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                              : prog > 0
                              ? "bg-gradient-to-r from-[#B38F46] to-[#E3BE70] shadow-[0_0_10px_rgba(197,160,89,0.3)]"
                              : "bg-transparent"
                          }`}
                          style={{ width: `${prog}%` }}
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={prog}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdate(resource.id, {
                            metadata: {
                              ...resource.metadata,
                              readingProgress: val,
                              readingStatus: val === 100 ? "completed" : val > 0 ? "in_progress" : "unread"
                            }
                          });
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        aria-label="Regola avanzamento lettura"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      {[0, 25, 50, 75, 100].map((step) => {
                        const isCurrent = prog === step;
                        return (
                          <button
                            key={step}
                            type="button"
                            onClick={() => onUpdate(resource.id, {
                              metadata: {
                                ...resource.metadata,
                                readingProgress: step,
                                readingStatus: step === 100 ? "completed" : step > 0 ? "in_progress" : "unread"
                              }
                            })}
                            className={`flex-1 py-1 text-xs font-mono rounded-md transition-all text-center ${
                              isCurrent
                                ? step === 100
                                  ? "bg-emerald-950 text-emerald-300 border border-emerald-600/60 font-semibold"
                                  : step === 0
                                  ? "bg-[#222] text-white border border-[#444] font-semibold"
                                  : "bg-[#2A210F] text-[#E0BA6A] border border-[#C5A059]/60 font-semibold"
                                : "bg-[#141414] hover:bg-[#1E1E1E] text-[#777] hover:text-[#BBB] border border-[#222]"
                            }`}
                          >
                            {step === 0 ? "0%" : `${step}%`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* OKF Ontology Badges if available */}
              {resource.type === "knowledge" && (
                <div className="bg-[#120F0A] border border-[#C5A059]/30 rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <BrainCircuit className="w-4 h-4" />
                      <span>Specifiche Ontologiche OKF v0.2</span>
                    </div>

                    {resource.metadata?.domain && (
                      <span className="text-[10px] font-mono bg-[#1A1A1A] border border-[#333] text-[#AAA] px-2 py-0.5 rounded">
                        Dominio: {resource.metadata.domain}
                      </span>
                    )}
                  </div>

                  {resource.metadata?.entities && resource.metadata.entities.length > 0 && (
                    <div>
                      <div className="text-[11px] font-mono text-[#777] mb-1.5 uppercase">Entità Estratte:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {resource.metadata.entities.map((ent, idx) => {
                          const name = typeof ent === "string" ? ent : ent.name;
                          const entType = typeof ent === "string" ? "entity" : ent.type;
                          return (
                            <span key={idx} className="text-xs font-mono bg-[#1A160E] border border-[#C5A059]/20 text-[#D5B069] px-2 py-0.5 rounded">
                              <span className="text-[#888]">{entType}:</span> {name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {resource.metadata?.relations && resource.metadata.relations.length > 0 && (
                    <div>
                      <div className="text-[11px] font-mono text-[#777] mb-1.5 uppercase">Relazioni nel Grafo:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {resource.metadata.relations.map((rel, idx) => {
                          const src = rel.source || rel.sourceTitle || resource.title;
                          const tgt = rel.target || rel.targetTitle || rel.targetId || "";
                          const rType = rel.type || rel.relationType || "relates_to";
                          return (
                            <div key={idx} className="text-[11px] font-mono bg-[#16130C] border border-[#2D2413] text-[#CCC] p-2 rounded flex items-center justify-between">
                              <span className="font-semibold text-white truncate">{src}</span>
                              <span className="text-[10px] text-[#C5A059] px-1.5 bg-[#000]/40 rounded">{rType}</span>
                              <span className="font-semibold text-white truncate">{tgt}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Troubleshooting & Diagnostic Box */}
              {resource.type === "troubleshooting" && (
                <div className="bg-[#140D07] border border-[#F97316]/30 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#F97316]/20 pb-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#F97316]">
                      <Wrench className="w-4 h-4" />
                      <span className="font-semibold uppercase tracking-wider">Scheda Diagnostica & Soluzione Problema</span>
                    </div>
                    {resource.metadata?.affectedSystem && (
                      <span className="text-[11px] font-mono bg-[#281508] border border-[#F97316]/40 text-[#FDBA74] px-2.5 py-0.5 rounded-full font-medium">
                        {resource.metadata.affectedSystem}
                      </span>
                    )}
                  </div>

                  {resource.metadata?.rootCause && (
                    <div className="bg-[#0C0804] border border-[#331D0F] rounded-lg p-3 space-y-1">
                      <div className="text-[10px] font-mono uppercase text-[#F97316] font-semibold">Causa Scatenante / Root Cause:</div>
                      <p className="text-xs text-[#E5E5E5] leading-relaxed">{resource.metadata.rootCause}</p>
                    </div>
                  )}

                  {resource.metadata?.attemptedFixes && resource.metadata.attemptedFixes.length > 0 && (
                    <div className="bg-[#0C0804] border border-[#331D0F] rounded-lg p-3 space-y-1.5">
                      <div className="text-[10px] font-mono uppercase text-[#A3A3A3] font-semibold flex items-center gap-1.5">
                        <ThumbsDown className="w-3.5 h-3.5 text-[#F97316]" />
                        <span>Tentativi Non Risolutivi / Falsi Positivi:</span>
                      </div>
                      <ul className="space-y-1 text-xs text-[#A3A3A3]">
                        {resource.metadata.attemptedFixes.map((fix, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-[#F97316] font-mono">✕</span>
                            <span>{fix}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {resource.metadata?.solutionSteps && resource.metadata.solutionSteps.length > 0 && (
                    <div className="bg-[#06140D] border border-emerald-800/40 rounded-lg p-3 space-y-2">
                      <div className="text-[11px] font-mono uppercase text-emerald-400 font-semibold flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Procedura Risolutiva Verificata</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(resource.metadata?.solutionSteps?.join("\n") || "", "troubleshoot_solution")}
                          className="text-[10px] font-mono text-emerald-300 hover:text-white bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-700/40 flex items-center gap-1"
                        >
                          {copiedSection === "troubleshoot_solution" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedSection === "troubleshoot_solution" ? "Copiato" : "Copia Procedura"}</span>
                        </button>
                      </div>
                      <ol className="space-y-1.5 text-xs text-[#D1FAE5]">
                        {resource.metadata.solutionSteps.map((step, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-emerald-400 font-mono font-bold shrink-0">{idx + 1}.</span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* Summary & Full Original Text Block */}
              <div className="bg-[#111] border border-[#1C1C1C] rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-[11px] font-mono uppercase text-[#666] tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#888]" />
                    <span>
                      {isItalianView ? "Descrizione & Sintesi (Traduzione Italiana)" : "Descrizione & Sintesi AI"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleCopy(currentDisplaySummary, "modal_summary")}
                      className="text-[11px] font-mono text-[#888] hover:text-white flex items-center gap-1"
                      title="Copia testo sommario"
                    >
                      {copiedSection === "modal_summary" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#888]" />}
                      <span>{copiedSection === "modal_summary" ? "Copiato" : "Copia"}</span>
                    </button>

                    {!hasTranslation && (
                      <button
                        type="button"
                        onClick={() => handleTranslate(false)}
                        disabled={isTranslating}
                        className="text-[11px] font-mono text-[#C5A059] hover:text-[#E5C170] flex items-center gap-1 hover:underline"
                      >
                        <Languages className="w-3 h-3" />
                        <span>Traduci con AI</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-sm leading-relaxed text-[#DDD] space-y-2 prose prose-invert max-w-none">
                  <Markdown>{currentDisplaySummary}</Markdown>
                </div>
              </div>

              {/* Original Full Input / Text Captured - Always clearly accessible if user input is longer or distinct */}
              {resource.rawInput && resource.rawInput.trim().length > 0 && resource.rawInput.trim() !== resource.url && (
                <div className="bg-[#0D0D0D] border border-[#262626] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-[11px] font-mono uppercase text-[#C5A059] tracking-wider flex items-center gap-1.5 font-medium">
                      <Terminal className="w-3.5 h-3.5 text-[#C5A059]" />
                      <span>Testo Integrale Immesso dall'Utente ({resource.rawInput.length} caratteri)</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(resource.rawInput || "", "raw_input")}
                      className="text-[11px] font-mono text-[#AAA] hover:text-white flex items-center gap-1"
                    >
                      {copiedSection === "raw_input" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#C5A059]" />}
                      <span>{copiedSection === "raw_input" ? "Copiato" : "Copia Testo Completo"}</span>
                    </button>
                  </div>

                  <div className="text-xs sm:text-sm font-mono text-[#CCC] bg-[#050505] p-3.5 sm:p-4 rounded-lg border border-[#1C1C1C] overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed scrollbar-thin scrollbar-thumb-[#333]">
                    {resource.rawInput}
                  </div>
                </div>
              )}

              {/* User Custom Notes & Annotations if available */}
              {resource.metadata?.userNotes && resource.metadata.userNotes.trim().length > 0 && (
                <div className="bg-[#120F0A] border border-[#C5A059]/40 rounded-xl p-4 sm:p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-mono uppercase text-[#E5C170] tracking-wider flex items-center gap-1.5 font-medium">
                      <FileText className="w-3.5 h-3.5 text-[#C5A059]" />
                      <span>Note Personali & Commenti Operativi</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(resource.metadata!.userNotes!, "user_notes")}
                      className="text-[11px] font-mono text-[#AAA] hover:text-white flex items-center gap-1"
                    >
                      {copiedSection === "user_notes" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#C5A059]" />}
                      <span>{copiedSection === "user_notes" ? "Copiato" : "Copia Note"}</span>
                    </button>
                  </div>
                  <div className="text-xs sm:text-sm text-[#E2D2B5] leading-relaxed font-sans whitespace-pre-wrap bg-[#1A140A] p-3 rounded-lg border border-[#2D2110]">
                    {resource.metadata.userNotes}
                  </div>
                </div>
              )}

              {/* Technical Evaluation & Insights Card (Score, Use Cases, Pros, Cons) */}
              {(() => {
                const meta = resource.metadata || {};
                const hasScore = typeof meta.score === "number" && meta.score > 0;
                const hasUseCases = Array.isArray(meta.useCases) && meta.useCases.length > 0;
                const hasPros = Array.isArray(meta.pros) && meta.pros.length > 0;
                const hasCons = Array.isArray(meta.cons) && meta.cons.length > 0;
                const hasInsights = hasScore || hasUseCases || hasPros || hasCons || meta.scoreRationale;

                return (
                  <div className="bg-[#0E0C08] border border-[#C5A059]/30 rounded-xl p-4 sm:p-5 space-y-4">
                    {/* Header with AI trigger */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059] font-medium">
                        <Award className="w-4 h-4 text-[#C5A059]" />
                        <span>Analisi Tecnica & Valutazione AI</span>
                      </div>

                      <button
                        type="button"
                        onClick={handleGenerateInsights}
                        disabled={isGeneratingInsights}
                        className="flex items-center gap-1.5 text-xs font-mono bg-[#221A0C] hover:bg-[#332610] text-[#E5C170] hover:text-white border border-[#C5A059]/40 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                        title="Calcola o rigenera casi d'uso, pro, contro e voto tramite Google Gemini AI"
                      >
                        {isGeneratingInsights ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C5A059]" />
                            <span>Elaborazione Gemini AI...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                            <span>{hasInsights ? "Rigenera con AI" : "Calcola con AI"}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Status feedback message */}
                    {insightMessage && (
                      <div className="text-xs font-mono text-[#E5C170] bg-[#1E170A] border border-[#C5A059]/30 px-3 py-2 rounded-lg flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                        <span>{insightMessage}</span>
                      </div>
                    )}

                    {hasInsights ? (
                      <div className="space-y-4">
                        {/* Score & Rationale Block */}
                        {hasScore && (
                          <div className="bg-[#141009] border border-[#2B2110] rounded-lg p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm px-2.5 py-0.5 rounded font-mono font-bold border ${
                                  meta.score! >= 85
                                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/60"
                                    : meta.score! >= 70
                                    ? "bg-[#2A210F] text-[#E5C170] border-[#C5A059]/50"
                                    : "bg-[#1E1E1E] text-[#CCC] border-[#333]"
                                }`}>
                                  {meta.score}/100
                                </span>
                                <span className="text-xs font-mono text-[#AAA]">
                                  {meta.score! >= 85
                                    ? "Alta Utilità / Altamente Raccomandato"
                                    : meta.score! >= 70
                                    ? "Molto Buono / Raccomandato"
                                    : meta.score! >= 50
                                    ? "Utile per Scenari Specifici"
                                    : "Sperimentale / Da Valutare"}
                                </span>
                              </div>

                              <span className="text-[11px] font-mono text-[#777]">Indice di Rilevanza</span>
                            </div>

                            {/* Score progress bar */}
                            <div className="h-2 w-full bg-[#0A0A0A] rounded-full overflow-hidden border border-[#221B0E]">
                              <div
                                className={`h-full transition-all duration-500 rounded-full ${
                                  meta.score! >= 85
                                    ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                                    : meta.score! >= 70
                                    ? "bg-gradient-to-r from-[#B38F46] to-[#E3BE70]"
                                    : "bg-gradient-to-r from-[#666] to-[#999]"
                                }`}
                                style={{ width: `${meta.score}%` }}
                              />
                            </div>

                            {meta.scoreRationale && (
                              <p className="text-xs text-[#CCC] font-sans leading-relaxed italic border-l-2 border-[#C5A059]/40 pl-2.5 my-1">
                                "{meta.scoreRationale}"
                              </p>
                            )}
                          </div>
                        )}

                        {/* Use Cases / Scenarios */}
                        {hasUseCases && (
                          <div>
                            <div className="text-[11px] font-mono uppercase text-[#999] mb-2 flex items-center gap-1.5 tracking-wider">
                              <Target className="w-3.5 h-3.5 text-[#C5A059]" />
                              <span>Casi di Utilizzo & Scenari Applicativi:</span>
                            </div>
                            <div className="space-y-1.5">
                              {meta.useCases!.map((useCase, idx) => (
                                <div
                                  key={idx}
                                  className="bg-[#15120B] border border-[#2A2214] hover:border-[#3D301B] p-2.5 rounded-lg flex items-start gap-2 text-xs text-[#DDD] transition-colors"
                                >
                                  <span className="text-[#C5A059] font-mono font-bold text-xs mt-0.5 shrink-0">
                                    0{idx + 1}.
                                  </span>
                                  <span className="leading-relaxed">{useCase}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Pros & Cons Columns */}
                        {(hasPros || hasCons) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {/* Pros Box */}
                            <div className="bg-[#0A140F] border border-emerald-900/40 rounded-lg p-3 space-y-2">
                              <div className="text-xs font-mono uppercase text-emerald-400 font-medium flex items-center gap-1.5">
                                <ThumbsUp className="w-3.5 h-3.5" />
                                <span>Punti di Forza (Pro)</span>
                              </div>
                              {hasPros ? (
                                <ul className="space-y-1.5 text-xs text-emerald-200/90 font-sans">
                                  {meta.pros!.map((pro, idx) => (
                                    <li key={idx} className="flex items-start gap-1.5 leading-snug">
                                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                      <span>{pro}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-[#666] font-mono">Nessun pro registrato.</p>
                              )}
                            </div>

                            {/* Cons Box */}
                            <div className="bg-[#140F08] border border-[#C5A059]/25 rounded-lg p-3 space-y-2">
                              <div className="text-xs font-mono uppercase text-[#E5C170] font-medium flex items-center gap-1.5">
                                <ThumbsDown className="w-3.5 h-3.5" />
                                <span>Limiti / Considerazioni (Contro)</span>
                              </div>
                              {hasCons ? (
                                <ul className="space-y-1.5 text-xs text-[#DDD] font-sans">
                                  {meta.cons!.map((con, idx) => (
                                    <li key={idx} className="flex items-start gap-1.5 leading-snug">
                                      <span className="text-[#C5A059] font-bold text-xs shrink-0 mt-0.5">•</span>
                                      <span>{con}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-[#666] font-mono">Nessun contro registrato.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Empty State with CTA */
                      <div className="bg-[#141009] border border-[#281F0E] rounded-lg p-4 text-center space-y-2.5">
                        <p className="text-xs text-[#AAA] leading-relaxed max-w-lg mx-auto">
                          Nessuna analisi tecnica ancora registrata. Puoi inserire i casi d'uso, pro, contro e il voto in modalità <strong className="text-white">Modifica</strong> oppure cliccare sul pulsante qui sotto per calcolarli istantaneamente con Google Gemini.
                        </p>
                        <button
                          type="button"
                          onClick={handleGenerateInsights}
                          disabled={isGeneratingInsights}
                          className="inline-flex items-center gap-2 text-xs font-mono bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg"
                        >
                          {isGeneratingInsights ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-black" />
                              <span>Generazione in corso...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 text-black" />
                              <span>Genera Analisi Completa con AI</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Markdown Content Viewer (OKF / Article / Full Web Doc) */}
              {currentDisplayMarkdown && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <FileCode className="w-4 h-4 text-[#C5A059]" />
                      <span className="font-semibold text-white">
                        {resource.type === "article" ? "Testo Completo dell'Articolo" : "Documento Integrale"}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${
                        isItalianView 
                          ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/50" 
                          : "bg-[#181818] text-[#888] border-[#2E2E2E]"
                      }`}>
                        {isItalianView ? "🇮🇹 Tradotto in Italiano" : "🌐 Testo Originale"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(currentDisplayMarkdown, "docmd")}
                        className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                      >
                        {copiedSection === "docmd" ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copiato</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-[#C5A059]" />
                            <span>Copia Markdown</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="text-xs font-mono text-[#CCC] bg-[#050505] p-4 sm:p-5 rounded-lg overflow-x-auto border border-[#181818] max-h-96 overflow-y-auto leading-relaxed prose prose-invert max-w-none">
                    <Markdown>{currentDisplayMarkdown}</Markdown>
                  </div>
                </div>
              )}

              {/* MCP Specific Config block */}
              {resource.type === "mcp_server" && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <Code2 className="w-4 h-4" />
                      <span>Configurazione MCP (`claude_desktop_config.json`)</span>
                    </div>

                    <button
                      onClick={() => handleCopy(resource.metadata?.configSnippet || resource.metadata?.command || "", "mcp")}
                      className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                    >
                      {copiedSection === "mcp" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiato</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#C5A059]" />
                          <span>Copia JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="text-xs font-mono text-[#D5B069] bg-[#050505] p-3 rounded-lg overflow-x-auto border border-[#181818]">
                    {resource.metadata?.configSnippet || (
                      resource.metadata?.command 
                        ? `// Comando di avvio:\n${resource.metadata.command}` 
                        : "// Nessuna config JSON registrata"
                    )}
                  </pre>

                  {resource.metadata?.toolsProvided && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-[11px] font-mono text-[#666]">Tool forniti:</span>
                      {resource.metadata.toolsProvided.map((tool, idx) => (
                        <span key={idx} className="bg-[#141414] text-[#AAA] font-mono text-[10px] px-2 py-0.5 rounded border border-[#222]">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AI Skill specific Prompt block */}
              {resource.type === "ai_skill" && resource.metadata?.systemPrompt && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <Sparkles className="w-4 h-4" />
                      <span>System Prompt & Istruzioni Skill</span>
                    </div>

                    <button
                      onClick={() => handleCopy(resource.metadata?.systemPrompt || "", "skill")}
                      className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                    >
                      {copiedSection === "skill" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiato</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#C5A059]" />
                          <span>Copia Prompt</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="text-xs font-mono text-[#CCC] bg-[#050505] p-3 rounded-lg overflow-x-auto border border-[#181818] whitespace-pre-wrap leading-relaxed">
                    {resource.metadata.systemPrompt}
                  </pre>

                  {resource.metadata?.recommendedModel && (
                    <div className="mt-2 text-[11px] font-mono text-[#666]">
                      Modello suggerito: <span className="text-[#C5A059]">{resource.metadata.recommendedModel}</span>
                    </div>
                  )}
                </div>
              )}

              {/* GitHub Clone command */}
              {resource.type === "github_repo" && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#AAA]">
                      <Terminal className="w-4 h-4 text-[#C5A059]" />
                      <span>{resource.metadata?.installCommand || `git clone ${resource.url}`}</span>
                    </div>

                    <button
                      onClick={() => handleCopy(resource.metadata?.installCommand || `git clone ${resource.url}`, "clone")}
                      className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                    >
                      {copiedSection === "clone" ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-[#C5A059]" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Article Open Graph preview if article type */}
              {resource.type === "article" && resource.url && (() => {
                let domain = resource.metadata?.domain || ogData?.domain;
                if (!domain && resource.url) {
                  try {
                    domain = new URL(resource.url.startsWith("http") ? resource.url : `https://${resource.url}`).hostname.replace(/^www\./, "");
                  } catch {}
                }
                const siteName = resource.metadata?.siteName || ogData?.siteName || domain;
                const metaDesc = resource.metadata?.ogDescription || ogData?.ogDescription;
                const rawFav = resource.metadata?.favicon || ogData?.favicon || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null);
                const fav = faviconError ? (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null) : rawFav;
                const img = resource.metadata?.ogImage || ogData?.ogImage;

                return (
                  <div className="bg-[#0A0A0A] border border-[#222] rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                        {fav ? (
                          <img
                            src={fav}
                            alt={domain || "Favicon"}
                            className="w-4 h-4 rounded-sm shrink-0 object-contain bg-black/40"
                            referrerPolicy="no-referrer"
                            onError={() => setFaviconError(true)}
                          />
                        ) : (
                          <Globe className="w-4 h-4" />
                        )}
                        <span>Anteprima Open Graph & Metadati Web</span>
                      </div>

                      {domain && (
                        <span className="text-[10px] font-mono bg-[#141414] border border-[#262626] text-[#AAA] px-2 py-0.5 rounded">
                          {siteName || domain}
                        </span>
                      )}
                    </div>

                    {img && (
                      <div className="rounded-lg overflow-hidden border border-[#222] max-h-48 w-full bg-black/50">
                        <img 
                          src={img} 
                          alt="Open Graph preview" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {metaDesc && (
                      <div className="bg-[#121212] border border-[#1E1E1E] rounded-lg p-3 text-xs text-[#AAA] italic leading-relaxed">
                        <div className="text-[10px] font-mono uppercase text-[#666] mb-1 not-italic">Meta Description Estratta:</div>
                        "{metaDesc}"
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-[#777] font-mono flex-wrap pt-1">
                      {resource.metadata?.author && (
                        <span>Autore: <span className="text-white">{resource.metadata.author}</span></span>
                      )}
                      {resource.metadata?.readingTimeMin && (
                        <span>Tempo di lettura: <span className="text-[#C5A059]">{resource.metadata.readingTimeMin} min</span></span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Knowledge Graph Connections & Linked Nodes Explorer */}
              {(() => {
                // Compute all connected resources and relationships
                const connectedItems: {
                  targetResource?: ResourceItem;
                  targetTitle: string;
                  relationType: string;
                  badgeColor: string;
                  reason: string;
                  isInternalDoc: boolean;
                }[] = [];

                const thisEntities = (resource.metadata?.entities || []).map((e: any) => 
                  (typeof e === "string" ? e : e?.name || "").toLowerCase().trim()
                ).filter(Boolean);

                const thisTags = (resource.tags || []).map((t) => t.toLowerCase().trim());
                const thisDomain = resource.metadata?.domain?.toLowerCase().trim();

                // 1. Explicit OKF relations
                if (resource.metadata?.relations && Array.isArray(resource.metadata.relations)) {
                  resource.metadata.relations.forEach((rel) => {
                    const tId = rel.targetId;
                    const tTitle = rel.targetTitle || rel.target || (rel as any).targetName || tId || "Documento";
                    const matchedRes = allResources.find((r) => 
                      (tId && r.id === tId) || 
                      r.title.toLowerCase().trim() === tTitle.toLowerCase().trim() ||
                      (tTitle.length >= 4 && r.title.toLowerCase().includes(tTitle.toLowerCase()))
                    );

                    connectedItems.push({
                      targetResource: matchedRes,
                      targetTitle: matchedRes?.title || tTitle,
                      relationType: rel.relationType || "references",
                      badgeColor: "bg-[#C5A059]/20 text-[#E5C170] border-[#C5A059]/40",
                      reason: rel.description || `Relazione ontologica OKF v0.2: ${rel.relationType || "collegato"}`,
                      isInternalDoc: !!matchedRes,
                    });
                  });
                }

                // 2. Incoming explicit relations from other resources
                allResources.forEach((other) => {
                  if (other.id === resource.id) return;
                  if (other.metadata?.relations && Array.isArray(other.metadata.relations)) {
                    other.metadata.relations.forEach((rel) => {
                      const tId = rel.targetId;
                      const tTitle = (rel.targetTitle || rel.target || (rel as any).targetName || "").toLowerCase().trim();
                      if (
                        (tId && tId === resource.id) ||
                        (tTitle && (resource.title.toLowerCase().trim() === tTitle || resource.title.toLowerCase().includes(tTitle)))
                      ) {
                        if (!connectedItems.some((c) => c.targetResource?.id === other.id)) {
                          connectedItems.push({
                            targetResource: other,
                            targetTitle: other.title,
                            relationType: `Citato da: ${rel.relationType || "references"}`,
                            badgeColor: "bg-purple-950/60 text-purple-300 border-purple-800/40",
                            reason: `"${other.title}" dichiara una relazione verso questa risorsa`,
                            isInternalDoc: true,
                          });
                        }
                      }
                    });
                  }
                });

                // 3. Shared entities and concepts
                allResources.forEach((other) => {
                  if (other.id === resource.id) return;
                  if (connectedItems.some((c) => c.targetResource?.id === other.id)) return;

                  const otherEntities = (other.metadata?.entities || []).map((e: any) => 
                    (typeof e === "string" ? e : e?.name || "").toLowerCase().trim()
                  ).filter(Boolean);

                  const commonEnts = thisEntities.filter((e) => otherEntities.includes(e) && e.length > 2);
                  if (commonEnts.length > 0) {
                    connectedItems.push({
                      targetResource: other,
                      targetTitle: other.title,
                      relationType: "Entità Condivisa",
                      badgeColor: "bg-sky-950/60 text-sky-300 border-sky-800/40",
                      reason: `Entità in comune: ${commonEnts.slice(0, 3).join(", ")}`,
                      isInternalDoc: true,
                    });
                  }
                });

                // 4. Shared tags
                allResources.forEach((other) => {
                  if (other.id === resource.id) return;
                  if (connectedItems.some((c) => c.targetResource?.id === other.id)) return;

                  const otherTags = (other.tags || []).map((t) => t.toLowerCase().trim());
                  const sharedTags = thisTags.filter((t) => otherTags.includes(t) && t.length > 1);

                  if (sharedTags.length >= 1) {
                    connectedItems.push({
                      targetResource: other,
                      targetTitle: other.title,
                      relationType: `#${sharedTags[0]}`,
                      badgeColor: "bg-amber-950/60 text-amber-300 border-amber-800/40",
                      reason: `Tag in comune: ${sharedTags.map((t) => "#" + t).join(", ")}`,
                      isInternalDoc: true,
                    });
                  }
                });

                // 5. Shared Domain (if applicable)
                if (thisDomain && thisDomain !== "general") {
                  allResources.forEach((other) => {
                    if (other.id === resource.id) return;
                    if (connectedItems.some((c) => c.targetResource?.id === other.id)) return;

                    const otherDomain = other.metadata?.domain?.toLowerCase().trim();
                    if (otherDomain && otherDomain === thisDomain) {
                      connectedItems.push({
                        targetResource: other,
                        targetTitle: other.title,
                        relationType: `Dominio: ${resource.metadata?.domain}`,
                        badgeColor: "bg-emerald-950/60 text-emerald-300 border-emerald-800/40",
                        reason: `Stesso dominio concettuale (${resource.metadata?.domain})`,
                        isInternalDoc: true,
                      });
                    }
                  });
                }

                return (
                  <div className="bg-[#0B0B0B] border border-[#242424] rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059] font-medium">
                        <Network className="w-4 h-4 text-[#C5A059]" />
                        <span>Nodi e Relazioni nel Knowledge Graph ({connectedItems.length} connessioni attive)</span>
                      </div>

                      <div className="text-[11px] font-mono text-[#777]">
                        Grafo Topologico OKF
                      </div>
                    </div>

                    {connectedItems.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        {connectedItems.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              if (item.targetResource && onNavigateToResource) {
                                onNavigateToResource(item.targetResource);
                              }
                            }}
                            className={`p-3 rounded-lg border bg-[#121212] flex flex-col justify-between gap-2 transition-all ${
                              item.targetResource && onNavigateToResource
                                ? "border-[#262626] hover:border-[#C5A059]/60 hover:bg-[#181818] cursor-pointer group"
                                : "border-[#1F1F1F]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-sans text-xs font-medium text-white group-hover:text-[#C5A059] transition-colors line-clamp-2">
                                {item.targetTitle}
                              </div>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${item.badgeColor}`}>
                                {item.relationType}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1C1C1C] text-[11px] text-[#888]">
                              <span className="truncate">{item.reason}</span>
                              {item.targetResource && onNavigateToResource && (
                                <ChevronRight className="w-3.5 h-3.5 text-[#666] group-hover:text-[#C5A059] shrink-0 transition-transform group-hover:translate-x-0.5" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-[#121212] border border-[#1C1C1C] rounded-lg p-3.5 text-center space-y-2">
                        <p className="text-xs text-[#888] font-sans leading-relaxed">
                          Nessun altro documento nel Vault condivide attualmente gli stessi tag, entità o collegamenti diretti con questa risorsa.
                        </p>
                        <div className="text-[11px] font-mono text-[#AAA]">
                          💡 <strong className="text-[#C5A059]">Come collegarlo:</strong> Clicca su <em>Modifica</em> per aggiungere tag comuni ad altre risorse (es. <span className="text-[#C5A059]">#windows</span>, <span className="text-[#C5A059]">#os</span>, <span className="text-[#C5A059]">#tools</span>) o aggiungi altri documenti correlati.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Tags */}
              {resource.tags && resource.tags.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono uppercase text-[#666] mb-2 tracking-wider">
                    Tag Associati
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {resource.tags.map((t, idx) => (
                      <span
                        key={idx}
                        className="text-xs font-mono bg-[#141414] text-[#AAA] border border-[#222] px-2.5 py-1 rounded-md"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
