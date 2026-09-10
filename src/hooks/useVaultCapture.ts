/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { 
  auth, 
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
  serverTimestamp, 
  getDocs, 
  setDoc, 
  writeBatch,
  disableNetwork,
  User 
} from "../lib/firebase";
import { ResourceItem, ResourceType, RawFileItem, DiagnosticLog, CaptureStage } from "../types";
import { localFallbackAnalyzeResource } from "../lib/fallbackParser";
import { parseDate, getTimestampMillis } from "../lib/dateUtils";
import { loadRawFilesFromIndexedDB } from "../lib/indexedDb";
import { 
  sanitizeForFirestore, 
  isQuotaError, 
  withFirestoreTimeout, 
  saveLocalResources 
} from "./useVaultData";
import { saveQuotaExceededStatus } from "../lib/cacheManager";
import { recordLifecycleEvent } from "../lib/resourceLifecycleTracker";
import { validateOKFDocumentSchema } from "../lib/okfParser";

// Local storage key for raw files
const RAW_FILES_STORAGE_KEY = "knowledge_vault_raw_files";

function loadLocalRawFiles(uid?: string): RawFileItem[] | null {
  try {
    const key = uid ? `${RAW_FILES_STORAGE_KEY}_${uid}` : RAW_FILES_STORAGE_KEY;
    const item = localStorage.getItem(key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.warn("Could not load local raw files:", err);
    return null;
  }
}

function saveLocalRawFiles(files: RawFileItem[], uid?: string) {
  try {
    const key = uid ? `${RAW_FILES_STORAGE_KEY}_${uid}` : RAW_FILES_STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(files));
  } catch (err) {
    console.warn("Could not save local raw files:", err);
  }
}

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
};

export type InputClassificationType = 
  | "web_link"           // Standard HTTP/HTTPS link or web URL
  | "github_repo"        // GitHub repository URL (e.g. github.com/owner/repo)
  | "scientific_paper"   // arXiv, DOI, scientific paper URL or ID
  | "rss_feed"           // RSS / Atom feed URL or XML
  | "mcp_server"         // MCP config or protocol definition
  | "ai_skill"           // Prompt, system instruction, skill template
  | "troubleshooting"    // Bug report, error log, resolution steps
  | "quick_note"         // Quick note, scratchpad memo
  | "okf_document"       // Formatted technical document with OKF frontmatter
  | "raw_text";          // General raw text/snippet

export interface InputClassificationResult {
  classification: InputClassificationType;
  isWebLink: boolean;
  detectedUrl?: string;
  isExplicitKnowledge: boolean;
  confidence: number;
  reason: string;
  characteristics: {
    hasHttpPrefix: boolean;
    isGitHub: boolean;
    isArxiv: boolean;
    isRss: boolean;
    hasYamlFrontmatter: boolean;
    hasOkfVersionHeader: boolean;
    isMultiLine: boolean;
    length: number;
  };
}

/**
 * Step 1 Classifier: Ispeziona e categorizza l'input grezzo prima di qualsiasi operazione di storage.
 * Identifica in modo deterministico collegamenti web, repository, documenti OKF e note.
 */
