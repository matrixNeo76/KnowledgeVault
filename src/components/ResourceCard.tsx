import React, { useState } from "react";
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
  FileCode
} from "lucide-react";
import { ResourceItem, ResourceType } from "../types";

interface ResourceCardProps {
  resource: ResourceItem;
  onToggleFavorite: (id: string, currentFav: boolean) => void;
  onOpenDetail: (resource: ResourceItem) => void;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({
  resource,
  onToggleFavorite,
  onOpenDetail,
}) => {
  const [copied, setCopied] = useState(false);

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

  const formatDate = (ts: any) => {
    if (!ts) return "";
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleDateString("it-IT", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div 
      onClick={() => onOpenDetail(resource)}
      className="group bg-[#0F0F0F] border border-[#1F1F1F] hover:border-[#333] hover:shadow-xl hover:shadow-black/50 p-5 rounded-xl flex flex-col justify-between transition-all duration-200 cursor-pointer relative"
    >
      <div>
        {/* Top Header: Badge, Date, Favorite */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2.5 py-1 rounded-md tracking-wide uppercase font-mono font-semibold flex items-center gap-1.5 ${badge.bg}`}>
              {badge.icon}
              {badge.label}
            </span>

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
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#555] text-[10px] font-mono">
              {formatDate(resource.createdAt)}
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
      <div className="flex items-center justify-between pt-3 border-t border-[#181818] mt-auto">
        <div className="flex items-center gap-2 truncate max-w-[60%]">
          {resource.url ? (
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
          ) : (
            <span className="text-[11px] text-[#C5A059] font-mono flex items-center gap-1">
              <FileCode className="w-3 h-3" /> OKF Document
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
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

          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(resource);
            }}
            className="text-[#C5A059] hover:text-[#D5B069] text-xs font-medium flex items-center gap-0.5"
          >
            <span>{resource.type === "knowledge" ? "Apri OKF" : "Dettagli"}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
