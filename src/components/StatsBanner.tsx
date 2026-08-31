import React from "react";
import { 
  BookOpen, 
  Github, 
  Cpu, 
  Sparkles, 
  Tag, 
  X, 
  BrainCircuit, 
  ArrowUpDown,
  LayoutGrid,
  List,
  Network,
  RotateCcw,
  Globe,
  Wrench
} from "lucide-react";
import { ResourceType, SortOption, ViewMode } from "../types";

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
  };
  currentCategory: ResourceType | "all" | "favorites";
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
  sortBy = "newest",
  onSortByChange,
  viewMode = "grid",
  onViewModeChange,
  totalFilteredCount,
  searchQuery = "",
  onClearSearch,
}) => {
  const getCategoryTitle = () => {
    switch (currentCategory) {
      case "knowledge":
        return "Knowledge Vault (OKF v0.2)";
      case "troubleshooting":
        return "Problemi & Soluzioni (Troubleshooting)";
      case "article":
        return "Articoli & Guide";
      case "link":
        return "Link & Web Tools";
      case "github_repo":
        return "GitHub Repositories";
      case "mcp_server":
        return "MCP Servers & Tools";
      case "ai_skill":
        return "AI Skills & Prompts";
      case "favorites":
        return "Risorse Preferite";
      default:
        return "Tutte le Risorse nel Vault";
    }
  };

  const hasActiveFilters = Boolean(selectedTag || searchQuery);

  return (
    <div className="space-y-3.5">
      {/* Category Title & Quick Metric Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-2xl font-serif text-white tracking-tight flex items-center gap-2.5">
            <span>{getCategoryTitle()}</span>
            <span className="text-xs font-mono bg-[#161616] text-[#C5A059] border border-[#262626] px-2.5 py-0.5 rounded-full">
              {counts[currentCategory] || 0}
            </span>
          </h2>
          <p className="text-xs text-[#777] mt-0.5">
            Knowledge base ontologica con linking semantico OKF v0.2 & Firestore Cloud Sync
          </p>
        </div>

        {/* Mini stats counters */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1 scrollbar-none">
          <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#1C1C1C] text-[11px] font-mono text-[#AAA] shrink-0">
            <BrainCircuit className="w-3 h-3 text-[#C5A059]" />
            <span>{counts.knowledge || 0} OKF</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#1C1C1C] text-[11px] font-mono text-[#AAA] shrink-0">
            <Wrench className="w-3 h-3 text-[#F97316]" />
            <span>{counts.troubleshooting || 0} Fixes</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#1C1C1C] text-[11px] font-mono text-[#AAA] shrink-0">
            <Globe className="w-3 h-3 text-[#06B6D4]" />
            <span>{counts.link || 0} Links</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#1C1C1C] text-[11px] font-mono text-[#AAA] shrink-0">
            <Cpu className="w-3 h-3 text-[#38BDF8]" />
            <span>{counts.mcp_server} MCP</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#1C1C1C] text-[11px] font-mono text-[#AAA] shrink-0">
            <Github className="w-3 h-3 text-[#A855F7]" />
            <span>{counts.github_repo} Repos</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#1C1C1C] text-[11px] font-mono text-[#AAA] shrink-0">
            <Sparkles className="w-3 h-3 text-[#10B981]" />
            <span>{counts.ai_skill} Skills</span>
          </div>
        </div>
      </div>

      {/* Tag Cloud Filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
          <span className="text-[10px] font-mono uppercase text-[#555] flex items-center gap-1 shrink-0">
            <Tag className="w-3 h-3 text-[#C5A059]" />
            Tag:
          </span>

          {selectedTag && (
            <button
              onClick={() => onSelectTag(null)}
              className="flex items-center gap-1 text-[11px] font-mono bg-[#C5A059] text-black px-2.5 py-0.5 rounded-full font-medium shrink-0 transition-transform active:scale-95"
            >
              <span>#{selectedTag}</span>
              <X className="w-3 h-3 stroke-[3]" />
            </button>
          )}

          {allTags
            .filter((t) => t !== selectedTag)
            .slice(0, 18)
            .map((tag) => (
              <button
                key={tag}
                onClick={() => onSelectTag(tag)}
                className="text-[11px] font-mono bg-[#111] hover:bg-[#181818] text-[#888] hover:text-[#DDD] border border-[#1C1C1C] hover:border-[#333] px-2.5 py-0.5 rounded-full whitespace-nowrap transition-colors shrink-0"
              >
                #{tag}
              </button>
            ))}
        </div>
      )}

      {/* Interactive Sorting & View Controls Bar (Responsive for Mobile & Desktop) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 pb-1 border-t border-[#141414]">
        {/* Left: Result count & Filter Reset */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#888] font-mono text-[11px] sm:text-xs">
            {typeof totalFilteredCount === "number" ? (
              <>
                <strong className="text-[#E0E0E0]">{totalFilteredCount}</strong> {totalFilteredCount === 1 ? "risorsa trovata" : "risorse trovate"}
              </>
            ) : null}
          </span>

          {hasActiveFilters && (
            <button
              onClick={() => {
                onSelectTag(null);
                if (onClearSearch) onClearSearch();
              }}
              className="flex items-center gap-1 text-[10px] font-mono text-[#C5A059] bg-[#1C170E] border border-[#3E3017] px-2 py-0.5 rounded-md hover:bg-[#2A2012] transition-colors"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Azzera filtri</span>
            </button>
          )}
        </div>

        {/* Right: Quick Sort Selector & View Mode Switcher */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {onSortByChange && (
            <div className="flex items-center gap-1.5 bg-[#0F0F0F] border border-[#222] hover:border-[#333] rounded-lg px-2.5 py-1 text-xs text-[#888] transition-colors shadow-sm">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
              <label htmlFor="sorting-select-mobile" className="text-[11px] font-mono text-[#777] hidden xs:inline">
                Ordina:
              </label>
              <select
                id="sorting-select-mobile"
                value={sortBy}
                onChange={(e) => onSortByChange(e.target.value as SortOption)}
                className="bg-transparent text-[#CCC] text-[11px] sm:text-xs focus:outline-none cursor-pointer pr-1 font-medium"
              >
                <option value="newest" className="bg-[#141414] text-[#CCC]">Più recenti (Data)</option>
                <option value="oldest" className="bg-[#141414] text-[#CCC]">Meno recenti</option>
                <option value="title" className="bg-[#141414] text-[#CCC]">Titolo (A - Z)</option>
                <option value="title_desc" className="bg-[#141414] text-[#CCC]">Titolo (Z - A)</option>
                <option value="favorites" className="bg-[#141414] text-[#CCC]">Preferiti prima</option>
                <option value="type" className="bg-[#141414] text-[#CCC]">Tipo di risorsa</option>
              </select>
            </div>
          )}

          {onViewModeChange && (
            <div className="flex items-center bg-[#0F0F0F] border border-[#222] rounded-lg p-0.5">
              <button
                onClick={() => onViewModeChange("grid")}
                className={`p-1 rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-[#1F1F1F] text-[#C5A059]"
                    : "text-[#666] hover:text-[#AAA]"
                }`}
                title="Vista a Griglia"
                aria-label="Vista Griglia"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onViewModeChange("table")}
                className={`p-1 rounded-md transition-colors ${
                  viewMode === "table"
                    ? "bg-[#1F1F1F] text-[#C5A059]"
                    : "text-[#666] hover:text-[#AAA]"
                }`}
                title="Vista a Tabella"
                aria-label="Vista Tabella"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onViewModeChange("graph")}
                className={`p-1 rounded-md transition-colors ${
                  viewMode === "graph"
                    ? "bg-[#1F1F1F] text-[#C5A059]"
                    : "text-[#666] hover:text-[#AAA]"
                }`}
                title="Vista a Grafo (OKF)"
                aria-label="Vista Grafo"
              >
                <Network className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
