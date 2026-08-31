import { ResourceItem } from "../types";
import { parseDate } from "./dateUtils";

/**
 * Normalizes a resource item for export into clean JSON or CSV format.
 * Converts Firestore Timestamps / dates to standard ISO strings.
 */
export function normalizeResourceForExport(resource: ResourceItem) {
  const createdDate = parseDate(resource.createdAt);
  const updatedDate = parseDate(resource.updatedAt);

  return {
    id: resource.id,
    type: resource.type,
    title: resource.title,
    summary: resource.summary || "",
    url: resource.url || "",
    tags: Array.isArray(resource.tags) ? resource.tags : [],
    isFavorite: !!resource.isFavorite,
    userId: resource.userId || null,
    createdAt: createdDate ? createdDate.toISOString() : new Date().toISOString(),
    updatedAt: updatedDate ? updatedDate.toISOString() : (createdDate ? createdDate.toISOString() : new Date().toISOString()),
    metadata: resource.metadata ? {
      okfVersion: resource.metadata.okfVersion || "0.2",
      domain: resource.metadata.domain || "",
      docType: resource.metadata.docType || "",
      stars: typeof resource.metadata.stars === "number" ? resource.metadata.stars : undefined,
      language: resource.metadata.language || "",
      protocol: resource.metadata.protocol,
      command: resource.metadata.command,
      toolsProvided: resource.metadata.toolsProvided,
      skillType: resource.metadata.skillType,
      author: resource.metadata.author,
      entities: Array.isArray(resource.metadata.entities) ? resource.metadata.entities : [],
      relations: Array.isArray(resource.metadata.relations) ? resource.metadata.relations : [],
      markdownContent: resource.metadata.markdownContent || "",
    } : undefined,
  };
}

/**
 * Triggers a browser download of a file with the specified content, MIME type and filename.
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports resources to formatted JSON backup with metadata envelope.
 */
export function exportResourcesToJSON(
  resources: ResourceItem[],
  filenamePrefix: string = "knowledge_vault_backup"
) {
  const normalized = resources.map(normalizeResourceForExport);
  const backupPayload = {
    vault_version: "0.2",
    exported_at: new Date().toISOString(),
    total_resources: resources.length,
    resources: normalized,
  };

  const jsonString = JSON.stringify(backupPayload, null, 2);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${timestamp}.json`;
  
  downloadFile(jsonString, filename, "application/json");
  return filename;
}

/**
 * Helper to escape CSV cell fields safely according to RFC 4180.
 */
function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  // If string contains double quotes, commas, newlines, wrap in quotes and escape quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Exports resources to CSV format with RFC 4180 escaping and UTF-8 BOM for Excel/Numbers compatibility.
 */
export function exportResourcesToCSV(
  resources: ResourceItem[],
  filenamePrefix: string = "knowledge_vault_backup"
) {
  const headers = [
    "ID",
    "Tipo",
    "Titolo",
    "Sommario",
    "URL",
    "Tags",
    "Preferito",
    "Versione OKF",
    "Dominio",
    "Tipo Documento",
    "Entità Principali",
    "Numero Relazioni",
    "Data Creazione",
    "Data Modifica"
  ];

  const rows = resources.map((r) => {
    const norm = normalizeResourceForExport(r);
    const entitiesList = norm.metadata?.entities
      ?.map((e) => (typeof e === "string" ? e : e?.name || ""))
      .filter(Boolean)
      .join("; ") || "";
    const relationsCount = norm.metadata?.relations?.length || 0;
    const tagsList = norm.tags.join("; ");

    return [
      escapeCSV(norm.id),
      escapeCSV(norm.type),
      escapeCSV(norm.title),
      escapeCSV(norm.summary),
      escapeCSV(norm.url),
      escapeCSV(tagsList),
      escapeCSV(norm.isFavorite ? "Sì" : "No"),
      escapeCSV(norm.metadata?.okfVersion || ""),
      escapeCSV(norm.metadata?.domain || ""),
      escapeCSV(norm.metadata?.docType || ""),
      escapeCSV(entitiesList),
      escapeCSV(relationsCount),
      escapeCSV(norm.createdAt),
      escapeCSV(norm.updatedAt),
    ].join(",");
  });

  // Include UTF-8 BOM (\uFEFF) so Microsoft Excel / Apple Numbers decode Italian characters / accents properly
  const csvContent = "\uFEFF" + [headers.map(escapeCSV).join(","), ...rows].join("\r\n");
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${timestamp}.csv`;

  downloadFile(csvContent, filename, "text/csv");
  return filename;
}
