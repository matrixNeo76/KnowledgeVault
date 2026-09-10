import { 
  auth, 
  googleProvider, 
  GoogleAuthProvider, 
  signInWithPopup, 
  getGoogleAccessToken, 
  setGoogleAccessToken,
  clearGoogleAccessToken,
  hasValidGoogleToken
} from "./firebase";

export { 
  hasValidGoogleToken,
  clearGoogleAccessToken,
  getGoogleAccessToken
};
import { ResourceItem, ResourceType } from "../types";

export const DEFAULT_KNOWLEDGE_FOLDER_ID = "151nJJammXivExYPlRG6AmrlWuHB104Jy";
export const DEFAULT_KNOWLEDGE_FOLDER_URL = "https://drive.google.com/drive/folders/151nJJammXivExYPlRG6AmrlWuHB104Jy?usp=sharing";
export const DEFAULT_KNOWLEDGE_FOLDER_NAME = "knowledge (Team Shared)";

export interface TargetFolderOption {
  id: string;
  name: string;
  url: string;
  isPersonal?: boolean;
  isDefault?: boolean;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
  size?: string;
  owners?: { displayName?: string; emailAddress?: string; photoLink?: string }[];
}

export interface GoogleDocExportResult {
  docId: string;
  docUrl: string;
  title: string;
  folderId: string;
  folderUrl: string;
}

export class GoogleAuthExpiredError extends Error {
  constructor(message = "Sessione Google Workspace scaduta o non autorizzata (401).") {
    super(message);
    this.name = "GoogleAuthExpiredError";
  }
}

/**
 * Storage helpers for user's preferred target folder in Google Drive
 */
const ACTIVE_FOLDER_KEY = "vault_gdrive_active_folder_config";

export function getActiveFolderConfig(): TargetFolderOption {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = localStorage.getItem(ACTIVE_FOLDER_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Fallback
    }
  }
  return {
    id: DEFAULT_KNOWLEDGE_FOLDER_ID,
    name: DEFAULT_KNOWLEDGE_FOLDER_NAME,
    url: DEFAULT_KNOWLEDGE_FOLDER_URL,
    isDefault: true
  };
}

export function setActiveFolderConfig(folder: TargetFolderOption): void {
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(ACTIVE_FOLDER_KEY, JSON.stringify(folder));
  }
}

/**
 * Robust wrapper around fetch for Google APIs with 401 expiration detection and descriptive errors
 */
export async function workspaceFetch(
  url: string, 
  options: RequestInit = {}, 
  token: string
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401) {
    clearGoogleAccessToken();
    throw new GoogleAuthExpiredError("Token Google non valido o scaduto. Effettua nuovamente l'autorizzazione.");
  }

  return res;
}

/**
 * Explicit user-triggered Google Sign-In with OAuth scopes.
 * Must be called from a user gesture (button click).
 */
export async function requestGoogleAccess(): Promise<string> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) {
      throw new Error("Impossibile ottenere il token di accesso Google Workspace.");
    }
    setGoogleAccessToken(token, 3550);
    return token;
  } catch (error: any) {
    if (error.code === "auth/popup-blocked") {
      throw new Error("La finestra popup di Google è stata bloccata dal browser. Abilita i popup per questo sito e riprova.");
    }
    if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
      throw new Error("Finestra di accesso Google chiusa prima del completamento.");
    }
    console.error("[GoogleWorkspace] Errore autenticazione OAuth:", error);
    throw error;
  }
}

/**
 * Ensures a valid OAuth access token is available. If forcePrompt is false and token is cached, returns it.
 */
export async function ensureGoogleAccessToken(forcePrompt = false): Promise<string> {
  const existingToken = getGoogleAccessToken();
  if (existingToken && !forcePrompt) {
    return existingToken;
  }
  return await requestGoogleAccess();
}

/**
 * Checks if current user already has an active Google OAuth token
 */
export function isGoogleConnected(): boolean {
  return hasValidGoogleToken();
}

/**
 * Parses a Google Drive or Google Docs URL to extract the resource ID and type.
 */
