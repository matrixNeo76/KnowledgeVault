import React, { useState, useRef, useEffect } from "react";
import { 
  BookOpen, 
  Github, 
  Cpu, 
  Sparkles, 
  Tag, 
  X, 
  BrainCircuit, 
  RotateCcw, 
  Globe, 
  Wrench, 
  Layers, 
  Star, 
  Search, 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronUp,
  Check, 
  Paperclip,
  BarChart3,
  Info
} from "lucide-react";
import { ResourceType, NavCategory, SortOption, ViewMode } from "../types";

interface StatsBannerProps {
  counts: {
    all: number;
    knowledge: number;
    troubleshooting?: number;
    article: number;
    github_repo: number;
    mcp_server: number;
    ai_skill: number;
    link?: number;
    favorites: number;
    raw_files?: number;
  };
  currentCategory: NavCategory;
  allTags: string[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  sortBy?: SortOption;
  onSortByChange?: (sort: SortOption) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  totalFilteredCount?: number;
  searchQuery?: string;
  onClearSearch?: () => void;
}

export const StatsBanner: React.FC<StatsBannerProps> = ({
  counts,
  currentCategory,
  allTags,
  selectedTag,
  onSelectTag,
  totalFilteredCount,
  searchQuery = "",
  onClearSearch,
}) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isMetricsExpanded, setIsMetricsExpanded] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("KV_METRICS_EXPANDED") === "true";
    }
    return false;
  });
  const [tagSearchInput, setTagSearchInput] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const toggleMetrics = () => {
    setIsMetricsExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("KV_METRICS_EXPANDED", String(next));
      return next;
    });
  };

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFilterOpen]);

  const getCategoryMeta = () => {
    switch (currentCategory) {
      case "knowledge":
        return {
          title: "Knowledge Vault (OKF v0.2)",
          subtitle: "Specifiche ontologiche, schemi concettuali e guide architetturali conformi allo standard OKF v0.2",
          icon: <BrainCircuit className="w-4 h-4 text-[#C5A059]" />,
          badgeColor: "bg-[#C5A059]/15 text-[#E5C170] border-[#C5A059]/30",
        };
      case "raw_files":
        return {
          title: "Buffer File Grezzi",
          subtitle: "Area di staging per file fino a 50MB (PDF, TXT, MD, immagini, log) pronti per la conversione AI in OKF v0.2",
          icon: <Paperclip className="w-4 h-4 text-[#C5A059]" />,
          badgeColor: "bg-[#C5A059]/15 text-[#E5C170] border-[#C5A059]/30",
        };
      case "troubleshooting":
        return {
          title: "Problemi & Soluzioni",
          subtitle: "Diagnostica errori, cause radice, log di sistema e procedure di risoluzione guidata con checklist",
          icon: <Wrench className="w-4 h-4 text-[#F97316]" />,
          badgeColor: "bg-[#F97316]/15 text-[#FB923C] border-[#F97316]/30",
        };
      case "favorites":
        return {
          title: "Risorse Preferite",
          subtitle: "Raccolta delle risorse e dei nodi contrassegnati come preferiti per un accesso prioritario",
          icon: <Star className="w-4 h-4 text-[#FACC15] fill-[#FACC15]/20" />,
          badgeColor: "bg-[#FACC15]/15 text-[#FDE047] border-[#FACC15]/30",
        };
      case "mcp_server":
        return {
          title: "MCP Servers & Tools",
          subtitle: "Server Model Context Protocol, comandi di avvio runtime, tool esposti e snippet di configurazione",
          icon: <Cpu className="w-4 h-4 text-[#38BDF8]" />,
          badgeColor: "bg-[#38BDF8]/15 text-[#7DD3FC] border-[#38BDF8]/30",
        };
      case "github_repo":
        return {
          title: "GitHub Repositories",
          subtitle: "Repository open-source, snippet di codice, comandi di installazione e stack tecnologici",
          icon: <Github className="w-4 h-4 text-[#A855F7]" />,
          badgeColor: "bg-[#A855F7]/15 text-[#C084FC] border-[#A855F7]/30",
        };
      case "ai_skill":
        return {
          title: "AI Skills & Prompts",
          subtitle: "Prompt ingegnerizzati, istruzioni di sistema per agenti autonomi e regole di condotta",
          icon: <Sparkles className="w-4 h-4 text-[#10B981]" />,
          badgeColor: "bg-[#10B981]/15 text-[#34D399] border-[#10B981]/30",
        };
      case "article":
        return {
          title: "Articoli & Guide",
          subtitle: "Approfondimenti tecnici, tutorial architetturali e documentazione analitica",
          icon: <BookOpen className="w-4 h-4 text-[#EAB308]" />,
          badgeColor: "bg-[#EAB308]/15 text-[#FACC15] border-[#EAB308]/30",
        };
      case "link":
        return {
          title: "Link & Web Tools",
          subtitle: "Collegamenti a risorse esterne, tool online e portali di documentazione",
          icon: <Globe className="w-4 h-4 text-[#06B6D4]" />,
          badgeColor: "bg-[#06B6D4]/15 text-[#22D3EE] border-[#06B6D4]/30",
        };
      default:
        return {
          title: "Tutte le Risorse",
          subtitle: "Indice unificato con ricerca tokenizzata profonda, linking ontologico e sincronizzazione Firestore",
          icon: <Layers className="w-4 h-4 text-[#C5A059]" />,
          badgeColor: "bg-[#C5A059]/15 text-[#E5C170] border-[#C5A059]/30",
        };
    }
  };

  const meta = getCategoryMeta();
  const hasActiveFilters = Boolean(selectedTag || searchQuery);

  const filteredTags = allTags.filter((tag) =>
    tag.toLowerCase().includes(tagSearchInput.toLowerCase().trim())
  );

  return (
    <div className="space-y-2 pb-1">
      {/* Primary Compact Sub-Header Bar (Height: ~38px) */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[#0C0C0C] border border-[#1A1A1A] rounded-xl">
        
        {/* Left: Category Icon + Title + Count Badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-[#16130B] border border-[#C5A059]/30 flex items-center justify-center shrink-0">
            {meta.icon}
          </div>
          <h2 className="text-xs sm:text-sm font-semibold text-white tracking-tight truncate font-sans">
            {meta.title}
          </h2>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 ${meta.badgeColor}`}>
            {typeof totalFilteredCount === "number" ? totalFilteredCount : counts[currentCategory] || 0}
          </span>
        </div>

        {/* Center/Right: Filter Popover, Active Tag Chips, Clear & Metrics Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Active Tag Chip */}
          {selectedTag && (
            <button
              onClick={() => onSelectTag(null)}
              className="flex items-center gap-1 text-[10.5px] font-mono bg-[#C5A059] text-black px-2 py-0.5 rounded-md font-medium shrink-0 transition-transform active:scale-95 cursor-pointer shadow-xs"
              title="Rimuovi filtro tag"
            >
              <span>#{selectedTag}</span>
              <X className="w-3 h-3 stroke-[3]" />
            </button>
          )}

          {/* Active Search Query Chip */}
          {searchQuery && (
            <div className="flex items-center gap-1 text-[10.5px] font-mono bg-[#1C160B] text-[#E5C170] border border-[#C5A059]/40 px-2 py-0.5 rounded-md shrink-0">
              <span className="truncate max-w-[100px]">"{searchQuery}"</span>
              {onClearSearch && (
                <button 
                  onClick={onClearSearch} 
                  className="hover:text-white ml-0.5 cursor-pointer"
                  title="Cancella filtro ricerca"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Filter Popover Trigger */}
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer border ${
                selectedTag || isFilterOpen
                  ? "bg-[#1C160B] text-[#E5C170] border-[#C5A059]/60 font-semibold"
                  : "bg-[#121212] hover:bg-[#181818] text-[#888] hover:text-[#DDD] border-[#222]"
              }`}
              title="Filtra per tag tematici"
            >
              <SlidersHorizontal className="w-3 h-3 text-[#C5A059]" />
              <span className="hidden sm:inline">Tag</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${isFilterOpen ? "rotate-180 text-[#C5A059]" : "text-[#555]"}`} />
            </button>

            {/* Filter Popover Panel */}
            {isFilterOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 bg-[#0F0F0F] border border-[#242424] rounded-xl shadow-2xl z-40 p-3 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1C1C1C]">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-[#DDD]">
                    <Tag className="w-3 h-3 text-[#C5A059]" />
                    <span>Filtra per Tag</span>
                  </div>
                  {selectedTag && (
                    <button
                      onClick={() => {
                        onSelectTag(null);
                        setIsFilterOpen(false);
                      }}
                      className="text-[10px] font-mono text-[#C5A059] hover:underline"
                    >
                      Azzera tag
                    </button>
                  )}
                </div>

                {/* Tag Search Input */}
                {allTags.length > 5 && (
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#555]" />
                    <input
                      type="text"
                      value={tagSearchInput}
                      onChange={(e) => setTagSearchInput(e.target.value)}
                      placeholder="Cerca tag..."
                      className="w-full bg-[#141414] border border-[#222] focus:border-[#C5A059]/50 rounded-lg py-1 pl-7 pr-2 text-xs text-[#E0E0E0] placeholder-[#555] focus:outline-none font-mono"
                    />
                  </div>
                )}

                {/* Tags List */}
                <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
                  {filteredTags.length === 0 ? (
                    <p className="text-xs text-[#666] text-center py-3 font-mono">
                      Nessun tag corrispondente
                    </p>
                  ) : (
                    filteredTags.map((tag) => {
                      const isSelected = selectedTag === tag;
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            onSelectTag(isSelected ? null : tag);
                            setIsFilterOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-xs font-mono transition-all text-left cursor-pointer ${
                            isSelected
                              ? "bg-[#241C0E] text-[#E5C170] border border-[#C5A059]/40 font-semibold"
                              : "text-[#888] hover:text-[#FFF] hover:bg-[#161616]"
                          }`}
                        >
                          <span className="truncate">#{tag}</span>
                          {isSelected && <Check className="w-3 h-3 text-[#C5A059] shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Reset All Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={() => {
                onSelectTag(null);
                if (onClearSearch) onClearSearch();
              }}
              className="flex items-center gap-1 text-[10.5px] font-mono text-[#C5A059] hover:text-[#E5C170] bg-[#161209] hover:bg-[#20180B] border border-[#C5A059]/30 px-1.5 py-0.5 rounded-md transition-colors shrink-0 cursor-pointer"
              title="Azzera tutti i filtri"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Azzera</span>
            </button>
          )}

          {/* Vault Metrics Toggle Button */}
          <button
            onClick={toggleMetrics}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono border transition-all ${
              isMetricsExpanded
                ? "bg-[#18140B] text-[#E5C170] border-[#C5A059]/40"
                : "bg-[#111111] text-[#777] hover:text-[#BBB] border-[#222] hover:bg-[#161616]"
            }`}
            title={isMetricsExpanded ? "Comprimi cruscotto metriche" : "Espandi cruscotto metriche Vault"}
          >
            <BarChart3 className="w-3 h-3 text-[#C5A059]" />
            <span className="hidden md:inline">Metriche</span>
            {isMetricsExpanded ? (
              <ChevronUp className="w-3 h-3 text-[#C5A059]" />
            ) : (
              <ChevronDown className="w-3 h-3 text-[#666]" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable Vault Metrics & Insights Drawer */}
      {isMetricsExpanded && (
        <div className="p-3 bg-[#0C0C0C] border border-[#1A1A1A] rounded-xl animate-in fade-in slide-in-from-top-2 duration-150 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-[#777]">
            <div className="flex items-center gap-1.5 text-xs text-[#AAA]">
              <Info className="w-3.5 h-3.5 text-[#C5A059]" />
              <span className="leading-tight">{meta.subtitle}</span>
            </div>
            <span className="text-[10px] font-mono text-[#555] uppercase tracking-wider">
              Distribuzione OKF
            </span>
          </div>

          {/* Metric Distribution Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 pt-1">
            <div className="p-2 rounded-lg bg-[#111] border border-[#1C1C1C] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono text-[#999]">
                <BrainCircuit className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Knowledge</span>
              </div>
              <span className="text-xs font-mono font-semibold text-[#E5C170]">{counts.knowledge || 0}</span>
            </div>

            <div className="p-2 rounded-lg bg-[#111] border border-[#1C1C1C] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono text-[#999]">
                <Wrench className="w-3.5 h-3.5 text-[#F97316]" />
                <span>Fixes</span>
              </div>
              <span className="text-xs font-mono font-semibold text-[#FB923C]">{counts.troubleshooting || 0}</span>
            </div>

            <div className="p-2 rounded-lg bg-[#111] border border-[#1C1C1C] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono text-[#999]">
                <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>MCP Servers</span>
              </div>
              <span className="text-xs font-mono font-semibold text-[#7DD3FC]">{counts.mcp_server || 0}</span>
            </div>

            <div className="p-2 rounded-lg bg-[#111] border border-[#1C1C1C] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono text-[#999]">
                <Github className="w-3.5 h-3.5 text-[#A855F7]" />
                <span>GitHub</span>
              </div>
              <span className="text-xs font-mono font-semibold text-[#C084FC]">{counts.github_repo || 0}</span>
            </div>

            <div className="p-2 rounded-lg bg-[#111] border border-[#1C1C1C] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono text-[#999]">
                <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
                <span>AI Skills</span>
              </div>
              <span className="text-xs font-mono font-semibold text-[#34D399]">{counts.ai_skill || 0}</span>
            </div>

            <div className="p-2 rounded-lg bg-[#111] border border-[#1C1C1C] flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono text-[#999]">
                <BookOpen className="w-3.5 h-3.5 text-[#EAB308]" />
                <span>Guide</span>
              </div>
              <span className="text-xs font-mono font-semibold text-[#FACC15]">{counts.article || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
