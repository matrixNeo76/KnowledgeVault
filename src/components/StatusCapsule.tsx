import React, { useEffect, useState, useRef } from "react";
import { 
  RefreshCw, 
  Database, 
  Clock, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  HardDrive, 
  Download, 
  ShieldCheck, 
  GitMerge, 
  Activity, 
  X,
  ExternalLink
} from "lucide-react";
import { getFirebaseQuotaResetInfo, DEFAULT_SYNC_INTERVAL_MS } from "../lib/cacheManager";

export interface StatusCapsuleProps {
  quotaExceeded: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  onManualSync: () => void;
  resourceCount: number;
  onExportBackup?: () => void;
  hasPendingConflicts?: boolean;
  conflictCount?: number;
  onOpenConflictModal?: () => void;
  onOpenRecoveryModal?: () => void;
  onOpenQuotaTelemetry?: () => void;
  onOpenPersistenceStatus?: () => void;
  unsyncedCount?: number;
  onUploadUnsynced?: () => void;
}

export const StatusCapsule: React.FC<StatusCapsuleProps> = ({
  quotaExceeded,
  isSyncing,
  lastSyncTime: _lastSyncTime,
  onManualSync,
  resourceCount,
  onExportBackup,
  hasPendingConflicts,
  conflictCount: _conflictCount,
  onOpenConflictModal,
  onOpenRecoveryModal,
  onOpenQuotaTelemetry,
  onOpenPersistenceStatus,
  unsyncedCount = 0,
  onUploadUnsynced,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState(getFirebaseQuotaResetInfo());
  const [secondsUntilNextAutoSync, setSecondsUntilNextAutoSync] = useState(Math.round(DEFAULT_SYNC_INTERVAL_MS / 1000));
  const [serverStatus, setServerStatus] = useState<{ exists: boolean; formattedSize?: string; savedAt?: string; count?: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Update countdown every second
  useEffect(() => {
    const timer = setInterval(() => {
      setQuotaInfo(getFirebaseQuotaResetInfo());
      setSecondsUntilNextAutoSync((prev) => {
        if (prev <= 1) return Math.round(DEFAULT_SYNC_INTERVAL_MS / 1000);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll server backup status
  useEffect(() => {
    const checkServerBackup = async () => {
      try {
        const res = await fetch("/api/vault/backup-status");
        if (res.ok) {
          const data = await res.json();
          setServerStatus(data);
        }
      } catch {
        // Non-fatal
      }
    };
    checkServerBackup();
    const srvTimer = setInterval(checkServerBackup, 30000);
    return () => clearInterval(srvTimer);
  }, [resourceCount]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const formatMinutesSeconds = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Sleek Compact Status Capsule Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all cursor-pointer shadow-xs ${
          quotaExceeded
            ? "bg-amber-950/40 hover:bg-amber-900/60 border-amber-600/40 text-amber-300 ring-1 ring-amber-500/20"
            : isSyncing
            ? "bg-[#18140B] border-[#C5A059]/50 text-[#E5C170]"
            : hasPendingConflicts
            ? "bg-[#1C160B] border-[#C5A059]/60 text-[#E5C170]"
            : "bg-[#111111] hover:bg-[#161616] border-[#222222] hover:border-[#333333] text-[#AAA] hover:text-[#E0E0E0]"
        }`}
        title="Stato Sincronizzazione, Persistenza Multi-Livello & Quote Cloud"
        aria-label="Stato Sincronizzazione e Persistenza"
      >
        {isSyncing ? (
          <>
            <RefreshCw className="w-3 h-3 text-[#C5A059] animate-spin shrink-0" />
            <span className="text-[11px] font-medium hidden sm:inline text-[#E5C170]">Sincronizzo...</span>
          </>
        ) : quotaExceeded ? (
          <>
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="text-[11px] font-semibold text-amber-300 hidden sm:inline">
              {resourceCount} protetti
            </span>
            <span className="text-[9.5px] px-1 py-0.2 rounded bg-amber-900/60 text-amber-200 border border-amber-700/50">
              Offline
            </span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-[11px] font-medium hidden sm:inline">
              {resourceCount} protetti
            </span>
            {unsyncedCount > 0 && (
              <span className="text-[9.5px] px-1 py-0.2 rounded bg-[#C5A059]/20 text-[#E5C170] border border-[#C5A059]/30">
                +{unsyncedCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0E0E0E] border border-[#262626] rounded-xl shadow-2xl z-50 p-3.5 font-sans animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#1C1C1C]">
            <div className="flex items-center gap-2">
              {quotaExceeded ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <div>
                <h4 className="text-xs font-semibold text-white">
                  {quotaExceeded ? "Protezione Locale Attiva" : "Persistenza Multi-Livello"}
                </h4>
                <p className="text-[10px] text-[#777] font-mono">
                  {resourceCount} risorse sincronizzate e al sicuro
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[#666] hover:text-white p-1 rounded-md transition-colors"
              aria-label="Chiudi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 3-Layer Storage Status Cards */}
          <div className="space-y-1.5 mb-3 font-mono text-[10.5px]">
            {/* Server Backup */}
            <div className="p-2 rounded-lg bg-[#141414] border border-[#202020] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[#CCC]">Disco Server</span>
              </div>
              <span className="text-[#888]">
                {serverStatus?.exists ? (serverStatus.formattedSize || "Attivo") : "Disponibile"}
              </span>
            </div>

            {/* IndexedDB */}
            <div className="p-2 rounded-lg bg-[#141414] border border-[#202020] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[#CCC]">Browser IndexedDB</span>
              </div>
              <span className="text-emerald-400 font-semibold">Attivo</span>
            </div>

            {/* Firestore Cloud */}
            <div className="p-2 rounded-lg bg-[#141414] border border-[#202020] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CloudSyncIcon quotaExceeded={quotaExceeded} isSyncing={isSyncing} />
                <span className="text-[#CCC]">Firestore Cloud</span>
              </div>
              <span className={quotaExceeded ? "text-amber-400 font-semibold" : "text-emerald-400"}>
                {quotaExceeded ? "Offline (In rotazione)" : "Sincronizzato"}
              </span>
            </div>
          </div>

          {/* Cloud Cycles & Timer Row */}
          <div className="grid grid-cols-2 gap-2 mb-3 font-mono text-[10.5px]">
            <div className="p-2 rounded-lg bg-[#121212] border border-[#1E1E1E]">
              <div className="flex items-center gap-1.5 text-[#777] mb-0.5">
                <Clock className="w-3 h-3 text-[#C5A059]" />
                <span>Reset Quota:</span>
              </div>
              <div className={`font-semibold ${quotaExceeded ? "text-amber-300" : "text-[#E5C170]"}`}>
                {quotaInfo.formattedCountdown}
              </div>
              <div className="text-[9px] text-[#555]">
                {quotaInfo.formattedResetTime} locale
              </div>
            </div>

            <div className="p-2 rounded-lg bg-[#121212] border border-[#1E1E1E]">
              <div className="flex items-center gap-1.5 text-[#777] mb-0.5">
                <Zap className="w-3 h-3 text-[#555]" />
                <span>Auto-sync:</span>
              </div>
              <div className="font-semibold text-[#CCC]">
                {formatMinutesSeconds(secondsUntilNextAutoSync)}
              </div>
              <div className="text-[9px] text-[#555]">
                Ogni 10 minuti
              </div>
            </div>
          </div>

          {/* Quick Actions Grid */}
          <div className="space-y-1.5 pt-1 border-t border-[#1C1C1C]">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => {
                  onManualSync();
                }}
                disabled={isSyncing}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#16130B] hover:bg-[#20180B] border border-[#C5A059]/40 text-[#E5C170] text-xs font-mono font-medium transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
                <span>{isSyncing ? "Sincronizzo..." : "Sincronizza"}</span>
              </button>

              {onExportBackup && (
                <button
                  onClick={() => {
                    onExportBackup();
                  }}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#141414] hover:bg-[#1A1A1A] border border-[#242424] text-[#CCC] hover:text-white text-xs font-mono transition-all cursor-pointer"
                >
                  <Download className="w-3 h-3 text-[#C5A059]" />
                  <span>Scarica JSON</span>
                </button>
              )}
            </div>

            {/* Conditional items: Conflicts or Unsynced */}
            {hasPendingConflicts && onOpenConflictModal && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenConflictModal();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#1C160B] hover:bg-[#2A2012] border border-[#C5A059]/50 text-[#E5C170] text-xs font-mono transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <GitMerge className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Allineamento Versioni</span>
                </div>
                <span className="text-[10px] text-[#C5A059]">Risolvi →</span>
              </button>
            )}

            {unsyncedCount > 0 && onUploadUnsynced && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onUploadUnsynced();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#18140B] hover:bg-[#241C10] border border-[#C5A059]/40 text-[#E5C170] text-xs font-mono transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>Sincronizza {unsyncedCount} risorse locali</span>
                </div>
                <span className="text-[10px] text-[#C5A059]">Invia →</span>
              </button>
            )}

            {/* Telemetry and Recovery Links */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              {onOpenRecoveryModal && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenRecoveryModal();
                  }}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#121212] hover:bg-[#181818] border border-[#1E1E1E] text-[#999] hover:text-[#DDD] text-[11px] font-mono transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-3 h-3 text-[#C5A059]" />
                  <span>Centro Recupero</span>
                </button>
              )}

              {onOpenQuotaTelemetry && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenQuotaTelemetry();
                  }}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#121212] hover:bg-[#181818] border border-[#1E1E1E] text-[#999] hover:text-[#DDD] text-[11px] font-mono transition-all cursor-pointer"
                >
                  <Activity className="w-3 h-3 text-[#C5A059]" />
                  <span>Diagnostica</span>
                </button>
              )}
            </div>

            {onOpenPersistenceStatus && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenPersistenceStatus();
                }}
                className="w-full text-center text-[10.5px] font-mono text-[#777] hover:text-[#C5A059] pt-1 transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Dettagli completi architettura storage</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CloudSyncIcon = ({ quotaExceeded, isSyncing }: { quotaExceeded: boolean; isSyncing: boolean }) => {
  if (isSyncing) return <RefreshCw className="w-3.5 h-3.5 text-[#C5A059] animate-spin" />;
  if (quotaExceeded) return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
  return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
};
