import React, { useRef, useEffect, useState } from "react";
import { 
  Search, 
  Menu, 
  Plus, 
  LayoutGrid, 
  List, 
  Network, 
  Terminal, 
  Printer, 
  X, 
  ArrowUpDown,
  MoreVertical,
  FileText,
  Command,
  Check,
  Focus
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
  onOpenExport?: () => void;
  onOpenPrintDossier?: () => void;
  onOpenGoogleDrive?: () => void;
  user: User | null;
  onSignIn: () => void;
  totalCount: number;
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
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
  onOpenPrintDossier,
  onOpenGoogleDrive,
  totalCount,
  isZenMode = false,
  onToggleZenMode,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const sortMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Global shortcuts: Cmd/Ctrl + K or "/" for search, Cmd/Ctrl + Shift + F for Zen Focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive = activeTag === "input" || activeTag === "textarea";

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (onToggleZenMode) onToggleZenMode();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "/" && !isInputActive) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        setIsSortOpen(false);
        setIsMoreMenuOpen(false);
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggleZenMode]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sortOptions: { id: SortOption; label: string }[] = [
    { id: "newest", label: "Più recenti" },
    { id: "oldest", label: "Meno recenti" },
    { id: "title", label: "Titolo (A-Z)" },
    { id: "title_desc", label: "Titolo (Z-A)" },
    { id: "type", label: "Per Tipologia" },
    { id: "favorites", label: "Prima Preferiti" },
  ];

  const currentSortLabel = sortOptions.find((s) => s.id === sortBy)?.label || "Ordina";

  return (
    <header className="h-14 border-b border-[#1A1A1A] bg-[#0A0A0A]/95 backdrop-blur-md flex items-center justify-between px-3 sm:px-5 shrink-0 z-20 gap-3">
      {/* Left side: Mobile menu toggle + Modern Omnibar */}
      <div className="flex items-center gap-2.5 flex-1 max-w-xl min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 text-[#888] hover:text-white bg-[#121212] hover:bg-[#1A1A1A] border border-[#242424] rounded-lg shrink-0 transition-colors"
          aria-label="Apri menu laterale"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Omnibar Input */}
        <div className="relative w-full min-w-0 flex items-center">
          <Search className={`absolute left-3 w-4 h-4 transition-colors ${
            isSearchFocused ? "text-[#C5A059]" : "text-[#555]"
          }`} />
          
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cerca per titolo, testo, entità o tag..."
            className="w-full bg-[#111111] hover:bg-[#141414] focus:bg-[#141414] border border-[#202020] focus:border-[#C5A059]/70 rounded-lg py-1.5 pl-9 pr-24 text-xs text-[#E0E0E0] placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-[#C5A059]/30 transition-all font-sans"
          />

          {/* Right badges inside Omnibar */}
          <div className="absolute right-2 flex items-center gap-1.5 pointer-events-none">
            {searchQuery ? (
              <>
                <span className="text-[10px] font-mono text-[#C5A059] bg-[#C5A059]/10 px-1.5 py-0.5 rounded border border-[#C5A059]/20 pointer-events-auto">
                  {totalCount} {totalCount === 1 ? "risultato" : "risultati"}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSearchChange("");
                    searchInputRef.current?.focus();
                  }}
                  className="pointer-events-auto text-[#666] hover:text-[#DDD] p-0.5 rounded transition-colors"
                  aria-label="Cancella ricerca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <span className="hidden sm:flex items-center gap-0.5 text-[10px] font-mono text-[#555] bg-[#161616] px-1.5 py-0.5 rounded border border-[#222]">
                <Command className="w-2.5 h-2.5" />
                <span>K</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right side: Sort, Views, More Menu & Primary CTA */}
      <div className="flex items-center gap-2 shrink-0">
        
        {/* Sort Menu Dropdown */}
        <div className="relative" ref={sortMenuRef}>
          <button
            onClick={() => setIsSortOpen(!isSortOpen)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#222] bg-[#111] hover:bg-[#161616] hover:border-[#333] text-xs font-mono text-[#999] hover:text-[#DDD] transition-all"
            title="Ordina le risorse del Vault"
          >
            <ArrowUpDown className="w-3 h-3 text-[#C5A059]" />
            <span className="truncate max-w-[120px]">{currentSortLabel}</span>
          </button>

          {isSortOpen && (
            <div className="absolute right-0 mt-1.5 w-48 bg-[#111111] border border-[#222222] rounded-lg shadow-xl py-1 z-30 font-sans text-xs">
              <div className="px-3 py-1 text-[10px] font-mono text-[#555] uppercase tracking-wider border-b border-[#1A1A1A]">
                Ordina risorse
              </div>
              {sortOptions.map((opt) => {
                const isSelected = opt.id === sortBy;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onSortByChange(opt.id);
                      setIsSortOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#1A1A1A] transition-colors text-left ${
                      isSelected ? "text-[#E5C170] font-medium bg-[#16130B]" : "text-[#AAA]"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#C5A059]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* View Mode Toggle: Grid / Table / Graph */}
        <div className="flex items-center bg-[#111111] border border-[#202020] rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => onViewModeChange("grid")}
            className={`p-1.5 rounded-md text-xs font-mono flex items-center gap-1 transition-all ${
              viewMode === "grid"
                ? "bg-[#1F180E] text-[#E5C170] border border-[#C5A059]/40 shadow-xs"
                : "text-[#777] hover:text-[#CCC] hover:bg-[#161616]"
            }`}
            title="Vista Schede a Griglia"
            aria-label="Vista Griglia"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[10.5px]">Griglia</span>
          </button>

          <button
            onClick={() => onViewModeChange("table")}
            className={`p-1.5 rounded-md text-xs font-mono flex items-center gap-1 transition-all ${
              viewMode === "table"
                ? "bg-[#1F180E] text-[#E5C170] border border-[#C5A059]/40 shadow-xs"
                : "text-[#777] hover:text-[#CCC] hover:bg-[#161616]"
            }`}
            title="Vista Elenco a Tabella"
            aria-label="Vista Tabella"
          >
            <List className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[10.5px]">Tabella</span>
          </button>

          <button
            onClick={() => onViewModeChange("graph")}
            className={`p-1.5 rounded-md text-xs font-mono flex items-center gap-1 transition-all ${
              viewMode === "graph"
                ? "bg-[#1F180E] text-[#E5C170] border border-[#C5A059]/40 shadow-xs"
                : "text-[#777] hover:text-[#CCC] hover:bg-[#161616]"
            }`}
            title="Vista Grafo Ontologico OKF"
            aria-label="Vista Grafo"
          >
            <Network className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[10.5px]">Grafo</span>
          </button>
        </div>

        {/* Zen / ADHD Focus Mode Toggle */}
        {onToggleZenMode && (
          <button
            onClick={onToggleZenMode}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
              isZenMode
                ? "bg-[#251B0A] border-[#C5A059] text-[#E5C170] shadow-sm font-semibold ring-1 ring-[#C5A059]/50"
                : "bg-[#111] hover:bg-[#161616] border-[#222] hover:border-[#333] text-[#888] hover:text-[#DDD]"
            }`}
            title={
              isZenMode 
                ? "Esci dalla Modalità Focus Zen (Esc o ⌘⇧F)" 
                : "Attiva Modalità Focus Zen (⌘⇧F) - Rimuove la sidebar e isola il canvas per massima concentrazione cognitiva"
            }
            aria-label="Modalità Focus Zen"
          >
            <Focus className={`w-3.5 h-3.5 ${isZenMode ? "text-[#C5A059] animate-pulse" : "text-[#777]"}`} />
            <span className="hidden sm:inline">{isZenMode ? "Zen Attivo" : "Focus"}</span>
          </button>
        )}

        {/* Secondary Tools Menu (··· Altro) */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
            className="p-1.5 text-[#888] hover:text-white bg-[#111] hover:bg-[#181818] border border-[#202020] rounded-lg transition-colors"
            title="Strumenti aggiuntivi ed esportazioni"
            aria-label="Altri strumenti"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isMoreMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-52 bg-[#111111] border border-[#222222] rounded-lg shadow-2xl py-1 z-30 font-sans text-xs">
              <div className="px-3 py-1 text-[10px] font-mono text-[#555] uppercase tracking-wider border-b border-[#1A1A1A]">
                Strumenti Vault
              </div>

              {onOpenPrintDossier && (
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    onOpenPrintDossier();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left"
                >
                  <Printer className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Stampa / Dossier PDF</span>
                </button>
              )}

              {onOpenDiagnostic && (
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    onOpenDiagnostic();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left"
                >
                  <Terminal className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Console Log & Tracing</span>
                </button>
              )}

              {onOpenGoogleDrive && (
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    onOpenGoogleDrive();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[#CCC] hover:text-white hover:bg-[#181818] transition-colors text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span>Google Drive & Docs Hub</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Primary Action Button: Add Resource */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs py-1.5 px-3 sm:px-3.5 rounded-lg transition-all shadow-sm active:scale-95 shrink-0 cursor-pointer"
          title="Aggiungi o Ingerisci nuova Risorsa"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="hidden sm:inline font-medium">Nuova</span>
        </button>
      </div>
    </header>
  );
};