export function parseGoogleResourceUrl(input: string): { id: string; type: 'doc' | 'file' | 'folder' | 'unknown' } | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Match Google Docs URL: docs.google.com/document/d/<ID>/...
  const docMatch = trimmed.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) {
    return { id: docMatch[1], type: 'doc' };
  }

  // Match Google Drive Folder: drive.google.com/drive/folders/<ID>
  const folderMatch = trimmed.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) {
    return { id: folderMatch[1], type: 'folder' };
  }

  // Match Google Drive File: drive.google.com/file/d/<ID>/...
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return { id: fileMatch[1], type: 'file' };
  }

  // Match open?id=<ID>
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) {
    return { id: idParamMatch[1], type: 'file' };
  }

  // Direct alphanumeric ID (at least 20 chars)
  if (/^[a-zA-Z0-9_-]{20,60}$/.test(trimmed)) {
    return { id: trimmed, type: 'unknown' };
  }

  return null;
}

/**
 * Verifies if a folder exists and is accessible.
 */
export async function verifyFolderAccess(
  token: string, 
  folderId: string
): Promise<{ accessible: boolean; folderName?: string; webViewLink?: string; error?: string }> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,webViewLink,capabilities`;
    const res = await workspaceFetch(url, {}, token);
    
    if (!res.ok) {
      if (res.status === 404) {
        return { accessible: false, error: "Cartella non trovata o permessi insufficienti su Google Drive (404)." };
      }
      if (res.status === 403) {
        return { accessible: false, error: "Accesso non autorizzato a questa cartella (403)." };
      }
      return { accessible: false, error: `Errore verifica cartella (${res.status})` };
    }

    const data = await res.json();
    return {
      accessible: true,
      folderName: data.name,
      webViewLink: data.webViewLink
    };
  } catch (err: any) {
    return { accessible: false, error: err.message };
  }
}

/**
 * Searches user's personal Drive for a folder named "Knowledge Vault", or creates one if absent.
 */
export async function findOrCreateUserKnowledgeFolder(
  token: string, 
  folderName = "Knowledge Vault"
): Promise<TargetFolderOption> {
  const safeName = folderName.replace(/'/g, "");
  const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${safeName}' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=1`;

  const res = await workspaceFetch(searchUrl, {}, token);
  if (res.ok) {
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      const folder = data.files[0];
      const opt: TargetFolderOption = {
        id: folder.id,
        name: folder.name,
        url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}?usp=sharing`,
        isPersonal: true
      };
      setActiveFolderConfig(opt);
      return opt;
    }
  }

  // If not found, create it in root Drive
  const createUrl = "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink";
  const createRes = await workspaceFetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      description: "Cartella dedicata per l'archiviazione di risorse, compendi e documenti generati da Knowledge Vault."
    })
  }, token);

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Impossibile creare la cartella "${folderName}" su Google Drive: ${err}`);
  }

  const newFolder = await createRes.json();
  const folderOpt: TargetFolderOption = {
    id: newFolder.id,
    name: newFolder.name,
    url: newFolder.webViewLink || `https://drive.google.com/drive/folders/${newFolder.id}?usp=sharing`,
    isPersonal: true
  };
  setActiveFolderConfig(folderOpt);
  return folderOpt;
}

/**
 * Lists files contained within a specific Google Drive folder.
 */
