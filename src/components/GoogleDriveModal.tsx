import React, { useState, useEffect } from "react";
import {
  FileText,
  Folder,
  ExternalLink,
  Download,
  Upload,
  RefreshCw,
  Search,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Lock,
  Layers,
  FileCode,
  ArrowRight,
  Database,
  X,
  Plus,
  BookOpen,
  Headphones,
  Zap
} from "lucide-react";
import { ResourceItem, ResourceType } from "../types";
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_KNOWLEDGE_FOLDER_NAME,
  DEFAULT_KNOWLEDGE_FOLDER_URL,
  DriveFileInfo,
  GoogleDocExportResult,
  ensureGoogleAccessToken,
  listDriveFolderFiles,
  searchDriveDocsAndFiles,
  readDriveDocContent,
  exportResourceToGoogleDoc,
  exportCompendiumToGoogleDoc,
  parseGoogleResourceUrl,
  searchNotebookLMDocs,
  exportNotebookLMSourceDoc
} from "../lib/googleDriveDocs";

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaultResources: ResourceItem[];
  onIngestContent: (input: string, explicitType?: ResourceType, sourceMetadata?: any) => Promise<boolean>;
  selectedResourceForExport?: ResourceItem | null;
  onResourceExported?: (resourceId: string, exportResult: GoogleDocExportResult) => void;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  vaultResources,
  onIngestContent,
  selectedResourceForExport,
  onResourceExported
}) => {
  const [activeTab, setActiveTab] = useState<"folder" | "search" | "export_digest" | "single_export" | "paste_link" | "notebooklm">(
    selectedResourceForExport ? "single_export" : "folder"
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Folder & Search state
  const [folderFiles, setFolderFiles] = useState<DriveFileInfo[]>([]);
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DriveFileInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // NotebookLM Bridge state
  const [notebookLMFiles, setNotebookLMFiles] = useState<DriveFileInfo[]>([]);
  const [isLoadingNotebookLM, setIsLoadingNotebookLM] = useState(false);
  const [notebookLMPasteText, setNotebookLMPasteText] = useState("");
  const [notebookLMDocType, setNotebookLMDocType] = useState<"auto" | "briefing" | "study_guide" | "faq" | "audio_transcript">("auto");
  const [isIngestingNotebookLM, setIsIngestingNotebookLM] = useState(false);
  const [isExportingForNotebookLM, setIsExportingForNotebookLM] = useState(false);
  const [notebookLMExportResult, setNotebookLMExportResult] = useState<(GoogleDocExportResult & { notebookLMUrl: string }) | null>(null);

  // Ingestion state
  const [ingestingFileId, setIngestingFileId] = useState<string | null>(null);
  const [ingestSuccessMessage, setIngestSuccessMessage] = useState<string | null>(null);
  const [pastedUrl, setPastedUrl] = useState("");
  const [isIngestingPastedUrl, setIsIngestingPastedUrl] = useState(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<GoogleDocExportResult | null>(null);
  const [digestTitle, setDigestTitle] = useState("Compendio Tecnico Knowledge Vault");
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);

  // Initialize selected resources for digest when modal opens
  useEffect(() => {
    if (vaultResources.length > 0 && selectedResourceIds.length === 0) {
      setSelectedResourceIds(vaultResources.slice(0, 15).map((r) => r.id));
    }
  }, [vaultResources]);

  // Update active tab when single export is triggered
  useEffect(() => {
    if (selectedResourceForExport) {
      setActiveTab("single_export");
    }
  }, [selectedResourceForExport]);

  // Try silent auth check or prompt on mount
  useEffect(() => {
    if (isOpen) {
      checkAuthAndLoad();
    }
  }, [isOpen]);

  const checkAuthAndLoad = async (forcePrompt = false) => {
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      const token = await ensureGoogleAccessToken(forcePrompt);
      if (token) {
        setIsAuthenticated(true);
        loadFolderContents(token);
      }
    } catch (err: any) {
      console.warn("[GoogleDriveModal] Connessione Google Workspace non attiva:", err);
      setAuthError(err.message || "Autenticazione Google richiesta.");
      setIsAuthenticated(false);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const loadFolderContents = async (token?: string) => {
    setIsLoadingFolder(true);
    setFolderError(null);
    try {
      const currentToken = token || (await ensureGoogleAccessToken());
      const files = await listDriveFolderFiles(currentToken, DEFAULT_KNOWLEDGE_FOLDER_ID);
      setFolderFiles(files);
    } catch (err: any) {
      console.error("[GoogleDriveModal] Errore lettura cartella Drive:", err);
      setFolderError(err.message || "Impossibile recuperare i file dalla cartella Knowledge.");
    } finally {
      setIsLoadingFolder(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const token = await ensureGoogleAccessToken();
      const results = await searchDriveDocsAndFiles(token, searchQuery);
      setSearchResults(results);
    } catch (err: any) {
      console.error("[GoogleDriveModal] Errore ricerca:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Ingest file from Drive / Docs
  const handleIngestFile = async (file: DriveFileInfo) => {
    setIngestingFileId(file.id);
    setIngestSuccessMessage(null);
    try {
      const token = await ensureGoogleAccessToken();
      const { text, name, webViewLink } = await readDriveDocContent(token, file.id, file.mimeType);

      if (!text || text.trim().length === 0) {
        throw new Error("Il documento Google Drive è vuoto.");
      }

      // Infer resource type based on name and mimeType
      let explicitType: ResourceType = "knowledge";
      const lowerName = name.toLowerCase();
      if (lowerName.includes("mcp") || lowerName.includes("server")) explicitType = "mcp_server";
      else if (lowerName.includes("skill") || lowerName.includes("prompt")) explicitType = "ai_skill";
      else if (lowerName.includes("repo") || lowerName.includes("github")) explicitType = "github_repo";
      else if (lowerName.includes("guida") || lowerName.includes("articol")) explicitType = "article";

      const success = await onIngestContent(text, explicitType, {
        gdriveSourceId: file.id,
        gdriveSourceUrl: webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
        gdocUrl: webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
        gdocId: file.id,
        originalFileName: name
      });

      if (success) {
        setIngestSuccessMessage(`"${name}" ingerito e analizzato con successo nel Vault!`);
        setTimeout(() => setIngestSuccessMessage(null), 5000);
      }
    } catch (err: any) {
      alert(`Errore ingestione file: ${err.message}`);
    } finally {
      setIngestingFileId(null);
    }
  };

  // Ingest via direct URL paste
  const handleIngestPastedUrl = async () => {
    if (!pastedUrl.trim()) return;
    setIsIngestingPastedUrl(true);
    setIngestSuccessMessage(null);

    try {
      const parsed = parseGoogleResourceUrl(pastedUrl);
      if (!parsed) {
        throw new Error("URL non riconosciuto come Google Docs o Google Drive. Inserisci un link valido.");
      }

      const token = await ensureGoogleAccessToken();
      const { text, name, webViewLink } = await readDriveDocContent(token, parsed.id);

      const success = await onIngestContent(text, "knowledge", {
        gdriveSourceId: parsed.id,
        gdriveSourceUrl: webViewLink || pastedUrl,
        gdocUrl: webViewLink || pastedUrl,
        gdocId: parsed.id,
        originalFileName: name
      });

      if (success) {
        setIngestSuccessMessage(`"${name}" importato con successo da Google Docs!`);
        setPastedUrl("");
        setTimeout(() => setIngestSuccessMessage(null), 5000);
      }
    } catch (err: any) {
      alert(`Errore importazione link: ${err.message}`);
    } finally {
      setIsIngestingPastedUrl(false);
    }
  };

  // Export single resource
  const handleExportSingle = async () => {
    if (!selectedResourceForExport) return;
    setIsExporting(true);
    setExportResult(null);

    try {
      const token = await ensureGoogleAccessToken();
      const res = await exportResourceToGoogleDoc(token, selectedResourceForExport, DEFAULT_KNOWLEDGE_FOLDER_ID);
      setExportResult(res);

      if (onResourceExported) {
        onResourceExported(selectedResourceForExport.id, res);
      }
    } catch (err: any) {
      alert(`Errore esportazione Google Doc: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Export multi-resource digest compendium
  const handleExportDigest = async () => {
    const resourcesToExport = vaultResources.filter((r) => selectedResourceIds.includes(r.id));
    if (resourcesToExport.length === 0) {
      alert("Seleziona almeno una risorsa da includere nel Compendio.");
      return;
    }

    setIsExporting(true);
    setExportResult(null);

    try {
      const token = await ensureGoogleAccessToken();
      const res = await exportCompendiumToGoogleDoc(
        token,
        resourcesToExport,
        digestTitle,
        DEFAULT_KNOWLEDGE_FOLDER_ID
      );
      setExportResult(res);
    } catch (err: any) {
      alert(`Errore generazione Compendio: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // NotebookLM: Load files exported to Google Drive
  const loadNotebookLMFiles = async () => {
    setIsLoadingNotebookLM(true);
    try {
      const token = await ensureGoogleAccessToken();
      const files = await searchNotebookLMDocs(token);
      setNotebookLMFiles(files);
    } catch (err: any) {
      console.warn("Errore ricerca documenti NotebookLM:", err);
    } finally {
      setIsLoadingNotebookLM(false);
    }
  };

  // NotebookLM: Quick Ingest pasted output
  const handleIngestNotebookLMPaste = async () => {
    if (!notebookLMPasteText.trim() || isIngestingNotebookLM) return;
    setIsIngestingNotebookLM(true);
    try {
      let typeLabel = "Appunti & Sintesi NotebookLM";
      let docKind = "guide";
      if (notebookLMDocType === "briefing") {
        typeLabel = "NotebookLM Briefing Doc";
        docKind = "guide";
      } else if (notebookLMDocType === "study_guide") {
        typeLabel = "NotebookLM Study Guide";
        docKind = "guide";
      } else if (notebookLMDocType === "faq") {
        typeLabel = "NotebookLM FAQ & Glossario";
        docKind = "specification";
      } else if (notebookLMDocType === "audio_transcript") {
        typeLabel = "NotebookLM Audio Overview Deep Dive";
        docKind = "concept";
      }

      const formattedInput = `[${typeLabel}]\n\n${notebookLMPasteText.trim()}`;

      const success = await onIngestContent(
        formattedInput,
        "knowledge",
        {
          sourceOrigin: "NotebookLM (Gemini)",
          docType: docKind,
          tags: ["notebooklm", "gemini", "ai-research", notebookLMDocType !== "auto" ? notebookLMDocType : "notes"]
        }
      );

      if (success) {
        setIngestSuccessMessage(`Output di NotebookLM ("${typeLabel}") inserito con successo nel Vault secondo standard OKF v0.2!`);
        setNotebookLMPasteText("");
        setTimeout(() => setIngestSuccessMessage(null), 5000);
      }
    } catch (err: any) {
      alert(`Errore ingestione NotebookLM: ${err.message}`);
    } finally {
      setIsIngestingNotebookLM(false);
    }
  };

  // NotebookLM: Export vault resources as a high-density Google Doc in knowledge folder
  const handleExportForNotebookLM = async () => {
    setIsExportingForNotebookLM(true);
    setNotebookLMExportResult(null);
    try {
      const token = await ensureGoogleAccessToken();
      const selected = vaultResources.filter(r => selectedResourceIds.includes(r.id));
      const resourcesToSend = selected.length > 0 ? selected : vaultResources.slice(0, 15);
      
      const res = await exportNotebookLMSourceDoc(
        token,
        resourcesToSend,
        DEFAULT_KNOWLEDGE_FOLDER_ID
      );

      setNotebookLMExportResult(res);
    } catch (err: any) {
      alert(`Errore creazione sorgente per NotebookLM: ${err.message}`);
    } finally {
      setIsExportingForNotebookLM(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl bg-[#0F0F0F] border border-[#C5A059]/40 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#222] bg-[#141414]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#4285F4]/15 border border-[#4285F4]/30 flex items-center justify-center text-[#4285F4]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide font-serif">
                  Google Drive & Docs Hub
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-950/60 text-blue-300 border border-blue-800/40">
                  v3.0 Workspace
                </span>
              </div>
              <p className="text-xs text-[#888]">
                Cartella collegata:{" "}
                <a
                  href={DEFAULT_KNOWLEDGE_FOLDER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#C5A059] hover:underline font-medium inline-flex items-center gap-1"
                >
                  <Folder className="w-3 h-3 inline" />
                  {DEFAULT_KNOWLEDGE_FOLDER_NAME}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#222] text-[#888] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1A1A1A] bg-[#0A0A0A] overflow-x-auto">
          <button
            onClick={() => { setActiveTab("folder"); setExportResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "folder"
                ? "bg-[#C5A059] text-black font-semibold"
                : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            Cartella "{DEFAULT_KNOWLEDGE_FOLDER_NAME}"
          </button>

          <button
            onClick={() => { setActiveTab("search"); setExportResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "search"
                ? "bg-[#C5A059] text-black font-semibold"
                : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Cerca in Google Drive
          </button>

          <button
            onClick={() => { setActiveTab("paste_link"); setExportResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "paste_link"
                ? "bg-[#C5A059] text-black font-semibold"
                : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Importa da Link GDoc
          </button>

          {selectedResourceForExport && (
            <button
              onClick={() => { setActiveTab("single_export"); setExportResult(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === "single_export"
                  ? "bg-[#C5A059] text-black font-semibold"
                  : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              Esporta Risorsa Selezionata
            </button>
          )}

          <button
            onClick={() => { setActiveTab("export_digest"); setExportResult(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "export_digest"
                ? "bg-[#C5A059] text-black font-semibold"
                : "text-[#AAA] hover:text-white hover:bg-[#1A1A1A]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Crea Compendio ({vaultResources.length})
          </button>

          <button
            onClick={() => { 
              setActiveTab("notebooklm"); 
              setExportResult(null); 
              if (notebookLMFiles.length === 0) loadNotebookLMFiles();
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "notebooklm"
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold shadow-md"
                : "text-emerald-400 hover:text-white hover:bg-emerald-950/40 border border-emerald-800/30"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-300" />
            <span>NotebookLM & Gemini Bridge</span>
          </button>
        </div>

        {/* Global Notifications */}
        {ingestSuccessMessage && (
          <div className="mx-4 mt-3 p-3 bg-emerald-950/60 border border-emerald-600/40 rounded-xl flex items-center gap-2 text-xs text-emerald-300 animate-fade-in">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="font-medium">{ingestSuccessMessage}</span>
          </div>
        )}

        {/* Auth Barrier Notice if needed */}
        {!isAuthenticated && (
          <div className="p-6 m-4 bg-[#14120B] border border-[#C5A059]/30 rounded-xl text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#C5A059]/15 flex items-center justify-center text-[#C5A059]">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">
              Connessione a Google Workspace Richiesta
            </h3>
            <p className="text-xs text-[#AAA] max-w-md mx-auto">
              Per leggere i documenti dalla cartella <strong className="text-[#C5A059]">{DEFAULT_KNOWLEDGE_FOLDER_NAME}</strong> o creare nuovi Google Docs formattati, autorizza l'applicazione con il tuo account Google.
            </p>
            <button
              onClick={() => checkAuthAndLoad(true)}
              disabled={isAuthenticating}
              className="px-5 py-2.5 rounded-xl bg-[#4285F4] hover:bg-[#3367D6] text-white font-medium text-xs shadow-lg transition-all inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              {isAuthenticating ? "Connessione in corso..." : "Autorizza Google Drive & Docs"}
            </button>
            {authError && <p className="text-xs text-red-400">{authError}</p>}
          </div>
        )}

        {/* Modal Body */}
        {isAuthenticated && (
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            
            {/* TAB 1: Folder View */}
            {activeTab === "folder" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-[#BBB]">
                    <Folder className="w-4 h-4 text-[#C5A059]" />
                    <span>Contenuto cartella: <strong className="text-white">{DEFAULT_KNOWLEDGE_FOLDER_NAME}</strong></span>
                    <span className="text-[#666]">({folderFiles.length} file rilevati)</span>
                  </div>
                  <button
                    onClick={() => loadFolderContents()}
                    disabled={isLoadingFolder}
                    className="px-2.5 py-1 rounded-lg bg-[#181818] hover:bg-[#222] border border-[#333] text-xs text-[#AAA] hover:text-white flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingFolder ? "animate-spin text-[#C5A059]" : ""}`} />
                    Aggiorna
                  </button>
                </div>

                {isLoadingFolder ? (
                  <div className="py-12 text-center text-xs text-[#888] space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C5A059]" />
                    <p>Caricamento file dalla cartella Google Drive...</p>
                  </div>
                ) : folderError ? (
                  <div className="p-4 bg-red-950/30 border border-red-800/40 rounded-xl text-xs text-red-300">
                    <p className="font-semibold mb-1">Impossibile leggere la cartella</p>
                    <p>{folderError}</p>
                  </div>
                ) : folderFiles.length === 0 ? (
                  <div className="p-8 text-center bg-[#141414] border border-[#222] rounded-xl space-y-2 text-xs text-[#888]">
                    <Folder className="w-8 h-8 mx-auto text-[#555]" />
                    <p className="font-medium text-white">Nessun file presente nella cartella "{DEFAULT_KNOWLEDGE_FOLDER_NAME}"</p>
                    <p className="max-w-md mx-auto">
                      Puoi caricare documenti Google Docs, PDF, Markdown o file di testo nella cartella su Drive, oppure esportare risorse dal Vault.
                    </p>
                    <a
                      href={DEFAULT_KNOWLEDGE_FOLDER_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 mt-2 rounded-lg bg-[#222] text-[#C5A059] hover:underline text-xs"
                    >
                      Apri cartella su Google Drive
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {folderFiles.map((file) => {
                      const isGDoc = file.mimeType === "application/vnd.google-apps.document";
                      const isIngesting = ingestingFileId === file.id;

                      return (
                        <div
                          key={file.id}
                          className="p-3 bg-[#141414] hover:bg-[#181818] border border-[#222] hover:border-[#C5A059]/40 rounded-xl flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isGDoc ? "bg-blue-950/40 text-blue-400 border border-blue-800/30" : "bg-amber-950/30 text-amber-400 border border-amber-800/30"
                            }`}>
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-medium text-white truncate">{file.name}</h4>
                              <p className="text-[10px] text-[#666] flex items-center gap-2">
                                <span>{isGDoc ? "Google Doc" : file.mimeType.split("/").pop()}</span>
                                {file.modifiedTime && (
                                  <span>• Modificato: {new Date(file.modifiedTime).toLocaleDateString()}</span>
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {file.webViewLink && (
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg bg-[#222] hover:bg-[#2A2A2A] text-[#888] hover:text-white text-xs"
                                title="Apri in Google Docs"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              onClick={() => handleIngestFile(file)}
                              disabled={isIngesting}
                              className="px-3 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#333] text-black font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm"
                            >
                              {isIngesting ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  Ingestione...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3" />
                                  Ingerisci nel Vault
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Search across Drive */}
            {activeTab === "search" && (
              <div className="space-y-4">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cerca documenti Google Docs o file in Drive per nome o testo..."
                      className="w-full pl-9 pr-3 py-2 bg-[#141414] border border-[#333] focus:border-[#C5A059] rounded-xl text-xs text-white placeholder-[#666] outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-4 py-2 bg-[#C5A059] text-black font-semibold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Cerca
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-[#888]">Risultati ricerca ({searchResults.length}):</p>
                    {searchResults.map((file) => (
                      <div
                        key={file.id}
                        className="p-3 bg-[#141414] border border-[#222] hover:border-[#C5A059]/40 rounded-xl flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <h4 className="text-xs font-medium text-white truncate">{file.name}</h4>
                          <p className="text-[10px] text-[#666]">{file.mimeType}</p>
                        </div>
                        <button
                          onClick={() => handleIngestFile(file)}
                          disabled={ingestingFileId === file.id}
                          className="px-3 py-1.5 rounded-lg bg-[#C5A059] text-black font-semibold text-xs flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3 h-3" />
                          Ingerisci
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Paste Link */}
            {activeTab === "paste_link" && (
              <div className="p-4 bg-[#141414] border border-[#222] rounded-xl space-y-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-white">Importa da URL Google Docs o Google Drive</h4>
                  <p className="text-[11px] text-[#888]">
                    Incolla un link come <code className="text-[#C5A059]">https://docs.google.com/document/d/...</code> per estrarne automaticamente il testo e catalogarlo secondo lo standard OKF v0.2.
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={pastedUrl}
                    onChange={(e) => setPastedUrl(e.target.value)}
                    placeholder="https://docs.google.com/document/d/..."
                    className="flex-1 px-3 py-2 bg-[#0A0A0A] border border-[#333] focus:border-[#C5A059] rounded-xl text-xs text-white placeholder-[#666] outline-none"
                  />
                  <button
                    onClick={handleIngestPastedUrl}
                    disabled={isIngestingPastedUrl || !pastedUrl.trim()}
                    className="px-4 py-2 bg-[#C5A059] text-black font-semibold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                  >
                    {isIngestingPastedUrl ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Importazione...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        Importa nel Vault
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: Single Resource Export */}
            {activeTab === "single_export" && selectedResourceForExport && (
              <div className="space-y-4">
                <div className="p-4 bg-[#141414] border border-[#222] rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-mono font-semibold bg-[#C5A059]/20 text-[#C5A059]">
                      {selectedResourceForExport.type}
                    </span>
                    <span className="text-[10px] text-[#888]">Standard OKF v0.2</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white">{selectedResourceForExport.title}</h3>
                  <p className="text-xs text-[#AAA] line-clamp-2">{selectedResourceForExport.summary}</p>
                </div>

                {exportResult ? (
                  <div className="p-4 bg-emerald-950/40 border border-emerald-600/40 rounded-xl space-y-3 animate-fade-in">
                    <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Google Doc creato con successo nella cartella "{DEFAULT_KNOWLEDGE_FOLDER_NAME}"!
                    </div>
                    <p className="text-xs text-[#AAA]">{exportResult.title}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={exportResult.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Apri Documento su Google Docs
                      </a>
                      <a
                        href={exportResult.folderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 bg-[#222] hover:bg-[#333] text-[#CCC] rounded-xl text-xs flex items-center gap-1"
                      >
                        <Folder className="w-3.5 h-3.5 text-[#C5A059]" />
                        Apri Cartella Drive
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-[#888]">
                      Verrà generato un documento Google Docs formattato con intestazione OKF v0.2, riepilogo esecutivo, tabella entità, relazioni topologiche e note tecniche, e inserito direttamente nella cartella <strong className="text-[#C5A059]">{DEFAULT_KNOWLEDGE_FOLDER_NAME}</strong>.
                    </p>
                    <button
                      onClick={handleExportSingle}
                      disabled={isExporting}
                      className="w-full py-3 bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#333] text-black font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                    >
                      {isExporting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Generazione Google Doc in corso...
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4" />
                          Crea Google Doc in cartella "{DEFAULT_KNOWLEDGE_FOLDER_NAME}"
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: Digest / Compendium Export */}
            {activeTab === "export_digest" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white">Titolo del Compendio</label>
                  <input
                    type="text"
                    value={digestTitle}
                    onChange={(e) => setDigestTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-[#141414] border border-[#333] focus:border-[#C5A059] rounded-xl text-xs text-white outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#AAA]">Risorse selezionate ({selectedResourceIds.length}/{vaultResources.length})</span>
                    <button
                      onClick={() => {
                        if (selectedResourceIds.length === vaultResources.length) {
                          setSelectedResourceIds([]);
                        } else {
                          setSelectedResourceIds(vaultResources.map((r) => r.id));
                        }
                      }}
                      className="text-[#C5A059] hover:underline"
                    >
                      {selectedResourceIds.length === vaultResources.length ? "Deseleziona tutte" : "Seleziona tutte"}
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 border border-[#222] p-2 rounded-xl bg-[#0A0A0A]">
                    {vaultResources.map((r) => {
                      const isChecked = selectedResourceIds.includes(r.id);
                      return (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 p-2 hover:bg-[#141414] rounded-lg cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedResourceIds((prev) => [...prev, r.id]);
                              } else {
                                setSelectedResourceIds((prev) => prev.filter((id) => id !== r.id));
                              }
                            }}
                            className="rounded border-[#444] text-[#C5A059] focus:ring-[#C5A059]"
                          />
                          <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-mono bg-[#222] text-[#AAA]">
                            {r.type}
                          </span>
                          <span className="truncate text-white flex-1">{r.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {exportResult ? (
                  <div className="p-4 bg-emerald-950/40 border border-emerald-600/40 rounded-xl space-y-3 animate-fade-in">
                    <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Compendio creato con successo su Google Drive!
                    </div>
                    <p className="text-xs text-[#AAA]">{exportResult.title}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={exportResult.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Apri Compendio su Google Docs
                      </a>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleExportDigest}
                    disabled={isExporting || selectedResourceIds.length === 0}
                    className="w-full py-3 bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#333] text-black font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                  >
                    {isExporting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Creazione compendio in corso...
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4" />
                        Genera Compendio Google Doc ({selectedResourceIds.length} Risorse)
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* TAB 6: NotebookLM & Gemini Bridge */}
            {activeTab === "notebooklm" && (
              <div className="space-y-5">
                {/* Intro / Banner */}
                <div className="p-4 bg-gradient-to-r from-emerald-950/50 via-[#10221c]/40 to-[#0c1a16]/40 border border-emerald-600/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        GEMINI 1.5 & NOTEBOOKLM
                      </span>
                      <span className="text-[11px] text-[#888]">Integrazione Google Workspace</span>
                    </div>
                    <h3 className="text-sm font-semibold text-white">
                      Ponte Operativo tra Knowledge Vault e Google NotebookLM
                    </h3>
                    <p className="text-xs text-[#AAA] max-w-xl">
                      NotebookLM elabora fonti affidabili per creare podcast audio, briefing e guide. 
                      Usa questo hub per convertire i tuoi taccuini in schede del Vault o esportare la conoscenza come fonti per NotebookLM.
                    </p>
                  </div>

                  <a
                    href="https://notebooklm.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shrink-0 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Apri NotebookLM
                  </a>
                </div>

                {/* Two Columns Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  
                  {/* LEFT COLUMN: Import from NotebookLM */}
                  <div className="p-4 bg-[#141414] border border-[#222] rounded-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-[#222] pb-2">
                      <div className="flex items-center gap-2">
                        <Download className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                          1. Importa da NotebookLM
                        </h4>
                      </div>
                      <span className="text-[10px] text-[#888]">Drive & Appunti</span>
                    </div>

                    {/* Section 1A: Search Drive for NotebookLM exports */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-[#CCC]">
                          Documenti Google Docs esportati da NotebookLM
                        </label>
                        <button
                          onClick={loadNotebookLMFiles}
                          disabled={isLoadingNotebookLM}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono"
                        >
                          <RefreshCw className={`w-3 h-3 ${isLoadingNotebookLM ? "animate-spin" : ""}`} />
                          Scansiona Drive
                        </button>
                      </div>

                      {isLoadingNotebookLM ? (
                        <div className="p-4 text-center text-xs text-[#777] bg-[#0A0A0A] rounded-lg border border-[#222]">
                          <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-emerald-400" />
                          Ricerca documenti NotebookLM in Google Drive...
                        </div>
                      ) : notebookLMFiles.length > 0 ? (
                        <div className="max-h-40 overflow-y-auto space-y-1.5 border border-[#222] p-2 rounded-xl bg-[#0A0A0A]">
                          {notebookLMFiles.map((file) => (
                            <div
                              key={file.id}
                              className="p-2 bg-[#121212] hover:bg-[#1A1A1A] border border-[#222] rounded-lg flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-white truncate">{file.name}</p>
                                <p className="text-[10px] text-[#666]">
                                  {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : "Google Doc"}
                                </p>
                              </div>
                              <button
                                onClick={() => handleIngestFile(file)}
                                disabled={ingestingFileId === file.id}
                                className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/40 text-emerald-300 rounded text-[11px] font-medium flex items-center gap-1 shrink-0"
                              >
                                <Sparkles className="w-3 h-3 text-emerald-400" />
                                Ingerisci
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-[#777] bg-[#0A0A0A] p-2.5 rounded-lg border border-[#1E1E1E]">
                          Nessun documento con nome tipico di NotebookLM ("Briefing Doc", "Study Guide", "FAQ") trovato al momento. In NotebookLM clicca su <strong>Esporta in Google Documenti</strong> e poi clicca su "Scansiona Drive".
                        </p>
                      )}
                    </div>

                    {/* Section 1B: Paste direct NotebookLM Output */}
                    <div className="space-y-2 pt-2 border-t border-[#222]">
                      <label className="text-xs font-medium text-[#CCC]">
                        Oppure incolla output / appunti generati da NotebookLM:
                      </label>
                      <div className="flex gap-1.5 flex-wrap">
                        {(["auto", "briefing", "study_guide", "faq", "audio_transcript"] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setNotebookLMDocType(type)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                              notebookLMDocType === type
                                ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold"
                                : "bg-[#1E1E1E] text-[#888] hover:text-[#CCC]"
                            }`}
                          >
                            {type === "auto" && "Auto"}
                            {type === "briefing" && "Briefing Doc"}
                            {type === "study_guide" && "Study Guide"}
                            {type === "faq" && "FAQ"}
                            {type === "audio_transcript" && "Audio Notes"}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={notebookLMPasteText}
                        onChange={(e) => setNotebookLMPasteText(e.target.value)}
                        placeholder="Incolla qui la sintesi, la guida di studio o la trascrizione audio generata da NotebookLM..."
                        rows={4}
                        className="w-full px-3 py-2 bg-[#0A0A0A] border border-[#2B2B2B] focus:border-emerald-500 rounded-xl text-xs text-white placeholder-[#555] outline-none resize-none font-mono"
                      />

                      <button
                        onClick={handleIngestNotebookLMPaste}
                        disabled={isIngestingNotebookLM || !notebookLMPasteText.trim()}
                        className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-[#222] text-white font-medium rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition-all"
                      >
                        {isIngestingNotebookLM ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Ingestione & Conversione OKF v0.2...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Salva nel Vault con tag #notebooklm
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Export Vault Knowledge to NotebookLM Source */}
                  <div className="p-4 bg-[#141414] border border-[#222] rounded-xl space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-[#222] pb-2">
                        <div className="flex items-center gap-2">
                          <Upload className="w-4 h-4 text-[#C5A059]" />
                          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                            2. Prepara Fonte per NotebookLM
                          </h4>
                        </div>
                        <span className="text-[10px] text-[#C5A059] font-mono">Dossier Google Doc</span>
                      </div>

                      <p className="text-xs text-[#AAA] leading-relaxed">
                        Compila le risorse del Vault in un unico Google Doc ottimizzato per NotebookLM, salvato direttamente nella cartella <strong className="text-[#C5A059]">{DEFAULT_KNOWLEDGE_FOLDER_NAME}</strong> di Google Drive.
                      </p>

                      <div className="p-3 bg-[#0A0A0A] border border-[#222] rounded-xl space-y-2 text-xs">
                        <div className="flex items-center justify-between text-[#888]">
                          <span>Risorse da includere nel Dossier:</span>
                          <span className="text-white font-semibold">
                            {selectedResourceIds.length > 0 ? selectedResourceIds.length : Math.min(vaultResources.length, 15)} schede
                          </span>
                        </div>
                        <p className="text-[11px] text-[#666]">
                          Formattazione ad alta densità sintattica per massimizzare la precisione di Gemini nel generare podcast, quiz e risposte di ricerca.
                        </p>
                      </div>

                      {notebookLMExportResult && (
                        <div className="p-3.5 bg-emerald-950/40 border border-emerald-600/40 rounded-xl space-y-2.5 animate-fade-in">
                          <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                            Fonte per NotebookLM creata con successo!
                          </div>
                          <p className="text-xs text-[#CCC] line-clamp-1 font-mono">
                            {notebookLMExportResult.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <a
                              href={notebookLMExportResult.docUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Visualizza Google Doc
                            </a>
                            <a
                              href="https://notebooklm.google.com"
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-[#252525] hover:bg-[#333] text-white rounded-lg text-xs font-medium flex items-center gap-1.5 border border-[#3A3A3A]"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-teal-400" />
                              Vai a NotebookLM (+ Aggiungi Fonte)
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleExportForNotebookLM}
                        disabled={isExportingForNotebookLM || vaultResources.length === 0}
                        className="w-full py-3 bg-[#C5A059] hover:bg-[#D5B069] disabled:bg-[#222] text-black font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                      >
                        {isExportingForNotebookLM ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Generazione Dossier per NotebookLM in corso...
                          </>
                        ) : (
                          <>
                            <BookOpen className="w-4 h-4" />
                            Crea Fonte NotebookLM in cartella "{DEFAULT_KNOWLEDGE_FOLDER_NAME}"
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )}

          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#222] bg-[#141414] flex items-center justify-between text-[11px] text-[#666]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>Cartella Google Drive: <strong>{DEFAULT_KNOWLEDGE_FOLDER_NAME}</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-[#222] hover:bg-[#2A2A2A] text-[#AAA] hover:text-white"
          >
            Chiudi
          </button>
        </div>

      </div>
    </div>
  );
};
