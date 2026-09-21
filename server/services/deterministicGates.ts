import crypto from "crypto";

export interface PreFlightCheckResult {
  valid: boolean;
  fileFormat: "pdf" | "zip" | "audio" | "markdown" | "json" | "code" | "unknown";
  sha256: string;
  sizeBytes: number;
  detectedMime: string;
  extractedMetadata: {
    title?: string;
    author?: string;
    doi?: string;
    pageCount?: number;
    estimatedTokens?: number;
    isEncrypted?: boolean;
    hasTextLayer?: boolean;
  };
  rejectionReason?: string;
  isDuplicate?: boolean;
  duplicateResourceId?: string;
}

/**
 * Deterministic Pre-Flight Gate (0ms AI call):
 * Checks magic bytes, SHA-256 fingerprint, minimum content bounds,
 * and container metadata before sending any bytes to Gemini models.
 */
export function executePreFlightCheck(
  buffer: Buffer,
  declaredMime?: string,
  filename?: string,
  existingSha256List: Array<{ id: string; sha256: string }> = []
): PreFlightCheckResult {
  const sizeBytes = buffer.length;

  // 1. Min/Max size check (Hard bounds)
  if (sizeBytes === 0) {
    return {
      valid: false,
      fileFormat: "unknown",
      sha256: "",
      sizeBytes: 0,
      detectedMime: "application/octet-stream",
      extractedMetadata: {},
      rejectionReason: "Il file è vuoto (0 byte). Ingestione rifiutata per prevenire allucinazioni.",
    };
  }

  if (sizeBytes > 75 * 1024 * 1024) {
    return {
      valid: false,
      fileFormat: "unknown",
      sha256: "",
      sizeBytes,
      detectedMime: "application/octet-stream",
      extractedMetadata: {},
      rejectionReason: `Il file supera la dimensione massima di 75MB (${(sizeBytes / 1024 / 1024).toFixed(1)}MB).`,
    };
  }

  // 2. Compute deterministic SHA-256 fingerprint
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  // Deduplication check
  const duplicate = existingSha256List.find((item) => item.sha256 === sha256);
  if (duplicate) {
    return {
      valid: true,
      fileFormat: "unknown",
      sha256,
      sizeBytes,
      detectedMime: declaredMime || "application/octet-stream",
      extractedMetadata: {},
      isDuplicate: true,
      duplicateResourceId: duplicate.id,
      rejectionReason: `Risorsa identica (SHA-256: ${sha256.slice(0, 8)}...) già presente nel Vault con ID ${duplicate.id}.`,
    };
  }

  // 3. Inspect Magic Bytes
  const magicHeader4 = buffer.slice(0, 4);
  const magicHeader8 = buffer.slice(0, 8);
  const magicString = magicHeader8.toString("binary");

  let format: PreFlightCheckResult["fileFormat"] = "unknown";
  let detectedMime = declaredMime || "application/octet-stream";
  const metadata: PreFlightCheckResult["extractedMetadata"] = {};

  // PDF check: starts with '%PDF'
  if (magicHeader4.toString("ascii") === "%PDF") {
    format = "pdf";
    detectedMime = "application/pdf";
    inspectPdfContainer(buffer, metadata);
  }
  // ZIP / Office check: 'PK\x03\x04'
  else if (magicHeader4[0] === 0x50 && magicHeader4[1] === 0x4b && magicHeader4[2] === 0x03 && magicHeader4[3] === 0x04) {
    format = "zip";
    detectedMime = "application/zip";
  }
  // Audio check: ID3 tag or MP3 sync byte 0xFF, 0xFB
  else if (
    magicString.startsWith("ID3") ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) ||
    magicString.startsWith("RIFF") ||
    magicString.startsWith("OggS") ||
    magicString.includes("ftypM4A")
  ) {
    format = "audio";
    detectedMime = declaredMime || "audio/mpeg";
  }
  // JSON check: starts with '{' or '[' (ignoring whitespace)
  else {
    const textSample = buffer.slice(0, 2048).toString("utf8").trim();
    if ((textSample.startsWith("{") && textSample.endsWith("}")) || (textSample.startsWith("[") && textSample.endsWith("]"))) {
      try {
        JSON.parse(buffer.toString("utf8"));
        format = "json";
        detectedMime = "application/json";
      } catch {
        format = "code";
      }
    } else if (textSample.startsWith("---") || filename?.endsWith(".md") || filename?.endsWith(".markdown")) {
      format = "markdown";
      detectedMime = "text/markdown";
      metadata.estimatedTokens = Math.ceil(buffer.length / 4);
    } else if (isPlainCodeText(textSample, filename)) {
      format = "code";
      detectedMime = "text/plain";
    }
  }

  // Minimum content validation for documents
  if (format === "pdf" && metadata.isEncrypted) {
    return {
      valid: false,
      fileFormat: "pdf",
      sha256,
      sizeBytes,
      detectedMime,
      extractedMetadata: metadata,
      rejectionReason: "Il file PDF è cifrato o protetto da password. Impossibile eseguire l'analisi ontologica.",
    };
  }

  return {
    valid: true,
    fileFormat: format,
    sha256,
    sizeBytes,
    detectedMime,
    extractedMetadata: metadata,
  };
}

function inspectPdfContainer(buffer: Buffer, metadata: PreFlightCheckResult["extractedMetadata"]) {
  const rawString = buffer.toString("binary");

  // Page count estimation via /Type /Page regex
  const pageMatches = rawString.match(/\/Type\s*\/Page[^s]/g);
  if (pageMatches) {
    metadata.pageCount = pageMatches.length;
  }

  // Encryption check
  if (rawString.includes("/Encrypt")) {
    metadata.isEncrypted = true;
  }

  // Title extraction from /Title
  const titleMatch = rawString.match(/\/Title\s*\(([^)]+)\)/i);
  if (titleMatch && titleMatch[1]) {
    metadata.title = titleMatch[1].trim();
  }

  // Author extraction from /Author
  const authorMatch = rawString.match(/\/Author\s*\(([^)]+)\)/i);
  if (authorMatch && authorMatch[1]) {
    metadata.author = authorMatch[1].trim();
  }

  // DOI regex detection (e.g. 10.xxxx/yyyy)
  const textAscii = buffer.toString("latin1");
  const doiMatch = textAscii.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i);
  if (doiMatch && doiMatch[1]) {
    metadata.doi = doiMatch[1].trim();
  }
}

function isPlainCodeText(sample: string, filename?: string): boolean {
  if (filename && /\.(ts|tsx|js|jsx|py|rs|go|java|cpp|c|sh|yaml|yml|toml)$/i.test(filename)) {
    return true;
  }
  return false;
}
