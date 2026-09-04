import { auth, googleProvider, GoogleAuthProvider, signInWithPopup, getGoogleAccessToken, setGoogleAccessToken } from "./firebase";
import { ResourceItem, ResourceType } from "../types";

export const DEFAULT_KNOWLEDGE_FOLDER_ID = "151nJJammXivExYPlRG6AmrlWuHB104Jy";
export const DEFAULT_KNOWLEDGE_FOLDER_URL = "https://drive.google.com/drive/folders/151nJJammXivExYPlRG6AmrlWuHB104Jy?usp=sharing";
export const DEFAULT_KNOWLEDGE_FOLDER_NAME = "knowledge";

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
  size?: string;
  owners?: { displayName?: string; emailAddress?: string }[];
}

export interface GoogleDocExportResult {
  docId: string;
  docUrl: string;
  title: string;
  folderId: string;
  folderUrl: string;
}

/**
 * Ensures a valid OAuth access token is available. If not cached, prompts the user via Google Sign-In.
 */
export async function ensureGoogleAccessToken(forcePrompt = false): Promise<string> {
  const existingToken = getGoogleAccessToken();
  if (existingToken && !forcePrompt) {
    return existingToken;
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) {
      throw new Error("Impossibile ottenere il token di accesso Google Workspace.");
    }
    setGoogleAccessToken(token);
    return token;
  } catch (error: any) {
    console.error("[GoogleWorkspace] Errore autenticazione OAuth:", error);
    throw error;
  }
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

  return null;
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

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[listDriveFolderFiles] Errore Drive API (${res.status}):`, errText);
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
  searchTerm: string = ""
): Promise<DriveFileInfo[]> {
  let query = "trashed = false";
  if (searchTerm.trim()) {
    const safeTerm = searchTerm.replace(/'/g, "");
    query += ` and (name contains '${safeTerm}' or fullText contains '${safeTerm}')`;
  } else {
    query += " and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'text/markdown' or mimeType = 'application/pdf')";
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size,owners)&orderBy=modifiedTime desc&pageSize=30`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

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
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Impossibile leggere i metadati del file Drive (${res.status})`);
  }

  return await res.json();
}

/**
 * Extracts plain text content from a Google Doc or supported file on Google Drive.
 */
export async function readDriveDocContent(
  token: string, 
  fileId: string, 
  mimeType?: string
): Promise<{ text: string; name: string; webViewLink?: string }> {
  // 1. Get metadata if mimeType is not provided
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

  // 2. If it's a Google Doc, export as plain text or markdown
  if (targetMime === "application/vnd.google-apps.document" || !targetMime) {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    const exportRes = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (exportRes.ok) {
      const text = await exportRes.text();
      return { text, name: fileName, webViewLink };
    }
    
    // Fallback: Use Docs API directly
    const docsUrl = `https://docs.googleapis.com/v1/documents/${fileId}`;
    const docsRes = await fetch(docsUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

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

    return { text: extractedText.trim(), name: docData.title || fileName, webViewLink };
  }

  // 3. If it's a plain text, markdown, json, or csv file
  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const mediaRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!mediaRes.ok) {
    throw new Error(`Errore download contenuto file (${mediaRes.status})`);
  }

  const text = await mediaRes.text();
  return { text, name: fileName, webViewLink };
}

/**
 * Creates a professionally formatted Google Doc in Google Drive for a single Vault resource.
 */