export async function listDriveFolderFiles(
  token: string, 
  folderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID
): Promise<DriveFileInfo[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size,owners)&orderBy=modifiedTime desc&pageSize=50`;

  const res = await workspaceFetch(url, {}, token);

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404 || res.status === 403) {
      throw new Error(`Cartella Google Drive non accessibile o permessi mancanti (${res.status}). Prova a selezionare la tua cartella personale "Knowledge Vault".`);
    }
    throw new Error(`Errore recupero file da Google Drive (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Searches user files and Google Docs across Drive.
 */
export async function searchDriveDocsAndFiles(
  token: string, 
  searchTerm: string = "",
  filterMime: "all" | "gdoc" | "text" = "all"
): Promise<DriveFileInfo[]> {
  let query = "trashed = false";
  
  if (filterMime === "gdoc") {
    query += " and mimeType = 'application/vnd.google-apps.document'";
  } else if (filterMime === "text") {
    query += " and (mimeType = 'text/plain' or mimeType = 'text/markdown' or mimeType = 'application/json')";
  } else {
    query += " and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'text/markdown' or mimeType = 'application/json' or mimeType = 'text/csv' or mimeType = 'text/html')";
  }

  if (searchTerm.trim()) {
    const safeTerm = searchTerm.replace(/'/g, "");
    query += ` and (name contains '${safeTerm}' or fullText contains '${safeTerm}')`;
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size,owners)&orderBy=modifiedTime desc&pageSize=40`;

  const res = await workspaceFetch(url, {}, token);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Errore ricerca Google Drive (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Retrieves file metadata from Google Drive.
 */
export async function getDriveFileMetadata(token: string, fileId: string): Promise<DriveFileInfo> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink,iconLink,modifiedTime,size,owners,description`;
  const res = await workspaceFetch(url, {}, token);

  if (!res.ok) {
    throw new Error(`Impossibile leggere i metadati del file Drive (${res.status})`);
  }

  return await res.json();
}

/**
 * Extracts plain text content from a Google Doc or supported file on Google Drive.
 * Protects against binary gibberish and supports text, markdown, csv, json, html, and Google Docs.
 */
export async function readDriveDocContent(
  token: string, 
  fileId: string, 
  mimeType?: string
): Promise<{ text: string; name: string; webViewLink?: string; mimeType: string }> {
  let fileName = "Google Doc";
  let targetMime = mimeType;
  let webViewLink = `https://docs.google.com/document/d/${fileId}/edit`;

  try {
    const meta = await getDriveFileMetadata(token, fileId);
    fileName = meta.name;
    targetMime = meta.mimeType;
    if (meta.webViewLink) webViewLink = meta.webViewLink;
  } catch (err) {
    console.warn("[readDriveDocContent] Impossibile recuperare metadati, fallback su esportazione diretta:", err);
  }

  // 1. Check if binary file that cannot be ingested as text
  if (
    targetMime &&
    (targetMime.startsWith("image/") ||
     targetMime.startsWith("audio/") ||
     targetMime.startsWith("video/") ||
     targetMime.includes("zip") ||
     targetMime.includes("tar") ||
     targetMime.includes("octet-stream"))
  ) {
    throw new Error(`Il file "${fileName}" (${targetMime}) è un formato binario. Seleziona un Google Doc, un file Markdown o un file di testo.`);
  }

  // 2. If it's a Google Doc, export as plain text or use Docs API
  if (targetMime === "application/vnd.google-apps.document" || !targetMime) {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    const exportRes = await workspaceFetch(exportUrl, {}, token);

    if (exportRes.ok) {
      const text = await exportRes.text();
      return { text: text.trim(), name: fileName, webViewLink, mimeType: targetMime || "application/vnd.google-apps.document" };
    }
    
    // Fallback: Docs API structural parse
    const docsUrl = `https://docs.googleapis.com/v1/documents/${fileId}`;
    const docsRes = await workspaceFetch(docsUrl, {}, token);

    if (!docsRes.ok) {
      const errText = await docsRes.text();
      throw new Error(`Errore lettura Google Doc (${docsRes.status}): ${errText}`);
    }

    const docData = await docsRes.json();
    let extractedText = "";
    if (docData.body?.content) {
      for (const elem of docData.body.content) {
        if (elem.paragraph?.elements) {
          for (const pElem of elem.paragraph.elements) {
            if (pElem.textRun?.content) {
              extractedText += pElem.textRun.content;
            }
          }
        }
      }
    }

    return { 
      text: extractedText.trim(), 
      name: docData.title || fileName, 
      webViewLink, 
      mimeType: "application/vnd.google-apps.document" 
    };
  }

  // 3. For plain text, markdown, json, csv, html
  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const mediaRes = await workspaceFetch(mediaUrl, {}, token);

  if (!mediaRes.ok) {
    throw new Error(`Errore download contenuto file (${mediaRes.status})`);
  }

  const text = await mediaRes.text();
  return { text: text.trim(), name: fileName, webViewLink, mimeType: targetMime };
}

/**
 * Builds beautifully formatted structured Google Docs content according to OKF v0.2
 */
function buildResourceDocumentText(resource: ResourceItem, targetFolderName: string): string {
  const dateStr = new Date().toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });
  const typeLabel = resource.type.toUpperCase().replace("_", " ");
  const domain = resource.metadata?.domain || "Informatica & AI";
  const tagsStr = (resource.tags || []).map(t => `#${t}`).join(" ");
  const status = resource.metadata?.status || "stable";
  const score = resource.metadata?.score !== undefined ? `${resource.metadata.score}/100` : "N/D";
  
  let takeawaysSection = "";
  if (resource.metadata?.aiKeyTakeaways && resource.metadata.aiKeyTakeaways.length > 0) {
    takeawaysSection = "\n\nEXECUTIVE TAKEAWAYS & PUNTI CHIAVE:\n" + resource.metadata.aiKeyTakeaways.map(k => `✓  ${k}`).join("\n");
  } else if (resource.metadata?.keyTakeaways && resource.metadata.keyTakeaways.length > 0) {
    takeawaysSection = "\n\nEXECUTIVE TAKEAWAYS & PUNTI CHIAVE:\n" + resource.metadata.keyTakeaways.map(k => `✓  ${k}`).join("\n");
  }

  let entitiesSection = "";
  if (resource.metadata?.entities && resource.metadata.entities.length > 0) {
    entitiesSection = "\n\nENTITÀ CHIAVE & TECNOLOGIE RILEVATE:\n" + resource.metadata.entities.map(e => {
      if (typeof e === "string") return `•  ${e}`;
      return `•  ${e.name} [${e.type}]${e.description ? ` — ${e.description}` : ""}`;
    }).join("\n");
  }

  let relationsSection = "";
  if (resource.metadata?.relations && resource.metadata.relations.length > 0) {
    relationsSection = "\n\nRELAZIONI TOPOLOGICHE NEL GRAFO:\n" + resource.metadata.relations.map(r => {
      return `➜  [${(r.relationType || "relates_to").toUpperCase()}] ➔ ${r.targetTitle || r.target || "Entità"}${r.description ? ` (${r.description})` : ""}`;
    }).join("\n");
  }

  return `${resource.title}

KNOWLEDGE VAULT • TECHNICAL SPECIFICATION (OKF v0.2)
═════════════════════════════════════════════════════════════════════
Tipo: ${typeLabel}   |   Dominio: ${domain}   |   Qualità/Score: ${score}
Stato: ${status.toUpperCase()}   |   Generato: ${dateStr}
Tag: ${tagsStr || "Nessun tag"}
URL Risorsa: ${resource.url || "Nessun URL esterno"}
═════════════════════════════════════════════════════════════════════

┌─ FRONTMATTER OKF v0.2 ─────────────────────────────────────────────┐
│ okf_version: "0.2"
│ title: "${resource.title.replace(/"/g, "'")}"
│ type: ${resource.type}
│ domain: "${domain.replace(/"/g, "'")}"
│ score: ${resource.metadata?.score || 90}
│ tags: [${(resource.tags || []).map(t => `"${t}"`).join(", ")}]
└────────────────────────────────────────────────────────────────────┘

SOMMARIO ESECUTIVO:
${resource.summary || "Nessun sommario disponibile."}
${takeawaysSection}${entitiesSection}${relationsSection}

DOCUMENTAZIONE COMPLETA & NOTE TECNICHE:
${resource.metadata?.markdownContent || resource.rawInput || "Nessun contenuto markdown aggiuntivo archiviato."}

═════════════════════════════════════════════════════════════════════
Certificato da Knowledge Vault • Protocollo OKF v0.2
Cartella Google Drive: ${targetFolderName}
`;
}

