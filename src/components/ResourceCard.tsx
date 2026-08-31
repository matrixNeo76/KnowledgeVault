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
  Globe,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  Award,
  ThumbsUp,
  ThumbsDown,
  Target,
  Languages,
  Zap
} from "lucide-react";
import { ResourceItem, ResourceType } from "../types";
import { formatDate } from "../lib/dateUtils";
import { fetchOpenGraphData, OpenGraphResult } from "../lib/ogUtils";

interface ResourceCardProps {
  resource: ResourceItem;
  onToggleFavorite: (id: string, currentFav: boolean) => void;
  onOpenDetail: (resource: ResourceItem) => void;
  onUpdateProgress?: (id: string, progress: number) => void;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({
  resource,
  onToggleFavorite,
  onOpenDetail,
  onUpdateProgress,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [ogData, setOgData] = useState<OpenGraphResult | null>(null);
  const [isLoadingOg, setIsLoadingOg] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

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
          label: "OKF v0.2 Knowledge",
          icon: <BrainCircuit className="w-3 h-3 text-[#C5A059]" />,
          bg: "bg-[#1C160B] border border-[#C5A059]/40 text-[#C5A059]",
        };
      case "github_repo":
        return {
          label: "GitHub Repo",
          icon: <Github className="w-3 h-3 text-[#A855F7]" />,
          bg: "bg-[#18121E] border border-[#A855F7]/30 text-[#A855F7]",
        };
      case "mcp_server":
        return {
          label: "MCP Server",
          icon: <Cpu className="w-3 h-3 text-[#38BDF8]" />,
          bg: "bg-[#0E1A24] border border-[#38BDF8]/30 text-[#38BDF8]",
        };
      case "ai_skill":
        return {
          label: "AI Skill",
          icon: <Sparkles className="w-3 h-3 text-[#10B981]" />,
          bg: "bg-[#0E1F18] border border-[#10B981]/30 text-[#10B981]",
        };
      case "link":
        return {
          label: "Link Web",
          icon: <Globe className="w-3 h-3 text-[#06B6D4]" />,
          bg: "bg-[#081820] border border-[#06B6D4]/30 text-[#06B6D4]",
        };
      case "article":
      default:
        return {
          label: "Articolo",
          icon: <BookOpen className="w-3 h-3 text-[#F59E0B]" />,
          bg: "bg-[#1A160E] border border-[#F59E0B]/30 text-[#F59E0B]",
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
  const scoreBorderClass = score !== null
    ? score >= 85
      ? "border-emerald-700/50 hover:border-emerald-500/80 shadow-[0_0_25px_-6px_rgba(16,185,129,0.15)] bg-gradient-to-b from-[#0E1511]/90 to-[#0F0F0F]"
      : score >= 70
      ? "border-[#C5A059]/45 hover:border-[#C5A059]/80 shadow-[0_0_25px_-6px_rgba(197,160,89,0.12)] bg-gradient-to-b from-[#14110A]/90 to-[#0F0F0F]"
      : "border-[#2A2A2A] hover:border-[#444]"
    : "border-[#1F1F1F] hover:border-[#333]";

  return (
    <div 
      onClick={() => onOpenDetail(resource)}
      className={`group bg-[#0F0F0F] border ${scoreBorderClass} hover:shadow-xl hover:shadow-black/50 p-5 rounded-xl flex flex-col justify-between transition-all duration-200 cursor-pointer relative`}
    >
      <div>
        {/* Top Header: Badge, Date, Favorite */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] px-2.5 py-1 rounded-md tracking-wide uppercase font-mono font-semibold flex items-center gap-1.5 ${badge.bg}`}>
              {badge.icon}
              {badge.label}
            </span>

            {resource.type === "article" && localProgress === 100 && (
              <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-700/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                Letto
              </span>
            )}

            {resource.type === "article" && localProgress > 0 && localProgress < 100 && (
              <span className="text-[10px] bg-[#221A0C] text-[#C5A059] border border-[#C5A059]/30 px-1.5 py-0.5 rounded font-mono">
                {localProgress}%
              </span>
            )}

            {resource.metadata?.domain && (
              <span className="text-[10px] bg-[#141414] text-[#888] px-2 py-0.5 rounded font-mono">
                {resource.metadata.domain}
              </span>
            )}

            {resource.metadata?.protocol && (
              <span className="text-[10px] bg-[#141414] text-[#888] px-2 py-0.5 rounded font-mono">
                {resource.metadata.protocol}
              </span>
            )}

            {score !== null && (
              <span 
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1 border shadow-sm ${
                  score >= 85
                    ? "bg-emerald-950/90 text-emerald-300 border-emerald-600/60 shadow-emerald-950/50"
                    : score >= 70
                    ? "bg-[#2A210F] text-[#E5C170] border-[#C5A059]/60 shadow-amber-950/50"
                    : "bg-[#1C1C1C] text-[#AAA] border-[#333]"
                }`}
                title={`Valutazione Utilità AI: ${score}/100${resource.metadata?.scoreRationale ? ` · ${resource.metadata.scoreRationale}` : ''}`}
              >
                <Award className={`w-3 h-3 ${score >= 85 ? "text-emerald-400" : score >= 70 ? "text-[#C5A059]" : "text-[#888]"}`} />
                <span>{score}/100</span>
              </span>
            )}

