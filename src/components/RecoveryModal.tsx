import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  RotateCcw, 
  Download, 
  Upload, 
  Database, 
  HardDrive, 
  Layers, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Search, 
  FileText,
  Clock,
  Sparkles,
  RefreshCw,
  FolderArchive
} from "lucide-react";
import { ResourceItem, RawFileItem, NavCategory } from "../types";
import { 
  performDeepRecoveryScan, 
  DeepRecoveryScanReport, 
  restoreRecoveredResources, 
  downloadBackupJSON 
} from "../lib/recoveryManager";

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentResources: ResourceItem[];
  currentCategory: NavCategory;
  selectedTag: string | null;
  searchQuery: string;
  onResetFilters: () => void;
  onApplyRestoredResources: (restored: ResourceItem[]) => void;
  currentUserId?: string;
  rawFiles: RawFileItem[];
}

export const RecoveryModal: React.FC<RecoveryModalProps> = ({
  isOpen,
  onClose,
  currentResources,
  currentCategory,
  selectedTag,
  searchQuery,
  onResetFilters,
  onApplyRestoredResources,
  currentUserId,
  rawFiles,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanReport, setScanReport] = useState<DeepRecoveryScanReport | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessMessage, setRestoreSuccessMessage] = useState<string | null>(null);
  const [selectedItemsForRestore, setSelectedItemsForRestore] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string>("all");
  const [modalSearch, setModalSearch] = useState<string>("");
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [fileImportError, setFileImportError] = useState<string | null>(null);

  // Run deep scan when modal opens
  useEffect(() => {
    if (isOpen) {
      handleRunScan();
    }
  }, [isOpen]);

  const handleRunScan = async () => {
    setIsScanning(true);
    setRestoreSuccessMessage(null);
    try {
      const report = await performDeepRecoveryScan(currentResources);
      setScanReport(report);
      // Default select all unique resources found
      setSelectedItemsForRestore(new Set(report.uniqueResources.map((r) => r.id)));
    } catch (err) {
      console.error("[RecoveryModal] Scan failed:", err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleRestoreAll = async () => {
    if (!scanReport || scanReport.uniqueResources.length === 0) return;
    setIsRestoring(true);
    try {
      const itemsToRestore = scanReport.uniqueResources.filter((r) => 
        selectedItemsForRestore.has(r.id)
      );

      const result = await restoreRecoveredResources(
        itemsToRestore,
        currentResources,
        currentUserId,
        rawFiles
      );

      onApplyRestoredResources(result.restoredResources);
      setRestoreSuccessMessage(
        `Ripristino completato con successo! ${result.mergedCount} risorse totali ora attive e salvate nel Vault.`
      );
      // Re-scan
      setTimeout(handleRunScan, 1500);
    } catch (err: any) {
      console.error("[RecoveryModal] Restore error:", err);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleExportJSON = () => {
    const listToExport = scanReport?.uniqueResources.length ? scanReport.uniqueResources : currentResources;
    downloadBackupJSON(listToExport, rawFiles);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileImportError(null);
    setIsImportingFile(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const importedResources: any[] = Array.isArray(parsed) ? parsed : (parsed.resources || []);
        
        if (importedResources.length === 0) {
          throw new Error("Nessuna risorsa valida trovata nel file JSON caricato.");
        }

        const normalized: ResourceItem[] = importedResources.map((r, i) => ({
          id: r.id || `file-imported-${Date.now()}-${i}`,
          userId: r.userId || currentUserId || "offline-user",
          title: r.title || `Risorsa importata #${i + 1}`,
          type: r.type || "knowledge",
          summary: r.summary || "",
          tags: Array.isArray(r.tags) ? r.tags : [],
          url: r.url || "",
          metadata: r.metadata,
          isFavorite: !!r.isFavorite,
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
          updatedAt: new Date(),
        }));

        const result = await restoreRecoveredResources(
          normalized,
          currentResources,
          currentUserId,
          rawFiles
        );

        onApplyRestoredResources(result.restoredResources);
        setRestoreSuccessMessage(
          `Importate e ripristinate ${result.addedCount} nuove risorse dal file (${result.mergedCount} totali nel Vault)!`
        );
        setTimeout(handleRunScan, 1500);
      } catch (err: any) {
        setFileImportError(err?.message || "Errore nel caricamento del file di backup.");
      } finally {
        setIsImportingFile(false);
      }
    };
    reader.readAsText(file);
  };

  const hasActiveFilters = currentCategory !== "all" || !!selectedTag || !!searchQuery.trim();

  if (!isOpen) return null;

  const displayList = (scanReport?.uniqueResources || []).filter((r) => {
    if (filterType !== "all" && r.type !== filterType) return false;
    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchSummary = r.summary?.toLowerCase().includes(q);
      const matchTags = r.tags?.some((t) => t.toLowerCase().includes(q));
      return matchTitle || matchSummary || matchTags;
    }
    return true;
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl max-h-[92vh] bg-[#0E0C09] border border-[#2D2413] rounded-2xl flex flex-col shadow-2xl overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E190F] bg-[#141009]/95">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#C5A059]/15 border border-[#C5A059]/30 text-[#D5B069]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Centro di Recupero & Diagnostica Risorse
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1C160C] text-[#C5A059] border border-[#3E3017]">
                  Storage Shield v0.2
                </span>
              </div>
              <p className="text-xs text-[#888]">
                Scansione automatica multi-livello (LocalStorage, IndexedDB, Session, Server Backup e Snapshots)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunScan}
              disabled={isScanning}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1A1610] hover:bg-[#251F14] text-[#CCC] hover:text-white border border-[#2D2413] flex items-center gap-1.5 transition-all"
              title="Riesegui scansione"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-[#C5A059]" : ""}`} />
              <span className="hidden sm:inline">Riscansiona</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Chiudi finestra"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1C160C] hover:bg-[#2A2010] text-[#888] hover:text-white border border-[#3E3017] transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* SECTION 1: FILTER STATUS WARNING (Why items might be hidden right now) */}
          {hasActiveFilters && (
            <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Filter className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-semibold text-amber-300">Filtri di visualizzazione attivi: </span>
                  <span className="text-[#DDD]">
                    {currentCategory !== "all" && `Categoria: "${currentCategory}" • `}
                    {selectedTag && `Tag: "#${selectedTag}" • `}
                    {searchQuery && `Ricerca: "${searchQuery}"`}
                  </span>
                  <p className="text-[11px] text-amber-400/80 mt-0.5">
                    Le tue risorse potrebbero non essere perse ma solo nascoste dai filtri attuali.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  onResetFilters();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-medium shrink-0 transition-colors"
              >
                Azzera Filtri e Mostra Tutto
              </button>
            </div>
          )}

          {/* Success / Info alerts */}
          {restoreSuccessMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 flex items-center gap-2 text-xs text-emerald-300 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{restoreSuccessMessage}</span>
            </div>
          )}

          {fileImportError && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-center gap-2 text-xs text-rose-300 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{fileImportError}</span>
            </div>
          )}

          {/* SECTION 2: STORAGE DETECTION REPORT CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#141009] border border-[#241C0E]">
              <div className="flex items-center justify-between text-xs text-[#888] mb-1">
                <span>Vault Attivo</span>
                <Layers className="w-3.5 h-3.5 text-[#C5A059]" />
              </div>
              <div className="text-xl font-bold text-white">
                {currentResources.length}
              </div>
              <span className="text-[10px] text-[#777]">risorse caricate in memoria</span>
            </div>

            <div className="p-3 rounded-xl bg-[#141009] border border-[#241C0E]">
              <div className="flex items-center justify-between text-xs text-[#888] mb-1">
                <span>Storage Scansionato</span>
                <HardDrive className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-blue-300">
                {scanReport ? scanReport.totalUniqueResources : "..."}
              </div>
              <span className="text-[10px] text-[#777]">risorse uniche rilevate</span>
            </div>

            <div className="p-3 rounded-xl bg-[#141009] border border-[#241C0E]">
              <div className="flex items-center justify-between text-xs text-[#888] mb-1">
                <span>Sorgenti Trovate</span>
                <Database className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-300">
                {scanReport ? scanReport.sources.length : "..."}
              </div>
              <span className="text-[10px] text-[#777]">livelli di storage con dati</span>
            </div>

            <div className="p-3 rounded-xl bg-[#141009] border border-[#241C0E]">
              <div className="flex items-center justify-between text-xs text-[#888] mb-1">
                <span>Buffer Grezzi</span>
                <FolderArchive className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-xl font-bold text-purple-300">
                {scanReport ? scanReport.totalRawFilesFound : rawFiles.length}
              </div>
              <span className="text-[10px] text-[#777]">file grezzi preservati</span>
            </div>
          </div>

          {/* SOURCING BREAKDOWN ACCORDION */}
          {scanReport && scanReport.sources.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[#120F0A] border border-[#261E0E]">
              <h4 className="text-xs font-semibold text-[#D5B069] mb-2 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>Riepilogo Dettagliato Sorgenti Storage Rilevate:</span>
              </h4>
              <div className="space-y-1.5 text-xs">
                {scanReport.sources.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-[#18130B] border border-[#241C0E]">
                    <div className="min-w-0 pr-2">
                      <span className="font-mono text-white text-[11px] truncate block">{s.sourceName}</span>
                      <span className="text-[10px] text-[#777]">{s.description}</span>
                    </div>
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#20180D] text-[#C5A059] border border-[#3E3017] shrink-0">
                      {s.count} elementi
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: ACTION CONTROLS & RESTORE BAR */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-[#17130C] border border-[#2E2413]">
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestoreAll}
                disabled={isRestoring || !scanReport || scanReport.uniqueResources.length === 0}
                className="px-4 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isRestoring ? "animate-spin" : ""}`} />
                <span>
                  {isRestoring
                    ? "Ripristino in corso..."
                    : `Ripristina Tutte (${scanReport?.uniqueResources.length || 0} Risorse)`}
                </span>
              </button>

              <button
                onClick={handleExportJSON}
                className="px-3 py-2 rounded-lg bg-[#1D180F] hover:bg-[#282114] text-[#DDD] hover:text-white border border-[#362A14] text-xs flex items-center gap-1.5 transition-colors"
                title="Esporta copia JSON di sicurezza sul tuo computer"
              >
                <Download className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Scarica Backup JSON</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="cursor-pointer px-3 py-2 rounded-lg bg-[#1D180F] hover:bg-[#282114] text-[#DDD] hover:text-white border border-[#362A14] text-xs flex items-center gap-1.5 transition-colors">
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                <span>{isImportingFile ? "Caricamento..." : "Importa da File JSON"}</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isImportingFile}
                />
              </label>
            </div>
          </div>

          {/* SECTION 4: PREVIEW OF RECOVERABLE RESOURCES */}
          <div className="border border-[#241C0E] rounded-xl overflow-hidden bg-[#110E09]">
            <div className="p-3 border-b border-[#241C0E] flex flex-wrap items-center justify-between gap-2 bg-[#16120B]">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#DDD]">
                <FileText className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Anteprima Risorse Recuperabili ({displayList.length})</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3 h-3 text-[#777] absolute left-2 top-2" />
                  <input
                    type="text"
                    placeholder="Filtra per titolo o tag..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="pl-7 pr-2 py-1 text-[11px] rounded-lg bg-[#1E180E] border border-[#332512] text-white placeholder-[#666] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-2 py-1 text-[11px] rounded-lg bg-[#1E180E] border border-[#332512] text-[#CCC] focus:outline-none"
                >
                  <option value="all">Tutti i tipi</option>
                  <option value="knowledge">Knowledge</option>
                  <option value="troubleshooting">Troubleshooting</option>
                  <option value="mcp_server">MCP Server</option>
                  <option value="github_repo">GitHub Repo</option>
                  <option value="ai_skill">AI Skill</option>
                  <option value="article">Articolo</option>
                </select>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-[#1D170C]">
              {displayList.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#777]">
                  {isScanning ? "Scansione in corso..." : "Nessuna risorsa trovata per i criteri selezionati."}
                </div>
              ) : (
                displayList.map((item) => (
                  <div key={item.id} className="p-2.5 px-3 flex items-start justify-between gap-3 hover:bg-[#18130B] transition-colors text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white truncate max-w-md">{item.title}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#20190D] text-[#C5A059] border border-[#3A2C14]">
                          {item.type}
                        </span>
                        {item.metadata?.docType && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#161C24] text-sky-400 border border-sky-900/40 font-mono">
                            {item.metadata.docType}
                          </span>
                        )}
                      </div>
                      {item.summary && (
                        <p className="text-[11px] text-[#888] line-clamp-1 mt-0.5">{item.summary}</p>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-[#666] mt-1 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString("it-IT") : "N/D"}
                        </span>
                        {item.tags && item.tags.length > 0 && (
                          <span className="truncate max-w-xs text-[#C5A059]/70">
                            #{item.tags.slice(0, 4).join(" #")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#1E190F] bg-[#141009] flex items-center justify-between">
          <span className="text-[11px] text-[#777]">
            Tutte le risorse ripristinate vengono salvate automaticamente su LocalStorage, IndexedDB e Server.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1C160C] hover:bg-[#282012] text-[#CCC] hover:text-white border border-[#3E3017] text-xs transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
