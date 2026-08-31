/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
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
  User
} from "./lib/firebase";
import { ResourceItem, ResourceType, ViewMode, SortOption, DiagnosticLog } from "./types";
import { initialSampleResources } from "./lib/sampleData";
import { parseDate, formatDate, getTimestampMillis } from "./lib/dateUtils";
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
import { FolderSearch, Plus, Sparkles, AlertCircle, Network, BrainCircuit, Terminal } from "lucide-react";

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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(true);
  
  // UI States
  const [currentCategory, setCurrentCategory] = useState<ResourceType | "all" | "favorites">("all");
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
  const [logs, setLogs] = useState<DiagnosticLog[]>([
    {
      id: "init-1",
      timestamp: new Date().toLocaleTimeString(),
      level: "info",
      category: "AUTH",
      message: "Knowledge Vault inizializzato. Avvio sessione...",
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
  const [isSeeding, setIsSeeding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setResources([]);
      setIsLoadingResources(false);
      return;
    }

    setIsLoadingResources(true);
    addLog("info", "FIRESTORE", `Sottoscrizione realtime alla collezione 'resources' per UID: ${user.uid}`);

    // Query resources matching current user
    const resourcesRef = collection(db, "resources");
    const q = query(
      resourcesRef,
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
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

        setResources(items);
        setIsLoadingResources(false);
        addLog("info", "FIRESTORE", `Sincronizzate ${items.length} risorse dal database.`);

        // Auto-seed if account has 0 resources
        if (snapshot.empty && !isSeeding) {
          handleSeedDemoData();
        }
      },
      (error) => {
        console.error("Firestore snapshot error:", error);
        addLog("error", "FIRESTORE", `Errore sincronizzazione Firestore: ${error.message}`, error);
        setStatusMessage(`Errore di connessione Firestore: ${error.message}`);
        setIsLoadingResources(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

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

  // Seed / Sync system documentation suite & demo data
  const handleSeedDemoData = async () => {
    if (!user) return;
    setIsSeeding(true);
    addLog("info", "CAPTURE", "Inizializzazione suite documentale OKF v0.2 nel Vault...");
    try {
      let addedCount = 0;
      let skippedCount = 0;

      for (const sample of initialSampleResources) {
        // Check if resource with same title already exists in user's vault
        const existing = resources.find((r) => r.title.trim().toLowerCase() === sample.title.trim().toLowerCase());
        if (existing) {
          skippedCount++;
          continue;
        }

        const itemToSave = sanitizeForFirestore({
          ...sample,
          url: sample.url || "",
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await addDoc(collection(db, "resources"), itemToSave);
        addedCount++;
      }

      if (addedCount > 0) {
        addLog("success", "CAPTURE", `Caricate ${addedCount} nuove documentazioni di sistema OKF v0.2!`);
        setStatusMessage(`Caricate ${addedCount} documentazioni e nodi relazionali OKF v0.2!`);
      } else {
        addLog("info", "CAPTURE", "Tutti i documenti di sistema sono già presenti nel Vault.");
        setStatusMessage("Tutti i documenti del sistema sono già sincronizzati nel Vault.");
      }
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      console.error("Seed error:", err);
      addLog("error", "CAPTURE", `Errore caricamento documentazione: ${err.message}`, err);
      setErrorMessage("Errore nel caricamento della documentazione: " + (err.message || ""));
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSeeding(false);
    }
  };

  // Analyze text/URL using server-side Gemini endpoint
  const analyzeWithAI = async (input: string, explicitType?: ResourceType) => {
    addLog("info", "GEMINI_AI", `Inizio analisi semantica (${input.length} caratteri, tipo: ${explicitType || "auto"})...`);
    const res = await fetch("/api/analyze-resource", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, explicitType }),
    });
    if (!res.ok) {
      const errText = await res.text();
      addLog("error", "GEMINI_AI", `Errore server (${res.status}): ${errText}`);
      throw new Error(`Server error: ${res.statusText}`);
    }
    const data = await res.json();
    addLog("success", "GEMINI_AI", `Analisi completata con successo: "${data.result.title}" (Tipo: ${data.result.type})`, {
      tags: data.result.tags,
      entities: data.result.metadata?.entities?.length || 0,
      metadata: data.result.metadata,
    });
    return data.result;
  };

  // Capture Bar Handler
  const handleCapture = async (input: string, explicitType?: ResourceType): Promise<boolean> => {
    if (!user) {
      addLog("warn", "CAPTURE", "Tentativo di cattura senza utente autenticato.");
      setErrorMessage("Autenticazione in corso, riprova tra un istante.");
      setTimeout(() => setErrorMessage(null), 4000);
      return false;
    }

    setIsAnalyzing(true);
    addLog("info", "CAPTURE", `Ricevuta richiesta di cattura [${explicitType || "auto"}]: ${input.slice(0, 80)}...`);
    try {
      // 1. Analyze with Gemini AI / OKF Engine
      const analyzed = await analyzeWithAI(input, explicitType);

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

      // 2. Save directly to Firestore
      addLog("info", "FIRESTORE", `Salvataggio risorsa "${analyzed.title}" [${resolvedType}] nel database...`);
      const rawData = {
        userId: user.uid,
        type: resolvedType,
        title: analyzed.title || "Nuova Risorsa",
        url: resolvedUrl,
        rawInput: input,
        summary: analyzed.summary || input,
        tags: Array.isArray(analyzed.tags) ? analyzed.tags : [],
        isFavorite: false,
        metadata: analyzed.metadata || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "resources"), sanitizeForFirestore(rawData));
      addLog("success", "FIRESTORE", `Risorsa salvata con successo con ID: ${docRef.id}`);

      setStatusMessage(`Risorsa "${rawData.title}" aggiunta al Vault!`);
      setTimeout(() => setStatusMessage(null), 4000);

      // Ensure the newly added resource is immediately visible on screen
      if (currentCategory !== "all" && currentCategory !== resolvedType) {
        setCurrentCategory(resolvedType);
      }
      setSelectedTag(null);
      setSearchQuery("");

      return true;
    } catch (error: any) {
      console.error("Capture failed:", error);
      addLog("error", "CAPTURE", `Fallimento cattura risorsa: ${error.message}`, error);
      setErrorMessage("Errore durante la cattura della risorsa: " + (error.message || ""));
      setTimeout(() => setErrorMessage(null), 5000);
      return false;
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Manual Add Handler
  const handleManualAdd = async (
    newResource: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">
  ): Promise<boolean> => {
    if (!user) {
      addLog("warn", "FIRESTORE", "Tentativo di inserimento manuale senza utente.");
      return false;
    }
    try {
      addLog("info", "FIRESTORE", `Inserimento manuale: "${newResource.title}" [${newResource.type}]`);
      const rawData = {
        userId: user.uid,
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

      const docRef = await addDoc(collection(db, "resources"), sanitizeForFirestore(rawData));
      addLog("success", "FIRESTORE", `Risorsa inserita con successo (ID: ${docRef.id})`);
      setStatusMessage("Risorsa salvata con successo nel Vault!");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    } catch (error: any) {
      console.error("Add failed:", error);
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
    setResources((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isFavorite: nextFav } : item))
    );
    setSelectedResourceForDetail((prev) =>
      prev && prev.id === id ? { ...prev, isFavorite: nextFav } : prev
    );

    try {
      const docRef = doc(db, "resources", id);
      await updateDoc(docRef, {
        isFavorite: nextFav,
        updatedAt: serverTimestamp(),
      });
      addLog("info", "FIRESTORE", `Preferito aggiornato per risorsa ${id}: ${nextFav ? "Aggiunto" : "Rimosso"}`);
    } catch (err: any) {
      console.error("Toggle favorite failed:", err);
      // Revert optimistic update on error
      setResources((prev) =>
        prev.map((item) => (item.id === id ? { ...item, isFavorite: currentFav } : item))
      );
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
      const status = clamped === 100 ? "completed" : clamped > 0 ? "in_progress" : "unread";

      const docRef = doc(db, "resources", id);
      const updatedMetadata = {
        ...(resource?.metadata || {}),
        readingProgress: clamped,
        readingStatus: status,
      };

      await updateDoc(
        docRef,
        sanitizeForFirestore({
          metadata: updatedMetadata,
          updatedAt: serverTimestamp(),
        })
      );

      // Optimistic update
      setResources((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, metadata: { ...item.metadata, readingProgress: clamped, readingStatus: status } }
            : item
        )
      );

      if (selectedResourceForDetail && selectedResourceForDetail.id === id) {
        setSelectedResourceForDetail((prev) =>
          prev
            ? { ...prev, metadata: { ...prev.metadata, readingProgress: clamped, readingStatus: status } }
            : null
        );
      }

      addLog("info", "FIRESTORE", `Avanzamento lettura aggiornato per "${resource?.title || id}": ${clamped}%`);
    } catch (err: any) {
      console.error("Reading progress update failed:", err);
      addLog("error", "FIRESTORE", `Errore aggiornamento lettura: ${err.message}`, err);
    }
  };

  // Update Resource
  const handleUpdateResource = async (id: string, updatedData: Partial<ResourceItem>): Promise<boolean> => {
    try {
      const docRef = doc(db, "resources", id);
      const dataToClean = {
        ...updatedData,
        ...(updatedData.url !== undefined ? { url: updatedData.url.trim() } : {}),
        updatedAt: serverTimestamp(),
      };
      delete (dataToClean as any).id;
      const sanitized = sanitizeForFirestore(dataToClean);
      await updateDoc(docRef, sanitized);
      // Update modal view state if currently open
      if (selectedResourceForDetail && selectedResourceForDetail.id === id) {
        setSelectedResourceForDetail((prev) => (prev ? { ...prev, ...updatedData } : null));
      }
      return true;
    } catch (err: any) {
      console.error("Update failed:", err);
      alert("Errore nell'aggiornamento: " + err.message);
      return false;
    }
  };

  // Delete Resource
  const handleDeleteResource = async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "resources", id));
      return true;
    } catch (err: any) {
      console.error("Delete failed:", err);
      alert("Errore nell'eliminazione: " + err.message);
      return false;
    }
  };

  // Compute category counts
  const counts = useMemo(() => {
    const res = {
      all: resources.length,
      knowledge: 0,
      article: 0,
      github_repo: 0,
      mcp_server: 0,
      ai_skill: 0,
      link: 0,
      favorites: 0,
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

  // Filter and sort resources
  const filteredResources = useMemo(() => {
    return resources
      .filter((item) => {
        // Category filter
        if (currentCategory === "favorites" && !item.isFavorite) return false;
        if (currentCategory !== "all" && currentCategory !== "favorites" && item.type !== currentCategory) {
          return false;
        }

        // Tag filter
        if (selectedTag && (!item.tags || !item.tags.includes(selectedTag))) {
          return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = item.title?.toLowerCase().includes(q);
          const matchSummary = item.summary?.toLowerCase().includes(q);
          const matchUrl = item.url?.toLowerCase().includes(q);
          const matchTags = item.tags?.some((t) => t.toLowerCase().includes(q));
          const matchMcpCmd = item.metadata?.command?.toLowerCase().includes(q);
          const matchGhRepo = item.metadata?.repoName?.toLowerCase().includes(q);
          return matchTitle || matchSummary || matchUrl || matchTags || matchMcpCmd || matchGhRepo;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "title") {
          return (a.title || "").localeCompare(b.title || "");
        }
        if (sortBy === "title_desc") {
          return (b.title || "").localeCompare(a.title || "");
        }
        if (sortBy === "favorites") {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
        }
        if (sortBy === "type") {
          const typePriority: Record<ResourceType, number> = {
            knowledge: 1,
            link: 2,
            mcp_server: 3,
            github_repo: 4,
            ai_skill: 5,
            article: 6,
          };
          const diff = (typePriority[a.type] || 99) - (typePriority[b.type] || 99);
          if (diff !== 0) return diff;
        }
        const timeA = getTimestampMillis(a.createdAt);
        const timeB = getTimestampMillis(b.createdAt);
        return sortBy === "oldest" ? timeA - timeB : timeB - timeA;
      });
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
        counts={counts}
        user={user}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onSeedDemo={handleSeedDemoData}
        isSeeding={isSeeding}
        onOpenKnowledgeUpload={() => setIsKnowledgeUploadOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
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
          user={user}
          onSignIn={handleGoogleSignIn}
          totalCount={counts.all}
        />

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

        {/* Scrollable View Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 flex flex-col">
          {/* Top Category Info & Tag Cloud */}
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

          {/* Resources Display */}
          {isLoadingResources ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-56 bg-[#0D0D0D] border border-[#1A1A1A] rounded-xl p-5" />
              ))}
            </div>
          ) : viewMode === "graph" ? (
            /* Graph View for Knowledge Ontology & Connected Resources */
            <div className="flex-1 w-full min-h-0 flex flex-col">
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
          ) : filteredResources.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[#222] rounded-2xl bg-[#0A0A0A] my-6">
              <div className="w-12 h-12 rounded-full bg-[#141414] border border-[#262626] flex items-center justify-center text-[#C5A059] mb-4">
                <FolderSearch className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-serif text-white mb-1">
                Nessuna risorsa trovata
              </h3>
              <p className="text-xs text-[#777] max-w-sm mb-6 leading-relaxed">
                {searchQuery || selectedTag
                  ? "Nessun risultato corrisponde ai criteri di ricerca impostati. Prova a rimuovere i filtri."
                  : "Il tuo Vault è vuoto. Inizia incollando un link GitHub, MCP, una guida, carica documenti Knowledge (OKF) o carica i dati demo."}
              </p>
              
              <div className="flex items-center gap-3 flex-wrap justify-center">
                {searchQuery || selectedTag ? (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedTag(null);
                    }}
                    className="text-xs text-[#C5A059] hover:underline"
                  >
                    Resetta filtri
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleSeedDemoData}
                      disabled={isSeeding}
                      className="px-4 py-2 rounded-lg bg-[#141414] hover:bg-[#1E1E1E] border border-[#333] text-xs text-[#C5A059] transition-colors"
                    >
                      {isSeeding ? "Caricamento Docs..." : "Carica Documentazione OKF v0.2"}
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
              onOpenKnowledgeUpload={() => setIsKnowledgeUploadOpen(true)}
              onOpenDiagnostic={() => setIsDiagnosticOpen(true)}
            />
          </div>
        </div>
      </main>

      {/* Resource Detail & Edit Modal */}
      <ResourceModal
        resource={selectedResourceForDetail}
        onClose={() => setSelectedResourceForDetail(null)}
        onUpdate={handleUpdateResource}
        onDelete={handleDeleteResource}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* OKF Knowledge Markdown Reader & Explorer Modal */}
      <KnowledgeReader
        resource={selectedKnowledgeForReader}
        allResources={resources}
        onClose={() => setSelectedKnowledgeForReader(null)}
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
    </div>
  );
}
