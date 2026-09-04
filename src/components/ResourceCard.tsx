import React, { useState, useEffect } from "react";
import { 
  BookOpen, 
  Github, 
  Cpu, 
  Sparkles, 
  Star, 
  ExternalLink, 
  Copy, 
  Check, 
  Terminal, 
  ChevronRight,
  BrainCircuit,
  FileCode,
  FileText,
  Globe,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  Award,
  ThumbsUp,
  ThumbsDown,
  Target,
  Languages,
  Zap,
  Wrench,
  ListChecks,
  Users,
  AlertTriangle,
  Printer,
  FileDown,
  Loader2
} from "lucide-react";
import { ResourceItem, ResourceType } from "../types";
import { formatDate } from "../lib/dateUtils";
import { fetchOpenGraphData, OpenGraphResult } from "../lib/ogUtils";
import { generateAndDownloadResourcePdf } from "../lib/pdfExport";

interface ResourceCardProps {
  resource: ResourceItem;
  onToggleFavorite: (id: string, currentFav: boolean) => void;
  onOpenDetail: (resource: ResourceItem) => void;
  onUpdateProgress?: (id: string, progress: number) => void;
  onPrintPreview?: (resource: ResourceItem) => void;
  onExportGoogleDoc?: (resource: ResourceItem) => void;
  onDownloadPdf?: (resource: ResourceItem) => void;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({
  resource,
  onToggleFavorite,
  onOpenDetail,
  onUpdateProgress,
  onPrintPreview,
  onExportGoogleDoc,
  onDownloadPdf,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [ogData, setOgData] = useState<OpenGraphResult | null>(null);
  const [isLoadingOg, setIsLoadingOg] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Direct client-side generation of offline PDF reference document
  const handleDirectPdfDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGeneratingPdf) return;

    if (onDownloadPdf) {
      onDownloadPdf(resource);
      return;
    }

    setIsGeneratingPdf(true);
    setPdfError(null);
    try {
      await generateAndDownloadResourcePdf(resource);
      setPdfDownloaded(true);
      setTimeout(() => setPdfDownloaded(false), 2500);
    } catch (err) {
      console.error("Errore generazione PDF:", err);
      setPdfError("Errore");
      setTimeout(() => setPdfError(null), 3000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Current reading progress state with optimistic local sync
  const currentProgress = resource.metadata?.readingProgress ?? (resource as any).readingProgress ?? 0;
  const [localProgress, setLocalProgress] = useState<number>(currentProgress);

  useEffect(() => {
    setLocalProgress(resource.metadata?.readingProgress ?? (resource as any).readingProgress ?? 0);
  }, [resource.metadata?.readingProgress, (resource as any).readingProgress]);

  const handleProgressChange = (newProgress: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newProgress)));
    setLocalProgress(clamped);
    if (onUpdateProgress) {
      onUpdateProgress(resource.id, clamped);
    }
  };

  // Fetch Open Graph data dynamically if not already present in resource metadata
  useEffect(() => {
    if (resource.type === "article" && resource.url) {
      // If resource already has OG description and favicon, don't fetch
      if (resource.metadata?.ogDescription && resource.metadata?.favicon) {
        return;
      }

      let isMounted = true;
      setIsLoadingOg(true);
      fetchOpenGraphData(resource.url).then((data) => {
        if (isMounted && data) {
          setOgData(data);
          setIsLoadingOg(false);
        }
      }).catch(() => {
        if (isMounted) setIsLoadingOg(false);
      });

      return () => {
        isMounted = false;
      };
    }
  }, [resource.type, resource.url, resource.metadata?.ogDescription, resource.metadata?.favicon]);

  // Derived Open Graph values
  let domain = resource.metadata?.domain || ogData?.domain;
  if (!domain && resource.url) {
    try {
      domain = new URL(resource.url.startsWith("http") ? resource.url : `https://${resource.url}`).hostname.replace(/^www\./, "");
    } catch {}
  }

  const siteName = resource.metadata?.siteName || ogData?.siteName || domain;
  const metaDescription = resource.metadata?.ogDescription || ogData?.ogDescription;
  const author = resource.metadata?.author || ogData?.author;
  const readingTimeMin = resource.metadata?.readingTimeMin;
  