export function classifyCaptureInput(input: string, explicitType?: ResourceType): InputClassificationResult {
  const trimmed = (input || "").trim();
  const lower = trimmed.toLowerCase();
  const isMultiLine = trimmed.includes("\n");
  const length = trimmed.length;

  const hasHttpPrefix = lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("www.");
  const urlRegex = /(?:https?:\/\/|www\.)[^\s]+/i;
  const urlMatch = trimmed.match(urlRegex);
  const detectedUrl = urlMatch ? (urlMatch[0].startsWith("www.") ? `https://${urlMatch[0]}` : urlMatch[0]) : undefined;

  const isGitHub = Boolean(lower.includes("github.com/"));
  const isArxiv = Boolean(lower.includes("arxiv.org/") || lower.includes("doi.org/") || lower.startsWith("paper:"));
  const isRss = Boolean(
    lower.endsWith(".xml") ||
    lower.includes("/feed") ||
    lower.includes("/rss") ||
    lower.startsWith("rss:") ||
    lower.includes("<rss") ||
    lower.includes("<feed")
  );
  const hasYamlFrontmatter = Boolean(trimmed.match(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---/));
  const hasOkfVersionHeader = Boolean(hasYamlFrontmatter && (lower.includes("okf_version") || lower.includes("okfversion")));

  const isExplicitKnowledge = explicitType === "knowledge";

  // Priorità 1: Paper Accademico / ArXiv
  if (isArxiv || explicitType === "paper") {
    return {
      classification: "scientific_paper",
      isWebLink: Boolean(detectedUrl || hasHttpPrefix),
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.95,
      reason: "Identificato paper scientifico o pre-print accademico (arXiv/DOI)",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 2: Repository GitHub
  if (isGitHub && explicitType !== "mcp_server" && explicitType !== "knowledge") {
    return {
      classification: "github_repo",
      isWebLink: true,
      detectedUrl: detectedUrl || (trimmed.match(/github\.com\/[^\s]+/i) ? `https://${trimmed.match(/github\.com\/[^\s]+/i)![0]}` : undefined),
      isExplicitKnowledge,
      confidence: 0.95,
      reason: "Identificato URL repository GitHub open-source",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 3: Feed RSS / Syndication
  if (isRss || explicitType === "rss") {
    return {
      classification: "rss_feed",
      isWebLink: Boolean(detectedUrl || hasHttpPrefix),
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.9,
      reason: "Identificato feed di syndication RSS / Atom",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 4: Collegamento Web Standard (URL o dominio web senza frontmatter)
  const isPureUrl = (hasHttpPrefix || Boolean(detectedUrl)) && !isMultiLine && length < 350;
  const isWebUrlDominant = (hasHttpPrefix || Boolean(detectedUrl)) && !hasYamlFrontmatter && !trimmed.startsWith("#") && length < 450;

  if ((isPureUrl || isWebUrlDominant || explicitType === "link" || explicitType === "article") && !hasYamlFrontmatter) {
    return {
      classification: "web_link",
      isWebLink: true,
      detectedUrl: detectedUrl || (hasHttpPrefix ? trimmed : undefined),
      isExplicitKnowledge,
      confidence: 0.92,
      reason: "Identificato collegamento web esterno (URL standard)",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 5: Configurazione MCP Server
  if (lower.includes("mcpservers") || lower.includes("claude_desktop_config") || lower.startsWith("mcp:") || explicitType === "mcp_server") {
    return {
      classification: "mcp_server",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.9,
      reason: "Identificata configurazione Model Context Protocol (MCP)",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 6: AI Skill Prompt
  if (lower.includes("system prompt") || lower.includes("you are a") || lower.startsWith("skill:") || explicitType === "ai_skill") {
    return {
      classification: "ai_skill",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.88,
      reason: "Identificato prompt di sistema o skill per agenti AI",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 7: Troubleshooting Diagnostics
  if (
    explicitType === "troubleshooting" ||
    (lower.includes("problema") && (lower.includes("soluzione") || lower.includes("fix") || lower.includes("risoluzione"))) ||
    lower.includes("root cause") ||
    lower.includes("causa:") ||
    (lower.includes("errore") && lower.includes(".dll"))
  ) {
    return {
      classification: "troubleshooting",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.88,
      reason: "Identificato log diagnostico o procedura di troubleshooting",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 8: Nota Rapida
  if (lower.startsWith("nota:") || lower.startsWith("note:") || lower.startsWith("memo:") || lower.startsWith("scratchpad:") || explicitType === "note") {
    return {
      classification: "quick_note",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: 0.85,
      reason: "Identificata nota rapida o appunto di lavoro",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Priorità 9: Documento Tecnico OKF v0.2
  if (hasYamlFrontmatter || hasOkfVersionHeader || isExplicitKnowledge || (trimmed.startsWith("#") && isMultiLine && length > 250)) {
    return {
      classification: "okf_document",
      isWebLink: false,
      detectedUrl,
      isExplicitKnowledge,
      confidence: hasYamlFrontmatter ? 0.98 : 0.75,
      reason: hasYamlFrontmatter ? "Identificato documento tecnico strutturato con YAML frontmatter OKF" : "Documento di conoscenza tecnica esteso",
      characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
    };
  }

  // Default: Snippet testuale generico
  return {
    classification: "raw_text",
    isWebLink: Boolean(detectedUrl && length < 150),
    detectedUrl,
    isExplicitKnowledge,
    confidence: 0.6,
    reason: "Snippet testuale grezzo generico",
    characteristics: { hasHttpPrefix, isGitHub, isArxiv, isRss, hasYamlFrontmatter, hasOkfVersionHeader, isMultiLine, length }
  };
}

interface UseVaultCaptureProps {
  user: User | null;
  quotaExceeded: boolean;
  setQuotaExceeded: (val: boolean) => void;
  addLog: (level: DiagnosticLog["level"], category: DiagnosticLog["category"], message: string, details?: any) => void;
  setStatusMessage: (msg: string | null) => void;
  setErrorMessage: (msg: string | null) => void;
  resources: ResourceItem[];
  setResources: React.Dispatch<React.SetStateAction<ResourceItem[]>>;
  setSelectedKnowledgeForReader: (item: ResourceItem) => void;
  currentCategory: string;
  setCurrentCategory: (cat: any) => void;
  selectedTag?: string | null;
  setSelectedTag: (tag: string | null) => void;
  searchQuery?: string;
  setSearchQuery: (q: string) => void;
}

export function useVaultCapture({
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
  selectedTag = null,
  setSelectedTag,
  searchQuery = "",
  setSearchQuery,
}: UseVaultCaptureProps) {
  const [rawFiles, setRawFiles] = useState<RawFileItem[]>(() => {
    const cached = loadLocalRawFiles();
    return cached || [];
  });
  const [isLoadingRawFiles, setIsLoadingRawFiles] = useState(false);
  const [isConvertingRawFileId, setIsConvertingRawFileId] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [captureStage, setCaptureStage] = useState<CaptureStage>("idle");
  const [captureStageMessage, setCaptureStageMessage] = useState<string>("");

  const wasQuotaExceededRef = useRef<boolean>(quotaExceeded);
  useEffect(() => {
    wasQuotaExceededRef.current = quotaExceeded;
  }, [quotaExceeded]);

  // Initial load of raw files from IndexedDB
  useEffect(() => {
    async function loadIdbFiles() {
      try {
        const idbFiles = await loadRawFilesFromIndexedDB();
        if (idbFiles && idbFiles.length > 0) {
          setRawFiles((prev) => (idbFiles.length >= prev.length ? idbFiles : prev));
        }
      } catch (err) {
        console.warn("Could not load raw files from IndexedDB:", err);
      }
    }
    loadIdbFiles();
  }, []);

  // Realtime listener for User's Staged / Raw Files Buffer
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
    const q = query(rawFilesRef, where("userId", "==", user.uid));

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

  // Helper to trace and isolate why resources might not be visible in the current UI view
  const checkAndLogFilterVisibility = (
    savedResource: ResourceItem,
    correlationId: string,
    actionContext: string
  ) => {
    const activeCategory = currentCategory;
    const activeTag = selectedTag;
    const activeSearch = searchQuery.trim();

    const matchesCategory = activeCategory === "all" || activeCategory === savedResource.type;
    const itemTags = (savedResource.tags || []).map((t) => String(t).toLowerCase());
    const matchesTag = !activeTag || itemTags.includes(activeTag.toLowerCase());
    const matchesSearch = !activeSearch ||
      savedResource.title.toLowerCase().includes(activeSearch.toLowerCase()) ||
      savedResource.summary.toLowerCase().includes(activeSearch.toLowerCase());

    const isVisible = matchesCategory && matchesTag && matchesSearch;

    if (!isVisible) {
      const hiddenReasons: string[] = [];
      if (!matchesCategory) {
        hiddenReasons.push(`Filtro categoria: vista "${activeCategory}" vs tipo risorsa "${savedResource.type}"`);
      }
      if (!matchesTag) {
        hiddenReasons.push(`Filtro tag: tag attivo "#${activeTag}" assente nei tag risorsa ([${itemTags.join(", ")}])`);
      }
      if (!matchesSearch) {
        hiddenReasons.push(`Filtro ricerca: query "${activeSearch}" non trovata nel testo`);
      }

      recordLifecycleEvent({
        stage: "FILTER_DISCREPANCY_CHECK",
        resourceId: savedResource.id,
        resourceTitle: savedResource.title,
        resourceType: savedResource.type,
        status: "warn",
        message: `[${actionContext} ${correlationId}] DISCREPANZA CONTEGGIO: Risorsa "${savedResource.title}" salvata con successo ma NASCOSTA dalla vista attuale!`,
        details: {
          correlationId,
          resourceId: savedResource.id,
          resourceTitle: savedResource.title,
          resourceType: savedResource.type,
          activeCategory,
          activeTag,
          activeSearch,
          hiddenReasons,
          totalVaultResources: resources.length,
          advice: `Reimposta la categoria su "all" o azzera i filtri per vedere questa risorsa.`,
        },
      });

      addLog(
        "warn",
        "LIFECYCLE",
        `Discrepanza di visualizzazione [${correlationId}]: "${savedResource.title}" salvata ma nascosta nella vista "${activeCategory}" (${hiddenReasons.join(" | ")}).`
      );
    } else {
      recordLifecycleEvent({
        stage: "FILTER_DISCREPANCY_CHECK",
        resourceId: savedResource.id,
        resourceTitle: savedResource.title,
        resourceType: savedResource.type,
        status: "info",
        message: `[${actionContext} ${correlationId}] Risorsa "${savedResource.title}" visibile correttamente nella vista attuale (${activeCategory}).`,
        details: {
          correlationId,
          resourceId: savedResource.id,
          activeCategory,
          activeTag,
          activeSearch,
          isVisible: true,
        },
      });
    }
  };

  // Upload Raw File with Firestore Staging & Chunking
  const handleUploadRawFile = async (file: File, notes?: string): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
      } catch (authErr: any) {
        addLog("error", "AUTH", "Autenticazione richiesta per caricare file.");
        setErrorMessage("Errore di autenticazione.");
        return false;
      }
    }

    const uploadSessionId = "raw-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const initialRawCount = rawFiles.length;

    try {
      recordLifecycleEvent({
        stage: "CAPTURE_INITIATED",
        resourceTitle: file.name,
        resourceType: file.type || "raw_file",
        status: "info",
        message: `[Upload File Grezzo ${uploadSessionId}] Avvio caricamento per "${file.name}" (${(file.size / 1024).toFixed(1)} KB, buffer attuale: ${initialRawCount} file)`,
        details: {
          uploadSessionId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          notesLength: notes?.length || 0,
          initialRawFilesCount: initialRawCount,
          userId: activeUser.uid,
        },
      });

      addLog("info", "CAPTURE", `[${uploadSessionId}] Avvio acquisizione file grezzo: "${file.name}" (${(file.size / 1024).toFixed(1)} KB, raw buffer: ${initialRawCount})`);
      
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

      const CHUNK_SIZE = 300 * 1024;
      const dataPayload = base64Data || textContent;
      const needsChunking = dataPayload.length > CHUNK_SIZE;
      const totalChunks = needsChunking ? Math.ceil(dataPayload.length / CHUNK_SIZE) : 1;

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

      recordLifecycleEvent({
        stage: "DATA_TRANSFORMATION",
        resourceTitle: file.name,
        resourceType: isAudio ? "audio" : ext || "document",
        status: "info",
        message: `[File Grezzo ${uploadSessionId}] Trasformazione completata: MIME "${resolvedMime}", chunking=${needsChunking} (${totalChunks} blocchi, ${dataPayload.length} bytes)`,
        details: {
          uploadSessionId,
          resolvedMime,
          isTextType,
          isAudio,
          isPdf,
          isImage,
          needsChunking,
          totalChunks,
          payloadLengthBytes: dataPayload.length,
        },
      });

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

        let rawCountBefore = 0;
        let rawCountAfter = 0;
        setRawFiles((prev) => {
          rawCountBefore = prev.length;
          const updated = [localFile, ...prev];
          rawCountAfter = updated.length;
          saveLocalRawFiles(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "RAW_FILE_STAGED",
          resourceId: localId,
          resourceTitle: file.name,
          resourceType: isAudio ? "audio" : ext || "document",
          status: "info",
          message: `[File Grezzo ${uploadSessionId}] Archiviato in memoria locale con ID "${localId}" (buffer raw: ${rawCountBefore} -> ${rawCountAfter})`,
          details: {
            uploadSessionId,
            fileId: localId,
            storageType: "localStorage",
            rawCountBefore,
            rawCountAfter,
            delta: rawCountAfter - rawCountBefore,
          },
        });

        addLog("info", "CAPTURE", `[${uploadSessionId}] File "${file.name}" archiviato nel buffer locale (ID: ${localId}, count: ${rawCountBefore} -> ${rawCountAfter}).`);
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
        totalChunks,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (!needsChunking) {
        if (textContent) rawFileDocData.textContent = textContent;
        if (base64Data) rawFileDocData.base64Data = base64Data;
      }

      const sanitized = sanitizeForFirestore(rawFileDocData);
      const writeStart = Date.now();
      const docRef = await withFirestoreTimeout(addDoc(collection(db, "raw_files"), sanitized), 3500);
      const writeDuration = Date.now() - writeStart;

      if (needsChunking) {
        addLog("info", "FIRESTORE", `[${uploadSessionId}] Frammentazione file (${totalChunks} blocchi)...`);
        for (let i = 0; i < totalChunks; i++) {
          const chunkData = dataPayload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await withFirestoreTimeout(setDoc(doc(db, "raw_files", docRef.id, "chunks", `chunk_${i}`), {
            index: i,
            data: chunkData,
            createdAt: serverTimestamp(),
          }), 3500);
        }
      }

      recordLifecycleEvent({
        stage: "RAW_FILE_STAGED",
        resourceId: docRef.id,
        resourceTitle: file.name,
        resourceType: isAudio ? "audio" : ext || "document",
        status: "success",
        message: `[File Grezzo ${uploadSessionId}] Archiviato con successo in Firestore collection 'raw_files' (ID: "${docRef.id}", durata: ${writeDuration}ms)`,
        details: {
          uploadSessionId,
          docId: docRef.id,
          storageType: "firestore",
          writeDurationMs: writeDuration,
          hasChunks: needsChunking,
          totalChunks,
          initialRawCount,
          targetRawCount: initialRawCount + 1,
        },
      });

      addLog("success", "CAPTURE", `[${uploadSessionId}] File "${file.name}" archiviato con successo nel buffer (ID: ${docRef.id})`);
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

        let rawCountBefore = 0;
        let rawCountAfter = 0;
        setRawFiles((prev) => {
          rawCountBefore = prev.length;
          const updated = [localFile, ...prev];
          rawCountAfter = updated.length;
          saveLocalRawFiles(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "RAW_FILE_STAGED",
          resourceId: localId,
          resourceTitle: file.name,
          resourceType: file.type || "document",
          status: "warn",
          message: `[File Grezzo ${uploadSessionId}] Quota Firestore esaurita: archiviato nel buffer locale con ID "${localId}" (${rawCountBefore} -> ${rawCountAfter})`,
          details: {
            uploadSessionId,
            localId,
            rawCountBefore,
            rawCountAfter,
            error: err?.message,
          },
        });

        setStatusMessage(`File "${file.name}" archiviato nella memoria locale (Quota Firestore esaurita)`);
        setTimeout(() => setStatusMessage(null), 3500);
        return true;
      }
      addLog("error", "CAPTURE", `[${uploadSessionId}] Errore upload file "${file.name}": ${err.message}`, err);
      setErrorMessage(`Errore upload file: ${err.message || "Errore sconosciuto"}`);
      setTimeout(() => setErrorMessage(null), 5000);
      return false;
    }
  };

  // Delete Raw File and any chunk subcollections
  const handleDeleteRawFile = async (fileId: string): Promise<boolean> => {
    const deleteSessionId = "del-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const rawCountBefore = rawFiles.length;

    try {
      addLog("info", "FIRESTORE", `[${deleteSessionId}] Eliminazione file grezzo ID: ${fileId} (raw buffer count: ${rawCountBefore})...`);
      
      let rawCountAfter = 0;
      setRawFiles((prev) => {
        const updated = prev.filter((f) => f.id !== fileId);
        rawCountAfter = updated.length;
        saveLocalRawFiles(updated, user?.uid);
        return updated;
      });

      if (!quotaExceeded && !fileId.startsWith("local-")) {
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

      recordLifecycleEvent({
        stage: "RAW_FILE_DELETED",
        resourceId: fileId,
        resourceTitle: `File Grezzo ${fileId}`,
        resourceType: "raw_file",
        status: "info",
        message: `[Eliminazione File ${deleteSessionId}] File grezzo eliminato con successo (buffer raw: ${rawCountBefore} -> ${rawCountAfter})`,
        details: {
          deleteSessionId,
          fileId,
          rawCountBefore,
          rawCountAfter,
          delta: rawCountAfter - rawCountBefore,
        },
      });

      addLog("success", "FIRESTORE", `[${deleteSessionId}] File grezzo eliminato con successo (ID: ${fileId}, conteggio: ${rawCountBefore} -> ${rawCountAfter})`);
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
      addLog("error", "FIRESTORE", `[${deleteSessionId}] Errore eliminazione file grezzo: ${err.message}`, err);
      setErrorMessage("Impossibile eliminare il file: " + err.message);
      setTimeout(() => setErrorMessage(null), 4000);
      return false;
    }
  };

  // Convert Staged Raw File to OKF v0.2 Knowledge Document via Gemini
  const handleConvertFileToOKF = async (file: RawFileItem): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) return false;

    const convSessionId = "conv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const initialVaultCount = resources.length;
    const initialRawCount = rawFiles.length;

    try {
      setIsConvertingRawFileId(file.id);

      recordLifecycleEvent({
        stage: "RAW_FILE_CONVERSION",
        resourceId: file.id,
        resourceTitle: file.fileName,
        resourceType: "knowledge",
        status: "info",
        message: `[Conversione File ${convSessionId}] Avvio conversione OKF v0.2 per file grezzo "${file.fileName}" (buffer raw: ${initialRawCount}, vault: ${initialVaultCount} elementi)`,
        details: {
          convSessionId,
          fileId: file.id,
          fileName: file.fileName,
          fileSize: file.fileSize,
          fileType: file.fileType,
          mimeType: file.mimeType,
          hasChunks: file.hasChunks,
          totalChunks: file.totalChunks,
          initialVaultCount,
          initialRawCount,
          userId: activeUser.uid,
        },
      });

      addLog("info", "GEMINI_AI", `[${convSessionId}] Avvio conversione intelligente in standard OKF v0.2 per file: "${file.fileName}"...`);

      let reconstructedText = file.textContent || "";
      let reconstructedBase64 = file.base64Data || "";

      const lowerName = file.fileName.toLowerCase();
      const isAudio = (file.mimeType && file.mimeType.toLowerCase().startsWith("audio/")) ||
        ["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus", "webm", "wma", "aiff"].some((ext) => lowerName.endsWith("." + ext)) ||
        file.fileType?.toLowerCase() === "audio";
      const isPdf = lowerName.endsWith(".pdf") || (file.mimeType && file.mimeType.toLowerCase().includes("pdf")) || file.fileType?.toLowerCase() === "pdf";
      const isImage = (file.mimeType && file.mimeType.toLowerCase().startsWith("image/")) || ["png", "jpg", "jpeg", "webp", "gif", "svg"].some((ext) => lowerName.endsWith("." + ext));
      const isBinary = isAudio || isPdf || isImage || Boolean(file.base64Data);

      if (!quotaExceeded && !file.id.startsWith("local-")) {
        // If file might have chunks in subcollection, attempt to retrieve them
        if (file.hasChunks && file.totalChunks && file.totalChunks > 1) {
          addLog("info", "FIRESTORE", `[${convSessionId}] Recupero ${file.totalChunks} blocchi dal database...`);
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
      }

      if (isBinary && !reconstructedBase64 && file.base64Data) {
        reconstructedBase64 = file.base64Data;
      }

      let resPayload: any = null;
      const convStartTime = Date.now();

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

          if (resPayload && resPayload.title) {
            const durationMs = Date.now() - convStartTime;
            recordLifecycleEvent({
              stage: "AI_ANALYSIS_SUCCESS",
              resourceTitle: resPayload.title,
              resourceType: "knowledge",
              status: "info",
              message: `[Conversione File ${convSessionId}] AI ha analizzato e convertito "${file.fileName}" in ${durationMs}ms: "${resPayload.title}"`,
              details: {
                convSessionId,
                durationMs,
                docType: resPayload.metadata?.docType,
                domain: resPayload.metadata?.domain,
                entitiesCount: resPayload.metadata?.entities?.length || 0,
                relationsCount: resPayload.metadata?.relations?.length || 0,
                tags: resPayload.tags,
              },
            });
          }
        }
      } catch (netErr: any) {
        console.warn("[File Conversion] Network/Gemini API error, applying local fallback:", netErr?.message);
        addLog("warn", "GEMINI_AI", `[${convSessionId}] Fallback locale applicato per file "${file.fileName}": ${netErr?.message || "timeout"}`);
        recordLifecycleEvent({
          stage: "AI_ANALYSIS_FALLBACK",
          resourceTitle: file.fileName,
          resourceType: "knowledge",
          status: "warn",
          message: `[Conversione File ${convSessionId}] API conversione non disponibile (${netErr?.message || "timeout"}), attivazione parser OKF euristico locale`,
          details: { convSessionId, error: netErr?.message },
        });
      }

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

      // Pre-flight duplicate check against existing resources
      const potentialDup = resources.find(
        (r) =>
          r.title.trim().toLowerCase() === newResourceItem.title.trim().toLowerCase() ||
          (r.metadata?.sourceFileName && r.metadata.sourceFileName === file.fileName)
      );

      recordLifecycleEvent({
        stage: "DATA_TRANSFORMATION",
        resourceId: newResourceId,
        resourceTitle: newResourceItem.title,
        resourceType: "knowledge",
        status: potentialDup ? "warn" : "info",
        message: potentialDup
          ? `[Conversione File ${convSessionId}] Trasformazione completata: possibile duplicato rilevato nel Vault ("${potentialDup.title}", ID: "${potentialDup.id}")`
          : `[Conversione File ${convSessionId}] File "${file.fileName}" trasformato in specifica OKF v0.2: "${newResourceItem.title}" (${newResourceItem.tags?.length || 0} tag, dominio: "${newResourceItem.metadata?.domain || 'Generale'}")`,
        details: {
          convSessionId,
          tempId: newResourceId,
          sourceFileId: file.id,
          sourceFileName: file.fileName,
          docType: resPayload.metadata?.docType,
          domain: resPayload.metadata?.domain,
          entitiesCount: resPayload.metadata?.entities?.length || 0,
          relationsCount: resPayload.metadata?.relations?.length || 0,
          potentialDuplicate: potentialDup
            ? { id: potentialDup.id, title: potentialDup.title, type: potentialDup.type }
            : null,
        },
      });

      if (quotaExceeded) {
        let countBefore = 0;
        let countAfter = 0;
        setResources((prev) => {
          countBefore = prev.length;
          const updated = [newResourceItem, ...prev];
          countAfter = updated.length;
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

        recordLifecycleEvent({
          stage: "LOCAL_CREATION",
          resourceId: newResourceId,
          resourceTitle: newResourceItem.title,
          resourceType: "knowledge",
          status: "success",
          message: `[Conversione File ${convSessionId}] Risorsa memorizzata nel Vault locale (conteggio: ${countBefore} -> ${countAfter}, delta: +${countAfter - countBefore})`,
          details: { convSessionId, id: newResourceId, countBefore, countAfter, delta: countAfter - countBefore },
        });

        addLog("success", "OKF_PARSER", `[${convSessionId}] Documento convertito e salvato in memoria locale: "${resPayload.title}" (conteggio: ${countBefore} -> ${countAfter})`);
        setStatusMessage(`File convertito in specifica OKF v0.2: "${resPayload.title}"`);
        setTimeout(() => setStatusMessage(null), 5000);
        setSelectedKnowledgeForReader(newResourceItem);
        checkAndLogFilterVisibility(newResourceItem, convSessionId, "Conversione File Locale");
        setCurrentCategory("knowledge");
        setSelectedTag(null);
        setSearchQuery("");
        return true;
      }

      recordLifecycleEvent({
        stage: "FIRESTORE_WRITE_START",
        resourceId: newResourceId,
        resourceTitle: newResourceItem.title,
        resourceType: "knowledge",
        status: "info",
        message: `[Conversione File ${convSessionId}] Salvataggio risorsa convertita in Cloud Firestore (target count: ${resources.length + 1})...`,
        details: { convSessionId, tempId: newResourceId, title: newResourceItem.title, currentVaultCount: resources.length },
      });

      const writeStart = Date.now();
      try {
        const sanitizedResource = sanitizeForFirestore({
          ...newResourceItem,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        delete (sanitizedResource as any).id;

        const newResourceDoc = await withFirestoreTimeout(addDoc(collection(db, "resources"), sanitizedResource), 3500);
        const writeDuration = Date.now() - writeStart;
        newResourceItem.id = newResourceDoc.id;

        recordLifecycleEvent({
          stage: "FIRESTORE_WRITE_SUCCESS",
          resourceId: newResourceDoc.id,
          resourceTitle: newResourceItem.title,
          resourceType: "knowledge",
          status: "success",
          message: `[Conversione File ${convSessionId}] Risorsa scritta in Firestore in ${writeDuration}ms con ID definitivo "${newResourceDoc.id}" (da temp "${newResourceId}")`,
          details: { convSessionId, originalTempId: newResourceId, firestoreId: newResourceDoc.id, writeDurationMs: writeDuration },
        });

        if (!file.id.startsWith("local-")) {
          await withFirestoreTimeout(updateDoc(doc(db, "raw_files", file.id), {
            status: "converted_okf",
            convertedResourceId: newResourceDoc.id,
            convertedResourceTitle: resPayload.title,
            updatedAt: serverTimestamp(),
          }), 10000);
        }
      } catch (saveErr: any) {
        recordLifecycleEvent({
          stage: "FIRESTORE_WRITE_FAIL",
          resourceId: newResourceId,
          resourceTitle: newResourceItem.title,
          resourceType: "knowledge",
          status: "warn",
          message: `[Conversione File ${convSessionId}] Scrittura Firestore non riuscita (${saveErr?.message || "timeout"}), preservato ID locale "${newResourceId}"`,
          details: { convSessionId, error: saveErr?.message, tempId: newResourceId },
        });

        if (isQuotaError(saveErr)) {
          setQuotaExceeded(true);
          wasQuotaExceededRef.current = true;
          saveQuotaExceededStatus(true);
          disableNetwork(db).catch(() => {});
        }
      }

      let countBeforeUpdate = 0;
      let countAfterUpdate = 0;
      setResources((prev) => {
        countBeforeUpdate = prev.length;
        const filtered = prev.filter((r) => r.id !== newResourceItem.id && r.id !== newResourceId);
        const updated = [newResourceItem, ...filtered];
        countAfterUpdate = updated.length;
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

      addLog(
        "success",
        "OKF_PARSER",
        `[${convSessionId}] Documento convertito con successo in OKF v0.2! Creato: "${resPayload.title}" (conteggio risorse: ${countBeforeUpdate} -> ${countAfterUpdate}, delta: +${countAfterUpdate - countBeforeUpdate})`
      );

      checkAndLogFilterVisibility(newResourceItem, convSessionId, "Conversione File OKF");

      setStatusMessage(`File convertito in specifica OKF v0.2: "${resPayload.title}"`);
      setTimeout(() => setStatusMessage(null), 5000);
      setSelectedKnowledgeForReader(newResourceItem);
      setCurrentCategory("knowledge");
      setSelectedTag(null);
      setSearchQuery("");

      return true;
    } catch (err: any) {
      console.error("Convert file to OKF error:", err);
      addLog("error", "GEMINI_AI", `[${convSessionId}] Errore durante conversione file "${file.fileName}": ${err.message}`, err);
      setErrorMessage(`Errore conversione: ${err.message || "Errore sconosciuto"}`);
      setTimeout(() => setErrorMessage(null), 5000);
      return false;
    } finally {
      setIsConvertingRawFileId(null);
    }
  };

  // Analyze text/URL using server-side Gemini endpoint with client-side fallback
  const analyzeWithAI = async (
    input: string, 
    explicitType?: ResourceType,
    onStageUpdate?: (stage: CaptureStage, message?: string) => void,
    correlationId?: string
  ) => {
    const activeCorrId = correlationId || ("ai-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6));
    const startTime = Date.now();
    addLog("info", "GEMINI_AI", `[${activeCorrId}] Inizio analisi semantica (${input.length} caratteri, tipo: ${explicitType || "auto"})...`);
    
    try {
      if (onStageUpdate) {
        onStageUpdate("sending", "Invio al server...");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      if (onStageUpdate) {
        setTimeout(() => {
          onStageUpdate("analyzing", "Elaborazione semantica con Gemini AI e Search Grounding...");
        }, 300);
      }

      // Provide existing vault resources context for high-fidelity cross-linking
      const contextList = resources.slice(0, 30).map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        tags: r.tags || [],
      }));

      const res = await fetch("/api/analyze-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ 
          input, 
          explicitType,
          existingResources: contextList
        }),
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.result && data.result.title) {
          const durationMs = Date.now() - startTime;
          recordLifecycleEvent({
            stage: "AI_ANALYSIS_SUCCESS",
            resourceTitle: data.result.title,
            resourceType: data.result.type,
            status: "info",
            message: `[Analisi Semantica ${activeCorrId}] Elaborazione cloud completata in ${durationMs}ms: "${data.result.title}" (${data.result.type})`,
            details: {
              correlationId: activeCorrId,
              durationMs,
              returnedTitle: data.result.title,
              returnedType: data.result.type,
              tagsCount: data.result.tags?.length || 0,
              tags: data.result.tags,
              entitiesCount: data.result.metadata?.entities?.length || 0,
              relationsCount: data.result.metadata?.relations?.length || 0,
              hasMarkdown: Boolean(data.result.metadata?.markdownContent),
            },
          });

          addLog("success", "GEMINI_AI", `[${activeCorrId}] Analisi completata con successo in ${durationMs}ms: "${data.result.title}" (Tipo: ${data.result.type})`, {
            tags: data.result.tags,
            entities: data.result.metadata?.entities?.length || 0,
            metadata: data.result.metadata,
          });
          return data.result;
        }
      } else {
        const errText = await res.text().catch(() => "");
        addLog("warn", "GEMINI_AI", `[${activeCorrId}] Risposta server non ottimale (${res.status}): ${errText.slice(0, 100)}, attivazione parser locale`);
      }
    } catch (networkErr: any) {
      console.warn("[Analyze AI] Endpoint request failed or timed out, activating local parser:", networkErr?.message);
      addLog("warn", "GEMINI_AI", `[${activeCorrId}] Analisi cloud non disponibile (${networkErr?.message || "timeout"}), elaborazione con parser euristico locale ad alta velocità...`);
    }

    if (onStageUpdate) {
      onStageUpdate("analyzing", "Estrazione euristica locale...");
    }

    const fallbackParsed = localFallbackAnalyzeResource(input, explicitType);
    recordLifecycleEvent({
      stage: "AI_ANALYSIS_FALLBACK",
      resourceTitle: fallbackParsed.title,
      resourceType: fallbackParsed.type,
      status: "warn",
      message: `[Analisi Semantica ${activeCorrId}] Applicato parser euristico locale ad alta velocità: "${fallbackParsed.title}" (${fallbackParsed.type})`,
      details: {
        correlationId: activeCorrId,
        fallbackTitle: fallbackParsed.title,
        fallbackType: fallbackParsed.type,
        tagsCount: fallbackParsed.tags?.length || 0,
        tags: fallbackParsed.tags,
      },
    });

    addLog("info", "GEMINI_AI", `[${activeCorrId}] Analisi locale completata con successo: "${fallbackParsed.title}" (Tipo: ${fallbackParsed.type})`, {
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
      } catch (authErr: any) {
        addLog("warn", "CAPTURE", "Tentativo di cattura senza utente autenticato.");
        setErrorMessage("Autenticazione in corso, riprova tra un istante.");
        setTimeout(() => setErrorMessage(null), 4000);
        return false;
      }
    }

    const captureSessionId = "cap-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const initialVaultCount = resources.length;

    // ========================================================================
    // VALIDAZIONE FASE 1: CLASSIFICAZIONE DETERMINISTICA INPUT PRIMA DELLO STORAGE
    // ========================================================================
    const inputClassification = classifyCaptureInput(input, explicitType);

    addLog(
      "info", 
      "CAPTURE", 
      `[${captureSessionId}] [Fase 1: Classificazione Input] Riconosciuto: '${inputClassification.classification}' (isWebLink: ${inputClassification.isWebLink}, confidenza: ${(inputClassification.confidence * 100).toFixed(0)}%, URL: "${inputClassification.detectedUrl || 'N/A'}") - ${inputClassification.reason}`
    );

    recordLifecycleEvent({
      stage: "CAPTURE_INITIATED",
      resourceTitle: input.slice(0, 60),
      resourceType: explicitType || (inputClassification.isWebLink ? "link" : inputClassification.classification),
      status: "info",
      message: `[Cattura ${captureSessionId}] Fase 1: Input classificato come '${inputClassification.classification}' (isWebLink: ${inputClassification.isWebLink}) - ${inputClassification.reason}`,
      details: {
        captureSessionId,
        step: 1,
        classification: inputClassification.classification,
        isWebLink: inputClassification.isWebLink,
        detectedUrl: inputClassification.detectedUrl,
        confidence: inputClassification.confidence,
        inputLength: input.length,
        explicitType: explicitType || null,
        initialVaultCount,
        currentCategory,
        selectedTag,
        searchQuery,
        userId: activeUser.uid,
      },
    });

    setIsAnalyzing(true);
    setCaptureStage("sending");
    setCaptureStageMessage("Invio richiesta...");

    const safetyTimer = setTimeout(() => {
      setIsAnalyzing(false);
      setCaptureStage("idle");
      setCaptureStageMessage("");
    }, 45000);

    addLog("info", "CAPTURE", `[${captureSessionId}] Ricevuta richiesta di cattura [${explicitType || "auto"}]: ${input.slice(0, 80)}...`);
    try {
      let analyzed: any = null;
      try {
        analyzed = await analyzeWithAI(
          input, 
          explicitType, 
          (stg, msg) => {
            setCaptureStage(stg);
            if (msg) setCaptureStageMessage(msg);
          },
          captureSessionId
        );
      } catch (aiErr) {
        console.warn("[handleCapture] AI analysis error, falling back to local heuristic:", aiErr);
        analyzed = localFallbackAnalyzeResource(input, explicitType);
      }

      if (!analyzed || !analyzed.title) {
        analyzed = localFallbackAnalyzeResource(input, explicitType);
      }

      let resolvedType = analyzed.type || explicitType || (inputClassification.isWebLink ? "link" : "article");
      if (
        (input.includes("github.com/") || (analyzed.url && analyzed.url.includes("github.com/")) || inputClassification.classification === "github_repo") &&
        explicitType !== "mcp_server" &&
        explicitType !== "knowledge" &&
        resolvedType !== "mcp_server"
      ) {
        resolvedType = "github_repo";
      }

      let resolvedUrl = (analyzed.url && typeof analyzed.url === "string") 
        ? analyzed.url.trim() 
        : (inputClassification.detectedUrl || (input.startsWith("http") ? input.trim() : ""));
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

      // ========================================================================
      // VALIDAZIONE FASE 2: VERIFICA SCHEMA OKF & LOG MOTIVO SPECIFICO DI FALLIMENTO
      // Previene che i collegamenti web vengano etichettati erroneamente come OKF!
      // ========================================================================
      const isLinkOrExternalWeb = 
        inputClassification.isWebLink || 
        resolvedType === "link" || 
        resolvedType === "article" || 
        resolvedType === "github_repo" ||
        Boolean(resolvedUrl && !inputClassification.characteristics.hasYamlFrontmatter);

      let okfConversionFailed = false;
      let okfFailureReason = "";

      if (isLinkOrExternalWeb) {
        // UN LINK WEB NON DEVE MAI ESSERE CONVERTITO IN SCHEMA DOCUMENTO OKF
        okfConversionFailed = true;
        okfFailureReason = `L'input è un collegamento web ("${resolvedUrl || inputClassification.detectedUrl || input}"). I link web non soddisfano i requisiti di specifica tecnica OKF v0.2 (richiedono corpo documentale e frontmatter YAML con entità ontologiche). Conversione a schema OKF respinta per prevenire etichettatura errata. Tipo confermato: "${resolvedType}".`;

        addLog("warn", "OKF_PARSER", `[${captureSessionId}] [Fase 2: Validazione OKF] ${okfFailureReason}`);

        recordLifecycleEvent({
          stage: "OKF_SCHEMA_VALIDATION",
          resourceTitle: analyzed.title || "Web Link",
          resourceType: resolvedType === "knowledge" ? "link" : resolvedType,
          status: "warn",
          message: `[Cattura ${captureSessionId}] Conversione a schema OKF respinta per link web: ${okfFailureReason}`,
          details: {
            captureSessionId,
            step: 2,
            okfConversionPassed: false,
            specificFailureReason: okfFailureReason,
            classification: inputClassification.classification,
            isWebLink: true,
            url: resolvedUrl,
            originalType: analyzed.type,
            coercedType: resolvedType === "knowledge" ? "link" : resolvedType,
          },
        });

        // Azione correttiva vincolante: impedisce che il link web diventi 'knowledge' o mantenga versioni OKF
        if (resolvedType === "knowledge") {
          resolvedType = "link";
        }
        delete mergedMetadata.okfVersion;
        delete mergedMetadata.okf_version;
        if (mergedMetadata.docType && !["guide", "tool_description"].includes(mergedMetadata.docType)) {
          delete mergedMetadata.docType;
        }
      } else if (
        explicitType === "knowledge" || 
        resolvedType === "knowledge" || 
        inputClassification.classification === "okf_document" ||
        mergedMetadata.okfVersion ||
        (Array.isArray(analyzed.tags) && analyzed.tags.includes("okf-v0.2"))
      ) {
        // Non è un link web, ed è candidato allo schema OKF v0.2: validiamo rigorosamente
        const okfValidation = validateOKFDocumentSchema(
          mergedMetadata.markdownContent || input,
          mergedMetadata,
          resolvedType
        );

        if (!okfValidation.isValidOKF) {
          okfConversionFailed = true;
          okfFailureReason = okfValidation.primaryFailureReason || okfValidation.failureReasons.join(" | ") || "Schema OKF v0.2 non conforme.";

          addLog(
            "warn",
            "OKF_PARSER",
            `[${captureSessionId}] [Fase 2: Validazione OKF Fallita] Conversione allo schema OKF v0.2 incompleta: ${okfFailureReason}`,
            {
              allReasons: okfValidation.failureReasons,
              classification: inputClassification.classification,
              title: analyzed.title,
            }
          );

          recordLifecycleEvent({
            stage: "OKF_SCHEMA_VALIDATION",
            resourceTitle: analyzed.title || "Documento Tecnico",
            resourceType: resolvedType,
            status: "warn",
            message: `[Cattura ${captureSessionId}] Conversione schema OKF v0.2 incompleta: ${okfFailureReason}`,
            details: {
              captureSessionId,
              step: 2,
              okfConversionPassed: false,
              specificFailureReason: okfFailureReason,
              allReasons: okfValidation.failureReasons,
              classification: inputClassification.classification,
            },
          });

          mergedMetadata.okfValidationWarnings = okfValidation.failureReasons;
        } else {
          addLog(
            "success",
            "OKF_PARSER",
            `[${captureSessionId}] [Fase 2: Validazione OKF Superata] Documento validato con successo conforme allo standard OKF v0.2 (docType: "${mergedMetadata.docType || okfValidation.parsedDocument?.docType || 'concept'}", entità: ${mergedMetadata.entities?.length || okfValidation.parsedDocument?.entities.length || 0})`
          );

          recordLifecycleEvent({
            stage: "OKF_SCHEMA_VALIDATION",
            resourceTitle: analyzed.title || "Documento OKF",
            resourceType: resolvedType,
            status: "success",
            message: `[Cattura ${captureSessionId}] Documento conforme allo standard OKF v0.2 (docType: "${mergedMetadata.docType || 'concept'}")`,
            details: {
              captureSessionId,
              step: 2,
              okfConversionPassed: true,
              docType: mergedMetadata.docType,
              domain: mergedMetadata.domain,
              entitiesCount: mergedMetadata.entities?.length || 0,
            },
          });
        }
      }

      // Sanitizzazione rigorosa dei tag: rimuove etichette OKF dai collegamenti web
      let sanitizedTags: string[] = Array.isArray(analyzed.tags) ? [...analyzed.tags] : [];
      if (isLinkOrExternalWeb) {
        sanitizedTags = sanitizedTags.filter(
          (t) => !["okf-v0.2", "okf", "okf-v0.1", "knowledge"].includes(String(t).toLowerCase())
        );
        if (resolvedType === "link" && !sanitizedTags.includes("link")) {
          sanitizedTags.push("link");
        }
      }

      // Controllo duplicati pre-flight rispetto alle risorse esistenti
      const potentialDuplicate = resources.find((r) => {
        if (resolvedUrl && r.url && r.url.toLowerCase() === resolvedUrl.toLowerCase()) return true;
        if (r.title && analyzed.title && r.title.trim().toLowerCase() === analyzed.title.trim().toLowerCase()) return true;
        return false;
      });

      recordLifecycleEvent({
        stage: "DATA_TRANSFORMATION",
        resourceTitle: analyzed.title || "Nuova Risorsa",
        resourceType: resolvedType,
        status: potentialDuplicate ? "warn" : "info",
        message: potentialDuplicate
          ? `[Cattura ${captureSessionId}] Dati trasformati in ${resolvedType}: possibile duplicato esistente ("${potentialDuplicate.title}", ID: "${potentialDuplicate.id}")`
          : `[Cattura ${captureSessionId}] Dati trasformati in risorsa standard (${resolvedType}, ${sanitizedTags.length} tag, dominio: "${mergedMetadata.domain || 'Generale'}")`,
        details: {
          captureSessionId,
          step1_classification: inputClassification.classification,
          step2_okfValidated: !okfConversionFailed,
          step2_okfFailureReason: okfFailureReason || null,
          isWebLink: inputClassification.isWebLink,
          rawInputLength: input.length,
          analyzedTitle: analyzed.title,
          rawAnalyzedType: analyzed.type,
          explicitTypeRequested: explicitType,
          resolvedType,
          resolvedUrl,
          tagsCount: sanitizedTags.length,
          tags: sanitizedTags,
          domain: mergedMetadata.domain,
          docType: mergedMetadata.docType,
          metadataKeys: Object.keys(mergedMetadata),
          potentialDuplicate: potentialDuplicate ? { id: potentialDuplicate.id, title: potentialDuplicate.title, type: potentialDuplicate.type } : null,
        },
      });

      setCaptureStage("saving");
      setCaptureStageMessage("Salvataggio nel Vault...");

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
          tags: sanitizedTags,
          isFavorite: false,
          metadata: mergedMetadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        let countBefore = 0;
        let countAfter = 0;
        setResources((prev) => {
          countBefore = prev.length;
          const updated = [localResource, ...prev];
          countAfter = updated.length;
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "LOCAL_CREATION",
          resourceId: localId,
          resourceTitle: localResource.title,
          resourceType: resolvedType,
          status: "info",
          message: `[Cattura ${captureSessionId}] Acquisizione cattura in memoria locale (conteggio: ${countBefore} -> ${countAfter}, delta: +${countAfter - countBefore}): "${localResource.title}"`,
          details: { captureSessionId, id: localId, type: resolvedType, countBefore, countAfter, delta: countAfter - countBefore },
        });

        checkAndLogFilterVisibility(localResource, captureSessionId, "Cattura Locale");

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

      addLog("info", "FIRESTORE", `[${captureSessionId}] Salvataggio risorsa "${analyzed.title}" [${resolvedType}]...`);
      const rawData = {
        userId: activeUser.uid,
        type: resolvedType,
        title: analyzed.title || "Nuova Risorsa",
        url: resolvedUrl,
        rawInput: input,
        summary: analyzed.summary || input,
        tags: sanitizedTags,
        isFavorite: false,
        metadata: mergedMetadata,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      recordLifecycleEvent({
        stage: "FIRESTORE_WRITE_START",
        resourceTitle: rawData.title,
        resourceType: resolvedType,
        status: "info",
        message: `[Cattura ${captureSessionId}] Tentativo di scrittura Firestore per nuova risorsa (target count: ${resources.length + 1}): "${rawData.title}"`,
        details: { captureSessionId, type: resolvedType, url: resolvedUrl, currentVaultCount: resources.length },
      });

      const writeStart = Date.now();
      try {
        const docRef = await withFirestoreTimeout(addDoc(collection(db, "resources"), sanitizeForFirestore(rawData)), 10000);
        const writeDuration = Date.now() - writeStart;
        addLog("success", "FIRESTORE", `[${captureSessionId}] Risorsa salvata con successo con ID: ${docRef.id} in ${writeDuration}ms`);

        const savedItem: ResourceItem = {
          id: docRef.id,
          ...rawData,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ResourceItem;

        let countBefore = 0;
        let countAfter = 0;
        let wasReplacement = false;
        setResources((prev) => {
          countBefore = prev.length;
          wasReplacement = prev.some((r) => r.id === docRef.id);
          const filtered = prev.filter((r) => r.id !== docRef.id);
          const updated = [savedItem, ...filtered];
          countAfter = updated.length;
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "FIRESTORE_WRITE_SUCCESS",
          resourceId: docRef.id,
          resourceTitle: savedItem.title,
          resourceType: resolvedType,
          status: "success",
          message: `[Cattura ${captureSessionId}] Risorsa memorizzata su Firestore in ${writeDuration}ms con ID "${docRef.id}" (conteggio: ${countBefore} -> ${countAfter}, delta: +${countAfter - countBefore})`,
          details: {
            captureSessionId,
            id: docRef.id,
            title: savedItem.title,
            writeDurationMs: writeDuration,
            countBefore,
            countAfter,
            delta: countAfter - countBefore,
            wasReplacement,
          },
        });

        checkAndLogFilterVisibility(savedItem, captureSessionId, "Scrittura Firestore");
      } catch (firestoreErr: any) {
        console.warn("[handleCapture] Firestore write failed or timed out, using multi-layer local backup:", firestoreErr);
        const localId = "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
        const localItem: ResourceItem = {
          id: localId,
          ...rawData,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ResourceItem;

        if (isQuotaError(firestoreErr)) {
          setQuotaExceeded(true);
          wasQuotaExceededRef.current = true;
          saveQuotaExceededStatus(true);
          disableNetwork(db).catch(() => {});
        }

        let countBefore = 0;
        let countAfter = 0;
        setResources((prev) => {
          countBefore = prev.length;
          const updated = [localItem, ...prev];
          countAfter = updated.length;
          saveLocalResources(updated, activeUser.uid);
          return updated;
        });

        recordLifecycleEvent({
          stage: "FIRESTORE_WRITE_FAIL",
          resourceId: localId,
          resourceTitle: localItem.title,
          resourceType: resolvedType,
          status: "warn",
          message: `[Cattura ${captureSessionId}] Scrittura Firestore fallita (${firestoreErr?.message || "timeout"}), preservata con ID locale "${localId}" (conteggio: ${countBefore} -> ${countAfter})`,
          details: { captureSessionId, localId, error: firestoreErr?.message, countBefore, countAfter },
        });

        checkAndLogFilterVisibility(localItem, captureSessionId, "Fallback Firestore");
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

      let countBefore = 0;
      let countAfter = 0;
      setResources((prev) => {
        countBefore = prev.length;
        const updated = [localResource, ...prev];
        countAfter = updated.length;
        saveLocalResources(updated, activeUser.uid);
        return updated;
      });

      recordLifecycleEvent({
        stage: "LOCAL_CREATION",
        resourceId: localId,
        resourceTitle: localResource.title,
        resourceType: emergencyFallback.type,
        status: "warn",
        message: `[Cattura ${captureSessionId}] Fallback emergenza: risorsa creata offline (conteggio: ${countBefore} -> ${countAfter}): "${localResource.title}"`,
        details: { captureSessionId, localId, error: error?.message, countBefore, countAfter },
      });

      checkAndLogFilterVisibility(localResource, captureSessionId, "Fallback Emergenza");

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

  return {
    rawFiles,
    setRawFiles,
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
  };
}