export async function exportResourceToGoogleDoc(
  token: string, 
  resource: ResourceItem, 
  targetFolderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID
): Promise<GoogleDocExportResult> {
  const docTitle = `[Knowledge Vault] ${resource.title}`;

  // Step 1: Create empty Google Doc
  const createRes = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title: docTitle })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Errore creazione Google Doc (${createRes.status}): ${errText}`);
  }

  const doc = await createRes.json();
  const docId = doc.documentId;
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

  // Step 2: Build structured content text
  const dateStr = new Date().toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });
  const typeLabel = resource.type.toUpperCase().replace("_", " ");
  const domain = resource.metadata?.domain || "Informatica & AI";
  const tagsStr = (resource.tags || []).map(t => `#${t}`).join(" ");
  
  // Format entities and relations if present
  let entitiesSection = "";
  if (resource.metadata?.entities && resource.metadata.entities.length > 0) {
    entitiesSection = "\n\nENTITÀ CHIAVE & TECNOLOGIE:\n" + resource.metadata.entities.map(e => {
      if (typeof e === "string") return `• ${e}`;
      return `• ${e.name} (${e.type})${e.description ? `: ${e.description}` : ""}`;
    }).join("\n");
  }

  let relationsSection = "";
  if (resource.metadata?.relations && resource.metadata.relations.length > 0) {
    relationsSection = "\n\nRELAZIONI TOPOLOGICHE:\n" + resource.metadata.relations.map(r => {
      return `• [${r.relationType || "relates_to"}] ➔ ${r.targetTitle || r.target || "Entità correlata"}${r.description ? ` (${r.description})` : ""}`;
    }).join("\n");
  }

  let takeawaysSection = "";
  if (resource.metadata?.aiKeyTakeaways && resource.metadata.aiKeyTakeaways.length > 0) {
    takeawaysSection = "\n\nPUNTI CHIAVE (EXECUTIVE TAKEAWAYS):\n" + resource.metadata.aiKeyTakeaways.map(k => `✓ ${k}`).join("\n");
  } else if (resource.metadata?.keyTakeaways && resource.metadata.keyTakeaways.length > 0) {
    takeawaysSection = "\n\nPUNTI CHIAVE:\n" + resource.metadata.keyTakeaways.map(k => `✓ ${k}`).join("\n");
  }

  const bodyText = `${resource.title}
═══════════════════════════════════════════════════════════════════
KNOWLEDGE VAULT TECHNICAL SPECIFICATION
Tipo: ${typeLabel} | Dominio: ${domain} | Standard: OKF v0.2
Esportato il: ${dateStr}
Tag: ${tagsStr || "Nessun tag"}
URL Originale: ${resource.url || "N/A"}
═══════════════════════════════════════════════════════════════════

--- FRONTMATTER OKF v0.2 ---
title: "${resource.title}"
type: ${resource.type}
domain: "${domain}"
status: "${resource.metadata?.status || "stable"}"
score: ${resource.metadata?.score || "N/A"}/100
tags: [${(resource.tags || []).map(t => `"${t}"`).join(", ")}]
-----------------------------

SOMMARIO ESECUTIVO:
${resource.summary || "Nessun sommario disponibile."}${takeawaysSection}${entitiesSection}${relationsSection}

DOCUMENTAZIONE COMPLETA & NOTE TECNICHE:
${resource.metadata?.markdownContent || resource.rawInput || "Nessun contenuto markdown aggiuntivo inserito."}

═══════════════════════════════════════════════════════════════════
Documento generato automaticamente da Knowledge Vault • Google Drive & Docs Integration
Cartella di destinazione: ${DEFAULT_KNOWLEDGE_FOLDER_NAME} (${targetFolderId})
`;

  // Step 3: Insert formatted text into the document
  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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
  });

  if (!updateRes.ok) {
    console.warn("[exportResourceToGoogleDoc] BatchUpdate parziale:", await updateRes.text());
  }

  // Step 4: Move the document into the Knowledge folder
  try {
    const moveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${docId}?addParents=${targetFolderId}&fields=id,parents,webViewLink`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!moveRes.ok) {
      console.warn("[exportResourceToGoogleDoc] Spostamento nella cartella target fallito (permessi cartella condivisa o root):", await moveRes.text());
    }
  } catch (moveErr) {
    console.warn("[exportResourceToGoogleDoc] Avviso spostamento cartella:", moveErr);
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
 * Exports multiple filtered resources into a single consolidated Google Doc (Compendium Digest).
 */
export async function exportCompendiumToGoogleDoc(
  token: string, 
  resources: ResourceItem[], 
  compendiumTitle: string = "Compendio Tecnico Knowledge Vault",
  targetFolderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID
): Promise<GoogleDocExportResult> {
  const fullTitle = `[Compendio Vault] ${compendiumTitle} (${resources.length} Risorse)`;

  // Step 1: Create Doc
  const createRes = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title: fullTitle })
  });

  if (!createRes.ok) {
    throw new Error(`Errore creazione Compendio (${createRes.status}): ${await createRes.text()}`);
  }

  const doc = await createRes.json();
  const docId = doc.documentId;
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

  const dateStr = new Date().toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });

  // Step 2: Build Table of Contents & Resource Sections
  let toc = "INDICE DELLE RISORSE:\n";
  let contentSections = "";

  resources.forEach((r, idx) => {
    const num = idx + 1;
    toc += `${num}. [${r.type.toUpperCase()}] ${r.title} (Score: ${r.metadata?.score || "N/A"})\n`;

    contentSections += `\n\n═══════════════════════════════════════════════════════════════════\n`;
    contentSections += `SEZIONE ${num}: ${r.title.toUpperCase()}\n`;
    contentSections += `Tipo: ${r.type} | Dominio: ${r.metadata?.domain || "N/A"} | URL: ${r.url || "N/A"}\n`;
    contentSections += `Tag: ${(r.tags || []).map(t => `#${t}`).join(" ") || "N/A"}\n`;
    contentSections += `───────────────────────────────────────────────────────────────────\n\n`;
    contentSections += `SOMMARIO:\n${r.summary || "Nessun sommario disponibile."}\n\n`;
    
    if (r.metadata?.markdownContent) {
      contentSections += `CONTENUTO TECNICO & SPECIFICHE:\n${r.metadata.markdownContent}\n`;
    }
  });

  const fullText = `${fullTitle}
═══════════════════════════════════════════════════════════════════
KNOWLEDGE VAULT COMPENDIUM DIGEST
Data di generazione: ${dateStr}
Totale Risorse Archiviate: ${resources.length}
Standard: OKF v0.2 (Open Knowledge Format)
Cartella Google Drive: ${DEFAULT_KNOWLEDGE_FOLDER_NAME}
═══════════════════════════════════════════════════════════════════

${toc}
${contentSections}

═══════════════════════════════════════════════════════════════════
Fine del compendio • Generato automaticamente con Google Docs API
`;

  // Step 3: Batch Update text
  await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: 1 }, text: fullText } }]
    })
  });

  // Step 4: Add to folder
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${docId}?addParents=${targetFolderId}&fields=id,parents,webViewLink`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });
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
 * Matches keywords like "Briefing Doc", "Study Guide", "Guida allo studio", "FAQ", "Panoramica audio", "NotebookLM".
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

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn("[searchNotebookLMDocs] Query error:", errText);
    return [];
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Exports resources into a high-density, structured Google Doc in the knowledge folder
 * optimized as a clean knowledge source for NotebookLM (Gemini).
 */
export async function exportNotebookLMSourceDoc(
  token: string,
  resources: ResourceItem[],
  targetFolderId: string = DEFAULT_KNOWLEDGE_FOLDER_ID,
  customTitle?: string
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
  const createRes = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title: fullTitle })
  });

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
  bodyText += `> Data di compilazione: ${dateStr} | Totale Risorse: ${resources.length}\n\n`;
  bodyText += `---\n\n`;

  resources.forEach((r, idx) => {
    bodyText += `## [${idx + 1}] ${r.title}\n`;
    bodyText += `- **Tipo:** ${r.type}\n`;
    bodyText += `- **Dominio:** ${r.metadata?.domain || "Informatica / AI"}\n`;
    if (r.url) bodyText += `- **Riferimento URL:** ${r.url}\n`;
    if (r.tags && r.tags.length > 0) bodyText += `- **Tag Chiave:** ${r.tags.map(t => `#${t}`).join(", ")}\n`;
    bodyText += `\n### Sintesi Esecutiva\n${r.summary || "Nessuna sintesi disponibile."}\n\n`;

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
  await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: 1 }, text: bodyText } }]
    })
  });

  // Step 4: Move to target folder
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${docId}?addParents=${targetFolderId}&fields=id,parents,webViewLink`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });
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
