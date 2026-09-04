/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  fbSignOut, 
  onAuthStateChanged, 
  signInAnonymously,
  db, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  getDocs,
  setDoc,
  writeBatch,
  disableNetwork,
  enableNetwork,
  User
} from "./lib/firebase";
import { ResourceItem, ResourceType, NavCategory, RawFileItem, ViewMode, SortOption, DiagnosticLog, CaptureStage } from "./types";
import { initialSampleResources, getInitialSampleResourcesWithIds } from "./lib/sampleData";
import { parseDate, formatDate, getTimestampMillis } from "./lib/dateUtils";
import { filterAndRankResources } from "./lib/searchEngine";
import { localFallbackAnalyzeResource } from "./lib/fallbackParser";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { CaptureBar } from "./components/CaptureBar";
import { StatsBanner } from "./components/StatsBanner";
import { ResourceCard } from "./components/ResourceCard";
import { ResourceTable } from "./components/ResourceTable";
import { ResourceModal } from "./components/ResourceModal";
import { AddResourceDialog } from "./components/AddResourceDialog";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { KnowledgeReader } from "./components/KnowledgeReader";
import { KnowledgeUploadDialog } from "./components/KnowledgeUploadDialog";
import { DiagnosticDrawer } from "./components/DiagnosticDrawer";
import { ExportBackupDialog } from "./components/ExportBackupDialog";
import { PrintPreviewModal } from "./components/PrintPreviewModal";
import { RawFileManager } from "./components/RawFileManager";
import { ConflictResolutionModal } from "./components/ConflictResolutionModal";
import { GoogleDriveModal } from "./components/GoogleDriveModal";
import { RecoveryModal } from "./components/RecoveryModal";
import { PersistenceStatusModal } from "./components/PersistenceStatusModal";
import { FolderSearch, Plus, Sparkles, AlertCircle, Network, BrainCircuit, Terminal, RefreshCw, HardDrive, ShieldCheck, GitMerge } from "lucide-react";
import { 
  saveCachedResources, 
  loadCachedResources, 
  saveCachedRawFiles, 
  loadCachedRawFiles,
  updateCacheTimestamp,
  getCacheMetadata,
  DEFAULT_SYNC_INTERVAL_MS,
  getFirebaseQuotaResetInfo,
  saveMultiLayerResources,
  loadFromServerFilesystem,
  isQuotaExceededSaved,
  saveQuotaExceededStatus
} from "./lib/cacheManager";
import { loadResourcesFromIndexedDB, loadRawFilesFromIndexedDB } from "./lib/indexedDb";
import { exportResourcesToJSON } from "./lib/exportUtils";
import { analyzeResourceConflicts, ConflictAnalysisResult } from "./lib/conflictResolver";
import { performDeepRecoveryScan } from "./lib/recoveryManager";
import { SyncStatusBanner } from "./components/SyncStatusBanner";
import { QuotaTelemetryPage } from "./components/QuotaTelemetryPage";
import {
  recordFirestoreRead,
  recordFirestoreWrite,
  recordFirestoreDelete,
  recordFirestoreError,
  setActiveFirestoreListenersCount,
} from "./lib/quotaTelemetry";

// Checks if a value is a plain JavaScript object (and not a Date, FieldValue, Timestamp, etc.)
function isPlainObject(value: any): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  if (typeof value.toMillis === "function" || typeof value.toDate === "function") return false;
  if ("_methodName" in value || "_delegate" in value) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

// Robust Firestore sanitizer to eliminate all undefined fields recursively while keeping serverTimestamp intact
function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter((v) => v !== undefined)
      .map((v) => (isPlainObject(v) || Array.isArray(v) ? sanitizeForFirestore(v) : v)) as any;
  }
  if (!isPlainObject(obj)) {
    return obj;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    } else if (isPlainObject(value)) {
      result[key] = sanitizeForFirestore(value);
    } else if (Array.isArray(value)) {
      result[key] = value
        .filter((v) => v !== undefined)
        .map((v) => (isPlainObject(v) || Array.isArray(v) ? sanitizeForFirestore(v) : v));
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

// Check if error is strictly related to Firestore quota exhaustion (RESOURCE_EXHAUSTED / HTTP 429)
function isQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const code = String(err.code || "").toLowerCase();
  return (
    code.includes("resource-exhausted") ||
    msg.includes("quota limit exceeded") ||
    msg.includes("quota exceeded") ||
    msg.includes("resource-exhausted") ||
    msg.includes("429")
  );
}

