import React from "react";
import { BookOpen, Github, Cpu, Sparkles, Star, Tag, X, BrainCircuit } from "lucide-react";
import { ResourceType } from "../types";

interface StatsBannerProps {
  counts: {
    all: number;
    knowledge: number;
    article: number;
    github_repo: number;
    mcp_server: number;
    ai_skill: number;
    favorites: number;
  };
  currentCategory: ResourceType | "all" | "favorites";
  allTags: string[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

export const StatsBanner: React.FC<StatsBannerProps> = ({
  counts,
  currentCategory,
  allTags,
  selectedTag,
  onSelectTag,
}) => {
  const getCategoryTitle = () => {
    switch (currentCategory) {
      case "knowledge":
        return "Knowledge Vault (OKF v0.2)";
      case "article":
        return "Articoli & Guide";
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

  return (
    <div className="space-y-4">
      {/* Category Title & Quick Metric Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-serif text-white tracking-tight flex items-center gap-2.5">
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
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#1C1C1C] text-[11px] font-mono text-[#AAA]">
            <BrainCircuit className="w-3 h-3 text-[#C5A059]" />
            <span>{counts.knowledge || 0} OKF</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#1C1C1C] text-[11px] font-mono text-[#AAA]">
            <Cpu className="w-3 h-3 text-[#38BDF8]" />
            <span>{counts.mcp_server} MCP</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#1C1C1C] text-[11px] font-mono text-[#AAA]">
            <Github className="w-3 h-3 text-[#A855F7]" />
            <span>{counts.github_repo} Repos</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D0D0D] border border-[#1C1C1C] text-[11px] font-mono text-[#AAA]">
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
                className="text-[11px] font-mono bg-[#111] hover:bg-[#181818] text-[#888] hover:text-[#DDD] border border-[#1C1C1C] hover:border-[#333] px-2.5 py-0.5 rounded-full whitespace-nowrap transition-colors"
              >
                #{tag}
              </button>
            ))}
        </div>
      )}
    </div>
  );
};