  const rawFavicon = resource.metadata?.favicon || ogData?.favicon || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null);
  const favicon = faviconError ? (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null) : rawFavicon;

  const getTypeBadge = (type: ResourceType) => {
    switch (type) {
      case "knowledge":
        return {
          label: "OKF Knowledge",
          icon: <BrainCircuit className="w-3 h-3 text-[#C5A059]" />,
          bg: "bg-[#14120D] border border-[#C5A059]/35 text-[#E5C170]",
        };
      case "troubleshooting":
        return {
          label: "Problemi & Fix",
          icon: <Wrench className="w-3 h-3 text-[#F97316]" />,
          bg: "bg-[#16100B] border border-[#F97316]/35 text-[#FB923C]",
        };
      case "github_repo":
        return {
          label: "GitHub Repo",
          icon: <Github className="w-3 h-3 text-[#A855F7]" />,
          bg: "bg-[#140F18] border border-[#A855F7]/30 text-[#C084FC]",
        };
      case "mcp_server":
        return {
          label: "MCP Server",
          icon: <Cpu className="w-3 h-3 text-[#38BDF8]" />,
          bg: "bg-[#0E151C] border border-[#38BDF8]/30 text-[#7DD3FC]",
        };
      case "ai_skill":
        return {
          label: "AI Skill",
          icon: <Sparkles className="w-3 h-3 text-[#10B981]" />,
          bg: "bg-[#0E1713] border border-[#10B981]/30 text-[#34D399]",
        };
      case "link":
        return {
          label: "Link Web",
          icon: <Globe className="w-3 h-3 text-[#06B6D4]" />,
          bg: "bg-[#0A161A] border border-[#06B6D4]/30 text-[#22D3EE]",
        };
      case "article":
      default:
        return {
          label: "Articolo",
          icon: <BookOpen className="w-3 h-3 text-[#F59E0B]" />,
          bg: "bg-[#16130B] border border-[#F59E0B]/30 text-[#FACC15]",
        };
    }
  };

  const badge = getTypeBadge(resource.type);

  // Quick Copy source URL to clipboard
  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (resource.url) {
      navigator.clipboard.writeText(resource.url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Quick 1-click copy action payload
  const handleQuickCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    let textToCopy = "";

    if (resource.type === "knowledge") {
      textToCopy = resource.metadata?.markdownContent || resource.summary || "";
    } else if (resource.type === "mcp_server") {
      textToCopy = resource.metadata?.configSnippet || resource.metadata?.command || resource.url || "";
    } else if (resource.type === "github_repo") {
      textToCopy = resource.metadata?.installCommand || `git clone ${resource.url}` || resource.url || "";
    } else if (resource.type === "ai_skill") {
      textToCopy = resource.metadata?.systemPrompt || resource.summary || "";
    } else {
      textToCopy = resource.url || resource.summary || "";
    }

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getQuickActionLabel = () => {
    switch (resource.type) {
      case "knowledge":
        return "Copia OKF .md";
      case "mcp_server":
        return "Copia Config MCP";
      case "github_repo":
        return "Copia Git Clone";
      case "ai_skill":
        return "Copia Prompt";
      default:
        return "Copia Link";
    }
  };

  const displayDate = formatDate(resource.createdAt) || formatDate(resource.updatedAt) || formatDate(new Date());

  const score = typeof resource.metadata?.score === "number" ? resource.metadata.score : null;

  // Analysis & Content Completion Flags (scannable indicators instead of cognitive text walls)
  const hasExecutiveSummary = Boolean(resource.metadata?.aiExecutiveSummary);
  const keyTakeawaysCount = resource.metadata?.aiKeyTakeaways?.length || 0;
  const hasKeyTakeaways = keyTakeawaysCount > 0;
  const solutionStepsCount = resource.metadata?.solutionSteps?.length || 0;
  const hasTroubleshooting = resource.type === "troubleshooting" || Boolean(resource.metadata?.affectedSystem || resource.metadata?.rootCause || solutionStepsCount > 0);
  const hasUserNotes = Boolean(resource.metadata?.userNotes);
  const prosCount = resource.metadata?.pros?.length || 0;
  const consCount = resource.metadata?.cons?.length || 0;
  const hasEvaluation = Boolean(prosCount > 0 || consCount > 0 || (resource.metadata?.useCases && resource.metadata.useCases.length > 0));
  const relationsCount = resource.metadata?.relations?.length || 0;
  const entitiesCount = resource.metadata?.entities?.length || 0;
  const hasGraphLinks = relationsCount > 0 || entitiesCount > 0;
  const hasItalianTranslation = Boolean(resource.metadata?.translatedSummary || resource.metadata?.translatedTitle || resource.metadata?.translatedContent);

  return (
    <div 
      onClick={() => onOpenDetail(resource)}
      className="group bg-[#0C0C0C] hover:bg-[#101010] border border-[#1C1C1C] hover:border-[#C5A059]/40 hover:shadow-lg p-4 sm:p-5 rounded-xl flex flex-col justify-between transition-all duration-150 cursor-pointer relative"
    >
      <div>
        {/* Top Header: Badge, Status, Date, Favorite */}
        <div className="flex justify-between items-center mb-3 gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className={`text-[10.5px] px-2.5 py-1 rounded-md font-mono font-medium flex items-center gap-1.5 shrink-0 ${badge.bg}`}>
              {badge.icon}
              {badge.label}
            </span>

            {/* OKF Document Badge for ANY resource structured in OKF v0.2 */}
            {(resource.metadata?.okfVersion || resource.metadata?.markdownContent) && (
              <span
                className="text-[10px] bg-[#17140B] text-[#E5C170] border border-[#C5A059]/40 px-2 py-0.5 rounded-md font-mono font-medium flex items-center gap-1 shrink-0"
                title={`Documento con ontologia OKF ${resource.metadata?.okfVersion ? `v${resource.metadata.okfVersion}` : "v0.2"} (Frontmatter YAML, Entità e Relazioni)`}
              >
                <BrainCircuit className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>OKF {resource.metadata?.okfVersion ? `v${resource.metadata.okfVersion}` : "v0.2"}</span>
              </span>
            )}

            {resource.type === "article" && localProgress === 100 && (
              <span className="text-[10px] bg-[#0E1712] text-emerald-300 border border-emerald-800/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                Letto
              </span>
            )}

            {resource.type === "article" && localProgress > 0 && localProgress < 100 && (
              <span className="text-[10px] bg-[#161208] text-[#E5C170] border border-[#C5A059]/30 px-1.5 py-0.5 rounded font-mono shrink-0">
                {localProgress}%
              </span>
            )}

            {resource.metadata?.domain && (
              <span className="text-[10px] bg-[#121212] text-[#888] px-2 py-0.5 rounded font-mono border border-[#1E1E1E] truncate max-w-[120px]">
                {resource.metadata.domain}
              </span>
            )}

            {score !== null && (
              <span 
                className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold flex items-center gap-1 border border-[#2A2416] bg-[#14110A] text-[#E5C170] shrink-0"
                title={`Valutazione Utilità AI: ${score}/100${resource.metadata?.scoreRationale ? ` · ${resource.metadata.scoreRationale}` : ''}`}
              >
                <Award className="w-3 h-3 text-[#C5A059]" />
                <span>{score}/100</span>
              </span>
            )}

            {(resource.metadata?.translatedSummary || resource.metadata?.translatedContent) && (
              <span 
                className="text-[10px] bg-[#0E1712] text-emerald-300 border border-emerald-800/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1 shrink-0"
                title="Traduzione in italiano disponibile"
              >
                <Languages className="w-2.5 h-2.5 text-emerald-400" />
                <span>IT</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[#666] text-[10px] font-mono">
              {displayDate}
            </span>

            {/* Quick Download PDF Icon Button */}
            <button
              type="button"
              onClick={handleDirectPdfDownload}
              disabled={isGeneratingPdf}
              className={`p-1 rounded transition-colors cursor-pointer ${
                pdfDownloaded
                  ? "text-emerald-400 bg-emerald-950/40 border border-emerald-800/40"
                  : isGeneratingPdf
                  ? "text-[#C5A059] bg-[#1A150A] animate-pulse"
                  : "text-[#555] hover:text-[#C5A059] hover:bg-[#181818]"
              }`}
              title={
                pdfDownloaded
                  ? "PDF scaricato con successo!"
                  : isGeneratingPdf
                  ? "Generazione PDF in corso..."
                  : "Scarica documento PDF offline"
              }
              aria-label="Scarica PDF offline"
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-3.5 h-3.5 text-[#C5A059] animate-spin" />
              ) : pdfDownloaded ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <FileDown className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(resource.id, !!resource.isFavorite);
              }}
              className="p-1 text-[#444] hover:text-[#C5A059] transition-colors cursor-pointer"
              title={resource.isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
            >
              <Star 
                className={`w-4 h-4 ${resource.isFavorite ? "fill-[#C5A059] text-[#C5A059]" : ""}`} 
              />
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-serif text-white group-hover:text-[#C5A059] transition-colors leading-snug mb-1.5 line-clamp-2">
          {resource.title}
        </h3>

        {/* Summary (Clean & scannable 2-line abstract) */}
        <p className="text-xs text-[#888] leading-relaxed mb-3 line-clamp-2">
          {resource.summary}
        </p>

        {/* Feature & Analysis Completion Indicators (Mostra SE sono state effettuate, senza ingolfare la griglia con i testi) */}
        {(hasExecutiveSummary || hasKeyTakeaways || hasTroubleshooting || hasUserNotes || hasEvaluation || hasGraphLinks) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3 select-none">
            {/* Sintesi Esecutiva AI */}
            {hasExecutiveSummary && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#181308] border border-[#C5A059]/35 text-[#E5C170]"
                title="Sintesi esecutiva AI elaborata • Clicca per visualizzare nella scheda"
              >
                <Zap className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>Sintesi AI</span>
                <Check className="w-2.5 h-2.5 text-emerald-400" />
              </span>
            )}

            {/* Punti Chiave */}
            {hasKeyTakeaways && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#16140B] border border-[#C5A059]/30 text-[#D8B96E]"
                title={`${keyTakeawaysCount} Punti chiave estratti dall'AI • Clicca per visualizzare nella scheda`}
              >
                <ListChecks className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>{keyTakeawaysCount} Punti Chiave</span>
                <Check className="w-2.5 h-2.5 text-emerald-400" />
              </span>
            )}

            {/* Scheda Diagnostica & Fix */}
            {hasTroubleshooting && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#180E08] border border-[#F97316]/35 text-[#FB923C]"
                title={`Scheda diagnostica problema & fix presente${solutionStepsCount > 0 ? ` (${solutionStepsCount} passaggi verificati)` : ''} • Clicca per visualizzare nella scheda`}
              >
                <Wrench className="w-2.5 h-2.5 text-[#F97316]" />
                <span>Fix{solutionStepsCount > 0 ? ` (${solutionStepsCount} step)` : ' Registrato'}</span>
              </span>
            )}

            {/* Note Personali Archiviate */}
            {hasUserNotes && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#14120D] border border-[#2D2211] text-[#D4B97B]"
                title="Note personali archiviate • Clicca per visualizzare nella scheda"
              >
                <FileText className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>Note</span>
              </span>
            )}

            {/* Valutazione Pro & Contro */}
            {hasEvaluation && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#121212] border border-[#242424] text-[#AAA]"
                title="Valutazione tecnica dettagliata con pro e contro disponibile nella scheda"
              >
                <Award className="w-2.5 h-2.5 text-[#777]" />
                <span>{prosCount > 0 ? `${prosCount} Pro` : ''}{prosCount > 0 && consCount > 0 ? ' · ' : ''}{consCount > 0 ? `${consCount} Contro` : (prosCount === 0 ? 'Valutato' : '')}</span>
              </span>
            )}

            {/* Connessioni Grafo (Relazioni ontologiche o Entità concettuali per qualsiasi risorsa) */}
            {hasGraphLinks && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#14120D] border border-[#C5A059]/30 text-[#E5C170]"
                title={
                  relationsCount > 0
                    ? `${relationsCount} connessioni ontologiche dirette registrate nel grafo`
                    : `${entitiesCount} entità collegate nel grafo ontologico interattivo`
                }
              >
                <BrainCircuit className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>{relationsCount > 0 ? `${relationsCount} Link Grafo` : `${entitiesCount} Entità Grafo`}</span>
              </span>
            )}
          </div>
        )}

        {/* Web Article Source Header (Clean single line without dense meta-descriptions) */}
        {resource.type === "article" && resource.url && (
          <div className="mb-3 bg-[#0A0A0A] border border-[#1C1C1C] rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {favicon ? (
                <img
                  src={favicon}
                  alt={domain || "Favicon"}
                  className="w-3.5 h-3.5 rounded-sm shrink-0 object-contain bg-black/40"
                  referrerPolicy="no-referrer"
                  onError={() => setFaviconError(true)}
                />
              ) : (
                <Globe className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
              )}
              <span className="text-[11px] font-mono text-[#C5A059] font-medium truncate">
                {siteName || domain || "Articolo Web"}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {author && (
                <span className="text-[10px] text-[#777] font-mono truncate max-w-[100px]" title={`Autore: ${author}`}>
                  {author}
                </span>
              )}
              {readingTimeMin && (
                <span className="text-[10px] text-[#666] font-mono bg-[#141414] px-1.5 py-0.5 rounded border border-[#222]">
                  {readingTimeMin}m read
                </span>
              )}
            </div>
          </div>
        )}

        {/* Compact Reading Progress for Articles */}
        {resource.type === "article" && (
          <div 
            className="mb-3 bg-[#0C0C0C] border border-[#1A1A1A] rounded-lg px-2.5 py-2 flex items-center justify-between gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-[11px] font-mono">
              {localProgress === 100 ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : localProgress > 0 ? (
                <Clock className="w-3 h-3 text-[#C5A059] shrink-0" />
              ) : (
                <BookOpen className="w-3 h-3 text-[#666] shrink-0" />
              )}
              <span className={localProgress === 100 ? "text-emerald-400 font-medium" : localProgress > 0 ? "text-[#C5A059]" : "text-[#777]"}>
                {localProgress === 100 ? "Letto (100%)" : localProgress > 0 ? `${localProgress}% letto` : "Da leggere"}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="w-16 sm:w-20 h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${localProgress === 100 ? "bg-emerald-400" : localProgress > 0 ? "bg-[#C5A059]" : "bg-transparent"}`}
                  style={{ width: `${localProgress}%` }}
                />
              </div>

              {localProgress === 100 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProgressChange(0);
                  }}
                  className="text-[10px] font-mono text-[#666] hover:text-[#BBB] px-1 py-0.5 rounded transition-colors"
                  title="Reimposta a non letto"
                >
                  Reset
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProgressChange(100);
                  }}
                  className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-800/40 transition-colors flex items-center gap-1"
                  title="Segna come completato"
                >
                  <Check className="w-2.5 h-2.5" />
                  <span>Segna Letto</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Code snippet preview if MCP or GitHub */}
        {resource.metadata?.command && (
          <div className="mb-3 bg-[#080808] border border-[#181818] rounded-md px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono text-[#AAA] overflow-hidden">
            <div className="flex items-center gap-1.5 truncate">
              <Terminal className="w-3 h-3 text-[#C5A059] shrink-0" />
              <span className="truncate">{resource.metadata.command}</span>
            </div>
          </div>
        )}

        {/* Tags */}
        {resource.tags && resource.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {resource.tags.slice(0, 4).map((tag, idx) => (
              <span 
                key={`tag-${resource.id || 'res'}-${tag}-${idx}`}
                className="text-[10px] font-mono bg-[#141414] text-[#777] border border-[#1F1F1F] px-2 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
            {resource.tags.length > 4 && (
              <span className="text-[10px] font-mono text-[#555] px-1 py-0.5">
                +{resource.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom Footer Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-[#181818] mt-auto gap-2">
        <div className="flex items-center gap-1.5 truncate max-w-[50%] min-w-0">
          {resource.url ? (
            <div className="flex items-center gap-1 min-w-0">
              <a
                href={resource.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] text-[#666] hover:text-[#C5A059] truncate flex items-center gap-1 transition-colors"
                title={resource.url}
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{resource.url.replace(/^https?:\/\//, "")}</span>
              </a>

              <button
                type="button"
                onClick={handleCopyLink}
                className="p-1 text-[#555] hover:text-[#C5A059] hover:bg-[#1A1A1A] rounded transition-colors shrink-0"
                title="Copia link sorgente"
                aria-label="Copia link negli appunti"
              >
                {copiedLink ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <LinkIcon className="w-3 h-3" />
                )}
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-[#C5A059] font-mono flex items-center gap-1 truncate">
              <FileCode className="w-3 h-3 shrink-0" /> OKF Document
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Google Docs Export or Direct Open Button */}
          {resource.metadata?.gdocUrl ? (
            <a
              href={resource.metadata.gdocUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-[#4285F4] hover:text-white bg-[#4285F4]/10 hover:bg-[#4285F4]/30 border border-[#4285F4]/30 px-2 py-1 rounded transition-colors"
              title="Apri Google Doc su Google Drive (cartella 'knowledge')"
            >
              <FileText className="w-3 h-3 text-[#4285F4]" />
              <span className="hidden sm:inline font-medium">GDoc</span>
            </a>
          ) : onExportGoogleDoc ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExportGoogleDoc(resource);
              }}
              className="p-1.5 text-[#777] hover:text-[#4285F4] bg-[#141414] hover:bg-[#1C1C1C] border border-[#222] rounded transition-colors"
              title="Esporta su Google Doc nella cartella 'knowledge'"
              aria-label="Crea Google Doc"
            >
              <FileText className="w-3.5 h-3.5 text-[#AAA] hover:text-[#4285F4]" />
            </button>
          ) : null}

          {/* Dedicated Copy Link Button if URL exists */}
          {resource.url && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1 text-[11px] text-[#888] hover:text-white bg-[#141414] hover:bg-[#1C1C1C] border border-[#222] px-2 py-1 rounded transition-colors"
              title="Copia URL negli appunti"
            >
              {copiedLink ? (
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
          )}

          {/* Specialized Copy Action for specific resource types */}
          {resource.type !== "article" && (
            <button
              type="button"
              onClick={handleQuickCopy}
              className="flex items-center gap-1 text-[11px] text-[#888] hover:text-white bg-[#141414] hover:bg-[#1C1C1C] border border-[#222] px-2 py-1 rounded transition-colors"
              title={getQuickActionLabel()}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copiato!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-[#C5A059]" />
                  <span className="hidden sm:inline">{getQuickActionLabel()}</span>
                </>
              )}
            </button>
          )}

          {/* Direct Download PDF Version Button */}
          <button
            type="button"
            onClick={handleDirectPdfDownload}
            disabled={isGeneratingPdf}
            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors cursor-pointer disabled:opacity-60 ${
              pdfDownloaded
                ? "bg-emerald-950/60 border-emerald-700/60 text-emerald-400"
                : pdfError
                ? "bg-rose-950/60 border-rose-700/60 text-rose-400"
                : isGeneratingPdf
                ? "bg-[#1C160B] border-[#C5A059]/50 text-[#E5C170]"
                : "bg-[#141414] hover:bg-[#1C1C1C] border-[#222] hover:border-[#C5A059]/40 text-[#888] hover:text-[#C5A059]"
            }`}
            title="Scarica direttamente la versione PDF autonoma di questo documento per consultazione offline"
            aria-label="Scarica PDF offline"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 className="w-3 h-3 text-[#C5A059] animate-spin shrink-0" />
                <span className="hidden sm:inline font-mono text-[10px] text-[#C5A059]">PDF...</span>
              </>
            ) : pdfDownloaded ? (
              <>
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline font-mono text-[10px] text-emerald-400">Scaricato!</span>
              </>
            ) : pdfError ? (
              <>
                <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                <span className="hidden sm:inline font-mono text-[10px] text-rose-400">Errore</span>
              </>
            ) : (
              <>
                <FileDown className="w-3 h-3 text-[#C5A059] shrink-0" />
                <span className="hidden sm:inline font-medium">PDF</span>
              </>
            )}
          </button>

          {/* Print Preview Button */}
          {onPrintPreview && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrintPreview(resource);
              }}
              className="p-1.5 text-[#777] hover:text-[#C5A059] bg-[#141414] hover:bg-[#1C1C1C] border border-[#222] rounded transition-colors"
              title="Anteprima di Stampa / Salva in PDF"
              aria-label="Stampa scheda"
            >
              <Printer className="w-3.5 h-3.5 text-[#AAA] hover:text-[#C5A059]" />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(resource);
            }}
            className="px-2.5 py-1 rounded bg-[#18140B] hover:bg-[#251E0E] border border-[#C5A059]/40 hover:border-[#C5A059] text-[#E5C170] hover:text-white text-xs font-medium flex items-center gap-1 transition-all ml-0.5 shadow-xs"
            title="Apri scheda dettagliata"
          >
            <span>{resource.metadata?.okfVersion || resource.type === "knowledge" ? "Dettagli OKF" : "Dettagli"}</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#C5A059]" />
          </button>
        </div>
      </div>
    </div>
  );
};
