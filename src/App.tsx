/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  ResourceItem, 
  NavCategory, 
  ViewMode, 
  SortOption 
} from "./types";
import { filterAndRankResources } from "./lib/searchEngine";
import { exportResourcesToJSON } from "./lib/exportUtils";
import { enableNetwork, db } from "./lib/firebase";
import { saveQuotaExceededStatus } from "./lib/cacheManager";
import { resetLocalQuotaLock } from "./lib/quotaTelemetry";
import { useVaultData, saveLocalResources } from "./hooks/useVaultData";
import { useVaultCapture } from "./hooks/useVaultCapture";

// Main Components
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { CaptureBar } from "./components/CaptureBar";
import { StatsBanner } from "./components/StatsBanner";
import { ResourceCard } from "./components/ResourceCard";
import { ResourceTable } from "./components/ResourceTable";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { RawFileManager } from "./components/RawFileManager";
import { QuotaTelemetryPage } from "./components/QuotaTelemetryPage";
import { VaultModalsContainer } from "./components/VaultModalsContainer";
import { OkfSyncModal } from "./components/OkfSyncModal";

// Icons
import { FolderSearch, Plus, AlertCircle, BrainCircuit, RefreshCw, ShieldCheck } from "lucide-react";

export default function App() {
  // 1. Vault Data & Persistence Hook
  const {
    user,
    resources,
    setResources,
    isLoadingResources,
    logs,
    addLog,
    setLogs,
    quotaExceeded,
    setQuotaExceeded,
    isSyncing,
    lastSyncTime,
    isSeeding,
    statusMessage,
    setStatusMessage,
    errorMessage,
    setErrorMessage,
    conflictAnalysis,
    isConflictModalOpen,
    setIsConflictModalOpen,
    isApplyingMerge,
    storageDiscrepancyNotice,
    setStorageDiscrepancyNotice,
    handleGoogleSignIn,
    handleSignOut,
    handleSeedDemoData,
    handleSyncSystemSpecs,
    handleBatchImportOkfItems,
    handleManualAdd,
    handleToggleFavorite,
    handleUpdateReadingProgress,
    handleUpdateResource,
    handleDeleteResource,
    handleApplyConflictMerge,
    handleUploadUnsyncedResources,
    handleTriggerSync,
    handleCheckConflicts,
  } = useVaultData();

  // 2. Navigation & Layout States
  const [currentCategory, setCurrentCategory] = useState<NavCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Selected Resources for Modals
  const [selectedResourceForDetail, setSelectedResourceForDetail] = useState<ResourceItem | null>(null);
  const [selectedKnowledgeForReader, setSelectedKnowledgeForReader] = useState<ResourceItem | null>(null);
  const [printPreviewResource, setPrintPreviewResource] = useState<ResourceItem | null>(null);
  const [isPrintDossierOpen, setIsPrintDossierOpen] = useState(false);
  const [isGoogleDriveOpen, setIsGoogleDriveOpen] = useState(false);
  const [googleDriveExportResource, setGoogleDriveExportResource] = useState<ResourceItem | null>(null);

  // Secondary Dialog Booleans
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isKnowledgeUploadOpen, setIsKnowledgeUploadOpen] = useState(false);
  const [isOkfSyncModalOpen, setIsOkfSyncModalOpen] = useState(false);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isPersistenceModalOpen, setIsPersistenceModalOpen] = useState(false);
  const [isCekikjModalOpen, setIsCekikjModalOpen] = useState(false);
  const [isDiscrepancyInspectorOpen, setIsDiscrepancyInspectorOpen] = useState(false);
  const [isVaultHealthCheckOpen, setIsVaultHealthCheckOpen] = useState(false);
  const [isIntelligenceDrawerOpen, setIsIntelligenceDrawerOpen] = useState(false);
  const [intelligencePrefilledQuery, setIntelligencePrefilledQuery] = useState<string>("");

  // 3. Raw Files Buffer & Ingestion Hook
  const {
    rawFiles,
    isLoadingRawFiles,
    isConvertingRawFileId,
    isAnalyzing,
    captureStage,
    captureStageMessage,
    analyzeWithAI,
    handleCapture,
    handleUploadRawFile,
    handleDeleteRawFile,
    handleConvertFileToOKF,
  } = useVaultCapture({
    user,
    quotaExceeded,
    setQuotaExceeded,
    addLog,
    setStatusMessage,
    setErrorMessage,
    resources,
    setResources,
    setSelectedKnowledgeForReader,
    currentCategory,
    setCurrentCategory,
    selectedTag,
    setSelectedTag,
    searchQuery,
    setSearchQuery,
  });

  // ADHD & Deep Focus Zen Mode (⌘⇧F)
  const [isZenMode, setIsZenMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("KV_ZEN_MODE") === "true";
    }
    return false;
  });

  const handleToggleZenMode = () => {
    setIsZenMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("KV_ZEN_MODE", String(next));
      } catch {}
      return next;
    });
  };

  // Global Keyboard Shortcuts (Cmd/Ctrl + K for Intelligence, Cmd/Ctrl + Shift + F or Esc for Zen)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsIntelligenceDrawerOpen((prev) => !prev);
      }
      // Alt+N (or Ctrl/Cmd+Alt+N) to open Add Resource Modal
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setIsAddModalOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        handleToggleZenMode();
      }
      if (e.key === "Escape" && isZenMode) {
        setIsZenMode(false);
        try {
          localStorage.setItem("KV_ZEN_MODE", "false");
        } catch {}
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isZenMode]);

  // Single Resource Export to Google Docs in Google Drive 'knowledge' folder
  const handleExportGoogleDoc = (resource: ResourceItem) => {
    setGoogleDriveExportResource(resource);
    setIsGoogleDriveOpen(true);
  };

  // Compute category counts
  const counts = useMemo(() => {
    const res = {
      all: resources.length,
      knowledge: 0,
      paper: 0,
      troubleshooting: 0,
      note: 0,
      rss: 0,
      article: 0,
      github_repo: 0,
      mcp_server: 0,
      ai_skill: 0,
      link: 0,
      favorites: 0,
      raw_files: rawFiles.length,
    };
    resources.forEach((r) => {
      if (r.type && res[r.type] !== undefined) {
        res[r.type]++;
      }
      if (r.isFavorite) {
        res.favorites++;
      }
    });
    return res;
  }, [resources, rawFiles]);

  const userResourcesCount = useMemo(() => {
    return resources.filter((r) => r.userId && r.userId !== "local-vault-user" && !r.id.startsWith("sample-")).length;
  }, [resources]);

  const systemResourcesCount = useMemo(() => {
    return resources.filter((r) => r.userId === "local-vault-user" || r.id.startsWith("sample-")).length;
  }, [resources]);

  // Compute all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    resources.forEach((r) => {
      if (r.tags && Array.isArray(r.tags)) {
        r.tags.forEach((t) => tagSet.add(t.toLowerCase()));
      }
    });
    return Array.from(tagSet);
  }, [resources]);

  // Filter and sort resources using multi-token & deep indexing search engine
  const filteredResources = useMemo(() => {
    return filterAndRankResources(
      resources,
      searchQuery,
      currentCategory,
      selectedTag,
      sortBy
    );
  }, [resources, currentCategory, selectedTag, searchQuery, sortBy]);

  return (
    <div className="flex h-screen w-full bg-[#050505] text-[#E0E0E0] font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        currentCategory={currentCategory}
        onSelectCategory={(cat) => {
          setCurrentCategory(cat);
          setSelectedTag(null);
        }}
        quotaExceeded={quotaExceeded}
        counts={counts}
        user={user}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onOpenOkfSync={() => setIsOkfSyncModalOpen(true)}
        onSeedDemo={() => handleSeedDemoData(true)}
        isSeeding={isSeeding}
        onOpenKnowledgeUpload={() => setIsKnowledgeUploadOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
        onOpenRecovery={() => setIsRecoveryModalOpen(true)}
        onOpenPersistenceStatus={() => setIsPersistenceModalOpen(true)}
        onOpenVaultHealthCheck={() => setIsVaultHealthCheckOpen(true)}
        onOpenCekikjInspector={() => setIsCekikjModalOpen(true)}
        unsyncedCount={resources.filter((r) => r.id.startsWith("local-") || r.id.startsWith("conv-") || r.id.startsWith("seed-")).length}
        onUploadUnsynced={handleUploadUnsyncedResources}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedTag={selectedTag}
        onSelectTag={(tag) => {
          setSelectedTag(tag);
        }}
        availableTags={allTags}
        onDropFiles={(files) => {
          if (files && files.length > 0) {
            Array.from(files).forEach((file) => {
              handleUploadRawFile(file);
            });
            setCurrentCategory("raw_files");
          }
        }}
        isZenMode={isZenMode}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative h-full min-w-0 overflow-hidden bg-[#070707]">
        {/* Header with Search and Controls */}
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          onOpenAddModal={() => setIsAddModalOpen(true)}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onOpenDiagnostic={() => setIsDiagnosticOpen(true)}
          onOpenExport={() => setIsExportOpen(true)}
          onOpenPrintDossier={() => setIsPrintDossierOpen(true)}
          onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
          onOpenCekikjInspector={() => setIsCekikjModalOpen(true)}
          user={user}
          onSignIn={handleGoogleSignIn}
          totalCount={counts.all}
          userResourcesCount={userResourcesCount}
          systemResourcesCount={systemResourcesCount}
          rawFilesCount={rawFiles.length}
          isZenMode={isZenMode}
          onToggleZenMode={handleToggleZenMode}
          quotaExceeded={quotaExceeded}
          isSyncing={isSyncing}
          lastSyncTime={lastSyncTime}
          onManualSync={handleTriggerSync}
          onExportBackup={() => exportResourcesToJSON(resources)}
          hasPendingConflicts={conflictAnalysis ? conflictAnalysis.hasConflicts : false}
          conflictCount={
            conflictAnalysis
              ? conflictAnalysis.localNewerCount + conflictAnalysis.localOnlyCount + conflictAnalysis.remoteNewerCount
              : 0
          }
          onOpenConflictModal={() => {
            if (conflictAnalysis) {
              setIsConflictModalOpen(true);
            } else {
              handleCheckConflicts();
            }
          }}
          onOpenRecoveryModal={() => setIsRecoveryModalOpen(true)}
          onOpenQuotaTelemetry={() => setCurrentCategory("quota_monitor")}
          onOpenPersistenceStatus={() => setIsPersistenceModalOpen(true)}
          onOpenDiscrepancyInspector={() => setIsDiscrepancyInspectorOpen(true)}
          onOpenVaultHealthCheck={() => setIsVaultHealthCheckOpen(true)}
          unsyncedCount={resources.filter((r) => r.id.startsWith("local-") || r.id.startsWith("conv-") || r.id.startsWith("seed-")).length}
          onUploadUnsynced={handleUploadUnsyncedResources}
          onOpenKnowledgeUpload={() => setIsKnowledgeUploadOpen(true)}
          onOpenOkfSync={() => setIsOkfSyncModalOpen(true)}
          onSeedDemo={() => handleSeedDemoData(true)}
          isSeeding={isSeeding}
        />

        {/* Compact Storage Discrepancy & Recovery Alert */}
        {storageDiscrepancyNotice && storageDiscrepancyNotice.foundCount > resources.length && (
          <div className="bg-[#181309] border-b border-[#C5A059]/40 text-[#E5C170] text-xs px-4 py-2 flex flex-wrap items-center justify-between gap-2 z-20 animate-fade-in font-sans">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#C5A059] shrink-0" />
              <span>
                <strong>Risorse archiviate rilevate nello storage:</strong> Trovate {storageDiscrepancyNotice.foundCount} risorse nei livelli locali/server (visualizzate: {resources.length}).
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsRecoveryModalOpen(true)}
                className="px-2.5 py-1 rounded bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-[11px] transition-colors shadow-xs cursor-pointer"
              >
                Apri Centro di Recupero
              </button>
              <button
                onClick={() => setStorageDiscrepancyNotice(null)}
                className="p-1 text-[#888] hover:text-white text-xs cursor-pointer"
                title="Ignora per ora"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Compact Quota Alert Strip */}
        {quotaExceeded && (
          <div className="bg-[#1C1204] border-b border-amber-600/30 text-amber-200 text-xs px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 z-20 font-sans">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Quota Cloud Firestore:</strong> Modalità offline multi-livello attiva ({counts.all} risorse salvate e protette).
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 font-mono">
              <button
                onClick={async () => {
                  await resetLocalQuotaLock();
                  setQuotaExceeded(false);
                  saveQuotaExceededStatus(false);
                  await enableNetwork(db).catch(() => {});
                  addLog("info", "FIRESTORE", "Verifica manuale quota Firestore avviata e blocco rimosso.");
                  handleTriggerSync();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold rounded text-[11px] cursor-pointer shadow-xs"
                title="Riconnetti Firestore e verifica connettività"
              >
                <RefreshCw className="w-3 h-3" />
                Verifica & Sblocca
              </button>
              <button
                onClick={() => setCurrentCategory("quota_monitor")}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#161616] hover:bg-[#202020] text-[#CCC] hover:text-white rounded border border-[#333] text-[11px] cursor-pointer"
              >
                Diagnostica Quote →
              </button>
              <button
                onClick={async () => {
                  await resetLocalQuotaLock();
                  setQuotaExceeded(false);
                  saveQuotaExceededStatus(false);
                  enableNetwork(db).catch(() => {});
                  addLog("info", "SYSTEM", "Banner avviso quota chiuso e blocco rimosso.");
                }}
                className="text-amber-400 hover:text-amber-200 px-1.5 py-0.5 text-xs ml-1 cursor-pointer font-bold"
                title="Chiudi avviso e sblocca"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Status Toast */}
        {statusMessage && (
          <div className="bg-[#C5A059] text-black text-xs font-semibold px-4 py-2 text-center animate-fade-in flex items-center justify-center gap-2">
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Error Toast */}
        {errorMessage && (
          <div className="bg-rose-950/90 border-b border-rose-800 text-rose-200 text-xs font-medium px-4 py-2 text-center animate-fade-in flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main Workspace Container: Immersive Fullscreen-fit for Graph View, Scrollable for Cards/Lists */}
        {viewMode === "graph" ? (
          <div className="flex-1 w-full h-full min-h-0 relative flex flex-col overflow-hidden bg-[#070707] p-2 sm:p-3">
            <KnowledgeGraph
              resources={filteredResources}
              onSelectResource={(item) => {
                if (item.type === "knowledge") {
                  setSelectedKnowledgeForReader(item);
                } else {
                  setSelectedResourceForDetail(item);
                }
              }}
              selectedTag={selectedTag}
              onSelectTag={setSelectedTag}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onOpenIntelligence={() => setIsIntelligenceDrawerOpen((prev) => !prev)}
            />
          </div>
        ) : (
          <>
            {/* Scrollable View Container */}
            <div className={`flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 flex flex-col transition-all duration-300 ${
              isZenMode ? "max-w-6xl mx-auto w-full" : ""
            }`}>
              {/* Active Zen Focus Mode Notice */}
              {isZenMode && (
                <div className="bg-[#141007] border border-[#C5A059]/35 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-[#E5C170] shadow-sm animate-fade-in font-sans">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C5A059] animate-pulse shrink-0" />
                    <span>
                      <strong>Modalità Focus Zen Attiva:</strong> Distrazioni rimosse per facilitare la concentrazione profonda e la lettura per profili neurodivergenti/ADHD.
                    </span>
                  </div>
                  <button
                    onClick={handleToggleZenMode}
                    className="px-2.5 py-1 rounded bg-[#251B0A] hover:bg-[#33240D] border border-[#C5A059]/50 text-[#E5C170] text-[11px] font-medium transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ml-3"
                    title="Disattiva Focus Zen (Esc o ⌘⇧F)"
                  >
                    <span>Esci da Focus</span>
                    <kbd className="text-[10px] text-[#A68848] font-mono bg-[#181206] px-1 rounded">⌘⇧F</kbd>
                  </button>
                </div>
              )}

              {/* Top Category Info & Tag Cloud */}
              {currentCategory !== "quota_monitor" && (
                <StatsBanner
                  counts={counts}
                  currentCategory={currentCategory}
                  allTags={allTags}
                  selectedTag={selectedTag}
                  onSelectTag={setSelectedTag}
                  sortBy={sortBy}
                  onSortByChange={setSortBy}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  totalFilteredCount={filteredResources.length}
                  searchQuery={searchQuery}
                  onClearSearch={() => setSearchQuery("")}
                  onOpenPrintDossier={() => setIsPrintDossierOpen(true)}
                  onOpenDiscrepancyInspector={() => setIsDiscrepancyInspectorOpen(true)}
                />
              )}

              {/* Resources, Quota Telemetry or Raw Files Display */}
              {currentCategory === "quota_monitor" ? (
                <div className="flex-1 flex flex-col min-h-0">
                  <QuotaTelemetryPage
                    quotaExceeded={quotaExceeded}
                    onRefreshOnlineStatus={async () => {
                      setQuotaExceeded(false);
                      saveQuotaExceededStatus(false);
                      await enableNetwork(db).catch(() => {});
                      addLog("success", "FIRESTORE", "Rete Firestore riattivata con successo dal Centro Telemetria.");
                      handleTriggerSync();
                    }}
                    onBackToVault={() => setCurrentCategory("all")}
                  />
                </div>
              ) : currentCategory === "raw_files" ? (
                <div className="flex-1 flex flex-col min-h-0">
                  <RawFileManager
                    files={rawFiles}
                    isLoading={isLoadingRawFiles}
                    onUploadFile={handleUploadRawFile}
                    onDeleteFile={handleDeleteRawFile}
                    onConvertFileToOKF={handleConvertFileToOKF}
                    onViewResource={(resId) => {
                      const target = resources.find((r) => r.id === resId);
                      if (target) {
                        if (target.type === "knowledge") {
                          setSelectedKnowledgeForReader(target);
                        } else {
                          setSelectedResourceForDetail(target);
                        }
                      }
                    }}
                    isConvertingId={isConvertingRawFileId}
                  />
                </div>
              ) : isLoadingResources ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-pulse">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-56 bg-[#0D0D0D] border border-[#1A1A1A] rounded-xl p-5" />
                  ))}
                </div>
              ) : filteredResources.length === 0 ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[#222] rounded-2xl bg-[#0A0A0A] my-6">
                  <div className="w-12 h-12 rounded-full bg-[#141414] border border-[#262626] flex items-center justify-center text-[#C5A059] mb-4">
                    <FolderSearch className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-serif text-white mb-1">
                    {resources.length > 0 ? "Nessuna risorsa corrisponde ai filtri impostati" : "Nessuna risorsa visualizzata"}
                  </h3>
                  <p className="text-xs text-[#777] max-w-md mb-6 leading-relaxed">
                    {resources.length > 0
                      ? `Attualmente sono presenti ${resources.length} risorse nel tuo Vault, ma nessuna corrisponde ai filtri attivi (${currentCategory !== "all" ? `categoria "${currentCategory}"` : ""}${selectedTag ? ` • tag "#${selectedTag}"` : ""}${searchQuery ? ` • ricerca "${searchQuery}"` : ""}).`
                      : (searchQuery || selectedTag
                        ? "Nessun risultato corrisponde ai criteri di ricerca impostati. Prova a rimuovere i filtri."
                        : "Il tuo Vault è vuoto o le risorse sono archiviate nei livelli di storage (LocalStorage / IndexedDB / Server).")}
                  </p>
                  
                  <div className="flex items-center gap-3 flex-wrap justify-center">
                    {resources.length > 0 && (currentCategory !== "all" || selectedTag || searchQuery) ? (
                      <button
                        onClick={() => {
                          setCurrentCategory("all");
                          setSearchQuery("");
                          setSelectedTag(null);
                        }}
                        className="px-4 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <span>Mostra Tutte le {resources.length} Risorse (Azzera Filtri)</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setIsRecoveryModalOpen(true)}
                          className="px-4 py-2 rounded-lg bg-[#1B150C] hover:bg-[#2A2012] border border-[#3E3017] hover:border-[#C5A059]/60 text-[#E5C170] text-xs transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-[#C5A059]" />
                          <span>Apri Centro di Recupero</span>
                        </button>
                        <button
                          onClick={() => setIsOkfSyncModalOpen(true)}
                          className="px-4 py-2 rounded-lg bg-[#141414] hover:bg-[#1E1E1E] border border-[#333] hover:border-[#C5A059]/50 text-xs text-[#C5A059] transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Sincronizza OKF (GitHub / Sistema)</span>
                        </button>
                        <button
                          onClick={() => setIsKnowledgeUploadOpen(true)}
                          className="px-4 py-2 rounded-lg bg-[#1E1A11] hover:bg-[#2B2313] border border-[#C5A059]/40 text-[#D5B069] text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <BrainCircuit className="w-3.5 h-3.5" />
                          <span>Carica OKF Doc</span>
                        </button>
                        <button
                          onClick={() => setIsAddModalOpen(true)}
                          className="px-4 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Nuova Risorsa</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : viewMode === "grid" ? (
                /* Grid View */
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredResources.map((item) => (
                    <ResourceCard
                      key={item.id}
                      resource={item}
                      onToggleFavorite={handleToggleFavorite}
                      onUpdateProgress={handleUpdateReadingProgress}
                      onPrintPreview={(res) => setPrintPreviewResource(res)}
                      onExportGoogleDoc={handleExportGoogleDoc}
                      onOpenDetail={(res) => {
                        if (res.type === "knowledge") {
                          setSelectedKnowledgeForReader(res);
                        } else {
                          setSelectedResourceForDetail(res);
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                /* Table View */
                <ResourceTable
                  resources={filteredResources}
                  onToggleFavorite={handleToggleFavorite}
                  onPrintPreview={(res) => setPrintPreviewResource(res)}
                  onExportGoogleDoc={handleExportGoogleDoc}
                  onOpenDetail={(res) => {
                    if (res.type === "knowledge") {
                      setSelectedKnowledgeForReader(res);
                    } else {
                      setSelectedResourceForDetail(res);
                    }
                  }}
                />
              )}
            </div>

            {/* Bottom Floating Quick Capture Bar */}
            <div className="p-4 sm:p-6 sm:pt-0 shrink-0 bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent">
              <div className="max-w-4xl mx-auto">
                <CaptureBar
                  onCapture={handleCapture}
                  isAnalyzing={isAnalyzing}
                  captureStage={captureStage}
                  captureStageMessage={captureStageMessage}
                  onOpenKnowledgeUpload={() => setIsKnowledgeUploadOpen(true)}
                  onOpenDiagnostic={() => setIsDiagnosticOpen(true)}
                  onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
                  onUploadRawFile={handleUploadRawFile}
                  onOpenIntelligence={(prefill) => {
                    if (prefill) {
                      setIntelligencePrefilledQuery(prefill);
                      setIsIntelligenceDrawerOpen(true);
                    } else {
                      setIsIntelligenceDrawerOpen((prev) => !prev);
                    }
                  }}
                  isIntelligenceOpen={isIntelligenceDrawerOpen}
                  resourceCount={resources.length}
                />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Extracted Isolated Modals Container */}
      <VaultModalsContainer
        isVaultHealthCheckOpen={isVaultHealthCheckOpen}
        setIsVaultHealthCheckOpen={setIsVaultHealthCheckOpen}
        isDiscrepancyInspectorOpen={isDiscrepancyInspectorOpen}
        setIsDiscrepancyInspectorOpen={setIsDiscrepancyInspectorOpen}
        selectedResourceForDetail={selectedResourceForDetail}
        setSelectedResourceForDetail={setSelectedResourceForDetail}
        resources={resources}
        handleUpdateResource={handleUpdateResource}
        handleDeleteResource={handleDeleteResource}
        handleToggleFavorite={handleToggleFavorite}
        selectedKnowledgeForReader={selectedKnowledgeForReader}
        setSelectedKnowledgeForReader={setSelectedKnowledgeForReader}
        printPreviewResource={printPreviewResource}
        setPrintPreviewResource={setPrintPreviewResource}
        isPrintDossierOpen={isPrintDossierOpen}
        setIsPrintDossierOpen={setIsPrintDossierOpen}
        filteredResources={filteredResources}
        handleExportGoogleDoc={handleExportGoogleDoc}
        isKnowledgeUploadOpen={isKnowledgeUploadOpen}
        setIsKnowledgeUploadOpen={setIsKnowledgeUploadOpen}
        isAddModalOpen={isAddModalOpen}
        setIsAddModalOpen={setIsAddModalOpen}
        handleManualAdd={handleManualAdd}
        analyzeWithAI={analyzeWithAI}
        isDiagnosticOpen={isDiagnosticOpen}
        setIsDiagnosticOpen={setIsDiagnosticOpen}
        logs={logs}
        setLogs={setLogs}
        addLog={addLog}
        userId={user?.uid}
        rawFiles={rawFiles}
        quotaExceeded={quotaExceeded}
        setQuotaExceeded={setQuotaExceeded}
        handleTriggerSync={handleTriggerSync}
        setStatusMessage={setStatusMessage}
        isExportOpen={isExportOpen}
        setIsExportOpen={setIsExportOpen}
        currentCategory={currentCategory}
        selectedTag={selectedTag}
        searchQuery={searchQuery}
        isConflictModalOpen={isConflictModalOpen}
        setIsConflictModalOpen={setIsConflictModalOpen}
        conflictAnalysis={conflictAnalysis}
        handleApplyConflictMerge={handleApplyConflictMerge}
        isApplyingMerge={isApplyingMerge}
        isGoogleDriveOpen={isGoogleDriveOpen}
        setIsGoogleDriveOpen={setIsGoogleDriveOpen}
        googleDriveExportResource={googleDriveExportResource}
        setGoogleDriveExportResource={setGoogleDriveExportResource}
        handleCapture={handleCapture}
        isRecoveryModalOpen={isRecoveryModalOpen}
        setIsRecoveryModalOpen={setIsRecoveryModalOpen}
        setCurrentCategory={setCurrentCategory}
        setSelectedTag={setSelectedTag}
        setSearchQuery={setSearchQuery}
        setResources={setResources}
        saveLocalResources={saveLocalResources}
        setStorageDiscrepancyNotice={setStorageDiscrepancyNotice}
        isPersistenceModalOpen={isPersistenceModalOpen}
        setIsPersistenceModalOpen={setIsPersistenceModalOpen}
        user={user}
        handleGoogleSignIn={handleGoogleSignIn}
        handleUploadUnsyncedResources={handleUploadUnsyncedResources}
        isSyncing={isSyncing}
        isCekikjModalOpen={isCekikjModalOpen}
        setIsCekikjModalOpen={setIsCekikjModalOpen}
        isIntelligenceDrawerOpen={isIntelligenceDrawerOpen}
        setIsIntelligenceDrawerOpen={setIsIntelligenceDrawerOpen}
        intelligencePrefilledQuery={intelligencePrefilledQuery}
        setIntelligencePrefilledQuery={setIntelligencePrefilledQuery}
        setViewMode={setViewMode}
      />

      {/* Sincronizzazione & Importazione OKF (GitHub / Specifiche di Sistema) */}
      <OkfSyncModal
        isOpen={isOkfSyncModalOpen}
        onClose={() => setIsOkfSyncModalOpen(false)}
        currentResources={resources}
        onSyncSystemSpecs={async (force) => {
          await handleSyncSystemSpecs(force);
        }}
        onBatchImportOkf={async (items, sourceLabel) => {
          return await handleBatchImportOkfItems(items, sourceLabel);
        }}
        isSyncingSystem={isSeeding}
        quotaExceeded={quotaExceeded}
      />
    </div>
  );
}
