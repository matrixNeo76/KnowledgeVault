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
  ChevronRight, 
  BrainCircuit, 
  FileCode, 
  Calendar, 
  CheckCircle2, 
  Clock,
  Award,
  Globe,
  Wrench,
  Printer,
  FileText,
  FileDown,
  Loader2
} from "lucide-react";
import { ResourceItem, ResourceType } from "../types";
import { formatDate } from "../lib/dateUtils";
import { generateAndDownloadResourcePdf } from "../lib/pdfExport";

interface ResourceTableProps {
  resources: ResourceItem[];
  onToggleFavorite: (id: string, currentFav: boolean) => void;
  onOpenDetail: (resource: ResourceItem) => void;
  onPrintPreview?: (resource: ResourceItem) => void;
  onExportGoogleDoc?: (resource: ResourceItem) => void;
  onDownloadPdf?: (resource: ResourceItem) => void;
}

export const ResourceTable: React.FC<ResourceTableProps> = ({
  resources,
  onToggleFavorite,
  onOpenDetail,
  onPrintPreview,
  onExportGoogleDoc,
  onDownloadPdf,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [downloadedPdfId, setDownloadedPdfId] = useState<string | null>(null);

  const handleDownloadPdf = async (e: React.MouseEvent, item: ResourceItem) => {
    e.stopPropagation();
    if (generatingPdfId) return;

    if (onDownloadPdf) {
      onDownloadPdf(item);
      return;
    }

    setGeneratingPdfId(item.id);
    try {
      await generateAndDownloadResourcePdf(item);
      setDownloadedPdfId(item.id);
      setTimeout(() => setDownloadedPdfId(null), 2500);
    } catch (err) {
      console.error("Errore generazione PDF:", err);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const getTypeBadge = (type: ResourceType) => {
    switch (type) {
      case "knowledge":
        return {
          label: "OKF v0.2",
          icon: <BrainCircuit className="w-3 h-3 text-[#C5A059]" />,
        };
      case "troubleshooting":
        return {
          label: "Problema & Fix",
          icon: <Wrench className="w-3 h-3 text-[#F97316]" />,
        };
      case "github_repo":
        return {
          label: "GitHub",
          icon: <Github className="w-3 h-3 text-[#A855F7]" />,
        };
      case "link":
        return {
          label: "Link Web",
          icon: <Globe className="w-3 h-3 text-[#06B6D4]" />,
        };
      case "mcp_server":
        return {
          label: "MCP",
          icon: <Cpu className="w-3 h-3 text-[#38BDF8]" />,
        };
      case "ai_skill":
        return {
          label: "AI Skill",
          icon: <Sparkles className="w-3 h-3 text-[#10B981]" />,
        };
      case "article":
      default:
        return {
          label: "Articolo",
          icon: <BookOpen className="w-3 h-3 text-[#F59E0B]" />,
        };
    }
  };

  const handleCopy = (e: React.MouseEvent, item: ResourceItem) => {
    e.stopPropagation();
    const payload = item.type === "knowledge" 
      ? item.metadata?.markdownContent || item.summary || ""
      : item.type === "mcp_server" 
      ? item.metadata?.configSnippet || item.metadata?.command || item.url || ""
      : item.type === "github_repo"
      ? item.metadata?.installCommand || `git clone ${item.url}` || item.url || ""
      : item.type === "ai_skill"
      ? item.metadata?.systemPrompt || item.summary || ""
      : item.url || item.summary;

    if (payload) {
      navigator.clipboard.writeText(payload);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="w-full overflow-x-auto bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl">
      <table className="w-full text-left text-xs text-[#AAA]">
        <thead className="bg-[#0F0F0F] text-[10px] uppercase font-mono tracking-wider text-[#666] border-b border-[#1F1F1F]">
          <tr>
            <th className="py-3 px-4 w-10 text-center">Fav</th>
            <th className="py-3 px-4 w-28">Tipo</th>
            <th className="py-3 px-4">Titolo & Sommario</th>
            <th className="py-3 px-4 hidden md:table-cell">Tags</th>
            <th className="py-3 px-4 hidden lg:table-cell">Data</th>
            <th className="py-3 px-4 hidden xl:table-cell">Link / Sorgente</th>
            <th className="py-3 px-4 text-right">Azioni</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#161616]">
          {resources.map((item, rowIdx) => {
            const badge = getTypeBadge(item.type);
            const isCopied = copiedId === item.id;
            const itemDate = formatDate(item.createdAt) || formatDate(item.updatedAt) || formatDate(new Date());

            return (
              <tr
                key={item.id || `table-row-${rowIdx}`}
                onClick={() => onOpenDetail(item)}
                className="hover:bg-[#111] transition-colors cursor-pointer group"
              >
                {/* Favorite Star */}
                <td className="py-3.5 px-4 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(item.id, !!item.isFavorite);
                    }}
                    className="text-[#444] hover:text-[#C5A059]"
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        item.isFavorite ? "fill-[#C5A059] text-[#C5A059]" : ""
                      }`}
                    />
                  </button>
                </td>

                {/* Type Badge */}
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#141414] border border-[#222] text-[#C5A059] font-mono text-[10px]">
                      {badge.icon}
                      {badge.label}
                    </span>
                    {item.type === "article" && item.metadata?.readingProgress !== undefined && (
                      item.metadata.readingProgress === 100 ? (
                        <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-700/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-0.5" title="Letto al 100%">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          Letto
                        </span>
                      ) : item.metadata.readingProgress > 0 ? (
                        <span className="text-[10px] bg-[#221A0C] text-[#C5A059] border border-[#C5A059]/30 px-1.5 py-0.5 rounded font-mono" title={`Avanzamento: ${item.metadata.readingProgress}%`}>
                          {item.metadata.readingProgress}%
                        </span>
                      ) : null
                    )}
                    {typeof item.metadata?.score === "number" && (
                      <span 
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-0.5 border ${
                          item.metadata.score >= 85
                            ? "bg-emerald-950/70 text-emerald-300 border-emerald-700/50"
                            : item.metadata.score >= 70
                            ? "bg-[#2A210F] text-[#E5C170] border-[#C5A059]/40"
                            : "bg-[#1C1C1C] text-[#AAA] border-[#333]"
                        }`}
                        title={`Valutazione: ${item.metadata.score}/100${item.metadata.scoreRationale ? ` - ${item.metadata.scoreRationale}` : ''}`}
                      >
                        <Award className="w-2.5 h-2.5 text-[#C5A059]" />
                        <span>{item.metadata.score}</span>
                      </span>
                    )}
                  </div>
                </td>

                {/* Title and brief description */}
                <td className="py-3.5 px-4 max-w-xs sm:max-w-md">
                  <div className="font-serif text-white group-hover:text-[#C5A059] transition-colors font-medium truncate">
                    {item.title}
                  </div>
                  <div className="text-[#666] text-[11px] truncate mt-0.5">
                    {item.summary}
                  </div>
                </td>

                {/* Tags */}
                <td className="py-3.5 px-4 hidden md:table-cell whitespace-nowrap">
                  <div className="flex gap-1 overflow-hidden max-w-[200px]">
                    {item.tags?.slice(0, 2).map((t, idx) => (
                      <span key={`table-tag-${item.id || rowIdx}-${t}-${idx}`} className="text-[10px] font-mono bg-[#141414] text-[#777] px-1.5 py-0.5 rounded">
                        #{t}
                      </span>
                    ))}
                    {item.tags?.length > 2 && (
                      <span className="text-[10px] text-[#555]">+{item.tags.length - 2}</span>
                    )}
                  </div>
                </td>

                {/* Date */}
                <td className="py-3.5 px-4 hidden lg:table-cell whitespace-nowrap">
                  <span className="text-[11px] font-mono text-[#666]">
                    {itemDate}
                  </span>
                </td>

                {/* URL */}
                <td className="py-3.5 px-4 hidden xl:table-cell whitespace-nowrap max-w-[180px] truncate">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[#666] hover:text-[#C5A059] flex items-center gap-1 text-[11px] truncate"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item.url.replace(/^https?:\/\//, "")}</span>
                    </a>
                  ) : item.type === "knowledge" ? (
                    <span className="text-[#C5A059] font-mono text-[11px] flex items-center gap-1">
                      <FileCode className="w-3 h-3" /> OKF Doc
                    </span>
                  ) : (
                    <span className="text-[#444] italic text-[11px]">Locale</span>
                  )}
                </td>

                {/* Actions */}
                <td className="py-3.5 px-4 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={(e) => handleCopy(e, item)}
                      className="p-1.5 rounded bg-[#141414] hover:bg-[#202020] text-[#888] hover:text-white transition-colors"
                      title="Copia Config / Snippet"
                    >
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-[#C5A059]" />
                      )}
                    </button>

                    {/* Google Doc Link or Export */}
                    {item.metadata?.gdocUrl ? (
                      <a
                        href={item.metadata.gdocUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded bg-[#4285F4]/15 hover:bg-[#4285F4]/30 border border-[#4285F4]/30 text-[#4285F4] hover:text-white transition-colors"
                        title="Apri Google Doc su Google Drive"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </a>
                    ) : onExportGoogleDoc ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onExportGoogleDoc(item);
                        }}
                        className="p-1.5 rounded bg-[#141414] hover:bg-[#202020] text-[#777] hover:text-[#4285F4] transition-colors"
                        title="Esporta su Google Doc nella cartella 'knowledge'"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    ) : null}

                    {/* Direct Download PDF Button */}
                    <button
                      onClick={(e) => handleDownloadPdf(e, item)}
                      disabled={generatingPdfId === item.id}
                      className={`p-1.5 rounded transition-colors ${
                        downloadedPdfId === item.id
                          ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
                          : generatingPdfId === item.id
                          ? "bg-[#1A140B] text-[#C5A059]"
                          : "bg-[#141414] hover:bg-[#202020] text-[#888] hover:text-[#C5A059]"
                      }`}
                      title={
                        downloadedPdfId === item.id
                          ? "PDF scaricato con successo!"
                          : generatingPdfId === item.id
                          ? "Generazione PDF in corso..."
                          : "Scarica documento PDF per consultazione offline"
                      }
                      aria-label="Scarica PDF offline"
                    >
                      {generatingPdfId === item.id ? (
                        <Loader2 className="w-3.5 h-3.5 text-[#C5A059] animate-spin" />
                      ) : downloadedPdfId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <FileDown className="w-3.5 h-3.5 text-[#AAA] hover:text-[#C5A059]" />
                      )}
                    </button>

                    {onPrintPreview && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPrintPreview(item);
                        }}
                        className="p-1.5 rounded bg-[#141414] hover:bg-[#202020] text-[#888] hover:text-[#C5A059] transition-colors"
                        title="Anteprima di Stampa & PDF"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#AAA] hover:text-[#C5A059]" />
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDetail(item);
                      }}
                      className="p-1.5 text-[#666] hover:text-[#C5A059]"
                      title="Apri Dettagli"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
