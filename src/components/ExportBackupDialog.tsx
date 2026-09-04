import React, { useState } from "react";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  X,
  CheckCircle2,
  Database,
  Filter,
  Layers,
  Sparkles,
  Info,
  ShieldCheck,
} from "lucide-react";
import { ResourceItem, ResourceType, NavCategory } from "../types";
import { exportResourcesToJSON, exportResourcesToCSV } from "../lib/exportUtils";
import { filterAndRankResources } from "../lib/searchEngine";

interface ExportBackupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  resources: ResourceItem[];
  currentCategory: NavCategory;
  selectedTag: string | null;
  searchQuery: string;
  onAddLog?: (category: any, level: any, message: string, details?: any) => void;
}

export const ExportBackupDialog: React.FC<ExportBackupDialogProps> = ({
  isOpen,
  onClose,
  resources,
  currentCategory,
  selectedTag,
  searchQuery,
  onAddLog,
}) => {
  const [exportScope, setExportScope] = useState<"all" | "filtered">("all");
  const [selectedFormat, setSelectedFormat] = useState<"json" | "csv">("json");
  const [isExporting, setIsExporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter resources if "filtered" scope is chosen
  const filteredResources = filterAndRankResources(
    resources,
    searchQuery,
    currentCategory,
    selectedTag,
    "newest"
  );

  const exportTarget = exportScope === "all" ? resources : filteredResources;

  const handleExport = () => {
    setIsExporting(true);
    setSuccessMessage(null);

    try {
      let filename = "";
      if (selectedFormat === "json") {
        filename = exportResourcesToJSON(exportTarget, `knowledge_vault_${exportScope}`);
      } else {
        filename = exportResourcesToCSV(exportTarget, `knowledge_vault_${exportScope}`);
      }

      setSuccessMessage(`File "${filename}" scaricato con successo (${exportTarget.length} risorse).`);
      
      if (onAddLog) {
        onAddLog(
          "success",
          "SYSTEM",
          `Backup locale esportato con successo in formato ${selectedFormat.toUpperCase()}`,
          {
            format: selectedFormat,
            scope: exportScope,
            count: exportTarget.length,
            filename,
          }
        );
      }

      setTimeout(() => {
        setIsExporting(false);
      }, 800);
    } catch (err: any) {
      setIsExporting(false);
      if (onAddLog) {
        onAddLog("error", "SYSTEM", "Errore durante l'esportazione del backup locale", { error: err.message });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-[#0D0D0D] border border-[#222] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#1A1A1A] flex items-center justify-between bg-[#0A0A0A]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#141414] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059]">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-serif text-white flex items-center gap-2">
                <span>Esporta Backup Vault</span>
                <span className="text-[10px] font-mono bg-[#1C170E] text-[#C5A059] border border-[#C5A059]/30 px-2 py-0.5 rounded-full">
                  OKF v0.2
                </span>
              </h2>
              <p className="text-xs text-[#777]">
                Salva una copia offline completa dei tuoi dati, ontologie e risorse.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#666] hover:text-white hover:bg-[#1A1A1A] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-5">
          {/* Format Selection */}
          <div>
            <label className="block text-xs font-mono text-[#AAA] mb-2 uppercase tracking-wider">
              1. Seleziona Formato di Esportazione
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* JSON Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedFormat("json");
                  setSuccessMessage(null);
                }}
                className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  selectedFormat === "json"
                    ? "bg-[#141108] border-[#C5A059] text-white shadow-md shadow-[#C5A059]/10"
                    : "bg-[#111] border-[#222] text-[#888] hover:border-[#333] hover:text-[#CCC]"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    selectedFormat === "json"
                      ? "bg-[#C5A059] text-black font-bold"
                      : "bg-[#1A1A1A] text-[#777]"
                  }`}
                >
                  <FileJson className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <span className={selectedFormat === "json" ? "text-[#C5A059] font-bold" : ""}>
                      JSON (Completo)
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 bg-[#222] rounded text-[#AAA]">
                      Raccomandato
                    </span>
                  </div>
                  <p className="text-[11px] text-[#666] mt-0.5 leading-snug">
                    Include metadati OKF, entità, relazioni topologiche, YAML frontmatter e contenuto Markdown.
                  </p>
                </div>
              </button>

              {/* CSV Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedFormat("csv");
                  setSuccessMessage(null);
                }}
                className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  selectedFormat === "csv"
                    ? "bg-[#141108] border-[#C5A059] text-white shadow-md shadow-[#C5A059]/10"
                    : "bg-[#111] border-[#222] text-[#888] hover:border-[#333] hover:text-[#CCC]"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    selectedFormat === "csv"
                      ? "bg-[#C5A059] text-black font-bold"
                      : "bg-[#1A1A1A] text-[#777]"
                  }`}
                >
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <span className={selectedFormat === "csv" ? "text-[#C5A059] font-bold" : ""}>
                      CSV Tabellare
                    </span>
                  </div>
                  <p className="text-[11px] text-[#666] mt-0.5 leading-snug">
                    Compatibile con Excel, Google Fogli e Numbers con codifica UTF-8 BOM e campi escaped.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Scope Selection */}
          <div>
            <label className="block text-xs font-mono text-[#AAA] mb-2 uppercase tracking-wider">
              2. Ambito dei Dati da Esportare
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  exportScope === "all"
                    ? "bg-[#161616] border-[#C5A059]/60 text-white"
                    : "bg-[#111] border-[#222] text-[#888] hover:border-[#333]"
                }`}
              >
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === "all"}
                  onChange={() => {
                    setExportScope("all");
                    setSuccessMessage(null);
                  }}
                  className="accent-[#C5A059]"
                />
                <div className="flex-1 text-xs">
                  <span className="font-medium text-[#EEE]">Tutto il Vault</span>
                  <div className="text-[11px] text-[#666] font-mono">
                    {resources.length} elementi totali
                  </div>
                </div>
                <Database className="w-4 h-4 text-[#777]" />
              </label>

              <label
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  exportScope === "filtered"
                    ? "bg-[#161616] border-[#C5A059]/60 text-white"
                    : "bg-[#111] border-[#222] text-[#888] hover:border-[#333]"
                }`}
              >
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === "filtered"}
                  onChange={() => {
                    setExportScope("filtered");
                    setSuccessMessage(null);
                  }}
                  className="accent-[#C5A059]"
                />
                <div className="flex-1 text-xs">
                  <span className="font-medium text-[#EEE]">Filtro Attuale</span>
                  <div className="text-[11px] text-[#666] font-mono">
                    {filteredResources.length} elementi visibili
                  </div>
                </div>
                <Filter className="w-4 h-4 text-[#777]" />
              </label>
            </div>
          </div>

          {/* Details summary */}
          <div className="p-3.5 bg-[#111] border border-[#1E1E1E] rounded-xl text-xs space-y-1.5">
            <div className="flex items-center justify-between text-[#888]">
              <span>Risorse selezionate:</span>
              <span className="font-mono text-white font-semibold">{exportTarget.length}</span>
            </div>
            <div className="flex items-center justify-between text-[#888]">
              <span>Formato file:</span>
              <span className="font-mono text-[#C5A059] uppercase">{selectedFormat}</span>
            </div>
            <div className="flex items-center justify-between text-[#888]">
              <span>Standard Ontologico:</span>
              <span className="font-mono text-emerald-400">Open Knowledge Format v0.2</span>
            </div>
          </div>

          {/* Success Banner */}
          {successMessage && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-[#1A1A1A] bg-[#0A0A0A] flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#666]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Generato al 100% in locale nel browser</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-[#2B2B2B] text-xs text-[#AAA] hover:text-white hover:bg-[#141414] transition-colors"
            >
              Chiudi
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || exportTarget.length === 0}
              className="flex items-center gap-1.5 bg-[#C5A059] hover:bg-[#D5B069] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-xs py-2 px-4 rounded-lg transition-all shadow-md shadow-[#C5A059]/10 active:scale-95"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isExporting ? "Generazione..." : `Scarica ${selectedFormat.toUpperCase()}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