            {(resource.metadata?.translatedSummary || resource.metadata?.translatedContent) && (
              <span 
                className="text-[10px] bg-emerald-950/70 text-emerald-300 border border-emerald-700/50 px-1.5 py-0.5 rounded font-mono flex items-center gap-1"
                title="Traduzione in italiano disponibile"
              >
                <Languages className="w-2.5 h-2.5 text-emerald-400" />
                <span>IT</span>
              </span>
            )}

            {resource.metadata?.aiExecutiveSummary && (
              <span 
                className="text-[10px] bg-[#221A0C] text-[#E5C170] border border-[#C5A059]/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1"
                title="Riassunto Esecutivo AI disponibile"
              >
                <Zap className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>Brief</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#666] text-[10px] font-mono">
              {displayDate}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(resource.id, !!resource.isFavorite);
              }}
              className="p-1 text-[#444] hover:text-[#C5A059] transition-colors"
              title={resource.isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
            >
              <Star 
                className={`w-4 h-4 ${resource.isFavorite ? "fill-[#C5A059] text-[#C5A059]" : ""}`} 
              />
            </button>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-serif text-white group-hover:text-[#C5A059] transition-colors leading-snug mb-2 line-clamp-2">
          {resource.title}
        </h3>

        {/* Summary */}
        <p className="text-xs text-[#888] leading-relaxed mb-4 line-clamp-3">
          {resource.summary}
        </p>

        {/* Open Graph Article Web Preview (Favicon, Domain & Meta Description) */}
        {resource.type === "article" && resource.url && (
          <div className="mb-3.5 bg-[#0A0A0A] border border-[#222] hover:border-[#383838] rounded-lg p-3 transition-colors">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                {favicon ? (
                  <img
                    src={favicon}
                    alt={domain || "Favicon"}
                    className="w-4 h-4 rounded-sm shrink-0 object-contain bg-black/40"
                    referrerPolicy="no-referrer"
                    onError={() => setFaviconError(true)}
                  />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                )}
                <span className="text-[11px] font-mono text-[#C5A059] font-medium truncate">
                  {siteName || domain || "Web Article"}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {author && (
                  <span className="text-[10px] text-[#777] font-mono truncate max-w-[110px]" title={`Autore: ${author}`}>
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

            {/* Meta Description */}
            {metaDescription ? (
              <p className="text-[11px] text-[#999] leading-relaxed line-clamp-2 italic border-l-2 border-[#C5A059]/40 pl-2 mt-1">
                {metaDescription}
              </p>
            ) : isLoadingOg ? (
              <div className="flex items-center gap-1.5 text-[10px] text-[#666] font-mono mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059] animate-pulse" />
                <span>Caricamento anteprima Open Graph...</span>
              </div>
            ) : null}
          </div>
        )}

        {/* Reading Progress Indicator for Article Type */}
        {resource.type === "article" && (
          <div 
            className="mb-3.5 bg-[#0C0C0C] border border-[#202020] hover:border-[#2C2C2C] rounded-lg p-3 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono">
                {localProgress === 100 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : localProgress > 0 ? (
                  <Clock className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                ) : (
                  <BookOpen className="w-3.5 h-3.5 text-[#666] shrink-0" />
                )}
                <span className={localProgress === 100 ? "text-emerald-400 font-medium" : localProgress > 0 ? "text-[#C5A059] font-medium" : "text-[#777]"}>
                  {localProgress === 100
                    ? "Articolo Letto (100%)"
                    : localProgress > 0
                    ? `Avanzamento · ${localProgress}%`
                    : "Da leggere (0%)"}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {localProgress === 100 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProgressChange(0);
                    }}
                    className="text-[10px] font-mono text-[#777] hover:text-[#BBB] hover:bg-[#1A1A1A] px-1.5 py-0.5 rounded border border-transparent hover:border-[#333] transition-colors"
                    title="Reimposta stato a non letto"
                  >
                    Reimposta
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProgressChange(100);
                    }}
                    className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800/50 transition-colors flex items-center gap-1"
                    title="Segna come letto (100%)"
                  >
                    <Check className="w-2.5 h-2.5" />
                    <span>Segna Letto</span>
                  </button>
                )}
              </div>
            </div>

            {/* Interactive Progress Bar & Track Slider */}
            <div className="relative mb-2.5">
              <div className="h-1.5 w-full bg-[#161616] rounded-full overflow-hidden border border-[#242424]">
                <div
                  className={`h-full transition-[width] duration-500 ease-out rounded-full ${
                    localProgress === 100
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                      : localProgress > 0
                      ? "bg-gradient-to-r from-[#B38F46] to-[#E3BE70] shadow-[0_0_8px_rgba(197,160,89,0.25)]"
                      : "bg-transparent"
                  }`}
                  style={{ width: `${localProgress}%` }}
                />
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={localProgress}
                onChange={(e) => {
                  e.stopPropagation();
                  handleProgressChange(Number(e.target.value));
                }}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Avanzamento lettura"
              />
            </div>

            {/* Quick Percentage Presets */}
            <div className="flex items-center justify-between gap-1">
              {[0, 25, 50, 75, 100].map((step) => {
                const isCurrent = localProgress === step;
                return (
                  <button
                    key={step}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProgressChange(step);
                    }}
                    className={`flex-1 py-0.5 text-[10px] font-mono rounded transition-all text-center ${
                      isCurrent
                        ? step === 100
                          ? "bg-emerald-950/80 text-emerald-300 border border-emerald-600/60 font-semibold"
                          : step === 0
                          ? "bg-[#222] text-white border border-[#444] font-semibold"
                          : "bg-[#2A210F] text-[#E0BA6A] border border-[#C5A059]/60 font-semibold"
                        : "bg-[#121212] hover:bg-[#1C1C1C] text-[#666] hover:text-[#AAA] border border-[#1C1C1C]"
                    }`}
                    title={`Imposta avanzamento al ${step}%`}
                  >
                    {step === 0 ? "0%" : `${step}%`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Evaluation Insights (Use cases, Pros, Cons) if available */}
        {((resource.metadata?.useCases && resource.metadata.useCases.length > 0) || 
          (resource.metadata?.pros && resource.metadata.pros.length > 0) || 
          (resource.metadata?.cons && resource.metadata.cons.length > 0)) && (
          <div className="mb-3.5 bg-[#0B0B0B] border border-[#1E1E1E] rounded-lg p-2.5 space-y-1.5 text-[11px]">
            {resource.metadata.useCases && resource.metadata.useCases.length > 0 && (
              <div className="flex items-start gap-1.5 text-[#CCC]">
                <Target className="w-3.5 h-3.5 text-[#C5A059] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-[#888] font-mono text-[10px] uppercase font-medium">Uso: </span>
                  <span className="text-[#BBB] line-clamp-1">{resource.metadata.useCases[0]}</span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-0.5 text-[10px] font-mono text-[#888]">
              {resource.metadata.pros && resource.metadata.pros.length > 0 && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <ThumbsUp className="w-2.5 h-2.5" />
                  {resource.metadata.pros.length} Pro
                </span>
              )}
              {resource.metadata.cons && resource.metadata.cons.length > 0 && (
                <span className="flex items-center gap-1 text-[#C5A059] font-medium">
                  <ThumbsDown className="w-2.5 h-2.5" />
                  {resource.metadata.cons.length} Contro
                </span>
              )}
              {resource.metadata.scoreRationale && !resource.metadata.useCases?.length && (
                <span className="text-[#777] truncate italic">
                  "{resource.metadata.scoreRationale}"
                </span>
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

        {/* Relations count badge if knowledge OKF */}
        {resource.type === "knowledge" && resource.metadata?.relations && resource.metadata.relations.length > 0 && (
          <div className="mb-3 flex items-center gap-1.5 text-[10px] font-mono text-[#C5A059]">
            <BrainCircuit className="w-3 h-3" />
            <span>{resource.metadata.relations.length} Connessioni nel grafo ontologico</span>
          </div>
        )}

        {/* Tags */}
        {resource.tags && resource.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {resource.tags.slice(0, 4).map((tag, idx) => (
              <span 
                key={idx}
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

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(resource);
            }}
            className="text-[#C5A059] hover:text-[#D5B069] text-xs font-medium flex items-center gap-0.5 ml-0.5"
          >
            <span>{resource.type === "knowledge" ? "Apri OKF" : "Dettagli"}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
