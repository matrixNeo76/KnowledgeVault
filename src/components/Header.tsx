import React from "react";
import { 
  Search, 
  Menu, 
  Plus, 
  LayoutGrid, 
  List, 
  ArrowUpDown, 
  LogIn,
  CheckCircle2,
  X,
  Network,
  Terminal
} from "lucide-react";
import { ViewMode } from "../types";
import { User } from "firebase/auth";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: "newest" | "oldest" | "title";
  onSortByChange: (sort: "newest" | "oldest" | "title") => void;
  onOpenAddModal: () => void;
  onOpenMobileMenu: () => void;
  onOpenDiagnostic?: () => void;
  user: User | null;
  onSignIn: () => void;
  totalCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortByChange,
  onOpenAddModal,
  onOpenMobileMenu,
  onOpenDiagnostic,
  user,
  onSignIn,
  totalCount,
}) => {
  return (
    <header className="h-20 border-b border-[#1F1F1F] bg-[#0A0A0A]/80 backdrop-blur-md flex items-center justify-between px-4 sm:px-8 shrink-0 z-20">
      {/* Left side: Mobile menu toggle + Search */}
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-[#888] hover:text-white bg-[#111] border border-[#222] rounded-lg"
          aria-label="Apri menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cerca per titolo, tag, repo, comando MCP o nodo OKF..."
            className="w-full bg-[#111] border border-[#222] rounded-full py-2 pl-10 pr-9 text-xs sm:text-sm text-[#E0E0E0] placeholder-[#555] focus:outline-none focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#E0E0E0]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Right side: Controls & Primary Actions */}
      <div className="flex items-center space-x-2 sm:space-x-3 pl-4">
        {/* Sort selector */}
        <div className="hidden sm:flex items-center gap-1.5 bg-[#111] border border-[#222] rounded-lg px-2.5 py-1.5 text-xs text-[#888]">
          <ArrowUpDown className="w-3.5 h-3.5 text-[#C5A059]" />
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as any)}
            className="bg-transparent text-[#CCC] text-xs focus:outline-none cursor-pointer"
          >
            <option value="newest" className="bg-[#111] text-[#CCC]">Più recenti</option>
            <option value="oldest" className="bg-[#111] text-[#CCC]">Meno recenti</option>
            <option value="title" className="bg-[#111] text-[#CCC]">Titolo A-Z</option>
          </select>
        </div>

        {/* View mode toggle (Grid / Table / Graph) */}
        <div className="flex items-center bg-[#111] border border-[#222] rounded-lg p-1">
          <button
            onClick={() => onViewModeChange("grid")}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "grid"
                ? "bg-[#1F1F1F] text-[#C5A059]"
                : "text-[#666] hover:text-[#AAA]"
            }`}
            title="Vista a Griglia"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange("table")}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "table"
                ? "bg-[#1F1F1F] text-[#C5A059]"
                : "text-[#666] hover:text-[#AAA]"
            }`}
            title="Vista a Tabella"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange("graph")}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "graph"
                ? "bg-[#1F1F1F] text-[#C5A059]"
                : "text-[#666] hover:text-[#AAA]"
            }`}
            title="Vista a Grafo Ontologico (OKF)"
          >
            <Network className="w-4 h-4" />
          </button>
        </div>

        {/* Diagnostic Log Console Trigger */}
        {onOpenDiagnostic && (
          <button
            onClick={onOpenDiagnostic}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#2C2314] bg-[#141009] hover:bg-[#1C160D] text-[#D5B069] text-xs font-mono transition-all"
            title="Apri Console di Diagnostica & Log Live"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Diagnostica</span>
          </button>
        )}

        {/* Sync status */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1F1F1F] bg-[#0E0E0E]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-[11px] font-mono text-[#888]">{totalCount} nel DB</span>
        </div>

        {/* Auth CTA if logged out */}
        {!user && (
          <button
            onClick={onSignIn}
            className="hidden sm:flex items-center gap-1.5 bg-[#141414] hover:bg-[#1A1A1A] border border-[#333] text-xs text-[#E0E0E0] px-3 py-2 rounded-lg transition-colors font-medium"
          >
            <LogIn className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Accedi</span>
          </button>
        )}

        {/* New Resource button */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs py-2 px-3.5 sm:px-4 rounded-lg transition-all shadow-md shadow-[#C5A059]/10 active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">Nuova Risorsa</span>
          <span className="sm:hidden">Nuova</span>
        </button>
      </div>
    </header>
  );
};