/**
 * Creates a formatted Google Doc in Google Drive for a single Vault resource.
 */
export async function exportResourceToGoogleDoc(
  token: string, 
  resource: ResourceItem, 
  targetFolderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID,
  targetFolderName: string = "Knowledge Vault"
): Promise<GoogleDocExportResult> {
  const docTitle = `[Knowledge Vault] ${resource.title}`;

  // Step 1: Create empty Google Doc
  const createRes = await workspaceFetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title: docTitle })
  }, token);

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Errore creazione Google Doc (${createRes.status}): ${errText}`);
  }

  const doc = await createRes.json();
  const docId = doc.documentId;
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

  // Step 2: Insert text
  const bodyText = buildResourceDocumentText(resource, targetFolderName);
  const updateRes = await workspaceFetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: bodyText
          }
        }
      ]
    })
  }, token);

  if (!updateRes.ok) {
    console.warn("[exportResourceToGoogleDoc] BatchUpdate parziale:", await updateRes.text());
  }

  // Step 3: Move the document into the Knowledge folder
  try {
    const moveRes = await workspaceFetch(
      `https://www.googleapis.com/drive/v3/files/${docId}?addParents=${targetFolderId}&fields=id,parents,webViewLink`, 
      { method: "PATCH" }, 
      token
    );

    if (!moveRes.ok) {
      console.warn("[exportResourceToGoogleDoc] Spostamento cartella target fallito, file salvato in root Drive:", await moveRes.text());
    }
  } catch (moveErr) {
    console.warn("[exportResourceToGoogleDoc] Avviso spostamento:", moveErr);
  }

  return {
    docId,
    docUrl,
    title: docTitle,
    folderId: targetFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${targetFolderId}?usp=sharing`
  };
}

/**
 * Batch exports multiple resources as separate Google Docs with progress feedback.
 */
export async function batchExportResourcesToGoogleDocs(
  token: string,
  resources: ResourceItem[],
  targetFolderId: string,
  targetFolderName: string,
  onProgress?: (current: number, total: number, lastResult?: GoogleDocExportResult) => void
): Promise<GoogleDocExportResult[]> {
  const results: GoogleDocExportResult[] = [];

  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    try {
      const res = await exportResourceToGoogleDoc(token, r, targetFolderId, targetFolderName);
      results.push(res);
      if (onProgress) {
        onProgress(i + 1, resources.length, res);
      }
      // Brief pause to respect Google Docs rate limits
      if (i < resources.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    } catch (err: any) {
      console.error(`[batchExport] Errore export risorsa "${r.title}":`, err);
    }
  }

  return results;
}

export interface AgenticDossierData {
  dossierTitle: string;
  executiveSynthesis: string;
  crossResourceInsights: string[];
  topologicalThemes: Array<{ theme: string; description: string; relatedResources?: string[] }>;
  notebookLMRecommendations?: {
    recommendedAudioFocus?: string;
    suggestedPrompts?: string[];
  };
  openEpistemicQuestions?: string[];
}

/**
 * Invokes the Multi-Agent Synthesis Orchestrator to generate an epistemic dossier across resources.
 */
export async function generateAgenticDossierSynthesis(
  resources: ResourceItem[],
  topic?: string,
  targetPlatform: "google_docs" | "notebooklm" = "google_docs"
): Promise<AgenticDossierData | null> {
  try {
    const res = await fetch("/api/vault/agentic-dossier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resources, topic, targetPlatform }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? data.data : null;
  } catch (err) {
    console.warn("[generateAgenticDossierSynthesis] Errore sintesi:", err);
    return null;
  }
}

/**
 * Exports multiple filtered resources into a single consolidated Google Doc (Compendium Digest).
 */
export async function exportCompendiumToGoogleDoc(
  token: string, 
  resources: ResourceItem[], 
  compendiumTitle: string = "Compendio Tecnico Knowledge Vault",
  targetFolderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID,
  targetFolderName: string = "Knowledge Vault",
  agenticDossier?: AgenticDossierData | null
): Promise<GoogleDocExportResult> {
  const fullTitle = `[Compendio Vault] ${compendiumTitle} (${resources.length} Risorse)`;

  // Step 1: Create Doc
  const createRes = await workspaceFetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: fullTitle })
  }, token);

  if (!createRes.ok) {
    throw new Error(`Errore creazione Compendio (${createRes.status}): ${await createRes.text()}`);
  }

  const doc = await createRes.json();
  const docId = doc.documentId;
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

  const dateStr = new Date().toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });

  // Optional Agentic Synthesis Header
  let agenticSection = "";
  if (agenticDossier) {
    agenticSection = `
┌─ SINTESI ESECUTIVA MULTI-AGENTE (CEKIKJ SYNTHESIS ORCHESTRATOR) ─────┐
│ Titolo Dossier: ${agenticDossier.dossierTitle}
│
│ SINTESI ANALITICA CROSS-RISORSA:
│ ${agenticDossier.executiveSynthesis}
│
│ SINERGIE & INSIGHT STRUTTURALI:
${agenticDossier.crossResourceInsights.map(ins => `│ • ${ins}`).join("\n")}
│
│ TEMI TOPOLOGICI & ARCHI NEL GRAFO:
${agenticDossier.topologicalThemes.map(t => `│ ► ${t.theme}: ${t.description}`).join("\n")}
│
│ QUESTIONI EPISTEMICHE APERTE:
${(agenticDossier.openEpistemicQuestions || []).map(q => `│ ? ${q}`).join("\n")}
└───────────────────────────────────────────────────────────────────────┘
\n\n`;
  }

  // Step 2: Build Table of Contents & Sections
  let toc = "INDICE ANALITICO DELLE RISORSE:\n";
  let contentSections = "";

  resources.forEach((r, idx) => {
    const num = idx + 1;
    toc += `${num}. [${r.type.toUpperCase()}] ${r.title} (Score: ${r.metadata?.score || "N/D"})\n`;

    contentSections += `\n\n═════════════════════════════════════════════════════════════════════\n`;
    contentSections += `SEZIONE ${num}: ${r.title.toUpperCase()}\n`;
    contentSections += `Tipo: ${r.type}   |   Dominio: ${r.metadata?.domain || "Informatica"}   |   URL: ${r.url || "N/D"}\n`;
    contentSections += `Tag: ${(r.tags || []).map(t => `#${t}`).join(" ") || "Nessun tag"}\n`;
    contentSections += `─────────────────────────────────────────────────────────────────────\n\n`;
    contentSections += `SOMMARIO ESECUTIVO:\n${r.summary || "Nessun sommario disponibile."}\n\n`;
    
    if (r.metadata?.aiKeyTakeaways && r.metadata.aiKeyTakeaways.length > 0) {
      contentSections += `PUNTI CHIAVE:\n${r.metadata.aiKeyTakeaways.map(k => `✓  ${k}`).join("\n")}\n\n`;
    }

    if (r.metadata?.markdownContent) {
      contentSections += `SPECIFICHE TECNICHE & DOCUMENTAZIONE:\n${r.metadata.markdownContent}\n`;
    }
  });

  const fullText = `${fullTitle}

KNOWLEDGE VAULT COMPENDIUM DIGEST
═════════════════════════════════════════════════════════════════════
Data di compilazione: ${dateStr}
Totale Schede Archiviate: ${resources.length}
Standard: OKF v0.2 (Open Knowledge Format)
Cartella Google Drive di Destinazione: ${targetFolderName}
═════════════════════════════════════════════════════════════════════
${agenticSection}
${toc}
${contentSections}

═════════════════════════════════════════════════════════════════════
Fine del compendio • Generato automaticamente con Google Docs API
`;

  // Step 3: Insert Text
  await workspaceFetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: 1 }, text: fullText } }]
    })
  }, token);

  // Step 4: Add to folder
  try {
    await workspaceFetch(
      `https://www.googleapis.com/drive/v3/files/${docId}?addParents=${targetFolderId}&fields=id,parents,webViewLink`, 
      { method: "PATCH" }, 
      token
    );
  } catch (e) {
    console.warn("[exportCompendiumToGoogleDoc] Spostamento cartella:", e);
  }

  return {
    docId,
    docUrl,
    title: fullTitle,
    folderId: targetFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${targetFolderId}?usp=sharing`
  };
}

/**
 * Searches for documents likely exported from or related to NotebookLM.
 */
export async function searchNotebookLMDocs(token: string): Promise<DriveFileInfo[]> {
  const keywords = [
    "Briefing Doc",
    "Study Guide",
    "Guida allo studio",
    "FAQ",
    "Panoramica audio",
    "Audio Overview",
    "NotebookLM",
    "Appunti di studio",
    "Dossier"
  ];
  
  const clauses = keywords.map(kw => `name contains '${kw.replace(/'/g, "")}'`).join(" or ");
  const query = `trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain') and (${clauses})`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size,owners)&orderBy=modifiedTime desc&pageSize=25`;

  try {
    const res = await workspaceFetch(url, {}, token);
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.warn("[searchNotebookLMDocs] Query error:", err);
    return [];
  }
}

/**
 * Exports resources into a high-density, structured Google Doc in the knowledge folder
 * optimized as a clean knowledge source for NotebookLM (Gemini).
 */
export async function exportNotebookLMSourceDoc(
  token: string,
  resources: ResourceItem[],
  targetFolderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID,
  customTitle?: string,
  targetFolderName: string = "Knowledge Vault",
  agenticDossier?: AgenticDossierData | null
): Promise<GoogleDocExportResult & { notebookLMUrl: string }> {
  const dateStr = new Date().toLocaleDateString("it-IT", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const fullTitle = customTitle?.trim() 
    ? customTitle.trim() 
    : `NotebookLM Source - Knowledge Vault Dossier (${resources.length} schede) - ${dateStr}`;

  // Step 1: Create Blank Google Doc
  const createRes = await workspaceFetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: fullTitle })
  }, token);

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Impossibile creare Google Doc per NotebookLM: ${err}`);
  }

  const createData = await createRes.json();
  const docId = createData.documentId;
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

  // Step 2: Build NotebookLM-Optimized Content
  let bodyText = `# ${fullTitle}\n\n`;
  bodyText += `> NOTA PER NOTEBOOKLM / GEMINI:\n`;
  bodyText += `> Questo documento costituisce una fonte di conoscenza strutturata esportata dal Knowledge Vault.\n`;
  bodyText += `> Formato: Open Knowledge Format (OKF v0.2).\n`;
  bodyText += `> Data di compilazione: ${dateStr} | Totale Risorse: ${resources.length}\n`;
  bodyText += `> Cartella Drive: ${targetFolderName}\n\n`;

  if (agenticDossier) {
    bodyText += `> 🧠 SINTESI ESECUTIVA MULTI-AGENTE (CEKIKJ SYNTHESIS ORCHESTRATOR):\n`;
    bodyText += `> ${agenticDossier.executiveSynthesis.replace(/\n/g, "\n> ")}\n>\n`;
    bodyText += `> INSIGHT CROSS-RISORSA & RELAZIONI TOPOLOGICHE:\n`;
    agenticDossier.crossResourceInsights.forEach(ins => {
      bodyText += `> • ${ins}\n`;
    });
    bodyText += `>\n`;
    if (agenticDossier.notebookLMRecommendations?.recommendedAudioFocus) {
      bodyText += `> GUIDA AUDIO OVERVIEW NOTEBOOKLM:\n`;
      bodyText += `> Focus consigliato: ${agenticDossier.notebookLMRecommendations.recommendedAudioFocus}\n`;
      if (agenticDossier.notebookLMRecommendations.suggestedPrompts?.length) {
        bodyText += `> Domande suggerite per l'indagine NotebookLM:\n`;
        agenticDossier.notebookLMRecommendations.suggestedPrompts.forEach(p => {
          bodyText += `> - "${p}"\n`;
        });
      }
      bodyText += `>\n`;
    }
  }

  bodyText += `---\n\n`;

  resources.forEach((r, idx) => {
    bodyText += `## [${idx + 1}] ${r.title}\n`;
    bodyText += `- **Tipo:** ${r.type}\n`;
    bodyText += `- **Dominio:** ${r.metadata?.domain || "Informatica / AI"}\n`;
    if (r.url) bodyText += `- **Riferimento URL:** ${r.url}\n`;
    if (r.tags && r.tags.length > 0) bodyText += `- **Tag Chiave:** ${r.tags.map(t => `#${t}`).join(", ")}\n`;
    bodyText += `\n### Sintesi Esecutiva\n${r.summary || "Nessuna sintesi disponibile."}\n\n`;

    if (r.metadata?.aiKeyTakeaways && r.metadata.aiKeyTakeaways.length > 0) {
      bodyText += `### Takeaways & Punti Salienti\n`;
      r.metadata.aiKeyTakeaways.forEach(k => {
        bodyText += `- ${k}\n`;
      });
      bodyText += `\n`;
    }

    if (r.metadata?.markdownContent) {
      bodyText += `### Approfondimento Tecnico & Documentazione\n${r.metadata.markdownContent}\n\n`;
    }

    if (r.metadata?.entities && r.metadata.entities.length > 0) {
      bodyText += `### Entità e Concetti Chiave\n`;
      r.metadata.entities.forEach((ent: any) => {
        bodyText += `- **${ent.name}** (${ent.type}): ${ent.description || ""}\n`;
      });
      bodyText += `\n`;
    }

    bodyText += `---\n\n`;
  });

  // Step 3: Insert Text
  await workspaceFetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: 1 }, text: bodyText } }]
    })
  }, token);

  // Step 4: Move to target folder
  try {
    await workspaceFetch(
      `https://www.googleapis.com/drive/v3/files/${docId}?addParents=${targetFolderId}&fields=id,parents,webViewLink`, 
      { method: "PATCH" }, 
      token
    );
  } catch (e) {
    console.warn("[exportNotebookLMSourceDoc] Spostamento cartella:", e);
  }

  return {
    docId,
    docUrl,
    title: fullTitle,
    folderId: targetFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${targetFolderId}?usp=sharing`,
    notebookLMUrl: "https://notebooklm.google.com"
  };
}
