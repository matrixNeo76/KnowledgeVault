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
import { ViewMode, SortOption } from "../types";
import { User } from "firebase/auth";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: SortOption;
  onSortByChange: (sort: SortOption) => void;
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
    <header className="h-16 sm:h-20 border-b border-[#1F1F1F] bg-[#0A0A0A]/90 backdrop-blur-md flex items-center justify-between px-3 sm:px-8 shrink-0 z-20 gap-2">
      {/* Left side: Mobile menu toggle + Search */}
      <div className="flex items-center gap-2 sm:gap-4 flex-1 max-w-xl min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-[#888] hover:text-white bg-[#111] border border-[#222] rounded-lg shrink-0"
          aria-label="Apri menu laterale"
        >
          <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <div className="relative w-full min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#555]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cerca risorse, tag, repo o nodi OKF..."
            className="w-full bg-[#111] border border-[#222] rounded-full py-1.5 sm:py-2 pl-8 sm:pl-10 pr-8 text-xs sm:text-sm text-[#E0E0E0] placeholder-[#555] focus:outline-none focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#E0E0E0] p-0.5"
              aria-label="Cancella ricerca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Right side: Controls & Primary Actions */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Sort selector - VISIBLE ON ALL SCREENS INCLUDING MOBILE */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-[#111] border border-[#222] hover:border-[#333] rounded-lg px-2 sm:px-2.5 py-1.5 text-xs text-[#888] transition-colors">
          <ArrowUpDown className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortOption)}
            className="bg-transparent text-[#CCC] text-[11px] sm:text-xs focus:outline-none cursor-pointer pr-1"
            aria-label="Ordinamento"
          >
            <option value="newest" className="bg-[#141414] text-[#CCC]">Più recenti</option>
            <option value="oldest" className="bg-[#141414] text-[#CCC]">Meno recenti</option>
            <option value="title" className="bg-[#141414] text-[#CCC]">Titolo (A - Z)</option>
            <option value="title_desc" className="bg-[#141414] text-[#CCC]">Titolo (Z - A)</option>
            <option value="favorites" className="bg-[#141414] text-[#CCC]">Preferiti prima</option>
            <option value="type" className="bg-[#141414] text-[#CCC]">Tipo risorsa</option>
          </select>
        </div>

        {/* View mode toggle (Grid / Table / Graph) */}
        <div className="flex items-center bg-[#111] border border-[#222] rounded-lg p-0.5 sm:p-1 shrink-0">
          <button
            onClick={() => onViewModeChange("grid")}
            className={`p-1 sm:p-1.5 rounded-md transition-colors ${
              viewMode === "grid"
                ? "bg-[#1F1F1F] text-[#C5A059]"
                : "text-[#666] hover:text-[#AAA]"
            }`}
            title="Vista a Griglia"
            aria-label="Vista Griglia"
          >
            <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={() => onViewModeChange("table")}
            className={`p-1 sm:p-1.5 rounded-md transition-colors ${
              viewMode === "table"
                ? "bg-[#1F1F1F] text-[#C5A059]"
                : "text-[#666] hover:text-[#AAA]"
            }`}
            title="Vista a Tabella"
            aria-label="Vista Tabella"
          >
            <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={() => onViewModeChange("graph")}
            className={`p-1 sm:p-1.5 rounded-md transition-colors ${
              viewMode === "graph"
                ? "bg-[#1F1F1F] text-[#C5A059]"
                : "text-[#666] hover:text-[#AAA]"
            }`}
            title="Vista a Grafo Ontologico (OKF)"
            aria-label="Vista Grafo"
          >
            <Network className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Diagnostic Log Console Trigger */}
        {onOpenDiagnostic && (
          <button
            onClick={onOpenDiagnostic}
            className="hidden xs:flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border border-[#2C2314] bg-[#141009] hover:bg-[#1C160D] text-[#D5B069] text-xs font-mono transition-all shrink-0"
            title="Apri Console di Diagnostica & Log Live"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Diagnostica</span>
          </button>
        )}

        {/* Sync status */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1F1F1F] bg-[#0E0E0E] shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-[11px] font-mono text-[#888]">{totalCount} nel DB</span>
        </div>

        {/* Auth CTA if logged out */}
        {!user && (
          <button
            onClick={onSignIn}
            className="hidden sm:flex items-center gap-1.5 bg-[#141414] hover:bg-[#1A1A1A] border border-[#333] text-xs text-[#E0E0E0] px-3 py-2 rounded-lg transition-colors font-medium shrink-0"
          >
            <LogIn className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Accedi</span>
          </button>
        )}

        {/* New Resource button */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1 sm:gap-1.5 bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs py-1.5 sm:py-2 px-2.5 sm:px-4 rounded-lg transition-all shadow-md shadow-[#C5A059]/10 active:scale-95 shrink-0"
          title="Aggiungi Nuova Risorsa"
        >
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">Nuova Risorsa</span>
          <span className="sm:hidden text-[11px]">Nuova</span>
        </button>
      </div>
    </header>
  );
};