// Execute Firestore operations with realistic network timeout (8000ms)
async function withFirestoreTimeout<T>(operation: Promise<T>, timeoutMs = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let completed = false;
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        reject(new Error("Firestore operation timed out (latenza di connessione di rete temporanea)"));
      }
    }, timeoutMs);

    operation
      .then((res) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          resolve(res);
        }
      })
      .catch((err) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

// Multi-Layer persistence helper functions (LocalStorage + IndexedDB + Backend Filesystem)
function saveLocalResources(items: ResourceItem[], uid?: string, currentRawFiles?: RawFileItem[]) {
  // Defensive guard: never overwrite local cache with 0 items if previous cache had items
  if (items.length === 0) {
    const existing = loadCachedResources(uid);
    if (existing && existing.length > 0) {
      console.warn("[App] Prevented saving empty array over existing cached resources!");
      return;
    }
  }
  saveCachedResources(items, uid);
  // Multi-tier persistence to IndexedDB and Server Backend Filesystem
  saveMultiLayerResources(items, currentRawFiles, uid).catch((err) => {
    console.warn("[App] Multi-layer persistence background save error:", err);
  });
}

function loadLocalResources(uid?: string): ResourceItem[] | null {
  return loadCachedResources(uid);
}

function saveLocalRawFiles(files: RawFileItem[], uid?: string, currentResources?: ResourceItem[]) {
  saveCachedRawFiles(files, uid);
  if (currentResources) {
    saveMultiLayerResources(currentResources, files, uid).catch((err) => {
      console.warn("[App] Multi-layer persistence background raw files save error:", err);
    });
  }
}

function loadLocalRawFiles(uid?: string): RawFileItem[] | null {
  return loadCachedRawFiles(uid);
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [resources, setResources] = useState<ResourceItem[]>(() => {
    const cached = loadLocalResources();
    return cached && cached.length > 0 ? cached : getInitialSampleResourcesWithIds();
  });
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  
  // UI States
  const [currentCategory, setCurrentCategory] = useState<NavCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedResourceForDetail, setSelectedResourceForDetail] = useState<ResourceItem | null>(null);
  const [selectedKnowledgeForReader, setSelectedKnowledgeForReader] = useState<ResourceItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isKnowledgeUploadOpen, setIsKnowledgeUploadOpen] = useState(false);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [printPreviewResource, setPrintPreviewResource] = useState<ResourceItem | null>(null);
  const [isPrintDossierOpen, setIsPrintDossierOpen] = useState(false);
  const [isGoogleDriveOpen, setIsGoogleDriveOpen] = useState(false);
  const [googleDriveExportResource, setGoogleDriveExportResource] = useState<ResourceItem | null>(null);
  
  // Staging / Raw Files Buffer State (Supports up to 50MB files)
  const [rawFiles, setRawFiles] = useState<RawFileItem[]>(() => {
    return loadLocalRawFiles() || [];
  });
  const [isLoadingRawFiles, setIsLoadingRawFiles] = useState(false);
  const [isConvertingRawFileId, setIsConvertingRawFileId] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<DiagnosticLog[]>([
    {
      id: "init-1",
      timestamp: new Date().toLocaleTimeString(),
      level: "info",
      category: "AUTH",
      message: "Knowledge Vault inizializzato con Persistenza Multi-Livello. Avvio sessione...",
    }
  ]);
  
  // Helper to add structured diagnostic logs
  const addLog = (
    level: DiagnosticLog["level"],
    category: DiagnosticLog["category"],
    message: string,
    details?: any
  ) => {
    const newLog: DiagnosticLog = {
      id: "log-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toLocaleTimeString(),
      level,
      category,
      message,
      details,
    };
    setLogs((prev) => [...prev.slice(-150), newLog]);
  };

  // Action States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [captureStage, setCaptureStage] = useState<CaptureStage>("idle");
  const [captureStageMessage, setCaptureStageMessage] = useState<string>("");
  const [isSeeding, setIsSeeding] = useState(false);
  const isSeedingRef = useRef(false);
  const hasAttemptedAutoSeedRef = useRef(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(() => isQuotaExceededSaved());
  const wasQuotaExceededRef = useRef<boolean>(isQuotaExceededSaved());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(new Date());
  const [syncTriggerCount, setSyncTriggerCount] = useState(0);

  // Conflict Resolution States
  const [conflictAnalysis, setConflictAnalysis] = useState<ConflictAnalysisResult | null>(null);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isApplyingMerge, setIsApplyingMerge] = useState(false);

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

  // Recovery Center & Deep Storage Detection States
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isPersistenceModalOpen, setIsPersistenceModalOpen] = useState(false);
  const [storageDiscrepancyNotice, setStorageDiscrepancyNotice] = useState<{ foundCount: number; currentCount: number } | null>(null);

  const resourcesRef = useRef<ResourceItem[]>(resources);
  useEffect(() => {
    resourcesRef.current = resources;
  }, [resources]);

  // Multi-Layer Startup Hydration: restore from Backend Server Filesystem or IndexedDB
  useEffect(() => {
    let isMounted = true;
    async function hydrateMultiLayer() {
      try {
        // 1. Check Server Backend Filesystem
        const serverData = await loadFromServerFilesystem();
        if (serverData && serverData.resources && serverData.resources.length > 0 && isMounted) {
          addLog("success", "CACHE", `Archivio persistente Server Backend caricato (${serverData.resources.length} risorse).`);
          setResources((prev) => {
            if (serverData.resources.length >= prev.length) {
              return serverData.resources;
            }
            return prev;
          });
          if (serverData.rawFiles && serverData.rawFiles.length > 0) {
            setRawFiles(serverData.rawFiles);
          }
        }

        // 2. Fallback to browser IndexedDB
        const idbItems = await loadResourcesFromIndexedDB();
        if (idbItems && idbItems.length > 0 && isMounted) {
          addLog("info", "CACHE", `Archivio IndexedDB caricato (${idbItems.length} risorse).`);
          setResources((prev) => {
            if (idbItems.length >= prev.length) {
              return idbItems;
            }
            return prev;
          });
          const idbFiles = await loadRawFilesFromIndexedDB();
          if (idbFiles && idbFiles.length > 0) {
            setRawFiles(idbFiles);
          }
        }

        // 3. Deep Scan for any additional recoverable resources across all storage layers
        setTimeout(async () => {
          if (!isMounted) return;
          try {
            const scan = await performDeepRecoveryScan(resourcesRef.current);
            if (scan.totalUniqueResources > resourcesRef.current.length) {
              setStorageDiscrepancyNotice({
                foundCount: scan.totalUniqueResources,
                currentCount: resourcesRef.current.length,
              });
              addLog(
                "warn",
                "CACHE",
                `Rilevate ${scan.totalUniqueResources} risorse archiviate nei livelli di storage rispetto a ${resourcesRef.current.length} visualizzate. Centro di Recupero disponibile.`
              );
            }
          } catch (e) {
            console.warn("Deep scan background notice:", e);
          }
        }, 1500);
      } catch (err: any) {
        console.warn("Startup multi-layer hydration check:", err?.message || err);
      }
    }

    hydrateMultiLayer();
    return () => { isMounted = false; };
  }, []);

  // Apply resolved merge back to Firestore and local state
  const handleApplyConflictMerge = async (resolvedItems: ResourceItem[], toUpload: ResourceItem[]) => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) return;
    setIsApplyingMerge(true);
    addLog("info", "FIRESTORE", `Avvio applicazione merge: ${resolvedItems.length} risorse totali, ${toUpload.length} da inviare a Firestore...`);
    
    try {
      // Upload items designated for Firestore upload
      if (toUpload.length > 0) {
        let uploadCount = 0;
        for (const item of toUpload) {
          const docRef = doc(db, "resources", item.id);
          const cleanPayload = sanitizeForFirestore({
            userId: activeUser.uid,
            type: item.type,
            title: item.title,
            url: item.url || "",
            rawInput: item.rawInput || "",
            summary: item.summary,
            tags: item.tags || [],
            isFavorite: item.isFavorite || false,
            rating: item.rating,
            metadata: item.metadata || {},
            createdAt: parseDate(item.createdAt) || new Date(),
            updatedAt: serverTimestamp(),
          });
          await setDoc(docRef, cleanPayload);
          uploadCount++;
        }
        addLog("success", "FIRESTORE", `Caricate ${uploadCount} risorse su Firestore durante la riconciliazione.`);
      }

      // Update active state and all persistence layers
      setResources(resolvedItems);
      saveLocalResources(resolvedItems, activeUser.uid, rawFiles);
      setQuotaExceeded(false);
      wasQuotaExceededRef.current = false;
      setLastSyncTime(new Date());
      updateCacheTimestamp();
      setIsConflictModalOpen(false);
      setConflictAnalysis(null);
      setStatusMessage(`Merge completato: ${resolvedItems.length} risorse unificate e sincronizzate con il cloud.`);
      setTimeout(() => setStatusMessage(null), 5000);
      addLog("success", "FIRESTORE", `Riconciliazione conflitti completata con successo (${resolvedItems.length} risorse totali).`);
    } catch (err: any) {
      console.error("Conflict merge error:", err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        addLog("warn", "FIRESTORE", "Quota Firestore ancora esaurita durante il merge. Le modifiche rimangono protette in locale.");
        setErrorMessage("Quota Firestore non ancora reimpostata. Le modifiche rimangono protette in memoria locale e su disco.");
      } else {
        addLog("error", "FIRESTORE", `Errore applicazione merge: ${err.message}`, err);
        setErrorMessage(`Errore merge: ${err.message}`);
      }
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsApplyingMerge(false);
    }
  };

  // Upload local-only resources (e.g. added offline or today) directly to Firestore
  const handleUploadUnsyncedResources = async () => {
    const activeUser = user || auth.currentUser;
    if (!activeUser) {
      setErrorMessage("Nessun utente attivo per inviare a Firestore. Accedi con Google.");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    const localOnly = resources.filter(
      (r) => r.id.startsWith("local-") || r.id.startsWith("conv-") || r.id.startsWith("seed-")
    );

    if (localOnly.length === 0) {
      setStatusMessage("Tutte le risorse sono già collegate a Firestore!");
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    setIsSyncing(true);
    addLog("info", "FIRESTORE", `Caricamento di ${localOnly.length} risorse locali su Firestore...`);

    try {
      await enableNetwork(db).catch(() => {});
      const updatedResources = [...resources];
      let uploadedCount = 0;

      for (const item of localOnly) {
        const rawData = {
          userId: activeUser.uid,
          type: item.type,
          title: item.title,
          url: item.url || "",
          rawInput: item.rawInput || "",
          summary: item.summary,
          tags: item.tags || [],
          isFavorite: item.isFavorite || false,
          rating: item.rating,
          metadata: item.metadata || {},
          createdAt: parseDate(item.createdAt) || new Date(),
          updatedAt: serverTimestamp(),
        };

        const docRef = await withFirestoreTimeout(
          addDoc(collection(db, "resources"), sanitizeForFirestore(rawData)),
          10000
        );
        recordFirestoreWrite();

        const idx = updatedResources.findIndex((r) => r.id === item.id);
        if (idx !== -1) {
          updatedResources[idx] = {
            ...item,
            id: docRef.id,
            userId: activeUser.uid,
            createdAt: item.createdAt,
            updatedAt: new Date(),
          };
        }
        uploadedCount++;
      }

      setResources(updatedResources);
      saveLocalResources(updatedResources, activeUser.uid, rawFiles);
      setQuotaExceeded(false);
      wasQuotaExceededRef.current = false;
      saveQuotaExceededStatus(false);
      setLastSyncTime(new Date());

      addLog("success", "FIRESTORE", `${uploadedCount} risorsa/e caricata/e su Firestore con successo.`);
      setStatusMessage(`${uploadedCount} risorsa/e salvata/e su Firestore! ID cloud generato.`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      addLog("error", "FIRESTORE", `Errore caricamento su Firestore: ${err.message}`, err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        setErrorMessage("Quota Firestore esaurita per oggi.");
      } else {
        setErrorMessage(`Errore Firestore: ${err.message}`);
      }
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Manual check for conflicts between local storage and Firestore
  const handleCheckConflicts = async () => {
    if (!user) return;
    try {
      const resourcesRefCollection = collection(db, "resources");
      const q = query(resourcesRefCollection, where("userId", "==", user.uid));
      const snap = await getDocs(q);
      const items: ResourceItem[] = [];
      snap.forEach((docSnap) => {
        const rawData = docSnap.data() as Omit<ResourceItem, "id">;
        const validatedCreatedAt = parseDate(rawData.createdAt) || parseDate(rawData.updatedAt) || new Date();
        items.push({
          id: docSnap.id,
          ...rawData,
          createdAt: rawData.createdAt ? (parseDate(rawData.createdAt) ? rawData.createdAt : validatedCreatedAt) : validatedCreatedAt,
        });
      });
      const analysis = analyzeResourceConflicts(resourcesRef.current, items);
      setConflictAnalysis(analysis);
      setIsConflictModalOpen(true);
    } catch (err: any) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        setErrorMessage("Quota Firestore esaurita.");
      }
    }
  };

  // Manual or timer-based sync trigger function with Conflict Resolution Detection
  const handleTriggerSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    addLog("info", "FIRESTORE", "Avvio sincronizzazione con Firestore e verifica conflitti...");
    try {
      if (!user) {
        setIsSyncing(false);
        return;
      }
      // Attempt to re-enable Firestore network for sync check
      await enableNetwork(db).catch(() => {});

      const resourcesRefCollection = collection(db, "resources");
      const q = query(resourcesRefCollection, where("userId", "==", user.uid));
      const snap = await getDocs(q);
      
      // Record telemetry for sync reads
      recordFirestoreRead(
        snap.size,
        "Sincronizzazione Manuale / Periodica",
        `Letti ${snap.size} documenti dalla collezione Firestore`
      );

      const items: ResourceItem[] = [];
      snap.forEach((docSnap) => {
        const rawData = docSnap.data() as Omit<ResourceItem, "id">;
        const validatedCreatedAt = parseDate(rawData.createdAt) || parseDate(rawData.updatedAt) || new Date();
        items.push({
          id: docSnap.id,
          ...rawData,
          createdAt: rawData.createdAt ? (parseDate(rawData.createdAt) ? rawData.createdAt : validatedCreatedAt) : validatedCreatedAt,
        });
      });

      items.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));

      // Analyze conflicts between local in-memory/cache resources and Firestore
      const analysis = analyzeResourceConflicts(resourcesRef.current, items);

      if (analysis.hasConflicts) {
        setConflictAnalysis(analysis);
        // Apply safe non-destructive union seamlessly without intrusive popups
        setResources(analysis.mergedResources);
        saveLocalResources(analysis.mergedResources, user.uid, rawFiles);
        setQuotaExceeded(false);
        wasQuotaExceededRef.current = false;
        setLastSyncTime(new Date());
        updateCacheTimestamp();
        addLog(
          "success",
          "FIRESTORE",
          `Sincronizzazione completata: ${analysis.mergedResources.length} risorse allineate in sicurezza.`
        );
        setStatusMessage(`Sincronizzazione completata: ${analysis.mergedResources.length} risorse allineate.`);
        setTimeout(() => setStatusMessage(null), 4000);
      } else {
        if (items.length > 0) {
          setResources(items);
          saveLocalResources(items, user.uid, rawFiles);
        }
        setQuotaExceeded(false);
        wasQuotaExceededRef.current = false;
        setLastSyncTime(new Date());
        updateCacheTimestamp();
        addLog("success", "FIRESTORE", `Sincronizzazione completata: ${items.length} risorse perfettamente allineate.`);
        setStatusMessage(`Sincronizzazione completata: ${items.length} risorse allineate.`);
        setTimeout(() => setStatusMessage(null), 4000);
      }
    } catch (err: any) {
      recordFirestoreError(err, "Sincronizzazione (handleTriggerSync)");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        disableNetwork(db).catch(() => {});
        addLog("warn", "FIRESTORE", "Quota Firestore esaurita durante il sync. Modalità locale mantenuta attiva.");
      } else {
        addLog("error", "FIRESTORE", `Errore sincronizzazione: ${err.message}`, err);
        setErrorMessage(`Errore sincronizzazione: ${err.message}`);
        setTimeout(() => setErrorMessage(null), 4000);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Proactively disable Firestore background network sync when quota is exceeded to prevent backoff delay logs
  useEffect(() => {
    saveQuotaExceededStatus(quotaExceeded);
    if (quotaExceeded) {
      disableNetwork(db).catch(() => {});
    } else {
      enableNetwork(db).catch(() => {});
    }
  }, [quotaExceeded]);

  // 10-Minute Periodic Auto-Sync Timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (!quotaExceeded) {
        addLog("info", "CACHE", "Timer di auto-sincronizzazione (10m) scattato.");
        handleTriggerSync();
      }
    }, DEFAULT_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [user, quotaExceeded]);

  // Transparent automatic background upload for local-only resources
  useEffect(() => {
    if (!user || quotaExceeded || isSyncing) return;
    const localOnly = resources.filter(
      (r) => r.id.startsWith("local-") || r.id.startsWith("conv-") || r.id.startsWith("seed-")
    );
    if (localOnly.length > 0) {
      const timer = setTimeout(() => {
        handleUploadUnsyncedResources();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [user, quotaExceeded, resources.length]);

  // 1. Listen for Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthLoading(false);
        addLog("success", "AUTH", `Utente autenticato: ${currentUser.email || "Anonimo"} (${currentUser.uid})`);
      } else {
        // Auto sign-in anonymously for instant friction-free access while keeping Firestore security rules valid
        try {
          addLog("info", "AUTH", "Tentativo di autenticazione anonima rapida...");
          const anonCred = await signInAnonymously(auth);
          setUser(anonCred.user);
          addLog("success", "AUTH", `Sessione anonima stabilita: UID ${anonCred.user.uid}`);
        } catch (err: any) {
          console.warn("Anonymous auth failed, waiting for explicit login:", err);
          addLog("warn", "AUTH", `Autenticazione anonima non riuscita: ${err.message}`);
          setUser(null);
        } finally {
          setAuthLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Realtime listener for User's Firestore Resources
  useEffect(() => {
    if (!user) {
      // In local mode without user, do not blank out resources; preserve cached or current resources
      const localCached = loadLocalResources();
      if (localCached && localCached.length > 0) {
        setResources(localCached);
      }
      setIsLoadingResources(false);
      return;
    }

    if (quotaExceeded) {
      setIsLoadingResources(false);
      const cached = loadLocalResources(user.uid);
      if (cached && cached.length > 0) {
        setResources(cached);
      }
      return;
    }

    setIsLoadingResources(true);
    addLog("info", "FIRESTORE", `Sottoscrizione realtime alla collezione 'resources' per UID: ${user.uid}`);

    // Query resources matching current user
    const resourcesColRef = collection(db, "resources");
    const q = query(
      resourcesColRef,
      where("userId", "==", user.uid)
    );

    let unsubscribe: (() => void) | null = null;
    try {
      setActiveFirestoreListenersCount(1);
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          // Record read telemetry
          const readCount = snapshot.docChanges().length || snapshot.size;
          if (readCount > 0) {
            recordFirestoreRead(
              readCount,
              "Listener Realtime (onSnapshot)",
              `Ricevuti ${snapshot.size} documenti (${snapshot.docChanges().length} modificati)`
            );
          }

          const items: ResourceItem[] = [];
          snapshot.forEach((docSnap) => {
            const rawData = docSnap.data() as Omit<ResourceItem, "id">;
            // Ensure valid createdAt timestamp is present for display and sorting (healing any previous corrupted records)
            const validatedCreatedAt = parseDate(rawData.createdAt) || parseDate(rawData.updatedAt) || new Date();
            items.push({
              id: docSnap.id,
              ...rawData,
              createdAt: rawData.createdAt ? (parseDate(rawData.createdAt) ? rawData.createdAt : validatedCreatedAt) : validatedCreatedAt,
            });
          });

          // Default sort by createdAt
          items.sort((a, b) => {
            const timeA = getTimestampMillis(a.createdAt);
            const timeB = getTimestampMillis(b.createdAt);
            return timeB - timeA;
          });

          // SAFETY SHIELD: Never let an empty or truncated Firestore snapshot destroy local resources
          const currentLocalItems = resourcesRef.current;
          const currentLocalCount = currentLocalItems.length;

          if (snapshot.empty) {
            // Firestore returned 0 documents for this specific user
            if (currentLocalCount > 0) {
              // PRESERVE LOCAL DATA: The user has resources in local memory/cache. Do NOT blank them out!
              if (user.isAnonymous) {
                addLog(
                  "info",
                  "FIRESTORE",
                  `Sessione Ospite (UID: ${user.uid.slice(0, 8)}...). Firestore ha restituito 0 documenti per questo specifico account ospite temporaneo. ${currentLocalCount} risorse sono intatte e protette nel Vault locale e sul server backend. Accedi con Google per sincronizzare con il tuo archivio cloud Firestore principale.`
                );
              } else {
                addLog(
                  "info",
                  "FIRESTORE",
                  `Firestore connesso per ${user.email || user.uid} (0 documenti remoti trovati). ${currentLocalCount} risorse locali mantenute e protette dallo scudo di sicurezza.`
                );
              }
              setIsLoadingResources(false);
              return;
            } else {
              // Local memory is empty: check if localStorage / IndexedDB has cached items
              const cached = loadLocalResources(user.uid);
              if (cached && cached.length > 0) {
                setResources(cached);
              }
              setIsLoadingResources(false);
              return;
            }
          }

          // If items were received from Firestore:
          // If local memory has significantly more items than Firestore (e.g. user had 100+ items and cloud has fewer):
          if (currentLocalCount > items.length && currentLocalCount > 15) {
            // Run safe merge non-destructively rather than interrupting the user with intrusive dialogs!
            const analysis = analyzeResourceConflicts(currentLocalItems, items);
            setConflictAnalysis(analysis);
            setResources(analysis.mergedResources);
            saveLocalResources(analysis.mergedResources, user.uid, rawFiles);
            addLog(
              "info",
              "FIRESTORE",
              `Unione sicura completata in background: ${analysis.mergedResources.length} risorse preservate.`
            );
            setIsLoadingResources(false);
            return;
          }

          if (wasQuotaExceededRef.current) {
            // Transitioned from Quota Exceeded back to Online!
            const analysis = analyzeResourceConflicts(resourcesRef.current, items);
            setConflictAnalysis(analysis);
            setResources(analysis.mergedResources);
            saveLocalResources(analysis.mergedResources, user.uid, rawFiles);
            setQuotaExceeded(false);
            wasQuotaExceededRef.current = false;
            saveQuotaExceededStatus(false);
            addLog(
              "info",
              "FIRESTORE",
              `Riconnessione cloud completata: ${analysis.mergedResources.length} risorse sincronizzate.`
            );
          } else {
            setResources(items);
            saveLocalResources(items, user.uid, rawFiles);
            setQuotaExceeded(false);
            wasQuotaExceededRef.current = false;
            saveQuotaExceededStatus(false);
            addLog("info", "FIRESTORE", `Sincronizzate ${items.length} risorse dal database.`);
          }
          setIsLoadingResources(false);

          // Keep active detail modals synced with fresh Firestore snapshot data
          setSelectedKnowledgeForReader((prev) => {
            if (!prev) return null;
            const fresh = items.find((i) => i.id === prev.id);
            return fresh || prev;
          });
          setSelectedResourceForDetail((prev) => {
            if (!prev) return null;
            const fresh = items.find((i) => i.id === prev.id);
            return fresh || prev;
          });
        },
        (error) => {
          console.warn("Firestore snapshot notice:", error?.message || error);
          recordFirestoreError(error, "Listener Realtime (onSnapshot)");
          if (isQuotaError(error)) {
            setQuotaExceeded(true);
            wasQuotaExceededRef.current = true;
            hasAttemptedAutoSeedRef.current = true;
            disableNetwork(db).catch(() => {});
            addLog("warn", "FIRESTORE", "Limite quota giornaliera Firestore (Free Tier) raggiunto. Attivata persistenza multi-livello offline/locale.");
            const cached = loadLocalResources(user?.uid);
            if (cached && cached.length > 0) {
              setResources(cached);
            }
          } else {
            addLog("error", "FIRESTORE", `Errore sincronizzazione Firestore: ${error.message}`, error);
            setStatusMessage(`Errore di connessione Firestore: ${error.message}`);
          }
          setIsLoadingResources(false);
        }
      );
    } catch (err: any) {
      console.warn("Snapshot setup error:", err);
      recordFirestoreError(err, "Listener Realtime setup");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        disableNetwork(db).catch(() => {});
      }
      setIsLoadingResources(false);
    }

    return () => {
      setActiveFirestoreListenersCount(0);
      if (unsubscribe) unsubscribe();
    };
  }, [user, quotaExceeded]);

  // 3. Realtime listener for User's Staged / Raw Files Buffer
  useEffect(() => {
    if (!user) {
      setRawFiles([]);
      setIsLoadingRawFiles(false);
      return;
    }

    if (quotaExceeded) {
      setIsLoadingRawFiles(false);
      const cachedRaw = loadLocalRawFiles(user.uid);
      if (cachedRaw) {
        setRawFiles(cachedRaw);
      }
      return;
    }

    setIsLoadingRawFiles(true);
    addLog("info", "FIRESTORE", `Sottoscrizione alla collezione 'raw_files' per UID: ${user.uid}`);

    const rawFilesRef = collection(db, "raw_files");
    const q = query(
      rawFilesRef,
      where("userId", "==", user.uid)
    );

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: RawFileItem[] = [];
          snapshot.forEach((docSnap) => {
            const rawData = docSnap.data() as Omit<RawFileItem, "id">;
            items.push({
              id: docSnap.id,
              ...rawData,
              createdAt: rawData.createdAt ? parseDate(rawData.createdAt) || new Date() : new Date(),
              updatedAt: rawData.updatedAt ? parseDate(rawData.updatedAt) || new Date() : new Date(),
            });
          });

          items.sort((a, b) => {
            const timeA = getTimestampMillis(a.createdAt);
            const timeB = getTimestampMillis(b.createdAt);
            return timeB - timeA;
          });

          setRawFiles(items);
          saveLocalRawFiles(items, user.uid);
          setIsLoadingRawFiles(false);
          addLog("info", "FIRESTORE", `Sincronizzati ${items.length} file grezzi nel buffer.`);
        },
        (error) => {
          console.warn("Firestore raw_files snapshot notice:", error?.message || error);
          if (isQuotaError(error)) {
            setQuotaExceeded(true);
            const cachedRaw = loadLocalRawFiles(user?.uid);
            if (cachedRaw) {
              setRawFiles(cachedRaw);
            }
          } else {
            addLog("error", "FIRESTORE", `Errore sincronizzazione raw_files: ${error.message}`, error);
          }
          setIsLoadingRawFiles(false);
        }
      );
    } catch (err: any) {
      console.warn("Raw files snapshot setup error:", err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
      }
      setIsLoadingRawFiles(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, quotaExceeded]);

  // Helper to read File as Base64 data URL
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Helper to read File as Text
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  };

  // Upload Raw File (PDF, TXT, MD, Images, Logs up to 50MB) with Firestore Staging & Chunking
  const handleUploadRawFile = async (file: File, notes?: string): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
        setUser(activeUser);
      } catch (authErr: any) {
        addLog("error", "AUTH", "Autenticazione richiesta per caricare file.");
        setErrorMessage("Errore di autenticazione.");
        return false;
      }
    }

    try {
      addLog("info", "CAPTURE", `Avvio acquisizione file grezzo: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);
      
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isAudio = (file.type && file.type.startsWith("audio/")) || ["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus", "webm", "wma", "aiff"].includes(ext);
      const isPdf = ext === "pdf" || (file.type && file.type.includes("pdf"));
      const isImage = (file.type && file.type.startsWith("image/")) || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);
      const isTextType = !isAudio && !isPdf && !isImage && (["txt", "md", "markdown", "json", "yaml", "yml", "csv", "log", "ts", "js", "py", "rs", "go", "xml", "toml", "sql", "sh"].includes(ext) || (file.type && file.type.startsWith("text/")));
      
      let textContent = "";
      let base64Data = "";

      if (isTextType) {
        try {
          textContent = await readFileAsText(file);
        } catch {
          base64Data = await readFileAsBase64(file);
        }
      } else {
        base64Data = await readFileAsBase64(file);
      }

      // Check if chunking is required (document limit in Firestore is 1MB, so chunk if > 400KB)
      const CHUNK_SIZE = 300 * 1024; // 300KB chunks
      const dataPayload = base64Data || textContent;
      const needsChunking = dataPayload.length > CHUNK_SIZE;

      let resolvedMime = file.type;
      if (!resolvedMime || resolvedMime === "application/octet-stream") {
        if (ext === "mp3") resolvedMime = "audio/mpeg";
        else if (ext === "wav") resolvedMime = "audio/wav";
        else if (ext === "ogg") resolvedMime = "audio/ogg";
        else if (ext === "m4a") resolvedMime = "audio/mp4";
        else if (ext === "pdf") resolvedMime = "application/pdf";
        else if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) resolvedMime = `image/${ext === "jpg" ? "jpeg" : ext}`;
        else resolvedMime = "application/octet-stream";
      }

      let previewText = "";
      if (isTextType) {
        previewText = textContent.slice(0, 3000);
      } else if (isAudio) {
        previewText = `[File Audio: ${file.name} - ${(file.size / 1024).toFixed(1)} KB - Formato: ${ext.toUpperCase() || "AUDIO"}]`;
      } else if (isPdf) {
        previewText = `[Documento PDF: ${file.name} - ${(file.size / 1024).toFixed(1)} KB]`;
      } else if (isImage) {
        previewText = `[Immagine: ${file.name} - ${(file.size / 1024).toFixed(1)} KB]`;
      } else {
        previewText = `[File Binario: ${file.name} - ${(file.size / 1024).toFixed(1)} KB]`;
      }

      // If Quota is exceeded, save directly to local state and localStorage
      if (quotaExceeded) {
        const localId = "local-file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const localFile: RawFileItem = {
          id: localId,
          userId: activeUser.uid,
          fileName: file.name,
          fileSize: file.size,
          fileType: isAudio ? "audio" : ext || "document",
          mimeType: resolvedMime,
          status: "raw",
          contentPreview: previewText,
          notes: notes || "",
          hasChunks: false,
          totalChunks: 1,
          textContent: textContent || undefined,
          base64Data: base64Data || undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setRawFiles((prev) => {
          const updated = [localFile, ...prev];
          saveLocalRawFiles(updated, activeUser.uid);
          return updated;
        });
        addLog("info", "CAPTURE", `File "${file.name}" archiviato nel buffer locale.`);
        setStatusMessage(`File "${file.name}" archiviato nel Vault!`);
        setTimeout(() => setStatusMessage(null), 3500);
        return true;
      }

      const rawFileDocData: Record<string, any> = {
        userId: activeUser.uid,
        fileName: file.name,
        fileSize: file.size,
        fileType: isAudio ? "audio" : ext || "document",
        mimeType: resolvedMime,
        status: "raw",
        contentPreview: previewText,
        notes: notes || "",
        hasChunks: needsChunking,
        totalChunks: needsChunking ? Math.ceil(dataPayload.length / CHUNK_SIZE) : 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (!needsChunking) {
        if (textContent) rawFileDocData.textContent = textContent;
        if (base64Data) rawFileDocData.base64Data = base64Data;
      }

      const sanitized = sanitizeForFirestore(rawFileDocData);
      const docRef = await withFirestoreTimeout(addDoc(collection(db, "raw_files"), sanitized), 3500);

      // If chunking is needed, write chunks to subcollection /raw_files/{docId}/chunks/{chunkIndex}
      if (needsChunking) {
        addLog("info", "FIRESTORE", `Frammentazione file (${rawFileDocData.totalChunks} blocchi)...`);
        const totalChunks = rawFileDocData.totalChunks;
        for (let i = 0; i < totalChunks; i++) {
          const chunkData = dataPayload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await withFirestoreTimeout(setDoc(doc(db, "raw_files", docRef.id, "chunks", `chunk_${i}`), {
            index: i,
            data: chunkData,
            createdAt: serverTimestamp(),
          }), 3500);
        }
      }

      addLog("success", "CAPTURE", `File "${file.name}" archiviato con successo nel buffer (ID: ${docRef.id})`);
      setStatusMessage(`File "${file.name}" archiviato nel Vault!`);
      setTimeout(() => setStatusMessage(null), 3500);
      return true;
    } catch (err: any) {
      console.error("Upload raw file failed:", err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        const localId = "local-file-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const localFile: RawFileItem = {
          id: localId,
          userId: activeUser.uid,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type?.startsWith("audio/") ? "audio" : "document",
          mimeType: file.type || "application/octet-stream",
          status: "raw",
          contentPreview: `[File: ${file.name} - ${(file.size / 1024).toFixed(1)} KB]`,
          notes: notes || "",
          hasChunks: false,
          totalChunks: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setRawFiles((prev) => {
          const updated = [localFile, ...prev];
          saveLocalRawFiles(updated, activeUser.uid);
          return updated;
        });
        setStatusMessage(`File "${file.name}" archiviato nella memoria locale (Quota Firestore esaurita)`);
        setTimeout(() => setStatusMessage(null), 3500);
        return true;
      }
      addLog("error", "CAPTURE", `Errore upload file "${file.name}": ${err.message}`, err);
      setErrorMessage(`Errore upload file: ${err.message || "Errore sconosciuto"}`);
      setTimeout(() => setErrorMessage(null), 5000);
      return false;
    }
  };

  // Delete Raw File and any chunk subcollections
  const handleDeleteRawFile = async (fileId: string): Promise<boolean> => {
    try {
      addLog("info", "FIRESTORE", `Eliminazione file grezzo ID: ${fileId}...`);
      
      // Optimistically update local state & cache
      setRawFiles((prev) => {
        const updated = prev.filter((f) => f.id !== fileId);
        saveLocalRawFiles(updated, user?.uid);
        return updated;
      });

        if (!quotaExceeded && !fileId.startsWith("local-")) {
        // Clean up chunks in subcollection if any
        try {
          const chunksRef = collection(db, "raw_files", fileId, "chunks");
          const chunkSnaps = await withFirestoreTimeout(getDocs(chunksRef), 3000);
          if (!chunkSnaps.empty) {
            const chunkBatch = writeBatch(db);
            chunkSnaps.forEach((cDoc) => chunkBatch.delete(cDoc.ref));
            await withFirestoreTimeout(chunkBatch.commit(), 3000);
          }
        } catch (chunkErr) {
          console.warn("Could not delete chunk subcollection (may not exist):", chunkErr);
        }

        await withFirestoreTimeout(deleteDoc(doc(db, "raw_files", fileId)), 3500);
      }

      addLog("success", "FIRESTORE", `File grezzo eliminato con successo (ID: ${fileId})`);
      setStatusMessage("File eliminato dal buffer.");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    } catch (err: any) {
      console.error("Delete raw file error:", err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        setStatusMessage("File rimosso dalla memoria locale.");
        setTimeout(() => setStatusMessage(null), 3000);
        return true;
      }
      addLog("error", "FIRESTORE", `Errore eliminazione file grezzo: ${err.message}`, err);
      setErrorMessage("Impossibile eliminare il file: " + err.message);
      setTimeout(() => setErrorMessage(null), 4000);
      return false;
    }
  };

  // Convert Staged Raw File to OKF v0.2 Knowledge Document via Gemini
  const handleConvertFileToOKF = async (file: RawFileItem): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) return false;

    try {
      setIsConvertingRawFileId(file.id);
      addLog("info", "GEMINI_AI", `Avvio conversione intelligente in standard OKF v0.2 per file: "${file.fileName}"...`);

      // Reconstruct payload if file was chunked or stored directly
      let reconstructedText = file.textContent || "";
      let reconstructedBase64 = file.base64Data || "";

      const lowerName = file.fileName.toLowerCase();
      const isAudio = (file.mimeType && file.mimeType.toLowerCase().startsWith("audio/")) ||
        ["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus", "webm", "wma", "aiff"].some((ext) => lowerName.endsWith("." + ext)) ||
        file.fileType?.toLowerCase() === "audio";
      const isPdf = lowerName.endsWith(".pdf") || (file.mimeType && file.mimeType.toLowerCase().includes("pdf")) || file.fileType?.toLowerCase() === "pdf";
      const isImage = (file.mimeType && file.mimeType.toLowerCase().startsWith("image/")) || ["png", "jpg", "jpeg", "webp", "gif", "svg"].some((ext) => lowerName.endsWith("." + ext));
      const isBinary = isAudio || isPdf || isImage || Boolean(file.base64Data);

      if (!quotaExceeded && !file.id.startsWith("local-") && file.hasChunks && file.totalChunks && file.totalChunks > 1) {
        addLog("info", "FIRESTORE", `Recupero ${file.totalChunks} blocchi dal database...`);
        try {
          const chunksSnapshot = await getDocs(collection(db, "raw_files", file.id, "chunks"));
          const chunks: { index: number; data: string }[] = [];
          chunksSnapshot.forEach((cSnap) => {
            chunks.push(cSnap.data() as { index: number; data: string });
          });
          chunks.sort((a, b) => a.index - b.index);
          const fullData = chunks.map((c) => c.data).join("");

          if (isBinary) {
            reconstructedBase64 = fullData;
          } else {
            reconstructedText = fullData;
          }
        } catch (chunksErr) {
          console.warn("Could not load chunks from Firestore:", chunksErr);
        }
      }

      // If binary, ensure reconstructedBase64 is populated from base64Data or full payload
      if (isBinary && !reconstructedBase64 && file.base64Data) {
        reconstructedBase64 = file.base64Data;
      }

      // Call Backend API with Gemini Multimodal Processing with timeout & fallback
      let resPayload: any = null;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const response = await fetch("/api/convert-file-to-okf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            fileName: file.fileName,
            fileType: isAudio ? "audio" : file.fileType,
            mimeType: file.mimeType,
            textContent: reconstructedText,
            base64Data: reconstructedBase64,
            notes: file.notes,
            existingResources: resources.map((r) => ({
              id: r.id,
              title: r.title,
              type: r.type,
              tags: r.tags,
            })),
          }),
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          resPayload = data.resource;
        }
      } catch (netErr: any) {
        console.warn("[File Conversion] Network/Gemini API error, applying local fallback:", netErr?.message);
        addLog("warn", "GEMINI_AI", `Fallback locale applicato per file "${file.fileName}": ${netErr?.message || "timeout"}`);
      }

      // If remote conversion failed, generate authoritative local OKF document
      if (!resPayload || !resPayload.title) {
        const cleanName = file.fileName.replace(/\.[^/.]+$/, "");
        const fallbackText = reconstructedText || file.notes || `Contenuto acquisito da ${file.fileName}`;
        const localDoc = `---\nokf_version: "0.2"\ntitle: "${cleanName}"\ntype: "specification"\ndomain: "${isAudio ? "Audio & Media Systems" : "Software & Systems"}"\ntags: ["file-upload", "${isAudio ? "audio" : "document"}", "okf-v0.2"]\ncreated_at: "${new Date().toISOString()}"\nentities:\n  - name: "${cleanName}"\n    type: "concept"\n    description: "Documento acquisito da ${file.fileName}"\nrelations:\n  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"\n    relation_type: "references"\n    weight: 0.85\n---\n\n# ${cleanName}\n\n> **Documento acquisito da file grezzo (\`${file.fileName}\`)**\n\n---\n\n## 1. Panoramica Esecutiva\nDocumentazione archiviata e convertita in specifiche OKF v0.2.\n\n---\n\n## 2. Contenuto Estratto\n${fallbackText.slice(0, 4000)}\n`;

        resPayload = {
          title: cleanName,
          summary: `Documento acquisito dal file ${file.fileName}. Specifiche OKF v0.2 generate.`,
          tags: ["file-upload", isAudio ? "audio" : "document", "okf-v0.2"],
          metadata: {
            okfVersion: "0.2",
            domain: isAudio ? "Audio & Media Systems" : "Software & Systems",
            docType: "specification",
            mediaType: isAudio ? "audio" : undefined,
            markdownContent: localDoc,
            entities: [{ name: cleanName, type: "concept", description: `Risorsa da ${file.fileName}` }],
            relations: [{ targetTitle: "Knowledge Vault", relationType: "references", weight: 0.8 }],
          },
        };
      }

      const newResourceId = "conv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      const newResourceItem: ResourceItem = {
        id: newResourceId,
        userId: activeUser.uid,
        type: "knowledge",
        title: resPayload.title,
        summary: resPayload.summary,
        tags: resPayload.tags || ["file-upload", "okf-v0.2"],
        metadata: {
          ...resPayload.metadata,
          sourceFileName: file.fileName,
          sourceFileId: file.id,
        },
        rawInput: `File: ${file.fileName}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // If Quota exceeded, persist in local memory and cache
      if (quotaExceeded) {
        setResources((prev) => {
          const updated = [newResourceItem, ...prev];
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        setRawFiles((prev) => {
          const updated = prev.map((f) =>
            f.id === file.id
              ? { ...f, status: "converted_okf" as const, convertedResourceId: newResourceId, convertedResourceTitle: resPayload.title }
              : f
          );
          saveLocalRawFiles(updated, activeUser.uid);
          return updated;
        });

        addLog("success", "OKF_PARSER", `Documento convertito e salvato in memoria locale: "${resPayload.title}"`);
        setStatusMessage(`File convertito in specifica OKF v0.2: "${resPayload.title}"`);
        setTimeout(() => setStatusMessage(null), 5000);
        setSelectedKnowledgeForReader(newResourceItem);
        return true;
      }

      try {
        const sanitizedResource = sanitizeForFirestore({
          ...newResourceItem,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        delete (sanitizedResource as any).id;

        const newResourceDoc = await withFirestoreTimeout(addDoc(collection(db, "resources"), sanitizedResource), 3500);
        newResourceItem.id = newResourceDoc.id;

        await withFirestoreTimeout(updateDoc(doc(db, "raw_files", file.id), {
          status: "converted_okf",
          convertedResourceId: newResourceDoc.id,
          convertedResourceTitle: resPayload.title,
          updatedAt: serverTimestamp(),
        }), 3500);
      } catch (saveErr: any) {
        if (isQuotaError(saveErr) || saveErr?.message?.includes("timed out")) {
          setQuotaExceeded(true);
          wasQuotaExceededRef.current = true;
          saveQuotaExceededStatus(true);
          disableNetwork(db).catch(() => {});
        }
      }

      // Ensure local state and reader are immediately populated
      setResources((prev) => {
        const filtered = prev.filter((r) => r.id !== newResourceItem.id);
        const updated = [newResourceItem, ...filtered];
        saveLocalResources(updated, activeUser.uid);
        return updated;
      });

      setRawFiles((prev) => {
        const updated = prev.map((f) =>
          f.id === file.id
            ? { ...f, status: "converted_okf" as const, convertedResourceId: newResourceItem.id, convertedResourceTitle: resPayload.title }
            : f
        );
        saveLocalRawFiles(updated, activeUser.uid);
        return updated;
      });

      addLog("success", "OKF_PARSER", `Documento convertito con successo in OKF v0.2! Creato: "${resPayload.title}"`);
      setStatusMessage(`File convertito in specifica OKF v0.2: "${resPayload.title}"`);
      setTimeout(() => setStatusMessage(null), 5000);
      setSelectedKnowledgeForReader(newResourceItem);

      return true;
    } catch (err: any) {
      console.error("Convert file to OKF error:", err);
      addLog("error", "GEMINI_AI", `Errore durante conversione file "${file.fileName}": ${err.message}`, err);
      setErrorMessage(`Errore conversione: ${err.message || "Errore sconosciuto"}`);
      setTimeout(() => setErrorMessage(null), 5000);
      return false;
    } finally {
      setIsConvertingRawFileId(null);
    }
  };

  // Auth Handlers
  const handleGoogleSignIn = async () => {
    try {
      addLog("info", "AUTH", "Avvio login con Google popup...");
      const result = await signInWithPopup(auth, googleProvider);
      addLog("success", "AUTH", `Login Google completato: ${result.user.email}`);
    } catch (error: any) {
      console.error("Google Sign-In failed:", error);
      addLog("error", "AUTH", `Login Google fallito: ${error.message}`, error);
      alert("Accesso con Google non riuscito o popup bloccato.");
    }
  };

  const handleSignOut = async () => {
    try {
      addLog("info", "AUTH", "Disconnessione utente...");
      await fbSignOut(auth);
      await signInAnonymously(auth);
      addLog("success", "AUTH", "Disconnesso. Nuova sessione anonima creata.");
    } catch (error: any) {
      console.error("Sign-Out error:", error);
      addLog("error", "AUTH", `Errore durante sign-out: ${error.message}`, error);
    }
  };

  // Seed / Sync system documentation suite & demo data with deep OKF v0.2 specifications using writeBatch
  const handleSeedDemoData = async (forceOverwrite = false, currentResourceList?: ResourceItem[]) => {
    const activeUser = user || auth.currentUser;
    if (!activeUser) return;
    if (isSeedingRef.current) return;
    
    isSeedingRef.current = true;
    setIsSeeding(true);
    addLog("info", "CAPTURE", "Inizializzazione e allineamento suite documentale OKF v0.2 nel Vault...");

    if (quotaExceeded) {
      // In quota exceeded state, perform in-memory merge and update local cache directly
      const activeResources = currentResourceList || resources;
      const merged = [...activeResources];
      let addedCount = 0;

      for (const sample of initialSampleResources) {
        const existingIdx = merged.findIndex(
          (r) =>
            r.title.trim().toLowerCase() === sample.title.trim().toLowerCase() ||
            (sample.url && r.url && r.url.trim().toLowerCase() === sample.url.trim().toLowerCase())
        );

        if (existingIdx === -1) {
          merged.push({
            ...sample,
            id: `seed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            userId: activeUser.uid,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as ResourceItem);
          addedCount++;
        }
      }

      setResources(merged);
      saveLocalResources(merged, activeUser.uid);
      setStatusMessage(`Suite OKF v0.2 sincronizzata in memoria locale (${addedCount} documenti).`);
      setTimeout(() => setStatusMessage(null), 4000);
      isSeedingRef.current = false;
      setIsSeeding(false);
      return;
    }

    try {
      const activeResources = currentResourceList || resources;
      const batch = writeBatch(db);
      let addedCount = 0;
      let updatedCount = 0;

      for (const sample of initialSampleResources) {
        // Match existing resource by exact title or canonical URL
        const existing = activeResources.find(
          (r) =>
            r.title.trim().toLowerCase() === sample.title.trim().toLowerCase() ||
            (sample.url && r.url && r.url.trim().toLowerCase() === sample.url.trim().toLowerCase())
        );

        if (existing) {
          const currentMdLen = (existing.metadata?.markdownContent || "").length;
          const sampleMdLen = (sample.metadata?.markdownContent || "").length;

          // Update if forceOverwrite is requested, or if the stored document is short/incomplete (< 500 chars)
          if (forceOverwrite || currentMdLen < 500 || (sampleMdLen > currentMdLen + 200 && existing.type === "knowledge")) {
            const docRef = doc(db, "resources", existing.id);
            const itemToUpdate = sanitizeForFirestore({
              title: sample.title,
              summary: sample.summary,
              type: sample.type,
              tags: sample.tags,
              isFavorite: sample.isFavorite ?? existing.isFavorite ?? false,
              metadata: {
                ...existing.metadata,
                ...sample.metadata,
                markdownContent: sample.metadata?.markdownContent || existing.metadata?.markdownContent,
              },
              updatedAt: serverTimestamp(),
            });
            batch.update(docRef, itemToUpdate);
            updatedCount++;
          }
        } else {
          const newDocRef = doc(collection(db, "resources"));
          const itemToSave = sanitizeForFirestore({
            ...sample,
            url: sample.url || "",
            userId: activeUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(newDocRef, itemToSave);
          addedCount++;
        }
      }

      if (addedCount > 0 || updatedCount > 0) {
        await withFirestoreTimeout(batch.commit(), 4500);
        addLog("success", "CAPTURE", `Sincronizzazione OKF v0.2 completata: ${addedCount} nuove, ${updatedCount} aggiornate!`);
        setStatusMessage(`Suite OKF v0.2 allineata: ${addedCount} create, ${updatedCount} aggiornate.`);
      } else {
        addLog("info", "CAPTURE", "Tutti i documenti del Vault sono già allineati alle specifiche complete OKF v0.2.");
        setStatusMessage("I documenti del Vault sono già aggiornati alle specifiche complete OKF v0.2.");
      }
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.warn("Seed notice:", err?.message || err);
      if (isQuotaError(err) || err?.message?.includes("timed out")) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        addLog("warn", "FIRESTORE", "Quota scritture giornaliere Firestore esaurita durante il seed. Caricamento documentazione in memoria locale.");
        setResources(initialSampleResources as ResourceItem[]);
        saveLocalResources(initialSampleResources as ResourceItem[], activeUser.uid);
        setStatusMessage("Modalità sessione locale: Suite documentale OKF v0.2 caricata con successo.");
      } else {
        addLog("error", "CAPTURE", `Errore sincronizzazione documentazione: ${err.message}`, err);
        setErrorMessage("Errore nel caricamento della documentazione: " + err.message);
      }
      setTimeout(() => setStatusMessage(null), 5000);
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      isSeedingRef.current = false;
      setIsSeeding(false);
    }
  };

  // Analyze text/URL using server-side Gemini endpoint with client-side fallback
  const analyzeWithAI = async (
    input: string, 
    explicitType?: ResourceType,
    onStageUpdate?: (stage: CaptureStage, message?: string) => void
  ) => {
    addLog("info", "GEMINI_AI", `Inizio analisi semantica (${input.length} caratteri, tipo: ${explicitType || "auto"})...`);
    
    try {
      if (onStageUpdate) {
        onStageUpdate("sending", "Invio al server...");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      if (onStageUpdate) {
        // Switch to analyzing after initial socket flush
        setTimeout(() => {
          onStageUpdate("analyzing", "Elaborazione semantica con Gemini AI...");
        }, 300);
      }

      const res = await fetch("/api/analyze-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ input, explicitType }),
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.result && data.result.title) {
          addLog("success", "GEMINI_AI", `Analisi completata con successo: "${data.result.title}" (Tipo: ${data.result.type})`, {
            tags: data.result.tags,
            entities: data.result.metadata?.entities?.length || 0,
            metadata: data.result.metadata,
          });
          return data.result;
        }
      } else {
        const errText = await res.text().catch(() => "");
        addLog("warn", "GEMINI_AI", `Risposta server non ottimale (${res.status}): ${errText.slice(0, 100)}, attivazione parser locale`);
      }
    } catch (networkErr: any) {
      console.warn("[Analyze AI] Endpoint request failed or timed out, activating local parser:", networkErr?.message);
      addLog("warn", "GEMINI_AI", `Analisi cloud non disponibile (${networkErr?.message || "timeout"}), elaborazione con parser euristico locale ad alta velocità...`);
    }

    if (onStageUpdate) {
      onStageUpdate("analyzing", "Estrazione euristica locale...");
    }

    // Fallback: Use client-side local parser
    const fallbackParsed = localFallbackAnalyzeResource(input, explicitType);
    addLog("info", "GEMINI_AI", `Analisi locale completata con successo: "${fallbackParsed.title}" (Tipo: ${fallbackParsed.type})`, {
      tags: fallbackParsed.tags,
      metadata: fallbackParsed.metadata,
    });
    return fallbackParsed;
  };

  // Capture Bar Handler
  const handleCapture = async (
    input: string, 
    explicitType?: ResourceType,
    extraMetadata?: Record<string, any>
  ): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
        setUser(activeUser);
      } catch (authErr: any) {
        addLog("warn", "CAPTURE", "Tentativo di cattura senza utente autenticato.");
        setErrorMessage("Autenticazione in corso, riprova tra un istante.");
        setTimeout(() => setErrorMessage(null), 4000);
        return false;
      }
    }

    setIsAnalyzing(true);
    setCaptureStage("sending");
    setCaptureStageMessage("Invio richiesta...");

    // Hard safety timer to guarantee UI never gets stuck in analyzing state
    const safetyTimer = setTimeout(() => {
      setIsAnalyzing(false);
      setCaptureStage("idle");
      setCaptureStageMessage("");
    }, 10000);

    addLog("info", "CAPTURE", `Ricevuta richiesta di cattura [${explicitType || "auto"}]: ${input.slice(0, 80)}...`);
    try {
      // 1. Analyze with Gemini AI / OKF Engine (guaranteed non-throwing fallback)
      let analyzed: any = null;
      try {
        analyzed = await analyzeWithAI(input, explicitType, (stg, msg) => {
          setCaptureStage(stg);
          if (msg) setCaptureStageMessage(msg);
        });
      } catch (aiErr) {
        console.warn("[handleCapture] AI analysis error, falling back to local heuristic:", aiErr);
        analyzed = localFallbackAnalyzeResource(input, explicitType);
      }

      if (!analyzed || !analyzed.title) {
        analyzed = localFallbackAnalyzeResource(input, explicitType);
      }

      let resolvedType = analyzed.type || explicitType || "article";
      if (
        (input.includes("github.com/") || (analyzed.url && analyzed.url.includes("github.com/"))) &&
        explicitType !== "mcp_server" &&
        explicitType !== "knowledge" &&
        resolvedType !== "mcp_server"
      ) {
        resolvedType = "github_repo";
      }

      let resolvedUrl = (analyzed.url && typeof analyzed.url === "string") ? analyzed.url.trim() : (input.startsWith("http") ? input.trim() : "");
      if (!resolvedUrl && input.includes("github.com/")) {
        const ghMatch = input.match(/github\.com\/[^\s]+/i);
        if (ghMatch) resolvedUrl = `https://${ghMatch[0]}`;
      }
      if (!resolvedUrl && extraMetadata?.gdocUrl) {
        resolvedUrl = extraMetadata.gdocUrl;
      }

      const mergedMetadata = {
        ...(analyzed.metadata || {}),
        ...(extraMetadata || {})
      };

      setCaptureStage("saving");
      setCaptureStageMessage("Salvataggio nel Vault...");

      // If Quota is exceeded or offline, save directly to local state and multi-layer backup
      if (quotaExceeded) {
        const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const localResource: ResourceItem = {
          id: localId,
          userId: activeUser.uid,
          type: resolvedType,
          title: analyzed.title || "Nuova Risorsa",
          url: resolvedUrl,
          rawInput: input,
          summary: analyzed.summary || input,
          tags: Array.isArray(analyzed.tags) ? analyzed.tags : [],
          isFavorite: false,
          metadata: mergedMetadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        setResources((prev) => {
          const updated = [localResource, ...prev];
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        setCaptureStage("success");
        setCaptureStageMessage("Completato!");
        setStatusMessage(`Risorsa "${localResource.title}" aggiunta al Vault!`);
        setTimeout(() => setStatusMessage(null), 4000);

        if (currentCategory !== "all" && currentCategory !== resolvedType) {
          setCurrentCategory(resolvedType);
        }
        setSelectedTag(null);
        setSearchQuery("");
        return true;
      }

      // 2. Save to Firestore with graceful fallback to multi-layer persistence
      addLog("info", "FIRESTORE", `Salvataggio risorsa "${analyzed.title}" [${resolvedType}]...`);
      const rawData = {
        userId: activeUser.uid,
        type: resolvedType,
        title: analyzed.title || "Nuova Risorsa",
        url: resolvedUrl,
        rawInput: input,
        summary: analyzed.summary || input,
        tags: Array.isArray(analyzed.tags) ? analyzed.tags : [],
        isFavorite: false,
        metadata: mergedMetadata,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        const docRef = await withFirestoreTimeout(addDoc(collection(db, "resources"), sanitizeForFirestore(rawData)), 3500);
        addLog("success", "FIRESTORE", `Risorsa salvata con successo con ID: ${docRef.id}`);

        const savedItem: ResourceItem = {
          id: docRef.id,
          ...rawData,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ResourceItem;

        setResources((prev) => {
          const filtered = prev.filter((r) => r.id !== docRef.id);
          const updated = [savedItem, ...filtered];
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });
      } catch (firestoreErr: any) {
        console.warn("[handleCapture] Firestore write failed or timed out, using multi-layer local backup:", firestoreErr);
        if (isQuotaError(firestoreErr) || firestoreErr?.message?.includes("timed out")) {
          setQuotaExceeded(true);
          wasQuotaExceededRef.current = true;
          saveQuotaExceededStatus(true);
          disableNetwork(db).catch(() => {});
        }
        const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const localItem: ResourceItem = {
          id: localId,
          ...rawData,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ResourceItem;

        setResources((prev) => {
          const updated = [localItem, ...prev];
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });
      }

      setCaptureStage("success");
      setCaptureStageMessage("Completato!");
      setStatusMessage(`Risorsa "${rawData.title}" aggiunta al Vault!`);
      setTimeout(() => setStatusMessage(null), 4000);

      if (currentCategory !== "all" && currentCategory !== resolvedType) {
        setCurrentCategory(resolvedType);
      }
      setSelectedTag(null);
      setSearchQuery("");

      return true;
    } catch (error: any) {
      console.warn("Capture fallback activated:", error);
      const emergencyFallback = localFallbackAnalyzeResource(input, explicitType);
      const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      const localResource: ResourceItem = {
        id: localId,
        userId: activeUser.uid,
        type: emergencyFallback.type,
        title: emergencyFallback.title,
        url: emergencyFallback.url || extraMetadata?.gdocUrl || (input.startsWith("http") ? input.trim() : ""),
        rawInput: input,
        summary: emergencyFallback.summary,
        tags: emergencyFallback.tags,
        isFavorite: false,
        metadata: {
          ...(emergencyFallback.metadata || {}),
          ...(extraMetadata || {})
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setResources((prev) => {
        const updated = [localResource, ...prev];
        saveLocalResources(updated, activeUser.uid);
        return updated;
      });

      setCaptureStage("success");
      setCaptureStageMessage("Completato (Offline)!");
      setStatusMessage(`Risorsa "${localResource.title}" salvata nel Vault!`);
      setTimeout(() => setStatusMessage(null), 4000);
      return true;
    } finally {
      clearTimeout(safetyTimer);
      setTimeout(() => {
        setIsAnalyzing(false);
        setCaptureStage("idle");
        setCaptureStageMessage("");
      }, 500);
    }
  };

  // Manual Add Handler
  const handleManualAdd = async (
    newResource: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">
  ): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
        setUser(activeUser);
      } catch (authErr: any) {
        addLog("warn", "FIRESTORE", "Tentativo di inserimento manuale senza utente.");
        return false;
      }
    }

    if (quotaExceeded) {
      const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      const localResource: ResourceItem = {
        id: localId,
        userId: activeUser.uid,
        type: newResource.type,
        title: newResource.title,
        url: newResource.url ? newResource.url.trim() : "",
        rawInput: newResource.rawInput || "",
        summary: newResource.summary,
        tags: newResource.tags || [],
        isFavorite: !!newResource.isFavorite,
        metadata: newResource.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setResources((prev) => {
        const updated = [localResource, ...prev];
        saveLocalResources(updated, activeUser.uid);
        return updated;
      });

      setStatusMessage("Risorsa salvata con successo nel Vault!");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    }

    try {
      addLog("info", "FIRESTORE", `Inserimento manuale: "${newResource.title}" [${newResource.type}]`);
      const rawData = {
        userId: activeUser.uid,
        type: newResource.type,
        title: newResource.title,
        url: newResource.url ? newResource.url.trim() : "",
        rawInput: newResource.rawInput || "",
        summary: newResource.summary,
        tags: newResource.tags || [],
        isFavorite: !!newResource.isFavorite,
        metadata: newResource.metadata || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await withFirestoreTimeout(addDoc(collection(db, "resources"), sanitizeForFirestore(rawData)), 8000);
      recordFirestoreWrite(1, "Creazione Risorsa", newResource.title);
      addLog("success", "FIRESTORE", `Risorsa inserita con successo (ID: ${docRef.id})`);

      const savedItem: ResourceItem = {
        id: docRef.id,
        ...rawData,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ResourceItem;

      setResources((prev) => {
        const filtered = prev.filter((r) => r.id !== docRef.id);
        const updated = [savedItem, ...filtered];
        saveLocalResources(updated, activeUser.uid);
        return updated;
      });

      setStatusMessage("Risorsa salvata con successo nel Vault!");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    } catch (error: any) {
      console.error("Add failed:", error);
      recordFirestoreError(error, "Creazione Risorsa");
      if (isQuotaError(error)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const localResource: ResourceItem = {
          id: localId,
          userId: activeUser.uid,
          type: newResource.type,
          title: newResource.title,
          url: newResource.url ? newResource.url.trim() : "",
          rawInput: newResource.rawInput || "",
          summary: newResource.summary,
          tags: newResource.tags || [],
          isFavorite: !!newResource.isFavorite,
          metadata: newResource.metadata || {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        setResources((prev) => {
          const updated = [localResource, ...prev];
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        setStatusMessage("Risorsa salvata in modalità offline (Quota Firestore esaurita)");
        setTimeout(() => setStatusMessage(null), 3000);
        return true;
      }
      addLog("error", "FIRESTORE", `Errore salvataggio manuale: ${error.message}`, error);
      setErrorMessage("Errore durante il salvataggio: " + (error.message || ""));
      setTimeout(() => setErrorMessage(null), 5000);
      return false;
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (id: string, currentFav: boolean) => {
    const nextFav = !currentFav;
    // Optimistic UI state update
    setResources((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, isFavorite: nextFav } : item));
      saveLocalResources(updated, user?.uid);
      return updated;
    });
    setSelectedResourceForDetail((prev) =>
      prev && prev.id === id ? { ...prev, isFavorite: nextFav } : prev
    );

    if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-")) {
      return;
    }

    try {
      const docRef = doc(db, "resources", id);
      await withFirestoreTimeout(updateDoc(docRef, {
        isFavorite: nextFav,
        updatedAt: serverTimestamp(),
      }), 3500);
      addLog("info", "FIRESTORE", `Preferito aggiornato per risorsa ${id}: ${nextFav ? "Aggiunto" : "Rimosso"}`);
    } catch (err: any) {
      if (isQuotaError(err) || err?.message?.includes("timed out")) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        return;
      }
      console.error("Toggle favorite failed:", err);
      // Revert optimistic update on error
      setResources((prev) => {
        const reverted = prev.map((item) => (item.id === id ? { ...item, isFavorite: currentFav } : item));
        saveLocalResources(reverted, user?.uid);
        return reverted;
      });
      setSelectedResourceForDetail((prev) =>
        prev && prev.id === id ? { ...prev, isFavorite: currentFav } : prev
      );
      addLog("error", "FIRESTORE", `Errore salvataggio preferito: ${err.message}`, err);
    }
  };

  // Update Reading Progress for Articles
  const handleUpdateReadingProgress = async (id: string, progress: number) => {
    try {
      const resource = resources.find((r) => r.id === id);
      const clamped = Math.max(0, Math.min(100, Math.round(progress)));
      const status: "unread" | "in_progress" | "completed" = clamped === 100 ? "completed" : clamped > 0 ? "in_progress" : "unread";

      // Optimistic state & local cache update
      setResources((prev) => {
        const updated = prev.map((item) =>
          item.id === id
            ? { ...item, metadata: { ...item.metadata, readingProgress: clamped, readingStatus: status } }
            : item
        );
        saveLocalResources(updated, user?.uid);
        return updated;
      });

      if (selectedResourceForDetail && selectedResourceForDetail.id === id) {
        setSelectedResourceForDetail((prev) =>
          prev
            ? { ...prev, metadata: { ...prev.metadata, readingProgress: clamped, readingStatus: status } }
            : null
        );
      }

      if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-")) {
        return;
      }

      const docRef = doc(db, "resources", id);
      const updatedMetadata = {
        ...(resource?.metadata || {}),
        readingProgress: clamped,
        readingStatus: status,
      };

      await withFirestoreTimeout(
        updateDoc(
          docRef,
          sanitizeForFirestore({
            metadata: updatedMetadata,
            updatedAt: serverTimestamp(),
          })
        ),
        3500
      );

      addLog("info", "FIRESTORE", `Avanzamento lettura aggiornato per "${resource?.title || id}": ${clamped}%`);
    } catch (err: any) {
      if (isQuotaError(err) || err?.message?.includes("timed out")) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        return;
      }
      console.error("Reading progress update failed:", err);
      addLog("error", "FIRESTORE", `Errore aggiornamento lettura: ${err.message}`, err);
    }
  };

  // Update Resource
  const handleUpdateResource = async (id: string, updatedData: Partial<ResourceItem>): Promise<boolean> => {
    // Instant optimistic update for both modals & main list & local cache
    setSelectedResourceForDetail((prev) => {
      if (prev && prev.id === id) {
        return {
          ...prev,
          ...updatedData,
          metadata: {
            ...(prev.metadata || {}),
            ...(updatedData.metadata || {}),
          },
        };
      }
      return prev;
    });

    setSelectedKnowledgeForReader((prev) => {
      if (prev && prev.id === id) {
        return {
          ...prev,
          ...updatedData,
          metadata: {
            ...(prev.metadata || {}),
            ...(updatedData.metadata || {}),
          },
        };
      }
      return prev;
    });

    setResources((prev) => {
      const updated = prev.map((item) =>
        item.id === id
          ? {
              ...item,
              ...updatedData,
              metadata: {
                ...(item.metadata || {}),
                ...(updatedData.metadata || {}),
              },
            }
          : item
      );
      saveLocalResources(updated, user?.uid);
      return updated;
    });

    if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-") || id.startsWith("conv-")) {
      return true;
    }

    try {
      const docRef = doc(db, "resources", id);
      const dataToClean = {
        ...updatedData,
        ...(updatedData.url !== undefined ? { url: updatedData.url.trim() } : {}),
        updatedAt: serverTimestamp(),
      };
      delete (dataToClean as any).id;
      const sanitized = sanitizeForFirestore(dataToClean);
      await withFirestoreTimeout(updateDoc(docRef, sanitized), 8000);
      recordFirestoreWrite(1, "Aggiornamento Risorsa", (updatedData as any).title || id);
      return true;
    } catch (err: any) {
      recordFirestoreError(err, "Aggiornamento Risorsa");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        return true;
      }
      console.error("Update failed:", err);
      return true;
    }
  };

  // Delete Resource
  const handleDeleteResource = async (id: string): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
        setUser(activeUser);
      } catch (authErr: any) {
        addLog("warn", "FIRESTORE", "Tentativo di eliminazione senza utente autenticato.");
        setErrorMessage("Errore di autenticazione. Riprova tra un istante.");
        setTimeout(() => setErrorMessage(null), 4000);
        return false;
      }
    }

    const previousResources = [...resources];
    const previousDetail = selectedResourceForDetail;

    // Optimistic removal from UI & cache
    setResources((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveLocalResources(updated, activeUser?.uid);
      return updated;
    });
    if (selectedResourceForDetail && selectedResourceForDetail.id === id) {
      setSelectedResourceForDetail(null);
    }

    if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-") || id.startsWith("conv-")) {
      setStatusMessage("Risorsa rimossa dal Vault.");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    }

    try {
      addLog("info", "FIRESTORE", `Eliminazione risorsa ID: ${id}...`);
      await withFirestoreTimeout(deleteDoc(doc(db, "resources", id)), 8000);
      recordFirestoreDelete(1, "Eliminazione Risorsa", id);
      addLog("success", "FIRESTORE", `Risorsa eliminata con successo dal Vault (ID: ${id})`);
      setStatusMessage("Risorsa eliminata con successo!");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    } catch (err: any) {
      recordFirestoreError(err, "Eliminazione Risorsa");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        setStatusMessage("Risorsa rimossa dalla memoria locale.");
        setTimeout(() => setStatusMessage(null), 3000);
        return true;
      }
      console.error("Delete failed:", err);
      // Revert optimistic change on real failure
      setResources(previousResources);
      saveLocalResources(previousResources, activeUser?.uid);
      if (previousDetail && previousDetail.id === id) {
        setSelectedResourceForDetail(previousDetail);
      }
      addLog("error", "FIRESTORE", `Errore durante eliminazione risorsa: ${err.message}`, err);
      setErrorMessage("Impossibile eliminare la risorsa: " + (err.message || "Errore sconosciuto"));
      setTimeout(() => setErrorMessage(null), 5000);
      return false;
    }
  };

  // Export Single Resource to Google Docs in Google Drive 'knowledge' folder
  const handleExportGoogleDoc = (resource: ResourceItem) => {
    setGoogleDriveExportResource(resource);
    setIsGoogleDriveOpen(true);
  };

  // Compute category counts
  const counts = useMemo(() => {
    const res = {
      all: resources.length,
      knowledge: 0,
      troubleshooting: 0,
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

  // Filter and sort resources using enhanced multi-token & deep indexing search engine
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
        onSeedDemo={() => handleSeedDemoData(true)}
        isSeeding={isSeeding}
        onOpenKnowledgeUpload={() => setIsKnowledgeUploadOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
        onOpenRecovery={() => setIsRecoveryModalOpen(true)}
        onOpenPersistenceStatus={() => setIsPersistenceModalOpen(true)}
        unsyncedCount={resources.filter((r) => r.id.startsWith("local-") || r.id.startsWith("conv-") || r.id.startsWith("seed-")).length}
        onUploadUnsynced={handleUploadUnsyncedResources}
        selectedTag={selectedTag}
        onSelectTag={(tag) => {
          setSelectedTag(tag);
          if (tag && currentCategory !== "all") {
            // Keep user on current view or let them see the filtered tag
          }
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
          user={user}
          onSignIn={handleGoogleSignIn}
          totalCount={counts.all}
          isZenMode={isZenMode}
          onToggleZenMode={handleToggleZenMode}
        />

        {/* Real-time Cache, Auto-Sync & Quota Reset Countdown Banner with Conflict Notification */}
        <SyncStatusBanner
          quotaExceeded={quotaExceeded}
          isSyncing={isSyncing}
          lastSyncTime={lastSyncTime}
          onManualSync={handleTriggerSync}
          resourceCount={counts.all}
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
          unsyncedCount={resources.filter((r) => r.id.startsWith("local-") || r.id.startsWith("conv-") || r.id.startsWith("seed-")).length}
          onUploadUnsynced={handleUploadUnsyncedResources}
          isAnonymous={user?.isAnonymous ?? true}
          userEmail={user?.email || null}
        />

        {/* Storage Discrepancy & Recovery Alert Banner */}
        {storageDiscrepancyNotice && storageDiscrepancyNotice.foundCount > resources.length && (
          <div className="bg-[#1C160B] border-b border-[#C5A059]/40 text-[#E5C170] text-xs px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 z-20 animate-fade-in font-sans">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#C5A059] shrink-0" />
              <span>
                <strong>Risorse archiviate rilevate nello storage:</strong> Trovate {storageDiscrepancyNotice.foundCount} risorse nei livelli locali/server (attualmente visualizzate: {resources.length}).
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsRecoveryModalOpen(true)}
                className="px-3 py-1 rounded bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors shadow-sm"
              >
                Apri Centro di Recupero
              </button>
              <button
                onClick={() => setStorageDiscrepancyNotice(null)}
                className="p-1 text-[#888] hover:text-white text-xs"
                title="Ignora per ora"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Quota Exceeded Alert Banner with Multi-Layer Protection Details */}
        {quotaExceeded && (
          <div className="bg-amber-950/80 border-b border-amber-500/40 text-amber-200 text-xs px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 z-20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Avviso Quota Firestore:</strong> Modalità offline / protezione locale attiva. Se Firestore è tornato disponibile, clicca su Verifica & Sblocca.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={async () => {
                  setQuotaExceeded(false);
                  wasQuotaExceededRef.current = false;
                  saveQuotaExceededStatus(false);
                  await enableNetwork(db).catch(() => {});
                  addLog("info", "FIRESTORE", "Verifica manuale quota Firestore avviata...");
                  handleTriggerSync();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#C5A059] hover:bg-[#D5B069] text-black font-medium rounded transition-colors text-[11px] cursor-pointer"
                title="Riconnetti Firestore e verifica connettività"
              >
                <RefreshCw className="w-3 h-3" />
                Verifica & Sblocca
              </button>
              <button
                onClick={() => exportResourcesToJSON(resources)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded border border-amber-500/40 transition-colors font-medium text-[11px]"
              >
                Scarica Backup JSON 📥
              </button>
              <a
                href="https://console.firebase.google.com/project/gen-lang-client-0828011049/firestore/databases/ai-studio-knowledgevaultde-43fb758c-8022-4e0b-a5e1-737aad496305/data?openUpgradeDialog=true"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#1A1A1A] hover:bg-[#252525] text-[#BBB] hover:text-white rounded border border-[#333] transition-colors font-medium text-[11px]"
              >
                Console Firebase ↗
              </a>
              <button
                onClick={() => {
                  setQuotaExceeded(false);
                  wasQuotaExceededRef.current = false;
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

              {/* Top Category Info & Tag Cloud - only when not viewing Quota Telemetry */}
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
                />
              )}

              {/* Resources, Quota Telemetry or Raw Files Display */}
              {currentCategory === "quota_monitor" ? (
                /* Dedicated Quota & Telemetry Diagnostics Dashboard */
                <div className="flex-1 flex flex-col min-h-0">
                  <QuotaTelemetryPage
                    quotaExceeded={quotaExceeded}
                    onRefreshOnlineStatus={async () => {
                      setQuotaExceeded(false);
                      wasQuotaExceededRef.current = false;
                      saveQuotaExceededStatus(false);
                      await enableNetwork(db).catch(() => {});
                      addLog("success", "FIRESTORE", "Rete Firestore riattivata con successo dal Centro Telemetria.");
                      handleTriggerSync();
                    }}
                    onBackToVault={() => setCurrentCategory("all")}
                  />
                </div>
              ) : currentCategory === "raw_files" ? (
                /* Raw Files & Staging Buffer Manager */
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
                        className="px-4 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-md"
                      >
                        <span>Mostra Tutte le {resources.length} Risorse (Azzera Filtri)</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setIsRecoveryModalOpen(true)}
                          className="px-4 py-2 rounded-lg bg-[#1B150C] hover:bg-[#2A2012] border border-[#3E3017] hover:border-[#C5A059]/60 text-[#E5C170] text-xs transition-colors flex items-center gap-1.5 font-medium"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-[#C5A059]" />
                          <span>Apri Centro di Recupero</span>
                        </button>
                        <button
                          onClick={() => handleSeedDemoData(true)}
                          disabled={isSeeding}
                          className="px-4 py-2 rounded-lg bg-[#141414] hover:bg-[#1E1E1E] border border-[#333] text-xs text-[#C5A059] transition-colors"
                        >
                          {isSeeding ? "Sincronizzazione OKF..." : "Sincronizza Suite OKF v0.2"}
                        </button>
                        <button
                          onClick={() => setIsKnowledgeUploadOpen(true)}
                          className="px-4 py-2 rounded-lg bg-[#1E1A11] hover:bg-[#2B2313] border border-[#C5A059]/40 text-[#D5B069] text-xs transition-colors flex items-center gap-1.5"
                        >
                          <BrainCircuit className="w-3.5 h-3.5" />
                          <span>Carica OKF Doc</span>
                        </button>
                        <button
                          onClick={() => setIsAddModalOpen(true)}
                          className="px-4 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] text-black font-semibold text-xs transition-colors flex items-center gap-1.5"
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
                />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Resource Detail & Edit Modal */}
      <ResourceModal
        resource={selectedResourceForDetail}
        allResources={resources}
        onClose={() => setSelectedResourceForDetail(null)}
        onUpdate={handleUpdateResource}
        onDelete={handleDeleteResource}
        onToggleFavorite={handleToggleFavorite}
        onPrintPreview={(res) => setPrintPreviewResource(res)}
        onExportGoogleDoc={handleExportGoogleDoc}
        onNavigateToResource={(res) => {
          setSelectedResourceForDetail(res);
        }}
      />

      {/* OKF Knowledge Markdown Reader & Explorer Modal */}
      <KnowledgeReader
        resource={selectedKnowledgeForReader}
        allResources={resources}
        onClose={() => setSelectedKnowledgeForReader(null)}
        onUpdate={handleUpdateResource}
        onPrintPreview={(res) => setPrintPreviewResource(res)}
        onExportGoogleDoc={handleExportGoogleDoc}
        onNavigateToResource={(res) => {
          if (res.type === "knowledge") {
            setSelectedKnowledgeForReader(res);
          } else {
            setSelectedKnowledgeForReader(null);
            setSelectedResourceForDetail(res);
          }
        }}
      />

      {/* Knowledge Upload Dialog (OKF v0.2 Converter) */}
      <KnowledgeUploadDialog
        isOpen={isKnowledgeUploadOpen}
        onClose={() => setIsKnowledgeUploadOpen(false)}
        onUploadProcessedDoc={handleManualAdd}
        existingResources={resources}
      />

      {/* Manual / AI Add Dialog */}
      <AddResourceDialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleManualAdd}
        onAnalyzeWithAI={analyzeWithAI}
        onAddLog={addLog}
      />

      {/* Live System Activity & Diagnostic Drawer */}
      <DiagnosticDrawer
        isOpen={isDiagnosticOpen}
        onClose={() => setIsDiagnosticOpen(false)}
        logs={logs}
        onClearLogs={() => setLogs([])}
        userId={user?.uid}
        totalResources={resources.length}
        resources={resources}
        rawFiles={rawFiles}
        isQuotaExceeded={quotaExceeded}
        onRefreshOnlineStatus={async () => {
          setQuotaExceeded(false);
          wasQuotaExceededRef.current = false;
          saveQuotaExceededStatus(false);
          await enableNetwork(db).catch(() => {});
          addLog("success", "FIRESTORE", "Rete Firestore ripristinata dal centro di auto-risoluzione.");
          handleTriggerSync();
        }}
        onNotification={(type, msg) => {
          addLog(type === "success" ? "success" : type === "error" ? "error" : "info", "SYSTEM", msg);
          setStatusMessage(msg);
          setTimeout(() => setStatusMessage(null), 4000);
        }}
      />

      {/* Export / Backup Dialog (JSON & CSV) */}
      <ExportBackupDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        resources={resources}
        currentCategory={currentCategory}
        selectedTag={selectedTag}
        searchQuery={searchQuery}
        onAddLog={addLog}
      />

      {/* Single Resource Print Preview Modal */}
      <PrintPreviewModal
        isOpen={!!printPreviewResource}
        onClose={() => setPrintPreviewResource(null)}
        resource={printPreviewResource}
      />

      {/* Multi-Resource / Collection Print Dossier Preview Modal */}
      <PrintPreviewModal
        isOpen={isPrintDossierOpen}
        onClose={() => setIsPrintDossierOpen(false)}
        resources={filteredResources}
        title={`Dossier Knowledge Vault (${filteredResources.length} schede)`}
      />

      {/* Local vs Firestore Conflict Resolution & Auto-Merge Modal */}
      <ConflictResolutionModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        analysis={conflictAnalysis}
        onApplyMerge={handleApplyConflictMerge}
        isApplying={isApplyingMerge}
      />

      {/* Google Drive & Docs Hub (Cartella 'knowledge') */}
      <GoogleDriveModal
        isOpen={isGoogleDriveOpen}
        onClose={() => {
          setIsGoogleDriveOpen(false);
          setGoogleDriveExportResource(null);
        }}
        vaultResources={resources}
        onIngestContent={handleCapture}
        selectedResourceForExport={googleDriveExportResource}
        onResourceExported={(resourceId, exportResult) => {
          handleUpdateResource(resourceId, {
            metadata: {
              gdocId: exportResult.docId,
              gdocUrl: exportResult.docUrl,
              gdocExportedAt: new Date().toISOString(),
              gdriveSourceId: exportResult.folderId,
            },
          });
          setStatusMessage(`Esportato con successo in Google Doc: "${exportResult.title}"`);
          setTimeout(() => setStatusMessage(null), 4000);
        }}
      />

      {/* Centro di Recupero & Protezione Dati Multi-Livello */}
      <RecoveryModal
        isOpen={isRecoveryModalOpen}
        onClose={() => setIsRecoveryModalOpen(false)}
        currentResources={resources}
        currentCategory={currentCategory}
        selectedTag={selectedTag}
        searchQuery={searchQuery}
        onResetFilters={() => {
          setCurrentCategory("all");
          setSelectedTag(null);
          setSearchQuery("");
        }}
        currentUserId={user?.uid}
        rawFiles={rawFiles}
        onApplyRestoredResources={(recovered) => {
          setResources(recovered);
          saveLocalResources(recovered, user?.uid, rawFiles);
          setStatusMessage(`Ripristinate con successo ${recovered.length} risorse nel Knowledge Vault!`);
          setStorageDiscrepancyNotice(null);
          addLog("success", "BACKUP", `Ripristino completato: ${recovered.length} risorse attive nel Vault.`);
          setTimeout(() => setStatusMessage(null), 5000);
        }}
      />

      {/* Stato Persistenza & Architettura a 3 Livelli Modal */}
      <PersistenceStatusModal
        isOpen={isPersistenceModalOpen}
        onClose={() => setIsPersistenceModalOpen(false)}
        user={user}
        onSignInWithGoogle={handleGoogleSignIn}
        resources={resources}
        onUploadUnsynced={handleUploadUnsyncedResources}
        isSyncing={isSyncing}
        quotaExceeded={quotaExceeded}
      />
    </div>
  );
}
