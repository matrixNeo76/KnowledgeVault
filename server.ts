import express from "express";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Helper to safely parse PDF buffer without crashing or emitting false errors
async function extractTextFromPdfBuffer(pdfBuffer: Buffer): Promise<string> {
  try {
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 10) return "";
    
    // Validate standard %PDF- magic signature (0x25, 0x50, 0x44, 0x46)
    const magic = pdfBuffer.subarray(0, 5).toString("latin1");
    if (!magic.startsWith("%PDF")) {
      return "";
    }

    const pdfModule = await import("pdf-parse");
    if (pdfModule.PDFParse) {
      const parser = new pdfModule.PDFParse({ data: pdfBuffer, verbosity: 0 });
      const res = await parser.getText();
      try { await parser.destroy(); } catch {}
      if (typeof res === "string") return res;
      if (res && typeof (res as any).text === "string") return (res as any).text;
      return "";
    } else if (typeof (pdfModule as any).default === "function") {
      const parsed = await (pdfModule as any).default(pdfBuffer);
      return parsed?.text || "";
    }
  } catch {
    // Non-fatal: if PDF binary is encrypted or non-standard, fallback to Gemini inline multimodal or raw text
  }
  return "";
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ limit: "60mb", extended: true }));

// Helper to get GoogleGenAI client lazily
let genAIClient: GoogleGenAI | null = null;
function getGenAI() {
  if (!genAIClient && process.env.GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAIClient;
}

export interface OpenGraphData {
  url: string;
  domain: string;
  siteName?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  favicon?: string;
  author?: string;
}

// Extract Open Graph tags, meta description and favicon from raw HTML
function extractOpenGraphFromHtml(html: string, targetUrl: string): OpenGraphData {
  let domain = "";
  let origin = "";
  try {
    const parsed = new URL(targetUrl);
    domain = parsed.hostname.replace(/^www\./, "");
    origin = parsed.origin;
  } catch {
    domain = "web";
  }

  // Fallback Google Favicon Service
  let favicon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined;

  let ogTitle = "";
  let ogDescription = "";
  let ogImage = "";
  let siteName = "";
  let author = "";

  const decodeEntities = (str: string) => {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Helper regex matcher for meta tags
  const getMeta = (propName: string) => {
    const regex = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${propName}["'][^>]*content=["']([^"']+)["']`, "i");
    const match = html.match(regex);
    if (match && match[1]) return decodeEntities(match[1]);
    
    const regexRev = new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${propName}["']`, "i");
    const matchRev = html.match(regexRev);
    return matchRev && matchRev[1] ? decodeEntities(matchRev[1]) : "";
  };

  ogTitle = getMeta("og:title") || getMeta("twitter:title");
  if (!ogTitle) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) ogTitle = decodeEntities(titleMatch[1]);
  }

  ogDescription = getMeta("og:description") || getMeta("twitter:description") || getMeta("description");
  ogImage = getMeta("og:image") || getMeta("twitter:image") || getMeta("twitter:image:src");
  siteName = getMeta("og:site_name") || getMeta("application-name");
  author = getMeta("author") || getMeta("article:author") || getMeta("twitter:creator");

  // If ogImage is relative, resolve it
  if (ogImage && !ogImage.startsWith("http") && origin) {
    try {
      ogImage = new URL(ogImage, origin).toString();
    } catch {}
  }

  // Favicon extraction from link tags
  const iconMatch = html.match(/<link\s+[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i) ||
                    html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i);
  if (iconMatch && iconMatch[1]) {
    let iconHref = iconMatch[1].trim();
    if (!iconHref.startsWith("http") && origin) {
      try {
        iconHref = new URL(iconHref, origin).toString();
      } catch {}
    }
    if (iconHref.startsWith("http")) {
      favicon = iconHref;
    }
  }

  return {
    url: targetUrl,
    domain,
    siteName: siteName || domain || "Web",
    ogTitle: ogTitle || undefined,
    ogDescription: ogDescription || undefined,
    ogImage: ogImage || undefined,
    favicon: favicon || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined),
    author: author || undefined,
  };
}

// Resilient server-side URL fetcher for Open Graph & full article extraction
async function fetchArticleTextFromUrl(rawUrl: string, timeoutMs = 6000): Promise<{ title?: string; text: string; markdown: string }> {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (compatible; KnowledgeVaultReader/2.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { text: "", markdown: "" };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml") && !contentType.includes("text/plain")) {
      return { text: "", markdown: "" };
    }

    const rawHtml = await response.text();
    
    // Extract title
    let title = "";
    const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(/\s+/g, " ").trim();
    }

    // Isolate the main readable content
    let contentHtml = rawHtml;
    
    // Remove script, style, noscript, svg, nav, footer, header, form tags
    contentHtml = contentHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
    contentHtml = contentHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
    contentHtml = contentHtml.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");
    contentHtml = contentHtml.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ");
    contentHtml = contentHtml.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ");
    contentHtml = contentHtml.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ");
    contentHtml = contentHtml.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ");
    contentHtml = contentHtml.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ");
    contentHtml = contentHtml.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, " ");

    // Look for <article>, <main>, or [role="main"] if present
    const articleMatch = contentHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = contentHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    
    let targetSection = articleMatch ? articleMatch[1] : (mainMatch ? mainMatch[1] : contentHtml);

    // Convert common HTML blocks to Markdown-like structure
    let formattedText = targetSection
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n")
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n")
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n")
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
      .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n")
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "\n> $1\n")
      .replace(/<br\s*[\/]?>/gi, "\n")
      .replace(/<hr\s*[\/]?>/gi, "\n---\n")
      .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

    // Strip remaining HTML tags
    formattedText = formattedText.replace(/<[^>]+>/g, " ");

    // Decode HTML entities
    formattedText = formattedText
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\r\n/g, "\n");

    // Normalize spacing and consecutive blank lines
    formattedText = formattedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line, index, arr) => line.length > 0 || (index > 0 && arr[index - 1].length > 0))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return {
      title,
      text: formattedText,
      markdown: formattedText,
    };
  } catch (err: any) {
    return { text: "", markdown: "" };
  }
}

// Resilient server-side URL fetcher for Open Graph extraction
async function fetchOpenGraphMetadata(rawUrl: string, timeoutMs = 4500): Promise<OpenGraphData> {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = `https://${targetUrl}`;
  }

  let domain = "";
  try {
    const parsed = new URL(targetUrl);
    domain = parsed.hostname.replace(/^www\./, "");
  } catch {
    domain = "web";
  }

  const defaultResult: OpenGraphData = {
    url: targetUrl,
    domain,
    siteName: domain,
    favicon: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (compatible; KnowledgeVault/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return defaultResult;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
      return defaultResult;
    }

    const buffer = await response.text();
    const htmlSlice = buffer.slice(0, 300000);
    return extractOpenGraphFromHtml(htmlSlice, targetUrl);
  } catch (err: any) {
    return defaultResult;
  }
}

// Fallback heuristic parser if Gemini API is unavailable or busy
function fallbackParse(rawText: string, explicitType?: string) {
  const text = rawText.trim();
  let type: "troubleshooting" | "article" | "github_repo" | "mcp_server" | "ai_skill" | "knowledge" | "link" = (explicitType as any) || "knowledge";
  let title = "Nuova Risorsa";
  let summary = "";
  let tags: string[] = [];
  let url = "";
  const metadata: Record<string, any> = {};

  // Check if input is a Troubleshooting / Error log report
  const isTroubleshoot = explicitType === "troubleshooting" || 
    (text.toLowerCase().includes("problema") && (text.toLowerCase().includes("soluzione") || text.toLowerCase().includes("risoluzione"))) ||
    (text.toLowerCase().includes("root cause") || text.toLowerCase().includes("causa:")) ||
    (text.toLowerCase().includes("errore") && text.toLowerCase().includes(".dll")) ||
    text.toLowerCase().includes("smart app control");

  if (isTroubleshoot) {
    type = "troubleshooting";
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    title = lines[0]?.replace(/^[#*-]+\s*/, "").slice(0, 100) || "Risoluzione Errore Tecnico";
    summary = lines.slice(1, 4).join(" ").slice(0, 300) || title;
    tags.push("troubleshooting", "bugfix", "diagnostica");

    if (text.toLowerCase().includes("windows")) tags.push("windows");
    if (text.toLowerCase().includes("primus") || text.toLowerCase().includes("acca")) tags.push("acca", "primus");
    if (text.toLowerCase().includes("dll")) tags.push("dll");

    metadata.affectedSystem = text.match(/(?:sistema|software|programma|applicativo)[:\s]+([^\n]+)/i)?.[1]?.trim() || "Sistema Operativo / Software";
    metadata.rootCause = text.match(/(?:causa|root cause|motivo)[:\s]+([^\n]+)/i)?.[1]?.trim() || "Blocco sicurezza / Conflitto librerie";
    
    // Extract solution steps
    const steps = text.split("\n")
      .filter(l => /^\d+\.|\bpasso\b|\bstep\b/i.test(l.trim()))
      .map(l => l.trim().replace(/^\d+\.\s*/, ""));
    if (steps.length > 0) {
      metadata.solutionSteps = steps;
    }
  } else {

  // Check URL pattern
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    url = urlMatch[0];
  } else if (text.includes("github.com/")) {
    const ghMatch = text.match(/github\.com\/[^\s]+/i);
    if (ghMatch) url = `https://${ghMatch[0]}`;
  }

  // GitHub URL or Owner/Repo pattern check
  const ghRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/i;
  const matchGh = (url || text).match(ghRegex);

  if (matchGh) {
    const owner = matchGh[1];
    const repoName = matchGh[2].replace(/\.git$/, "").replace(/[#?].*$/, "");
    url = `https://github.com/${owner}/${repoName}`;
    title = `${owner}/${repoName}`;

    // Respect explicitType if user specified one
    if (explicitType === "mcp_server" || (!explicitType && (text.toLowerCase().includes("mcp-server") || text.toLowerCase().includes("model context protocol")) && !text.toLowerCase().includes("not mcp"))) {
      type = "mcp_server";
      tags.push("mcp", "model-context-protocol", "server", repoName.toLowerCase());
      metadata.protocol = "stdio";
      metadata.command = `npx -y @modelcontextprotocol/server-${repoName}`;
      metadata.configSnippet = JSON.stringify({
        mcpServers: {
          [repoName]: {
            command: "npx",
            args: ["-y", `@modelcontextprotocol/server-${repoName}`]
          }
        }
      }, null, 2);
    } else if (explicitType === "knowledge") {
      type = "knowledge";
      tags.push("knowledge", "github", "repo", repoName.toLowerCase());
    } else {
      type = "github_repo";
      tags.push("github", "open-source", "repository", repoName.toLowerCase(), owner.toLowerCase());
      metadata.owner = owner;
      metadata.repoName = repoName;
      metadata.installCommand = `git clone https://github.com/${owner}/${repoName}.git`;
    }
    summary = `Repository GitHub ${owner}/${repoName}. Codice sorgente e documentazione open-source.`;
  } else if (explicitType === "link" || (!explicitType && url && (text.startsWith("http") || text.includes("link:") || text.includes("tool:") || text.includes("web:")))) {
    type = "link";
    tags.push("link", "web", "tool");
    if (url) {
      try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname.replace(/^www\./, "");
        title = domain;
        metadata.domain = domain;
        metadata.siteName = domain;
        metadata.favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        tags.push(domain.split(".")[0]);
      } catch {}
    }
    summary = text.replace(url, "").trim() || `Collegamento web a ${url || title}`;
  } else if (text.includes("mcpServers") || text.includes("claude_desktop_config") || text.toLowerCase().startsWith("mcp:")) {
    type = "mcp_server";
    title = "MCP Server Config";
    summary = "Configurazione server Model Context Protocol";
    tags.push("mcp", "tools", "protocol");
    metadata.protocol = "stdio";
  } else if (text.toLowerCase().includes("system prompt") || text.toLowerCase().includes("you are a") || text.toLowerCase().includes("skill definition") || text.toLowerCase().startsWith("skill:")) {
    type = "ai_skill";
    title = "AI Skill Definition";
    summary = text.slice(0, 180) + "...";
    tags.push("prompt", "ai-skill", "system-instruction");
    metadata.systemPrompt = text;
    metadata.recommendedModel = "gemini-3.7-flash";
  } else if (text.startsWith("---") || text.includes("okf_version") || text.includes("# ") || text.length > 300 || explicitType === "knowledge") {
    type = "knowledge";
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    
    // Extract first bold item or heading as title
    let extractedTitle = "";
    const boldMatch = text.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      extractedTitle = boldMatch[1].trim();
    } else if (lines.length > 0) {
      extractedTitle = lines[0].replace(/^#+\s*/, "").replace(/^\*\*|\*\*$/g, "").trim();
    }
    title = extractedTitle.slice(0, 100) || "Documento Knowledge";

    // Summary
    const cleanParagraph = text.replace(/^[#*-]+\s*/gm, "").replace(/\*\*/g, "").trim();
    summary = cleanParagraph;

    // Extract tags from keywords in text
    tags.push("knowledge", "okf-v0.2");
    if (text.toLowerCase().includes("claude")) tags.push("claude", "anthropic");
    if (text.toLowerCase().includes("mcp")) tags.push("mcp");
    if (text.toLowerCase().includes("cli") || text.toLowerCase().includes("terminale")) tags.push("cli");
    if (text.toLowerCase().includes("git")) tags.push("git");
    if (text.toLowerCase().includes("agent") || text.toLowerCase().includes("agentico")) tags.push("agentic-ai");
    if (text.toLowerCase().includes("test") || text.toLowerCase().includes("pytest")) tags.push("testing");

    // Extract entities from bold texts or markdown headers
    const extractedEntities: { name: string; type: string; description: string }[] = [];
    extractedEntities.push({ name: title, type: "concept", description: summary.slice(0, 100) });
    
    const boldItems = Array.from(text.matchAll(/\*\*([^*]+)\*\*/g))
      .map(m => m[1].trim())
      .filter(name => name.length > 2 && name.length < 40 && name !== title)
      .slice(0, 5);

    boldItems.forEach(item => {
      extractedEntities.push({ name: item, type: "feature", description: `Elemento chiave in ${title}` });
    });

    metadata.okfVersion = "0.2";
    metadata.domain = text.toLowerCase().includes("claude") || text.toLowerCase().includes("agent") ? "Agentic Systems & AI" : "Software Architecture";
    metadata.docType = "specification";
    metadata.markdownContent = text.startsWith("---")
      ? text
      : `---\nokf_version: "0.2"\ntitle: "${title}"\ntype: "${metadata.docType}"\ndomain: "${metadata.domain}"\ntags: ${JSON.stringify(Array.from(new Set(tags)))}\ncreated_at: "${new Date().toISOString()}"\n---\n\n# ${title}\n\n${text}`;
    metadata.entities = extractedEntities;
    metadata.relations = [
      { targetTitle: "Knowledge Vault", relationType: "references", weight: 0.8 }
    ];
  } else {
    // Article or general note or link
    type = (explicitType as any) || (url ? "link" : "article");
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    if (lines.length > 0) {
      title = lines[0].replace(/^#+\s*/, "").slice(0, 100);
      summary = lines.slice(1).join("\n\n").trim() || lines[0];
    }
    tags.push("knowledge", "dev");

    if (url) {
      try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname.replace(/^www\./, "");
        metadata.domain = domain;
        metadata.siteName = domain;
        metadata.favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
      } catch {}
    }
  }
}

  if (explicitType && ["troubleshooting", "article", "github_repo", "mcp_server", "ai_skill", "knowledge", "link"].includes(explicitType)) {
    type = explicitType as any;
  }

  // Universal OKF v0.2 Metadata Guarantee for all resource types
  metadata.okfVersion = "0.2";
  if (!metadata.docType) {
    metadata.docType = type === "github_repo" ? "architecture"
      : type === "mcp_server" ? "tool_description"
      : type === "ai_skill" ? "prompt_skill"
      : type === "troubleshooting" ? "specification"
      : type === "article" || type === "link" ? "guide"
      : "concept";
  }

  if (!metadata.domain || metadata.domain === "general") {
    metadata.domain = text.toLowerCase().includes("claude") || text.toLowerCase().includes("agent") || text.toLowerCase().includes("mcp")
      ? "Agentic Systems & AI"
      : text.toLowerCase().includes("cloud") || text.toLowerCase().includes("docker") || text.toLowerCase().includes("deploy")
      ? "DevOps & Cloud"
      : type === "troubleshooting"
      ? "System Diagnostics & Fix"
      : "Software Architecture";
  }

  if (!metadata.entities || metadata.entities.length === 0) {
    metadata.entities = [
      { name: title, type: "concept", description: summary.slice(0, 100) || "Elemento centrale" },
      { name: metadata.domain, type: "domain", description: "Dominio di appartenenza" },
    ];
    if (metadata.owner && metadata.repoName) {
      metadata.entities.push({ name: metadata.repoName, type: "software", description: `Repository GitHub ${metadata.owner}/${metadata.repoName}` });
    }
    tags.slice(0, 3).forEach((t) => {
      if (t.length > 2 && t !== "dev" && t !== "knowledge") {
        metadata.entities.push({ name: t.charAt(0).toUpperCase() + t.slice(1), type: "technology", description: `Tag ontologico: ${t}` });
      }
    });
  }

  if (!metadata.relations || metadata.relations.length === 0) {
    metadata.relations = [
      { targetTitle: "Knowledge Vault", relationType: "references", weight: 0.85, description: "Archiviazione e integrazione topologica nel Vault" }
    ];
  }

  if (!metadata.markdownContent) {
    const cleanTags = Array.from(new Set(tags.length > 0 ? tags : [type, "okf-v0.2"]));
    metadata.markdownContent = `---\nokf_version: "0.2"\ntitle: "${title}"\ntype: "${metadata.docType}"\ndomain: "${metadata.domain}"\ntags: ${JSON.stringify(cleanTags)}\ncreated_at: "${new Date().toISOString()}"\n---\n\n# ${title}\n\n> **${metadata.docType?.toUpperCase()} · OKF v0.2**\n> Ambito: ${metadata.domain}\n\n${summary || text}\n\n${url ? `\n\n**Riferimento Web:** [${url}](${url})\n` : ""}`;
  }

  return {
    type,
    title,
    url,
    summary: summary || text,
    tags: Array.from(new Set(tags)),
    metadata,
  };
}

// ----------------------------------------------------------------------
// Server-Side Telemetry Tracker for Gemini AI Quota & Operations
// ----------------------------------------------------------------------
export interface GeminiCallRecord {
  id: string;
  timestamp: string;
  endpoint: string;
  model: string;
  latencyMs: number;
  status: "success" | "quota_exceeded" | "unavailable" | "timeout" | "error";
  statusCode: number;
  promptTokens?: number;
  candidatesTokens?: number;
  errorMessage?: string;
}

const geminiCallHistory: GeminiCallRecord[] = [];
const modelUsageCounts: Record<string, number> = {
  "gemini-3.7-flash": 0,
  "gemini-flash-latest": 0,
  "gemini-3.1-flash-lite": 0,
};
let quota429Count = 0;
let error503Count = 0;
let lastResetDateUtc = new Date().toISOString().slice(0, 10);
let dailyRequestsCount = 0;

interface RollingEntry {
  timestamp: number;
  tokens: number;
}
const rollingMinuteRequests: RollingEntry[] = [];

function recordGeminiCall(record: Omit<GeminiCallRecord, "id" | "timestamp">) {
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  if (todayUtc !== lastResetDateUtc) {
    lastResetDateUtc = todayUtc;
    dailyRequestsCount = 0;
    quota429Count = 0;
    error503Count = 0;
  }

  dailyRequestsCount++;
  if (record.model) {
    modelUsageCounts[record.model] = (modelUsageCounts[record.model] || 0) + 1;
  }

  if (record.status === "quota_exceeded") {
    quota429Count++;
  } else if (record.status === "unavailable") {
    error503Count++;
  }

  const nowMs = Date.now();
  const totalTokens = (record.promptTokens || 0) + (record.candidatesTokens || 0);
  rollingMinuteRequests.push({ timestamp: nowMs, tokens: totalTokens });

  // purge older than 60s
  while (rollingMinuteRequests.length > 0 && nowMs - rollingMinuteRequests[0].timestamp > 60000) {
    rollingMinuteRequests.shift();
  }

  const fullRecord: GeminiCallRecord = {
    id: `gem-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now.toISOString(),
    ...record,
  };

  geminiCallHistory.unshift(fullRecord);
  if (geminiCallHistory.length > 100) {
    geminiCallHistory.pop();
  }
}

// Resilient Gemini Generator with valid candidate models and reliable timeout
async function generateWithGeminiFallback(prompt: string, schema: any, timeoutMs = 6000, endpoint = "/api/analyze-resource") {
  const ai = getGenAI();
  if (!ai) return null;

  // Use current supported models per guidelines (gemini-3.7-flash, gemini-flash-latest, gemini-3.1-flash-lite)
  const candidateModels = [
    "gemini-3.7-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
  ];

  for (const modelName of candidateModels) {
    const callStart = Date.now();
    try {
      const config: any = {
        responseMimeType: "application/json",
        responseSchema: schema,
      };

      // Optimize thinking latency for fast JSON structured response
      if (modelName.startsWith("gemini-3")) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      if (response && response.text) {
        const latencyMs = Date.now() - callStart;
        recordGeminiCall({
          endpoint,
          model: modelName,
          latencyMs,
          status: "success",
          statusCode: 200,
          promptTokens: response?.usageMetadata?.promptTokenCount || 0,
          candidatesTokens: response?.usageMetadata?.candidatesTokenCount || 0,
        });
        return { text: response.text, modelUsed: modelName };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - callStart;
      const isQuota = err?.status === "RESOURCE_EXHAUSTED" || err?.message?.includes("quota") || err?.message?.includes("429");
      const isUnavailable = err?.status === "UNAVAILABLE" || err?.code === 503 || err?.message?.includes("503") || err?.message?.includes("high demand");
      
      recordGeminiCall({
        endpoint,
        model: modelName,
        latencyMs,
        status: isQuota ? "quota_exceeded" : isUnavailable ? "unavailable" : "error",
        statusCode: isQuota ? 429 : isUnavailable ? 503 : 500,
        errorMessage: err?.message || "Generation error",
      });

      if (isQuota) {
        console.warn(`[Gemini] ${modelName} quota limit reached (429 RESOURCE_EXHAUSTED), attempting next model...`);
      } else if (isUnavailable) {
        console.warn(`[Gemini] ${modelName} temporarily busy (503 high demand), attempting next model...`);
      } else {
        console.warn(`[Gemini] ${modelName} generation issue: ${err?.message || "unknown"}`);
      }
    }
  }

  // Gracefully return null so callers seamlessly use local rule-based heuristics
  return null;
}

// Resilient Multimodal Gemini Generator (supporting base64 PDFs, Images, Text payloads)
async function generateMultimodalWithGeminiFallback(
  contents: any,
  schema: any,
  timeoutMs = 45000,
  endpoint = "/api/convert-file-to-okf"
) {
  const ai = getGenAI();
  if (!ai) return null;

  const candidateModels = [
    "gemini-3.7-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
  ];

  for (const modelName of candidateModels) {
    const callStart = Date.now();
    try {
      const config: any = {
        responseMimeType: "application/json",
        responseSchema: schema,
      };

      if (modelName === "gemini-3.7-flash") {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents,
        config,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      if (response && response.text) {
        const latencyMs = Date.now() - callStart;
        recordGeminiCall({
          endpoint,
          model: modelName,
          latencyMs,
          status: "success",
          statusCode: 200,
          promptTokens: response?.usageMetadata?.promptTokenCount || 0,
          candidatesTokens: response?.usageMetadata?.candidatesTokenCount || 0,
        });
        return { text: response.text, modelUsed: modelName };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - callStart;
      const isQuota = err?.status === "RESOURCE_EXHAUSTED" || err?.message?.includes("quota") || err?.message?.includes("429");
      const isUnavailable = err?.status === "UNAVAILABLE" || err?.code === 503 || err?.message?.includes("503");
      
      recordGeminiCall({
        endpoint,
        model: modelName,
        latencyMs,
        status: isQuota ? "quota_exceeded" : isUnavailable ? "unavailable" : "error",
        statusCode: isQuota ? 429 : isUnavailable ? 503 : 500,
        errorMessage: err?.message || "Multimodal error",
      });

      if (isQuota) {
        console.warn(`[Gemini Multimodal] ${modelName} quota limit reached (429), attempting fallback...`);
      } else if (isUnavailable) {
        console.warn(`[Gemini Multimodal] ${modelName} service busy (503), attempting fallback...`);
      } else {
        console.warn(`[Gemini Multimodal] ${modelName} attempt error:`, err?.message || "error");
      }
    }
  }

  return null;
}

// Helper to transcribe audio using gemini-3.5-transcribe with multi-model fallback
async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string,
  fileName: string,
  timeoutMs = 50000
): Promise<string> {
  const ai = getGenAI();
  if (!ai || !audioBase64) return "";

  // Prepare possible MIME types for audio container compatibility (especially for .m4a / aac)
  const lowerName = fileName.toLowerCase();
  const mimeCandidates: string[] = [];

  if (mimeType && mimeType.startsWith("audio/")) {
    mimeCandidates.push(mimeType);
  }

  if (lowerName.endsWith(".m4a") || (mimeType && (mimeType.includes("m4a") || mimeType.includes("mp4")))) {
    if (!mimeCandidates.includes("audio/mp4")) mimeCandidates.push("audio/mp4");
    if (!mimeCandidates.includes("audio/m4a")) mimeCandidates.push("audio/m4a");
    if (!mimeCandidates.includes("audio/aac")) mimeCandidates.push("audio/aac");
    if (!mimeCandidates.includes("audio/x-m4a")) mimeCandidates.push("audio/x-m4a");
  } else if (lowerName.endsWith(".mp3") || (mimeType && mimeType.includes("mp3"))) {
    if (!mimeCandidates.includes("audio/mp3")) mimeCandidates.push("audio/mp3");
    if (!mimeCandidates.includes("audio/mpeg")) mimeCandidates.push("audio/mpeg");
  } else if (lowerName.endsWith(".wav") || (mimeType && mimeType.includes("wav"))) {
    if (!mimeCandidates.includes("audio/wav")) mimeCandidates.push("audio/wav");
    if (!mimeCandidates.includes("audio/x-wav")) mimeCandidates.push("audio/x-wav");
  } else if (lowerName.endsWith(".ogg") || (mimeType && mimeType.includes("ogg"))) {
    if (!mimeCandidates.includes("audio/ogg")) mimeCandidates.push("audio/ogg");
  } else if (lowerName.endsWith(".flac") || (mimeType && mimeType.includes("flac"))) {
    if (!mimeCandidates.includes("audio/flac")) mimeCandidates.push("audio/flac");
  } else if (lowerName.endsWith(".webm") || (mimeType && mimeType.includes("webm"))) {
    if (!mimeCandidates.includes("audio/webm")) mimeCandidates.push("audio/webm");
  }

  if (mimeCandidates.length === 0) {
    mimeCandidates.push("audio/mp4", "audio/mp3", "audio/wav");
  }

  const transcriptionPrompt = `Accurately transcribe all spoken speech, dialogues, and discussions from this audio recording ("${fileName}"). Output the full verbatim transcription in the original spoken language (e.g., Italian or English). Use clear paragraphs, proper punctuation, and indicate speaker turns if identifiable. Do not invent details or add external commentary.`;

  // Candidate models: gemini-3.5-transcribe first (dedicated audio transcription), then gemini-3.7-flash, then gemini-flash-latest
  const candidateModels = [
    "gemini-3.5-transcribe",
    "gemini-3.7-flash",
    "gemini-flash-latest",
  ];

  for (const modelName of candidateModels) {
    for (const currentMime of mimeCandidates) {
      try {
        console.log(`[Audio Transcribe] Attempting transcription with ${modelName} (MIME: ${currentMime}) for "${fileName}"...`);
        const config: any = {};
        if (modelName === "gemini-3.7-flash") {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }

        const generatePromise = ai.models.generateContent({
          model: modelName,
          contents: [
            {
              inlineData: {
                mimeType: currentMime,
                data: audioBase64,
              },
            },
            {
              text: transcriptionPrompt,
            },
          ],
          config,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
        );

        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        if (response && response.text && response.text.trim().length > 0) {
          console.log(`[Audio Transcribe] Successfully transcribed ${response.text.length} chars with ${modelName} (MIME: ${currentMime})`);
          return response.text.trim();
        }
      } catch (err: any) {
        console.warn(`[Audio Transcribe] Model ${modelName} with MIME ${currentMime} failed:`, err?.message || "error");
      }
    }
  }

  return "";
}

// API Health
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Telemetry Stats Endpoint for Gemini AI
app.get("/api/telemetry/gemini-stats", (_req, res) => {
  const nowMs = Date.now();
  // purge rolling entries older than 60s
  while (rollingMinuteRequests.length > 0 && nowMs - rollingMinuteRequests[0].timestamp > 60000) {
    rollingMinuteRequests.shift();
  }
  const requestsLastMinute = rollingMinuteRequests.length;
  const tokensLastMinute = rollingMinuteRequests.reduce((sum, item) => sum + item.tokens, 0);

  let status: "OPERATIONAL" | "RATE_LIMITED" | "EXHAUSTED" | "UNAVAILABLE" = "OPERATIONAL";
  if (quota429Count > 0 && requestsLastMinute >= 14) {
    status = "RATE_LIMITED";
  } else if (dailyRequestsCount >= 1500) {
    status = "EXHAUSTED";
  } else if (error503Count > 3) {
    status = "UNAVAILABLE";
  }

  res.json({
    requestsToday: dailyRequestsCount,
    dailyLimit: 1500,
    requestsLastMinute,
    rpmLimit: 15,
    tokensLastMinute,
    tpmLimit: 1000000,
    quota429Count,
    error503Count,
    modelCounts: modelUsageCounts,
    recentCalls: geminiCallHistory.slice(0, 35),
    status,
  });
});

// Live Test Ping Endpoint for Gemini AI
app.post("/api/telemetry/test-gemini", async (_req, res) => {
  const ai = getGenAI();
  if (!ai) {
    return res.status(500).json({
      success: false,
      message: "Client Gemini non configurato (GEMINI_API_KEY non trovata nell'ambiente server)",
    });
  }

  const start = Date.now();
  try {
    const candidateModels = ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    let succeeded = false;
    let usedModel = "";
    let lastErr: any = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: "Rispondi solo con la parola 'OK'.",
        });
        if (response && response.text) {
          succeeded = true;
          usedModel = model;
          break;
        }
      } catch (err: any) {
        lastErr = err;
      }
    }

    const latencyMs = Date.now() - start;
    if (succeeded) {
      recordGeminiCall({
        endpoint: "/api/telemetry/test-gemini",
        model: usedModel,
        latencyMs,
        status: "success",
        statusCode: 200,
      });
      return res.json({
        success: true,
        modelUsed: usedModel,
        latencyMs,
        message: `Test eseguito con successo con ${usedModel} (${latencyMs}ms)`,
      });
    } else {
      const isQuota = lastErr?.status === "RESOURCE_EXHAUSTED" || lastErr?.message?.includes("quota") || lastErr?.message?.includes("429");
      recordGeminiCall({
        endpoint: "/api/telemetry/test-gemini",
        model: candidateModels[0],
        latencyMs,
        status: isQuota ? "quota_exceeded" : "error",
        statusCode: isQuota ? 429 : 500,
        errorMessage: lastErr?.message,
      });
      return res.status(isQuota ? 429 : 500).json({
        success: false,
        isQuota,
        latencyMs,
        message: isQuota
          ? "Quota / Rate-Limit Gemini Esaurito (429 RESOURCE_EXHAUSTED)"
          : `Errore chiamata Gemini: ${lastErr?.message || "Fallito"}`,
      });
    }
  } catch (outerErr: any) {
    return res.status(500).json({
      success: false,
      message: outerErr?.message || "Errore sconosciuto",
    });
  }
});

// POST /api/diagnostics/analyze-log - AI Diagnostic Engine with Local Fallback
app.post("/api/diagnostics/analyze-log", async (req, res) => {
  const { logMessage = "", category = "SYSTEM", level = "error", details = null, context = {} } = req.body;
  const start = Date.now();

  // 1. Instant Heuristic Rule Engine (0ms, 0 tokens) for common patterns or when quota is already exceeded
  const lowerMsg = String(logMessage || "").toLowerCase();
  const lowerCat = String(category || "").toLowerCase();
  const isQuotaRelated = lowerMsg.includes("quota") || lowerMsg.includes("429") || lowerMsg.includes("resource_exhausted") || lowerMsg.includes("esaurita");
  const isTimeoutRelated = lowerMsg.includes("timed out") || lowerMsg.includes("timeout") || lowerMsg.includes("latenza");
  const isNetworkOffline = lowerMsg.includes("offline") || lowerMsg.includes("network") || lowerMsg.includes("abort");

  const buildHeuristicResponse = () => {
    if (isQuotaRelated) {
      return {
        explanation: "La quota gratuita giornaliera Firestore o Gemini ha raggiunto la soglia limite temporanea. I dati locali non sono compromessi.",
        severity: "medium",
        dataSafetyNote: "I dati creati rimangono memorizzati nella cache locale (IndexedDB) e nel file di backup server.",
        suggestedActions: [
          {
            id: "FORCE_SERVER_BACKUP",
            label: "Salva su Backup Server",
            description: "Crea una copia di sicurezza immediata sul file system del server Express",
            isPrimary: true,
            risk: "safe",
          },
          {
            id: "RESET_OFFLINE_LOCK",
            label: "Azzera Blocco Locale & Riconnetti",
            description: "Cancella il flag locale di blocco e invia un nuovo ping di verifica",
            isPrimary: false,
            risk: "safe",
          },
          {
            id: "EXPORT_EMERGENCY_JSON",
            label: "Esporta Snapshot JSON",
            description: "Scarica subito un backup di emergenza sul tuo dispositivo",
            isPrimary: false,
            risk: "safe",
          },
        ],
        source: "heuristic",
      };
    }

    if (isTimeoutRelated || isNetworkOffline) {
      return {
        explanation: "Si è verificato un rallentamento o un'interruzione momentanea della connessione di rete con i servizi cloud.",
        severity: "low",
        dataSafetyNote: "Nessun dato è andato perso: la memoria locale conserva l'intero stato del Vault.",
        suggestedActions: [
          {
            id: "TEST_CONNECTIVITY",
            label: "Verifica Connettività Live",
            description: "Esegue un test di ping sia verso Google Gemini che verso Firestore",
            isPrimary: true,
            risk: "safe",
          },
          {
            id: "RESET_OFFLINE_LOCK",
            label: "Ripristina Rete Cloud",
            description: "Forza la riattivazione della scheda di rete Firestore disabilitata",
            isPrimary: false,
            risk: "safe",
          },
        ],
        source: "heuristic",
      };
    }

    if (lowerCat.includes("okf") || lowerCat.includes("capture") || lowerMsg.includes("schema") || lowerMsg.includes("parsing")) {
      return {
        explanation: "L'elaborazione del documento o file multimediale ha incontrato una discrepanza di formattazione o limite di contesto.",
        severity: "medium",
        dataSafetyNote: "Il file originale o il testo grezzo è preservato nello Staging Buffer dei Raw Files.",
        suggestedActions: [
          {
            id: "SWITCH_LOCAL_HEURISTIC",
            label: "Converti con Estrattore Euristico",
            description: "Estrae metadati OKF v0.2 istantaneamente a regole fisse a latenza zero",
            isPrimary: true,
            risk: "safe",
          },
          {
            id: "EXPORT_EMERGENCY_JSON",
            label: "Esporta Copia JSON",
            description: "Salva i dati grezzi su file JSON scaricabile",
            isPrimary: false,
            risk: "safe",
          },
        ],
        source: "heuristic",
      };
    }

    return {
      explanation: "Rilevato evento diagnostico nel sistema. L'infrastruttura sta operando regolarmente con persistenza attiva.",
      severity: "low",
      dataSafetyNote: "Il Vault è protetto con sincronizzazione a tre livelli (Firestore, Server, IndexedDB).",
      suggestedActions: [
        {
          id: "TEST_CONNECTIVITY",
          label: "Esegui Diagnostica Generale",
          description: "Controlla lo stato delle API di backend e del database",
          isPrimary: true,
          risk: "safe",
        },
        {
          id: "CLEAR_TRANSIENT_ERRORS",
          label: "Archivia Avvisi Transitori",
          description: "Pulisce gli avvisi superati dalla console di log",
          isPrimary: false,
          risk: "safe",
        },
      ],
      source: "heuristic",
    };
  };

  // If already quota exceeded or no AI key, return heuristic immediately
  const ai = getGenAI();
  if (!ai || context.isQuotaExceeded || isQuotaRelated) {
    return res.json(buildHeuristicResponse());
  }

  // 2. Call Gemini 3.7 Flash for deep contextual explanation
  try {
    const diagnosticSchema = {
      type: Type.OBJECT,
      properties: {
        explanation: {
          type: Type.STRING,
          description: "Spiegazione sintetica in massimo 2 frasi in italiano comprensibile e orientato all'utente",
        },
        severity: {
          type: Type.STRING,
          description: "low, medium, high, o critical",
        },
        dataSafetyNote: {
          type: Type.STRING,
          description: "Breve frase sulla sicurezza dei dati (es. 'I tuoi dati locali su IndexedDB e backup server sono intatti')",
        },
        suggestedActions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: {
                type: Type.STRING,
                description: "Uno tra: RESET_OFFLINE_LOCK, FORCE_SERVER_BACKUP, TEST_CONNECTIVITY, SWITCH_LOCAL_HEURISTIC, EXPORT_EMERGENCY_JSON, CLEAR_TRANSIENT_ERRORS",
              },
              label: {
                type: Type.STRING,
                description: "Titolo breve del pulsante (es. 'Azzera Blocco Quota')",
              },
              description: {
                type: Type.STRING,
                description: "Descrizione di cosa farà questa azione",
              },
              isPrimary: {
                type: Type.BOOLEAN,
                description: "true se è l'azione principale consigliata",
              },
              risk: {
                type: Type.STRING,
                description: "safe oppure warning",
              },
            },
            required: ["id", "label", "description", "risk"],
          },
        },
      },
      required: ["explanation", "severity", "dataSafetyNote", "suggestedActions"],
    };

    const prompt = `Sei l'assistente diagnostico intelligente di Knowledge Vault.
Analizza questo evento di log diagnostico e genera una diagnosi chiara e 1-3 azioni operative concrete.

MESSAGGIO LOG: "${logMessage}"
CATEGORIA: ${category}
LIVELLO: ${level}
DETTAGLI: ${details ? JSON.stringify(details).slice(0, 500) : "N/A"}
STATO SISTEMA: ${JSON.stringify(context)}

CATALOGO AZIONI DISPONIBILI (Usa ESCLUSIVAMENTE questi ID):
- RESET_OFFLINE_LOCK: Sblocca il blocco locale di Firestore e riattiva la connessione.
- FORCE_SERVER_BACKUP: Forza il salvataggio immediato sul file system del server Express (/api/vault/backup).
- TEST_CONNECTIVITY: Esegue un ping diagnostico in tempo reale verso Firestore e Gemini.
- SWITCH_LOCAL_HEURISTIC: Usa il parser euristico locale a regole (0ms, 0 token) senza chiamare le API AI.
- EXPORT_EMERGENCY_JSON: Scarica istantaneamente uno snapshot JSON locale sul dispositivo dell'utente.
- CLEAR_TRANSIENT_ERRORS: Pulisce i log temporanei non bloccanti.

Restituisci un JSON rigoroso conforme allo schema.`;

    // Candidate models in priority order with fast config and ample 12s timeout guard
    const candidateModels = ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout diagnosi")), 12000));

    let succeeded = false;
    let resultJson: any = null;
    let usedModel = "";

    for (const model of candidateModels) {
      try {
        const config: any = {
          responseMimeType: "application/json",
          responseSchema: diagnosticSchema,
          maxOutputTokens: 600,
        };
        if (model.startsWith("gemini-3")) {
          config.thinkingConfig = { thinkingBudget: 0 };
        }

        const geminiCall = ai.models.generateContent({
          model,
          contents: prompt,
          config,
        });

        const response: any = await Promise.race([geminiCall, timeoutPromise]);
        const text = response?.text;
        if (text) {
          resultJson = JSON.parse(text);
          usedModel = model;
          succeeded = true;
          break;
        }
      } catch (innerErr: any) {
        // Try next fallback model
      }
    }

    if (succeeded && resultJson) {
      const latencyMs = Date.now() - start;
      recordGeminiCall({
        endpoint: "/api/diagnostics/analyze-log",
        model: usedModel,
        latencyMs,
        status: "success",
        statusCode: 200,
      });

      return res.json({
        ...resultJson,
        source: "gemini",
        modelUsed: usedModel,
        latencyMs,
      });
    }
  } catch (err: any) {
    // Non-fatal: handled smoothly via heuristic fallback
  }

  // Graceful fallback
  return res.json(buildHeuristicResponse());
});

// API: Convert Staged / Raw File (Audio, PDF, Image, Text, Markdown, Logs, JSON) into full OKF v0.2 Resource
app.post("/api/convert-file-to-okf", async (req, res) => {
  try {
    const { 
      fileName = "file", 
      mimeType = "application/octet-stream", 
      fileType = "document", 
      textContent = "", 
      base64Data = "",
      notes = "",
      existingResources = [] 
    } = req.body;

    const contextList = (existingResources as any[]).slice(0, 30).map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      tags: r.tags || [],
    }));

    const cleanFileName = fileName.replace(/[\\/:"*?<>|]/g, "_");
    const inferredTitle = cleanFileName.replace(/\.[^/.]+$/, "");
    const lowerName = fileName.toLowerCase();

    // Categorize file by extension and MIME
    const isAudio = (mimeType && mimeType.toLowerCase().startsWith("audio/")) ||
      ["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus", "webm", "wma", "aiff"].some((ext) => lowerName.endsWith("." + ext)) ||
      fileType?.toLowerCase() === "audio";

    const isPdf = lowerName.endsWith(".pdf") || (mimeType && mimeType.toLowerCase().includes("pdf")) || fileType?.toLowerCase() === "pdf";
    const isImage = (mimeType && mimeType.toLowerCase().startsWith("image/")) || ["png", "jpg", "jpeg", "webp", "gif", "svg"].some((ext) => lowerName.endsWith("." + ext));

    // Extract any genuine base64 string from base64Data or data URLs
    let cleanBase64 = "";
    let rawB64 = base64Data || "";
    if (!rawB64 && typeof textContent === "string" && (textContent.startsWith("data:") || textContent.startsWith("JVBERi0") || textContent.startsWith("SUQz") || textContent.startsWith("UklGR") || textContent.startsWith("//+MYx"))) {
      rawB64 = textContent;
    }

    if (rawB64) {
      const dataPart = rawB64.includes(",") ? rawB64.split(",")[1] : rawB64;
      cleanBase64 = dataPart.replace(/[^A-Za-z0-9+/=]/g, "");
      while (cleanBase64.length % 4 !== 0) {
        cleanBase64 += "=";
      }
    }

    const schema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        domain: { type: Type.STRING },
        docType: { type: Type.STRING },
        entities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ["name", "type"],
          },
        },
        relations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetId: { type: Type.STRING },
              targetTitle: { type: Type.STRING },
              relationType: { type: Type.STRING },
              weight: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ["targetTitle", "relationType"],
          },
        },
        markdownContent: { type: Type.STRING },
      },
      required: ["title", "summary", "tags", "markdownContent", "entities", "relations"],
    };

    let parsed: any = null;
    let audioTranscript = "";

    // -------------------------------------------------------------
    // PATH A: AUDIO PROCESSING (MP3, WAV, M4A, OGG, AAC, FLAC, WEBM)
    // -------------------------------------------------------------
    if (isAudio) {
      let resolvedAudioMime = "audio/mp3";
      if (lowerName.endsWith(".wav") || (mimeType && mimeType.includes("wav"))) {
        resolvedAudioMime = "audio/wav";
      } else if (lowerName.endsWith(".ogg") || (mimeType && mimeType.includes("ogg"))) {
        resolvedAudioMime = "audio/ogg";
      } else if (lowerName.endsWith(".m4a") || (mimeType && (mimeType.includes("m4a") || mimeType.includes("mp4")))) {
        resolvedAudioMime = "audio/mp4";
      } else if (lowerName.endsWith(".aac") || (mimeType && mimeType.includes("aac"))) {
        resolvedAudioMime = "audio/aac";
      } else if (lowerName.endsWith(".flac") || (mimeType && mimeType.includes("flac"))) {
        resolvedAudioMime = "audio/flac";
      } else if (lowerName.endsWith(".webm") || (mimeType && mimeType.includes("webm"))) {
        resolvedAudioMime = "audio/webm";
      } else if (lowerName.endsWith(".mp3") || (mimeType && (mimeType.includes("mp3") || mimeType.includes("mpeg")))) {
        resolvedAudioMime = "audio/mp3";
      }

      console.log(`[Audio Processing] Ingesting audio file "${fileName}" (MIME: ${resolvedAudioMime}, Base64 Length: ${cleanBase64.length})`);

      // Step 1: Transcribe audio content
      if (cleanBase64 && cleanBase64.length > 50) {
        audioTranscript = await transcribeAudioWithGemini(cleanBase64, resolvedAudioMime, fileName);
      }

      // Step 2: Build deep knowledge comprehension prompt based on the actual spoken content
      const audioPromptText = `You are a Principal Ontologist, Audio Analyst, and Senior Technical Author.
An audio file ("${fileName}", format: ${fileType}, mime: ${resolvedAudioMime}) has been acquired into the Knowledge Vault.

${audioTranscript ? `Spoken Audio Transcript:\n"""\n${audioTranscript.slice(0, 35000)}\n"""` : `User Notes & Description:\n"""${notes || "Traccia audio acquisita nel buffer."}"""`}

${notes ? `User annotations:\n"""${notes}"""` : ""}

Existing resources in the user's Vault for topological cross-linking:
${JSON.stringify(contextList, null, 2)}

Strict OKF v0.2 Rules for Audio Processing & Understanding:
1. 'title': Clear, descriptive title summarizing the primary topic, interview, discussion, lecture, or meeting in the audio (e.g., "Discussione Architetturale Microservizi", "Analisi Strategica Sistemi AI", "Podcast Tech & Engineering").
2. 'summary': Dense, 2-4 sentence executive summary in Italian explaining what is discussed in the audio, key decisions, conclusions, and core takeaways.
3. 'tags': 4 to 8 relevant lowercase technical tags based on the spoken content (e.g. "audio", "transcript", "meeting", "architettura", "okf-v0.2").
4. 'domain': E.g. "AI Systems & Inference", "Cloud Architecture", "Audio Analysis & Speech", "Engineering & Systems", "Software Design".
5. 'docType': "concept" | "specification" | "architecture" | "guide".
6. 'entities': Array of 4 to 10 canonical entities mentioned or relevant in the audio { name: string, type: string, description: string }.
7. 'relations': Array of weighted relations to existing vault items or key concepts { targetTitle: string, relationType: 'references' | 'implements' | 'governs' | 'integrates' | 'extends', weight: number (0.5 to 1.0), description: string }.
8. 'markdownContent': An extensive, multi-section Markdown document (AT LEAST 400-900 words):
   - MUST start with the valid YAML frontmatter block enclosed in --- with okf_version: "0.2", title, type, domain, tags, created_at, entities, and relations.
   - Section 1: Panoramica Esecutiva & Sintesi dell'Audio (Clear summary of the audio recording, core objectives, context)
   - Section 2: Punti Salienti, Argomenti Trattati & Decisioni (Detailed breakdown of topics, key points, takeaways)
   - Section 3: Trascrizione Integrale dell'Audio (The complete, structured transcript of the audio with paragraph divisions)
   - Section 4: Ontologia, Concetti Chiave & Collegamenti nel Vault (Use [[Wikilinks]] to link concepts)
   - Section 5: Action Items & Conclusioni

Return pure JSON strictly matching the schema.`;

      // Try AI structured synthesis
      try {
        if (audioTranscript && audioTranscript.length > 10) {
          const generated = await generateWithGeminiFallback(audioPromptText, schema, 40000);
          if (generated?.text) {
            parsed = JSON.parse(generated.text);
          }
        } else if (cleanBase64 && cleanBase64.length > 50 && cleanBase64.length < 10 * 1024 * 1024) {
          // Multimodal audio direct synthesis
          const multimodalContents = [
            { text: audioPromptText },
            {
              inlineData: {
                mimeType: resolvedAudioMime,
                data: cleanBase64,
              },
            },
          ];
          const generated = await generateMultimodalWithGeminiFallback(multimodalContents, schema, 45000);
          if (generated?.text) {
            parsed = JSON.parse(generated.text);
          }
        }
      } catch (err: any) {
        console.warn("AI generation failed for audio convert-file-to-okf:", err?.message);
      }

      if (parsed && parsed.title && parsed.markdownContent) {
        return res.json({
          success: true,
          source: "gemini",
          resource: {
            type: "knowledge",
            title: parsed.title,
            summary: parsed.summary,
            tags: Array.from(new Set([...(parsed.tags || []), "audio", "transcript", "okf-v0.2"])),
            metadata: {
              okfVersion: "0.2",
              domain: parsed.domain || "Audio & Media Systems",
              docType: parsed.docType || "specification",
              mediaType: "audio",
              audioTranscript: audioTranscript || undefined,
              entities: parsed.entities || [],
              relations: parsed.relations || [],
              markdownContent: parsed.markdownContent,
              sourceFileName: fileName,
              sourceFileType: "audio",
            },
          },
        });
      }

      // Audio Heuristic Fallback with Genuine Transcript
      const displayTranscript = audioTranscript || notes || `Traccia audio acquisita dal file ${fileName}`;
      const audioFallbackDoc = `---
okf_version: "0.2"
title: "${inferredTitle}"
type: "specification"
domain: "Audio & Media Systems"
tags: ["audio", "transcript", "okf-v0.2"]
created_at: "${new Date().toISOString()}"
entities:
  - name: "${inferredTitle}"
    type: "concept"
    description: "Traccia audio acquisita da ${fileName}"
relations:
  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relation_type: "references"
    weight: 0.85
---

# ${inferredTitle}

> **Specifiche e trascrizione generate da traccia audio (\`${fileName}\`)**

---

## 1. Panoramica Esecutiva
Documento sonoro acquisito nel Knowledge Vault per archiviazione e consultazione semantica.

---

## 2. Dettagli Traccia
- **File sorgente**: \`${fileName}\`
- **Formato**: \`${resolvedAudioMime}\`
- **Stato trascrizione**: ${audioTranscript ? "Trascritto con successo" : "In attesa di trascrizione"}

---

## 3. Trascrizione Integrale dell'Audio
${displayTranscript}

---

## 4. Ontologia e Grafo
Questa risorsa è mappata per il collegamento con concetti ed entità del Vault.
`;

      return res.json({
        success: true,
        source: "fallback",
        resource: {
          type: "knowledge",
          title: inferredTitle,
          summary: `Traccia audio acquisita da ${fileName}. ${audioTranscript ? "Include trascrizione completa del parlato." : "Archiviata nel Knowledge Vault."}`,
          tags: ["audio", "transcript", "okf-v0.2"],
          metadata: {
            okfVersion: "0.2",
            domain: "Audio & Media Systems",
            docType: "specification",
            mediaType: "audio",
            audioTranscript: audioTranscript || undefined,
            markdownContent: audioFallbackDoc,
            sourceFileName: fileName,
            sourceFileType: "audio",
            entities: [{ name: inferredTitle, type: "concept", description: `Risorsa audio da ${fileName}` }],
            relations: contextList.slice(0, 2).map((c) => ({
              targetId: c.id,
              targetTitle: c.title,
              relationType: "references",
              weight: 0.8,
              description: "Collegamento ontologico nel Vault",
            })),
          },
        },
      });
    }

    // -------------------------------------------------------------
    // PATH B: PDF, IMAGE, CODE, TEXT, MARKDOWN, JSON, LOGS
    // -------------------------------------------------------------
    const promptText = `You are a Principal Software Architect, Ontologist, and Senior Technical Author.
Your mission is to perform deep, exhaustive analysis of the attached document/file ("${fileName}", type: ${fileType}, mime: ${mimeType}) and transform it into an authoritative, complete Open Knowledge Format (OKF v0.2) specification in Italian (using standard English for code, schemas, and technical terms).

User Notes/Annotations attached to this file:
"""${notes || "Nessuna nota aggiuntiva"}"""

Existing resources in the user's Vault for topological cross-linking:
${JSON.stringify(contextList, null, 2)}

Strict OKF v0.2 & Content Depth Mandates:
1. 'title': Clear, canonical title representing the document's core subject (without marketing fluff).
2. 'summary': Dense, 2-4 sentence executive summary in Italian explaining key technical findings, architecture, or solutions.
3. 'tags': 4 to 8 relevant lowercase technical tags.
4. 'domain': E.g. "AI Systems & Inference", "Cloud Architecture", "System Diagnostics & OS", "Developer Tooling", "Database Engineering", "Security".
5. 'docType': "concept" | "specification" | "architecture" | "guide" | "tool_description" | "prompt_skill".
6. 'entities': Array of 4 to 10 canonical entities with { name: string, type: string, description: string }.
7. 'relations': Array of weighted relations to existing vault items or key concepts { targetTitle: string, relationType: 'references' | 'implements' | 'governs' | 'integrates' | 'extends', weight: number (0.5 to 1.0), description: string }.
8. 'markdownContent': An extensive, multi-section Markdown document (500 to 1200+ words):
   - MUST begin with the YAML frontmatter block enclosed in --- with okf_version: "0.2", title, type, domain, tags, created_at, entities, and relations.
   - Section 1: Sintesi Esecutiva & Obiettivi Chiave
   - Section 2: Analisi Dettagliata, Architettura o Dati Estratti dal File (include code snippets, tables, diagrams if applicable)
   - Section 3: Pattern Operativi, Comandi o Soluzioni Pratiche
   - Section 4: Ontologia, Collegamenti e Interoperabilità (use [[Wikilinks]] pointing to vault concepts)
   - Section 5: Best Practice, Note di Sicurezza e Manutenzione

Return pure JSON strictly matching the schema.`;

    // Try extracting text directly from PDF buffer if genuine PDF binary data is present
    let extractedPdfText = "";
    if (isPdf && cleanBase64 && cleanBase64.length > 50) {
      try {
        const pdfBuffer = Buffer.from(cleanBase64, "base64");
        if (pdfBuffer.length > 10 && pdfBuffer.subarray(0, 4).toString("latin1") === "%PDF") {
          const parsedText = await extractTextFromPdfBuffer(pdfBuffer);
          if (parsedText && parsedText.trim().length > 20) {
            extractedPdfText = parsedText.trim();
            console.log(`[PDF Parser] Extracted ${extractedPdfText.length} characters of text from "${fileName}"`);
          }
        }
      } catch {
        // Continue gracefully
      }
    }

    // Step 1: If multimodal is possible and base64 size is reasonable (< 10MB)
    if (cleanBase64 && cleanBase64.length > 30 && cleanBase64.length < 10 * 1024 * 1024 && (isPdf || isImage)) {
      let resolvedMime = "application/pdf";
      if (isPdf) {
        resolvedMime = "application/pdf";
      } else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || (mimeType && (mimeType.includes("jpeg") || mimeType.includes("jpg")))) {
        resolvedMime = "image/jpeg";
      } else if (lowerName.endsWith(".webp") || (mimeType && mimeType.includes("webp"))) {
        resolvedMime = "image/webp";
      } else if (lowerName.endsWith(".gif") || (mimeType && mimeType.includes("gif"))) {
        resolvedMime = "image/gif";
      } else if (lowerName.endsWith(".png") || (mimeType && mimeType.includes("png"))) {
        resolvedMime = "image/png";
      }

      const multimodalContents = [
        { text: promptText + (extractedPdfText ? `\n\nExtracted Text from PDF:\n"""\n${extractedPdfText.slice(0, 25000)}\n"""` : "") },
        {
          inlineData: {
            mimeType: resolvedMime,
            data: cleanBase64,
          },
        },
      ];

      try {
        const generated = await generateMultimodalWithGeminiFallback(multimodalContents, schema, 45000);
        if (generated?.text) {
          parsed = JSON.parse(generated.text);
        }
      } catch (err: any) {
        console.warn("Multimodal AI generation failed for convert-file-to-okf:", err?.message);
      }
    }

    // Step 2: If multimodal was skipped or failed, use high-density text extraction + Gemini
    if (!parsed) {
      let extractedText = extractedPdfText || textContent || "";
      // Only decode base64 as UTF-8 if it is NOT an image, audio, or binary file
      if (!extractedText && cleanBase64 && cleanBase64.length > 20 && !isImage && !isPdf) {
        try {
          const decoded = Buffer.from(cleanBase64, "base64").toString("utf-8");
          // Check if decoded text is printable text (not binary garbage)
          if (/^[\x20-\x7E\s\u00A0-\uFFFF]*$/.test(decoded.slice(0, 500))) {
            extractedText = decoded;
          }
        } catch {
          extractedText = "";
        }
      }

      const textToAnalyze = extractedText || notes || `File: ${fileName}`;
      const textPrompt = `${promptText}\n\nDocument/File Content ("${fileName}"):\n"""\n${textToAnalyze.slice(0, 45000)}\n"""`;

      try {
        const generated = await generateWithGeminiFallback(textPrompt, schema, 35000);
        if (generated?.text) {
          parsed = JSON.parse(generated.text);
        }
      } catch (err: any) {
        console.warn("Text-based Gemini generation failed for convert-file-to-okf:", err?.message);
      }
    }

    if (parsed && parsed.title && parsed.markdownContent) {
      return res.json({
        success: true,
        source: "gemini",
        resource: {
          type: "knowledge",
          title: parsed.title,
          summary: parsed.summary,
          tags: parsed.tags || ["file-upload", "knowledge", "okf-v0.2"],
          metadata: {
            okfVersion: "0.2",
            domain: parsed.domain || "Knowledge Architecture",
            docType: parsed.docType || "specification",
            entities: parsed.entities || [],
            relations: parsed.relations || [],
            markdownContent: parsed.markdownContent,
            sourceFileName: fileName,
            sourceFileType: fileType,
          },
        },
      });
    }

    // Heuristic Fallback
    const fallbackText = textContent || extractedPdfText || notes || `Contenuto estratto dal file ${fileName}`;
    const fallbackDoc = `---
okf_version: "0.2"
title: "${inferredTitle}"
type: "specification"
domain: "Software & Systems"
tags: ["file-upload", "document", "okf-v0.2"]
created_at: "${new Date().toISOString()}"
entities:
  - name: "${inferredTitle}"
    type: "concept"
    description: "Documento originale acquisito da ${fileName}"
relations:
  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relation_type: "references"
    weight: 0.85
---

# ${inferredTitle}

> **Documento acquisito e convertito da file grezzo (\`${fileName}\`)**

---

## 1. Panoramica Esecutiva
Documentazione acquisita tramite il modulo di upload del Knowledge Vault.

---

## 2. Contenuto Estratto
${fallbackText.slice(0, 3000)}

---

## 3. Topologia e Grafo
Questa specifica è registrata nel Vault per collegamenti ontologici.
`;

    return res.json({
      success: true,
      source: "fallback",
      resource: {
        type: "knowledge",
        title: inferredTitle,
        summary: `Documento acquisito da ${fileName}. Include specifiche tecniche ed entità mappate.`,
        tags: ["file-upload", "document", "okf-v0.2"],
        metadata: {
          okfVersion: "0.2",
          domain: "Software & Systems",
          docType: "specification",
          markdownContent: fallbackDoc,
          sourceFileName: fileName,
          sourceFileType: fileType,
          entities: [{ name: inferredTitle, type: "concept", description: `Risorsa originata da ${fileName}` }],
          relations: contextList.slice(0, 2).map((c) => ({
            targetId: c.id,
            targetTitle: c.title,
            relationType: "references",
            weight: 0.8,
            description: "Collegamento ontologico nel Vault",
          })),
        },
      },
    });
  } catch (error: any) {
    console.error("Convert file to OKF error:", error);
    res.status(500).json({ error: error?.message || "Failed to convert file to OKF" });
  }
});

// API: Process document into OKF v0.2 format and build knowledge connections
app.post("/api/process-knowledge", async (req, res) => {
  try {
    const { text, filename, existingResources = [] } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Text content is required" });
    }

    const rawText = text.trim();
    const contextList = (existingResources as any[]).slice(0, 30).map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      tags: r.tags || [],
    }));

    const prompt = `You are a Principal Software Architect, Ontologist, and Senior Technical Writer.
Your task is to transform the provided raw text or document into an authoritative, deeply detailed, and comprehensive Open Knowledge Format (OKF v0.2) specification in Italian (with standard English technical terms/code).

Raw Document content (Filename: "${filename || 'document'}"):
"""
${rawText.slice(0, 15000)}
"""

Existing resources in the user's Vault for topological cross-linking:
${JSON.stringify(contextList, null, 2)}

Strict OKF v0.2 & Content Depth Rules:
1. 'title': Clear, canonical title without redundant marketing prefixes.
2. 'summary': A dense, highly descriptive 2-4 sentence executive summary in Italian.
3. 'tags': 4 to 8 relevant lowercase technical tags.
4. 'domain': E.g. "AI Systems & Inference", "Cloud Architecture", "Developer Tooling", "Database Engineering", "Security".
5. 'docType': "concept" | "specification" | "architecture" | "guide" | "tool_description" | "prompt_skill".
6. 'entities': Array of 3 to 8 canonical entities with { name: string, type: string, description: string }.
7. 'relations': Array of weighted relations to existing vault items or key concepts { targetTitle: string, relationType: 'references' | 'implements' | 'governs' | 'integrates' | 'extends', weight: number (0.5 to 1.0), description: string }.
8. 'markdownContent': A rich, comprehensive, multi-section Markdown document (AT LEAST 400-800 words):
   - MUST start with the valid YAML frontmatter block enclosed in --- with okf_version: "0.2", title, type, domain, tags, created_at, entities, and relations.
   - Section 1: Panoramica Esecutiva & Obiettivi (with executive value proposition)
   - Section 2: Specifiche Tecniche & Architettura (with workflow diagrams in ASCII/code blocks)
   - Section 3: Pattern Implementativi, Snippet di Codice o Comandi CLI
   - Section 4: Ontologia, Collegamenti e Interoperabilità (use [[Wikilinks]] to reference concepts and vault titles)
   - Section 5: Best Practice, Sicurezza e Considerazioni di Produzione

Return JSON strictly matching the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        domain: { type: Type.STRING },
        docType: { type: Type.STRING },
        entities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ["name", "type"],
          },
        },
        relations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetId: { type: Type.STRING },
              targetTitle: { type: Type.STRING },
              relationType: { type: Type.STRING },
              weight: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ["targetTitle", "relationType"],
          },
        },
        markdownContent: { type: Type.STRING },
      },
      required: ["title", "summary", "tags", "markdownContent", "entities", "relations"],
    };

    let parsed: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 25000);
      if (generated?.text) {
        parsed = JSON.parse(generated.text);
      }
    } catch (e: any) {
      console.warn("AI generation failed for process-knowledge, using fallback parser:", e?.message);
    }

    if (parsed && parsed.title && parsed.markdownContent) {
      return res.json({
        result: {
          type: "knowledge",
          title: parsed.title,
          summary: parsed.summary,
          tags: parsed.tags || ["knowledge", "okf-v0.2"],
          metadata: {
            okfVersion: "0.2",
            domain: parsed.domain || "Knowledge Architecture",
            docType: parsed.docType || "concept",
            entities: parsed.entities || [],
            relations: parsed.relations || [],
            markdownContent: parsed.markdownContent,
          },
        },
        source: "gemini",
      });
    }

    // Heuristic fallback if models unavailable
    const lines = rawText.split("\n").filter((l) => l.trim().length > 0);
    const inferredTitle = filename?.replace(/\.[^/.]+$/, "") || lines[0]?.replace(/^#+\s*/, "").slice(0, 100) || "Documento Knowledge";
    const okfDoc = rawText.startsWith("---")
      ? rawText
      : `---\nokf_version: "0.2"\ntitle: "${inferredTitle}"\ntype: "concept"\ndomain: "Software Architecture"\ntags: ["knowledge", "okf-v0.2"]\ncreated_at: "${new Date().toISOString()}"\nentities:\n  - name: "${inferredTitle}"\n    type: "concept"\n    description: "Elemento cardine del documento"\nrelations:\n  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"\n    relation_type: "references"\n    weight: 0.85\n---\n\n# ${inferredTitle}\n\n> **Documentazione tecnica generata per il Knowledge Vault (OKF v0.2)**\n\n---\n\n## 1. Panoramica Esecutiva\n${rawText}\n\n---\n\n## 2. Dettagli Architetturali & Note Operative\n- Risorsa registrata all'interno dell'ontologia del Vault.\n- Compatibile con l'esplorazione topologica nel Grafo D3.\n`;

    return res.json({
      result: {
        type: "knowledge",
        title: inferredTitle,
        summary: rawText.slice(0, 280) + (rawText.length > 280 ? "..." : ""),
        tags: ["knowledge", "okf-v0.2", "doc"],
        metadata: {
          okfVersion: "0.2",
          domain: "Software Architecture",
          docType: "concept",
          markdownContent: okfDoc,
          entities: [{ name: inferredTitle, type: "concept", description: "Concetto primario" }],
          relations: contextList.slice(0, 2).map((c) => ({
            targetId: c.id,
            targetTitle: c.title,
            relationType: "references",
            weight: 0.8,
            description: "Collegamento semantico nel Vault",
          })),
        },
      },
      source: "fallback",
    });
  } catch (error: any) {
    console.error("Knowledge processing error:", error);
    const lines = (req.body.text || "").split("\n").filter((l: string) => l.trim().length > 0);
    const fallbackTitle = req.body.filename?.replace(/\.[^/.]+$/, "") || lines[0]?.slice(0, 100) || "Documento Knowledge";
    res.json({
      result: {
        type: "knowledge",
        title: fallbackTitle,
        summary: (req.body.text || "").slice(0, 300),
        tags: ["knowledge", "okf-v0.2"],
        metadata: {
          okfVersion: "0.2",
          domain: "dev",
          docType: "concept",
          markdownContent: req.body.text || "",
          entities: [{ name: fallbackTitle, type: "concept" }],
          relations: [],
        },
      },
      source: "fallback-error",
      error: error?.message,
    });
  }
});

// API: Expand or Generate In-Depth OKF v0.2 Technical Documentation on Demand
app.post("/api/expand-documentation", async (req, res) => {
  try {
    const { resource, existingResources = [] } = req.body;
    if (!resource || !resource.title) {
      return res.status(400).json({ error: "Resource object with title is required" });
    }

    const {
      title,
      type = "knowledge",
      summary = "",
      url = "",
      tags = [],
      metadata = {},
      rawInput = "",
    } = resource;

    const currentContent = metadata.markdownContent || rawInput || summary || "";
    const contextList = (existingResources as any[]).slice(0, 25).map((r) => ({
      title: r.title,
      type: r.type,
      tags: r.tags || [],
    }));

    const prompt = `You are a World-Class Principal Software Architect and Lead Technical Author.
Create an EXHAUSTIVE, IN-DEPTH, AND PROFESSIONAL Open Knowledge Format (OKF v0.2) Technical Documentation file for the following resource:

Resource Context:
- Title: "${title}"
- Type: "${type}"
- URL: "${url || 'N/A'}"
- Summary: "${summary}"
- Tags: ${JSON.stringify(tags)}
- Existing Document/Context: """${currentContent.slice(0, 8000)}"""
- Type Specific Info: ${JSON.stringify(metadata, null, 2)}

Vault Cross-Reference Pool:
${JSON.stringify(contextList, null, 2)}

Requirements for the Generated Documentation:
1. Length & Depth: Must be a rich, comprehensive technical guide (500 to 1000+ words).
2. Language: Professional Italian for prose and explanations, standard English for technical identifiers, code, commands, and schemas.
3. YAML Frontmatter: Must begin with valid YAML starting with --- and ending with --- containing:
   - okf_version: "0.2"
   - title: "${title}"
   - type: "${metadata.docType || 'guide'}"
   - domain: "${metadata.domain || 'Software Architecture'}"
   - tags: ${JSON.stringify(tags.length > 0 ? tags : ['knowledge', 'okf-v0.2'])}
   - created_at: "${new Date().toISOString()}"
   - entities: array of { name, type, description }
   - relations: array of { target_title, relation_type, weight, description }
4. Document Sections to Include in the Markdown Body:
   # ${title}
   > Executive blockquote summary with key value proposition
   ---
   ## 1. Panoramica Esecutiva & Scopo del Progetto
   (Detailed context, architectural motivations, problem solved, and key capabilities)
   ## 2. Architettura Tecnica & Diagramma di Flusso
   (Include ASCII diagrams or component breakdown)
   ## 3. Guida Operativa, Comandi CLI & Snippet di Codice
   (Concrete, copy-pasteable bash/TypeScript/JSON/config snippets with inline comments)
   ## 4. Ontologia, Entità & Connessioni Topologiche
   (Incorporate [[Wikilinks]] pointing to related concepts or tools in the vault)
   ## 5. Linee Guida di Produzione, Resilienza e Sicurezza
   (Error handling, performance tips, security considerations)

5. Structured Output Fields:
   - 'expandedMarkdown': The full, complete Markdown document starting with YAML frontmatter.
   - 'enhancedSummary': An updated 2-3 sentence executive abstract in Italian.
   - 'entities': Array of 4 to 8 identified entities { name, type, description }.
   - 'relations': Array of 3 to 6 weighted topological relations { targetTitle, relationType, weight, description }.
   - 'domain': Refined technical domain.
   - 'docType': Refined docType ('concept' | 'specification' | 'architecture' | 'guide' | 'tool_description').

Return pure JSON matching the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        expandedMarkdown: { type: Type.STRING },
        enhancedSummary: { type: Type.STRING },
        domain: { type: Type.STRING },
        docType: { type: Type.STRING },
        entities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ["name", "type"],
          },
        },
        relations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetTitle: { type: Type.STRING },
              relationType: { type: Type.STRING },
              weight: { type: Type.NUMBER },
              description: { type: Type.STRING },
            },
            required: ["targetTitle", "relationType"],
          },
        },
      },
      required: ["expandedMarkdown", "enhancedSummary", "entities", "relations"],
    };

    let result: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 30000);
      if (generated?.text) {
        result = JSON.parse(generated.text);
      }
    } catch (err: any) {
      console.warn("AI generation failed for expand-documentation, using fallback:", err?.message);
    }

    if (result && result.expandedMarkdown) {
      return res.json({
        success: true,
        source: "gemini",
        data: {
          markdownContent: result.expandedMarkdown,
          summary: result.enhancedSummary || summary,
          domain: result.domain || metadata.domain || "Knowledge Systems",
          docType: result.docType || metadata.docType || "specification",
          entities: result.entities || metadata.entities || [],
          relations: result.relations || metadata.relations || [],
        },
      });
    }

    // Comprehensive Heuristic fallback generator
    const cleanBody = currentContent.replace(/^---[\s\S]*?---\n*/, "").trim() || summary;
    const fallbackEntities = metadata.entities && metadata.entities.length > 0 
      ? metadata.entities 
      : [
          { name: title, type: "concept", description: `Elemento cardine del documento "${title}"` },
          { name: metadata.domain || "Software Architecture", type: "domain", description: "Dominio di riferimento" },
        ];
    
    const fallbackRelations = metadata.relations && metadata.relations.length > 0
      ? metadata.relations
      : contextList.slice(0, 3).map((c) => ({
          targetTitle: c.title,
          relationType: "references",
          weight: 0.85,
          description: "Correlazione semantica nel Knowledge Vault",
        }));

    const fallbackMarkdown = `---
okf_version: "0.2"
title: "${title}"
type: "${metadata.docType || 'specification'}"
domain: "${metadata.domain || 'Software Architecture'}"
tags: ${JSON.stringify(tags.length > 0 ? tags : ['knowledge', 'okf-v0.2', 'architecture'])}
created_at: "${new Date().toISOString()}"
entities:
${fallbackEntities.map((e: any) => `  - name: "${typeof e === 'string' ? e : e.name}"\n    type: "${typeof e === 'string' ? 'concept' : e.type || 'concept'}"\n    description: "${typeof e === 'string' ? 'Entità associata' : e.description || 'Entità tecnica'}"`).join("\n")}
relations:
${fallbackRelations.map((r: any) => `  - target_title: "${r.targetTitle || r.target_title || 'Knowledge Vault'}"\n    relation_type: "${r.relationType || r.relation_type || 'references'}"\n    weight: ${r.weight || 0.85}\n    description: "${r.description || 'Connessione topologica'}"`).join("\n")}
---

# ${title}

> **Specifiche Tecniche & Approfondimento Architetturale (OKF v0.2)**
> 
> ${summary || `Documentazione approfondita per la risorsa **${title}**, catalogata all'interno del Knowledge Vault.`}

---

## 1. Panoramica Esecutiva & Obiettivi

La risorsa **${title}** rappresenta una componente fondamentale all'interno del dominio **${metadata.domain || 'Software Architecture'}**.
L'obiettivo primario di questa documentazione è formalizzare le linee guida architetturali, i requisiti di sistema e i protocolli di integrazione.

${summary ? `### Contesto & Abstract\n${summary}\n` : ''}

---

## 2. Architettura Tecnica & Specifiche dei Componenti

\`\`\`text
+-------------------------------------------------------------+
|                ${title.slice(0, 40).padEnd(40, " ")} |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|  Dominio: ${(metadata.domain || 'Software Systems').padEnd(46, " ")} |
|  Tipologia: ${(metadata.docType || 'specification').padEnd(44, " ")} |
|  Standard: OKF v0.2 / Graph Topological Engine              |
+-------------------------------------------------------------+
\`\`\`

### Dettagli del Contenuto
${cleanBody}

---

## 3. Guida Operativa & Pattern di Utilizzo

Per integrare e utilizzare efficacemente **${title}** nei flussi operativi:

1. **Configurazione Iniziale**: Verificare la conformità con lo standard OKF v0.2.
2. **Esecuzione & Parsing**: Sfruttare le pipeline di trasformazione del Knowledge Vault per mantenere sincronizzato il grafo delle dipendenze.
3. **Validazione**: Eseguire il controllo semantico delle entità e delle relazioni collegate.

---

## 4. Ontologia & Connessioni Topologiche

Questa risorsa è interconnessa con i seguenti concetti e nodi del Vault:
${fallbackRelations.map((r: any) => `- [[${r.targetTitle || r.target_title}]]: *${r.description || 'Relazione semantica'}* (\`${r.relationType || r.relation_type || 'references'}\`)`).join("\n")}

---

## 5. Best Practice, Sicurezza & Resilienza

- **Isolamento dei Dati**: Tutte le entità e i collegamenti rispettano i criteri di riservatezza e isolamento per-utente.
- **Integrità del Grafo**: Ogni aggiornamento mantiene consistenti i pesi di affinità nel motore D3 del grafo.
- **Audit & Versioning**: Revisione tracciata secondo lo standard di conformità OKF v0.2.
`;

    return res.json({
      success: true,
      source: "fallback",
      data: {
        markdownContent: fallbackMarkdown,
        summary: summary || `Documentazione tecnica dettagliata per ${title}`,
        domain: metadata.domain || "Software Architecture",
        docType: metadata.docType || "specification",
        entities: fallbackEntities,
        relations: fallbackRelations,
      },
    });
  } catch (error: any) {
    console.error("Expand documentation error:", error);
    res.status(500).json({ error: error?.message || "Failed to expand documentation" });
  }
});

// API: Fetch Open Graph and Website preview metadata
app.get("/api/fetch-opengraph", async (req, res) => {
  try {
    const targetUrl = (req.query.url as string) || "";
    if (!targetUrl || targetUrl.trim().length === 0) {
      return res.status(400).json({ error: "URL parameter is required" });
    }
    const ogData = await fetchOpenGraphMetadata(targetUrl);
    res.json({ success: true, metadata: ogData });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch Open Graph metadata" });
  }
});

app.post("/api/fetch-opengraph", async (req, res) => {
  try {
    const { url: targetUrl } = req.body;
    if (!targetUrl || typeof targetUrl !== "string" || targetUrl.trim().length === 0) {
      return res.status(400).json({ error: "URL is required in body" });
    }
    const ogData = await fetchOpenGraphMetadata(targetUrl);
    res.json({ success: true, metadata: ogData });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch Open Graph metadata" });
  }
});

// API: Analyze text/link and extract structured metadata using Gemini
app.post("/api/analyze-resource", async (req, res) => {
  try {
    const { input, explicitType, existingResources } = req.body;
    if (!input || typeof input !== "string" || input.trim().length === 0) {
      return res.status(400).json({ error: "Input string is required" });
    }

    const trimmedInput = input.trim();

    // Check if input contains a web URL to pre-fetch Open Graph metadata
    let ogData: OpenGraphData | null = null;
    const urlMatch = trimmedInput.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      try {
        ogData = await fetchOpenGraphMetadata(urlMatch[0]);
      } catch {}
    }

    const prompt = `You are an expert AI software architect and knowledge curator.
Analyze the following text or URL to extract structured information for a developer knowledge base adhering to Open Knowledge Format (OKF v0.2).

UNIVERSAL OKF v0.2 MANDATE:
EVERY resource (regardless of category: github_repo, article, mcp_server, ai_skill, troubleshooting, link, or knowledge) is a structured technical document in this Knowledge Vault. You MUST generate:
1. 'metadata.okfVersion': "0.2"
2. 'metadata.domain': Specific domain (e.g. "Agentic Systems & AI", "Software Architecture", "DevOps & Cloud Infrastructure", "Frontend Engineering", "Security & System Diagnostics")
3. 'metadata.docType': "architecture" (for github_repo), "tool_description" (for mcp_server), "prompt_skill" (for ai_skill), "specification" (for troubleshooting/knowledge), "guide" (for article/link), or "concept" (for concepts)
4. 'metadata.entities': Array of 3 to 6 identified technical entities { name, type, description }
5. 'metadata.relations': Array of 2 to 5 topological relations { targetTitle, relationType, weight, description }
6. 'metadata.markdownContent': Full technical documentation starting with YAML frontmatter conforming to OKF v0.2:
---
okf_version: "0.2"
title: "..."
type: "..."
domain: "..."
tags: [...]
created_at: "..."
---
Followed by rich Markdown documentation with sections (Panoramica, Architettura / Specifiche / Guida, Componenti, Utilizzo).

Target Categories:
1. 'troubleshooting' - Technical issues, software bugs, DLL/system errors, crash diagnostics, and step-by-step resolutions/workarounds
2. 'github_repo' - GitHub repositories, packages, tools (CRITICAL: any github.com URL must be classified as github_repo unless explicitType says otherwise)
3. 'mcp_server' - Model Context Protocol servers, tools, connectors for Claude/Gemini/AI agents
4. 'knowledge' - Architecture documents, specifications, second-brain knowledge notes
5. 'ai_skill' - AI System prompts, agents instructions, persona templates, workflow skills
6. 'article' - Blog posts, research papers, documentation, tutorials, architectural guides
7. 'link' - Web links, online tools, SaaS platforms, portals, official sites, web apps, API references

User Raw Input:
"""
${trimmedInput}
"""
${explicitType ? `User requested type hint: ${explicitType}` : ""}
${ogData ? `Extracted Open Graph web context:
- Domain: ${ogData.domain}
- Site Name: ${ogData.siteName || ogData.domain}
- OG Title: ${ogData.ogTitle || "N/A"}
- OG Description: ${ogData.ogDescription || "N/A"}
- Favicon: ${ogData.favicon || "N/A"}
- Author: ${ogData.author || "N/A"}
` : ""}
${Array.isArray(existingResources) && existingResources.length > 0 ? `Available Vault Resources for Cross-Linking Relations:
${existingResources.slice(0, 15).map((r: any) => `- "${r.title}" (Tipo: ${r.type}, Tags: ${(r.tags || []).join(", ")})`).join("\n")}
` : ""}

Instructions:
- If input contains "github.com/" or is a repo format "owner/repo", set type to 'github_repo' (unless explicitType is specifically 'mcp_server' or 'knowledge').
- If input is a generic website or online tool URL (not a blog post or github repo), or if explicitType is 'link', classify as 'link'.
- Extract a clean, precise title. For GitHub repos, use 'owner/repo' or repo name.
- If a URL is present or inferred, format as full https:// URL.
- Write a clear, comprehensive summary in Italian that preserves all essential facts, technical context, details, and user notes from the original input.
- Generate 3 to 6 relevant lowercase tags (e.g. ['github', 'typescript', 'open-source', 'agents', 'web-tool']).
- Fill type-specific metadata:
  - If troubleshooting: { affectedSystem, rootCause, attemptedFixes: ["string"], solutionSteps: ["string"], problemDescription }
  - If github_repo: { owner, repoName, language, installCommand: "git clone https://github.com/owner/repo.git" }
  - If mcp_server: { protocol: 'stdio' | 'sse', command, args, env, configSnippet, toolsProvided }
  - If ai_skill: { skillType, recommendedModel, systemPrompt, triggerKeywords, exampleUsage }
  - If article: { author, readingTimeMin, keyTakeaways: [], ogDescription, favicon, siteName, domain }
  - If link: { siteName, domain, favicon, ogDescription, ogImage }
- If the user input contains additional personal comments or custom notes, capture them in metadata.userNotes.

Return pure JSON matching this exact structure:
{
  "type": "troubleshooting" | "article" | "github_repo" | "mcp_server" | "ai_skill" | "knowledge" | "link",
  "title": "string",
  "url": "string",
  "summary": "string",
  "tags": ["string"],
  "metadata": {}
}`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["troubleshooting", "article", "github_repo", "mcp_server", "ai_skill", "knowledge", "link"],
        },
        title: { type: Type.STRING },
        url: { type: Type.STRING },
        summary: { type: Type.STRING },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        metadata: {
          type: Type.OBJECT,
          properties: {
            affectedSystem: { type: Type.STRING },
            rootCause: { type: Type.STRING },
            attemptedFixes: { type: Type.ARRAY, items: { type: Type.STRING } },
            solutionSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
            problemDescription: { type: Type.STRING },
            userNotes: { type: Type.STRING },
            owner: { type: Type.STRING },
            repoName: { type: Type.STRING },
            language: { type: Type.STRING },
            installCommand: { type: Type.STRING },
            protocol: { type: Type.STRING },
            command: { type: Type.STRING },
            args: { type: Type.ARRAY, items: { type: Type.STRING } },
            configSnippet: { type: Type.STRING },
            toolsProvided: { type: Type.ARRAY, items: { type: Type.STRING } },
            skillType: { type: Type.STRING },
            recommendedModel: { type: Type.STRING },
            systemPrompt: { type: Type.STRING },
            triggerKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            exampleUsage: { type: Type.STRING },
            author: { type: Type.STRING },
            readingTimeMin: { type: Type.STRING },
            keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
            ogTitle: { type: Type.STRING },
            ogDescription: { type: Type.STRING },
            ogImage: { type: Type.STRING },
            favicon: { type: Type.STRING },
            siteName: { type: Type.STRING },
            domain: { type: Type.STRING },
            okfVersion: { type: Type.STRING },
            domainDoc: { type: Type.STRING },
            docType: { type: Type.STRING },
            markdownContent: { type: Type.STRING },
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["name", "type"],
              },
            },
            relations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  targetId: { type: Type.STRING },
                  targetTitle: { type: Type.STRING },
                  relationType: { type: Type.STRING },
                  weight: { type: Type.NUMBER },
                  description: { type: Type.STRING },
                },
                required: ["targetTitle", "relationType"],
              },
            },
          },
        },
      },
      required: ["type", "title", "summary", "tags"],
    };

    let parsedJson: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema);
      if (generated?.text) {
        parsedJson = JSON.parse(generated.text);
      }
    } catch (err: any) {
      console.warn("AI generation failed for analyze-resource, using rule-based parser:", err?.message);
    }

    if (!parsedJson) {
      parsedJson = fallbackParse(trimmedInput, explicitType);
    }

    // Normalize and sanitize
    if (!parsedJson.tags) parsedJson.tags = [];
    if (!parsedJson.metadata) parsedJson.metadata = {};

    // Attach Open Graph attributes if available
    if (ogData) {
      if (!parsedJson.metadata.domain && ogData.domain) parsedJson.metadata.domain = ogData.domain;
      if (!parsedJson.metadata.siteName && ogData.siteName) parsedJson.metadata.siteName = ogData.siteName;
      if (!parsedJson.metadata.favicon && ogData.favicon) parsedJson.metadata.favicon = ogData.favicon;
      if (!parsedJson.metadata.ogDescription && ogData.ogDescription) parsedJson.metadata.ogDescription = ogData.ogDescription;
      if (!parsedJson.metadata.ogTitle && ogData.ogTitle) parsedJson.metadata.ogTitle = ogData.ogTitle;
      if (!parsedJson.metadata.ogImage && ogData.ogImage) parsedJson.metadata.ogImage = ogData.ogImage;
      if (!parsedJson.metadata.author && ogData.author) parsedJson.metadata.author = ogData.author;
    }

    // Check if input is a GitHub repository
    const ghRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/i;
    const matchGh = (parsedJson.url || trimmedInput).match(ghRegex);
    if (matchGh) {
      const owner = matchGh[1];
      const repoName = matchGh[2].replace(/\.git$/, "").replace(/[#?].*$/, "");
      parsedJson.url = `https://github.com/${owner}/${repoName}`;
      if (!parsedJson.metadata.owner) parsedJson.metadata.owner = owner;
      if (!parsedJson.metadata.repoName) parsedJson.metadata.repoName = repoName;
      if (!parsedJson.metadata.installCommand) {
        parsedJson.metadata.installCommand = `git clone https://github.com/${owner}/${repoName}.git`;
      }
      if (!explicitType || explicitType === "github_repo") {
        parsedJson.type = "github_repo";
      }
      if (!parsedJson.tags.includes("github")) parsedJson.tags.push("github");
    }

    if (explicitType && ["article", "github_repo", "mcp_server", "ai_skill", "knowledge", "link"].includes(explicitType)) {
      parsedJson.type = explicitType;
    }

    // If analyzing an article with a URL, try to scrape readable article body so full text is immediately available
    if (parsedJson.type === "article" && parsedJson.url && parsedJson.url.startsWith("http")) {
      try {
        const scraped = await fetchArticleTextFromUrl(parsedJson.url, 4000);
        if (scraped.text && scraped.text.length > 150) {
          parsedJson.metadata.markdownContent = scraped.markdown || scraped.text;
        }
      } catch {}
    }

    // UNIVERSAL OKF v0.2 SPECIFICATION GUARANTEE FOR ALL RESOURCE TYPES
    parsedJson.metadata.okfVersion = "0.2";
    if (!parsedJson.metadata.docType) {
      parsedJson.metadata.docType = parsedJson.type === "github_repo" ? "architecture"
        : parsedJson.type === "mcp_server" ? "tool_description"
        : parsedJson.type === "ai_skill" ? "prompt_skill"
        : parsedJson.type === "troubleshooting" ? "specification"
        : parsedJson.type === "article" || parsedJson.type === "link" ? "guide"
        : "concept";
    }

    if (!parsedJson.metadata.domain || parsedJson.metadata.domain === "general") {
      parsedJson.metadata.domain = parsedJson.metadata.siteName || (
        parsedJson.type === "github_repo" ? "Software Architecture"
        : parsedJson.type === "mcp_server" || parsedJson.type === "ai_skill" ? "Agentic Systems & AI"
        : parsedJson.type === "troubleshooting" ? "System Diagnostics & Fix"
        : "Software Architecture"
      );
    }

    if (!parsedJson.metadata.entities || parsedJson.metadata.entities.length === 0) {
      parsedJson.metadata.entities = [
        { name: parsedJson.title, type: "concept", description: parsedJson.summary?.slice(0, 100) || "Elemento centrale" },
        { name: parsedJson.metadata.domain, type: "domain", description: "Dominio di appartenenza" },
      ];
      if (parsedJson.metadata.owner && parsedJson.metadata.repoName) {
        parsedJson.metadata.entities.push({ name: parsedJson.metadata.repoName, type: "software", description: `Repository ${parsedJson.metadata.owner}/${parsedJson.metadata.repoName}` });
      }
      if (parsedJson.metadata.language) {
        parsedJson.metadata.entities.push({ name: parsedJson.metadata.language, type: "technology", description: `Linguaggio di programmazione: ${parsedJson.metadata.language}` });
      }
      (parsedJson.tags || []).slice(0, 3).forEach((t: string) => {
        if (t.length > 2 && t !== "dev" && t !== "knowledge") {
          parsedJson.metadata.entities.push({ name: t.charAt(0).toUpperCase() + t.slice(1), type: "technology", description: `Tag ontologico: ${t}` });
        }
      });
    }

    if (!parsedJson.metadata.relations || parsedJson.metadata.relations.length === 0) {
      parsedJson.metadata.relations = [
        { targetTitle: "Knowledge Vault", relationType: "references", weight: 0.85, description: "Archiviazione e integrazione topologica nel Vault" }
      ];
      if (Array.isArray(existingResources) && existingResources.length > 0) {
        const myTags = (parsedJson.tags || []).map((t: string) => t.toLowerCase());
        for (const er of existingResources) {
          if (er.title !== parsedJson.title) {
            const commonTags = (er.tags || []).filter((t: string) => myTags.includes(t.toLowerCase()));
            if (commonTags.length > 0) {
              parsedJson.metadata.relations.push({
                targetTitle: er.title,
                relationType: "references",
                weight: 0.75,
                description: `Correlazione tematica sui tag: ${commonTags.join(", ")}`
              });
              break;
            }
          }
        }
      }
    }

    if (!parsedJson.metadata.markdownContent || parsedJson.metadata.markdownContent.trim().length === 0) {
      const cleanTags = Array.from(new Set(parsedJson.tags.length > 0 ? parsedJson.tags : [parsedJson.type, "okf-v0.2"]));
      const entitiesYaml = (parsedJson.metadata.entities || []).map((e: any) => `  - name: "${e.name}"\n    type: "${e.type || 'concept'}"\n    description: "${e.description || 'Entità'}"`).join("\n");
      const relationsYaml = (parsedJson.metadata.relations || []).map((r: any) => `  - target_title: "${r.targetTitle || r.target_title}"\n    relation_type: "${r.relationType || r.relation_type || 'references'}"\n    weight: ${r.weight || 0.8}\n    description: "${r.description || 'Connessione'}"`).join("\n");

      parsedJson.metadata.markdownContent = `---\nokf_version: "0.2"\ntitle: "${parsedJson.title}"\ntype: "${parsedJson.metadata.docType}"\ndomain: "${parsedJson.metadata.domain}"\ntags: ${JSON.stringify(cleanTags)}\ncreated_at: "${new Date().toISOString()}"\nentities:\n${entitiesYaml}\nrelations:\n${relationsYaml}\n---\n\n# ${parsedJson.title}\n\n> **${parsedJson.metadata.docType?.toUpperCase()} · OKF v0.2**\n> Ambito: ${parsedJson.metadata.domain}\n\n## 1. Panoramica & Sintesi\n\n${parsedJson.summary || trimmedInput}\n\n${parsedJson.url ? `**URL di Riferimento:** [${parsedJson.url}](${parsedJson.url})\n\n` : ""}## 2. Specifiche Tecniche & Componenti\n\n- **Tipologia Risorsa**: \`${parsedJson.type}\`\n- **Dominio Tecnico**: \`${parsedJson.metadata.domain}\`\n- **Tipo Documento OKF**: \`${parsedJson.metadata.docType}\`\n${parsedJson.metadata.installCommand ? `- **Installazione / Clone**: \`${parsedJson.metadata.installCommand}\`\n` : ""}${parsedJson.metadata.command ? `- **Comando MCP**: \`${parsedJson.metadata.command}\`\n` : ""}\n## 3. Ontologia & Connessioni Topologiche\n\n${parsedJson.metadata.relations.map((r: any) => `- [[${r.targetTitle || r.target_title}]]: *${r.description || 'Correlazione'}* (\`${r.relationType || 'references'}\`)`).join("\n")}\n`;
    }

    res.json({ result: parsedJson, source: parsedJson ? "gemini" : "fallback" });
  } catch (error: any) {
    console.error("Analysis handler exception:", error);
    const fallbackResult = fallbackParse(req.body.input || "", req.body.explicitType);
    res.json({ result: fallbackResult, source: "fallback-after-error", error: error?.message });
  }
});

// API: Generate AI Insights (Use Cases, Pros, Cons, Utility Score 1-100)
app.post("/api/generate-insights", async (req, res) => {
  try {
    const { resource } = req.body;
    if (!resource || !resource.title) {
      return res.status(400).json({ error: "Resource object with title is required" });
    }

    const {
      title,
      type = "knowledge",
      summary = "",
      url = "",
      tags = [],
      metadata = {},
      rawInput = "",
    } = resource;

    const prompt = `You are a Principal Software Architect and Technology Strategist.
Analyze the following technical resource (Type: "${type}") and produce a rigorous, realistic, and objective technical evaluation:

Resource Details:
- Title: "${title}"
- Type: "${type}"
- URL: "${url || 'N/A'}"
- Summary: "${summary}"
- Tags: ${JSON.stringify(tags)}
- Type-Specific Metadata: ${JSON.stringify(metadata, null, 2)}
- Additional Context/Raw Input: """${(rawInput || metadata.markdownContent || summary).slice(0, 4000)}"""

Evaluate and generate in Italian (or professional software engineering terminology):
1. 'useCases': Array of 2 to 4 concrete, actionable real-world usage scenarios. Explain EXACTLY in what context, project or workflow a developer or architect should employ this resource.
2. 'pros': Array of 2 to 4 distinct key strengths, architectural advantages, or high-value features.
3. 'cons': Array of 2 to 3 genuine trade-offs, limitations, dependencies, or architectural considerations.
4. 'score': An integer score from 1 to 100 representing its overall utility, technical craftsmanship, and relevance in a modern development workflow.
5. 'scoreRationale': A concise 1-2 sentence justification for the assigned score.

Return pure JSON matching the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        useCases: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        pros: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        cons: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        score: {
          type: Type.INTEGER,
        },
        scoreRationale: {
          type: Type.STRING,
        },
      },
      required: ["useCases", "pros", "cons", "score", "scoreRationale"],
    };

    let result: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 20000);
      if (generated?.text) {
        result = JSON.parse(generated.text);
      }
    } catch (err: any) {
      console.warn("AI generation failed for generate-insights, using fallback:", err?.message);
    }

    if (result && typeof result.score === "number") {
      // Ensure score is within 1-100 bounds
      result.score = Math.max(1, Math.min(100, Math.round(result.score)));
      return res.json({
        success: true,
        source: "gemini",
        insights: result,
      });
    }

    // Heuristic Fallback Generator
    const fallbackScore = type === "mcp_server" ? 88 : type === "github_repo" ? 85 : type === "knowledge" ? 90 : type === "ai_skill" ? 86 : 82;
    const fallbackUseCases: Record<string, string[]> = {
      github_repo: [
        "Integrazione nel proprio stack di sviluppo o template di base",
        "Studio dell'architettura e pattern implementativi open-source",
        "Estensione delle funzionalità core tramite fork o plugin"
      ],
      mcp_server: [
        "Connessione come tool a Claude Desktop, Cursor o agenti autonomi",
        "Esposizione di API e dati locali o remoti al contesto LLM",
        "Automazione di flussi operativi tramite chiamate a funzione standardizzate"
      ],
      ai_skill: [
        "Inclusione nel prompt di sistema di agenti conversazionali o orchestratori",
        "Standardizzazione di comportamenti, vincoli e linee guida operative",
        "Specializzazione del modello su task verticali e formattazione rigorosa"
      ],
      article: [
        "Aggiornamento continuo su pattern architetturali e benchmark",
        "Consultazione rapida come riferimento concettuale e best practice",
        "Condivisione della conoscenza con il team di ingegneria"
      ],
      knowledge: [
        "Archiviazione secondo lo standard Open Knowledge Format (OKF v0.2)",
        "Esplorazione delle relazioni semantiche nel Grafo Topologico D3",
        "Riferimento di architettura per decisioni progettuali di lungo termine"
      ]
    };

    const fallbackPros: Record<string, string[]> = {
      github_repo: ["Codice sorgente verificabile e documentato", "Architettura modulare pronta per l'adozione", "Integrazione trasparente nell'ecosistema"],
      mcp_server: ["Conformità allo standard Model Context Protocol", "Isolamento sicuro dei comandi e delle credenziali", "Espandibilità dei tool forniti"],
      ai_skill: ["Direttive precise e vincoli ben strutturati", "Adattabilità a molteplici modelli LLM", "Riduzione delle allucinazioni tramite regole chiare"],
      article: ["Spiegazione approfondita del problema e della soluzione", "Esempi pratici e riferimenti verificati", "Facile lettura e consultazione rapida"],
      knowledge: ["Struttura formalizzata OKF con entità e relazioni", "Navigabilità nel grafo topologico", "Alta densità informativa e sintesi esecutiva"]
    };

    const fallbackCons: Record<string, string[]> = {
      github_repo: ["Richiede verifica della compatibilità delle dipendenze", "Manutenzione e aggiornamenti legati al maintainer"],
      mcp_server: ["Richiede configurazione del client MCP e variabili d'ambiente", "Dipendenza dal runtime di esecuzione locale/remoto"],
      ai_skill: ["Necessita di calibrazione in base al modello target", "Sensibile a modifiche del prompt di sistema generale"],
      article: ["Le informazioni potrebbero richiedere aggiornamenti nel tempo", "Implementazione pratica a carico dello sviluppatore"],
      knowledge: ["Richiede cura manuale continua per mantenere aggiornati i collegamenti"]
    };

    return res.json({
      success: true,
      source: "fallback",
      insights: {
        useCases: fallbackUseCases[type] || fallbackUseCases.knowledge,
        pros: fallbackPros[type] || fallbackPros.knowledge,
        cons: fallbackCons[type] || fallbackCons.knowledge,
        score: fallbackScore,
        scoreRationale: `Valutazione calcolata per ${title} (${type}) basata su rilevanza architetturale e maturità dei pattern applicati.`,
      },
    });
  } catch (error: any) {
    console.error("Generate insights error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate insights" });
  }
});

// API: Translate resource content and summary into Italian using Gemini AI (with full web article fetching if URL is provided)
app.post("/api/translate-resource", async (req, res) => {
  try {
    const { resource } = req.body;
    if (!resource || !resource.title) {
      return res.status(400).json({ error: "Resource object with title is required" });
    }

    const {
      title = "",
      type = "article",
      summary = "",
      url = "",
      rawInput = "",
      metadata = {},
    } = resource;

    let fullContent = metadata.markdownContent || rawInput || "";
    let fetchedOriginalContent = "";

    // If it's an article (or has a web URL) and we don't have the full body content, fetch it from the web!
    if (url && url.startsWith("http") && (!fullContent || fullContent.trim().length < 200)) {
      try {
        console.log(`[Translate] Fetching full article text from: ${url}`);
        const scraped = await fetchArticleTextFromUrl(url, 6500);
        if (scraped.text && scraped.text.length > 100) {
          fetchedOriginalContent = scraped.markdown || scraped.text;
          fullContent = fetchedOriginalContent;
        }
      } catch (err: any) {
        console.warn(`[Translate] Could not scrape full body from ${url}:`, err?.message);
      }
    }

    // If still empty, fall back to summary
    if (!fullContent || fullContent.trim().length === 0) {
      fullContent = summary || title;
    }

    const prompt = `You are a Principal Technical Translator, Software Localization Specialist, and Technical Editor.
Translate the following technical resource (Type: "${type}") into natural, fluent, comprehensive, and professional Italian.

Translation Rules:
1. Technical Fidelity: Keep all code snippets, bash commands, JSON blocks, YAML, API endpoints, variable names, keywords, and library names unchanged.
2. Complete Article Translation: If an article body or documentation text is provided, translate the ENTIRE text in rich Markdown. Do not summarize or cut it short — translate all sections, subheadings, paragraphs, lists, and explanations.
3. Structure: Maintain complete Markdown formatting (headers #, ##, ###, bold, bullet points, numbered lists, blockquotes, code blocks, links).
4. Quality: Produce an authoritative, highly readable Italian text suitable for senior software engineers, architects, and researchers.
5. Translate:
   - 'translatedTitle': Italian version of the title.
   - 'translatedSummary': Comprehensive Italian translation / executive abstract of the summary.
   - 'translatedContent': Full, detailed Italian translation of the entire article text / Markdown body / README / documentation.

Resource Details:
- Title: "${title}"
- Type: "${type}"
- URL: "${url || 'N/A'}"
- Summary: """${summary}"""
- Content: """${fullContent.slice(0, 30000)}"""

Return pure JSON matching the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        translatedTitle: { type: Type.STRING },
        translatedSummary: { type: Type.STRING },
        translatedContent: { type: Type.STRING },
        language: { type: Type.STRING },
      },
      required: ["translatedTitle", "translatedSummary", "translatedContent"],
    };

    let result: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 30000);
      if (generated?.text) {
        result = JSON.parse(generated.text);
      }
    } catch (err: any) {
      console.warn("AI generation failed for translate-resource, using fallback:", err?.message);
    }

    if (result && result.translatedSummary) {
      return res.json({
        success: true,
        source: "gemini",
        fetchedOriginalContent: fetchedOriginalContent || undefined,
        translation: {
          translatedTitle: result.translatedTitle || title,
          translatedSummary: result.translatedSummary,
          translatedContent: result.translatedContent || fullContent,
          language: "it",
          translatedAt: new Date().toISOString(),
        },
      });
    }

    // Heuristic fallback translation
    return res.json({
      success: true,
      source: "fallback",
      fetchedOriginalContent: fetchedOriginalContent || undefined,
      translation: {
        translatedTitle: `[IT] ${title}`,
        translatedSummary: summary ? `[Traduzione automatica locale]\n${summary}` : "Nessun sommario disponibile.",
        translatedContent: fullContent ? `## Traduzione di "${title}"\n\n${fullContent}` : "",
        language: "it",
        translatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Translate resource error:", error);
    res.status(500).json({ error: error?.message || "Failed to translate resource" });
  }
});

// API: Generate High-Density Executive Summary & Actionable Brief in Italian
app.post("/api/summarize-resource", async (req, res) => {
  try {
    const { resource } = req.body;
    if (!resource || !resource.title) {
      return res.status(400).json({ error: "Resource object with title is required" });
    }

    const {
      title = "",
      type = "article",
      summary = "",
      url = "",
      tags = [],
      rawInput = "",
      metadata = {},
    } = resource;

    const fullContent = metadata.markdownContent || rawInput || summary || "";

    const prompt = `You are a Principal Technology Analyst and Executive Editor.
Create a high-density, structured Executive Brief in Italian for this technical resource.

Resource Information:
- Title: "${title}"
- Type: "${type}"
- URL: "${url || 'N/A'}"
- Tags: ${JSON.stringify(tags)}
- Summary: """${summary}"""
- Full Body / Content: """${fullContent.slice(0, 10000)}"""

Produce the following in Italian:
1. 'executiveSummary': A crystal-clear 2-4 sentence executive overview explaining what this resource is, why it matters, and its core value proposition.
2. 'keyTakeaways': Array of 3 to 6 practical, concrete bullet points (architectural concepts, findings, technical capabilities).
3. 'targetAudience': A concise definition of who should read or use this (e.g., "Sviluppatori Backend, Data Engineers, AI Architects").
4. 'actionItems': Array of 2 to 4 immediate actionable next steps to test, adopt, or apply this knowledge.
5. 'estimatedReadingTime': A string or number representing the estimated time to study or implement (e.g. "5 minuti" or "15 minuti").

Return pure JSON matching the schema.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        executiveSummary: { type: Type.STRING },
        keyTakeaways: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        targetAudience: { type: Type.STRING },
        actionItems: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        estimatedReadingTime: { type: Type.STRING },
      },
      required: ["executiveSummary", "keyTakeaways", "targetAudience", "actionItems"],
    };

    let result: any = null;
    try {
      const generated = await generateWithGeminiFallback(prompt, schema, 20000);
      if (generated?.text) {
        result = JSON.parse(generated.text);
      }
    } catch (err: any) {
      console.warn("AI generation failed for summarize-resource, using fallback:", err?.message);
    }

    if (result && result.executiveSummary) {
      return res.json({
        success: true,
        source: "gemini",
        summaryResult: {
          executiveSummary: result.executiveSummary,
          keyTakeaways: result.keyTakeaways || [],
          targetAudience: result.targetAudience || "Sviluppatori e Ingegneri Software",
          actionItems: result.actionItems || [],
          estimatedReadingTime: result.estimatedReadingTime || "5 minuti",
          summarizedAt: new Date().toISOString(),
        },
      });
    }

    // Heuristic Fallback summary
    const typeLabel = type === "github_repo" ? "Repository GitHub" : type === "mcp_server" ? "Server MCP" : type === "ai_skill" ? "AI Skill" : type === "knowledge" ? "Documento OKF" : "Articolo Tecnico";

    return res.json({
      success: true,
      source: "fallback",
      summaryResult: {
        executiveSummary: `${title} è una risorsa di tipo ${typeLabel}. Fornisce strumenti e metodologie essenziali per l'architettura applicativa e l'orchestrazione software.`,
        keyTakeaways: [
          summary ? summary.slice(0, 140) + "..." : "Panoramica completa sulle specifiche e pattern operativi.",
          `Classificato nella categoria ${type} con integrazione nel Vault.`,
          "Pronto per l'adozione e il collegamento semantico nel Grafo D3."
        ],
        targetAudience: "Team di Sviluppo, Architetti Software e Specialisti AI",
        actionItems: [
          "Consultare la risorsa originale o la documentazione allegata",
          "Collegare la risorsa ad altri nodi correlati nel Knowledge Vault",
          "Testare l'implementazione o i pattern descritti in ambiente di sviluppo"
        ],
        estimatedReadingTime: "4 minuti",
        summarizedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Summarize resource error:", error);
    res.status(500).json({ error: error?.message || "Failed to summarize resource" });
  }
});

// ==========================================
// SERVER-SIDE DURABLE BACKUP & VAULT STORE
// ==========================================
const DATA_DIR = path.join(process.cwd(), "data");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");
const BACKUP_FILE_PATH = path.join(DATA_DIR, "vault-backup.json");

// Ensure data and snapshot directories exist
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Failed to create data directory:", e);
}

// POST /api/vault/backup - Save resources and raw files to backend filesystem
app.post("/api/vault/backup", async (req, res) => {
  try {
    const { resources, rawFiles, userId } = req.body;
    if (!Array.isArray(resources)) {
      return res.status(400).json({ error: "Missing or invalid 'resources' array in body" });
    }

    if (!fs.existsSync(DATA_DIR)) {
      await fsPromises.mkdir(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      await fsPromises.mkdir(SNAPSHOTS_DIR, { recursive: true });
    }

    // Preservation Shield: If existing backup file has content, save a snapshot before overwriting
    if (fs.existsSync(BACKUP_FILE_PATH)) {
      try {
        const oldContent = await fsPromises.readFile(BACKUP_FILE_PATH, "utf8");
        const oldParsed = JSON.parse(oldContent);
        const oldCount = Array.isArray(oldParsed.resources) ? oldParsed.resources.length : 0;
        if (oldCount > 0) {
          const snapName = `snapshot-${Date.now()}-${oldCount}items.json`;
          const snapPath = path.join(SNAPSHOTS_DIR, snapName);
          await fsPromises.writeFile(snapPath, oldContent, "utf8");

          // Keep maximum 20 latest snapshots
          const existingSnaps = await fsPromises.readdir(SNAPSHOTS_DIR);
          if (existingSnaps.length > 20) {
            existingSnaps.sort();
            for (let i = 0; i < existingSnaps.length - 20; i++) {
              await fsPromises.unlink(path.join(SNAPSHOTS_DIR, existingSnaps[i])).catch(() => {});
            }
          }
        }
      } catch (backupSnapErr) {
        console.warn("Non-fatal error creating snapshot backup:", backupSnapErr);
      }
    }

    const payload = {
      vaultVersion: "0.2",
      savedAt: new Date().toISOString(),
      timestamp: Date.now(),
      userId: userId || "local-user",
      totalResources: resources.length,
      totalRawFiles: Array.isArray(rawFiles) ? rawFiles.length : 0,
      resources,
      rawFiles: Array.isArray(rawFiles) ? rawFiles : [],
    };

    const jsonString = JSON.stringify(payload, null, 2);
    await fsPromises.writeFile(BACKUP_FILE_PATH, jsonString, "utf8");

    const stat = await fsPromises.stat(BACKUP_FILE_PATH);

    res.json({
      success: true,
      count: resources.length,
      rawFilesCount: payload.totalRawFiles,
      savedAt: payload.savedAt,
      timestamp: payload.timestamp,
      fileSizeBytes: stat.size,
      formattedSize: `${(stat.size / 1024).toFixed(1)} KB`,
    });
  } catch (error: any) {
    console.error("Failed to write vault backup to filesystem:", error);
    res.status(500).json({ error: error?.message || "Failed to save backup to server filesystem" });
  }
});

// GET /api/vault/snapshots - List available historical snapshots
app.get("/api/vault/snapshots", async (_req, res) => {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      return res.json({ snapshots: [] });
    }
    const files = await fsPromises.readdir(SNAPSHOTS_DIR);
    const snapshots = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(SNAPSHOTS_DIR, file);
        const stat = await fsPromises.stat(filePath);
        // Extract count from filename if possible: snapshot-<timestamp>-<count>items.json
        const match = file.match(/snapshot-(\d+)-(\d+)items\.json/);
        const timestamp = match ? parseInt(match[1], 10) : stat.mtimeMs;
        const count = match ? parseInt(match[2], 10) : 0;
        snapshots.push({
          filename: file,
          timestamp,
          formattedDate: new Date(timestamp).toLocaleString("it-IT"),
          count,
          sizeBytes: stat.size,
          formattedSize: `${(stat.size / 1024).toFixed(1)} KB`,
        });
      }
    }
    snapshots.sort((a, b) => b.timestamp - a.timestamp);
    res.json({ snapshots });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list snapshots" });
  }
});

// GET /api/vault/snapshot-detail - Get specific snapshot file contents
app.get("/api/vault/snapshot-detail", async (req, res) => {
  try {
    const filename = String(req.query.filename || "");
    if (!filename || filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({ error: "Invalid snapshot filename" });
    }
    const filePath = path.join(SNAPSHOTS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Snapshot not found" });
    }
    const content = await fsPromises.readFile(filePath, "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(content);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to read snapshot" });
  }
});

// GET /api/vault/backup - Load persistent vault backup from backend filesystem
app.get("/api/vault/backup", async (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_FILE_PATH)) {
      return res.json({
        success: true,
        exists: false,
        data: null,
      });
    }

    const content = await fsPromises.readFile(BACKUP_FILE_PATH, "utf8");
    const parsed = JSON.parse(content);
    const stat = await fsPromises.stat(BACKUP_FILE_PATH);

    res.json({
      success: true,
      exists: true,
      savedAt: parsed.savedAt,
      timestamp: parsed.timestamp || stat.mtimeMs,
      fileSizeBytes: stat.size,
      totalResources: parsed.resources?.length || 0,
      totalRawFiles: parsed.rawFiles?.length || 0,
      resources: parsed.resources || [],
      rawFiles: parsed.rawFiles || [],
    });
  } catch (error: any) {
    console.error("Failed to read vault backup from filesystem:", error);
    res.status(500).json({ error: error?.message || "Failed to read backup from server filesystem" });
  }
});

// GET /api/vault/backup-status - Check status of backend backup file
app.get("/api/vault/backup-status", async (_req, res) => {
  try {
    if (!fs.existsSync(BACKUP_FILE_PATH)) {
      return res.json({
        exists: false,
        path: BACKUP_FILE_PATH,
        count: 0,
      });
    }

    const stat = await fsPromises.stat(BACKUP_FILE_PATH);
    const content = await fsPromises.readFile(BACKUP_FILE_PATH, "utf8");
    let count = 0;
    let savedAt = stat.mtime.toISOString();
    try {
      const parsed = JSON.parse(content);
      count = parsed.resources?.length || 0;
      if (parsed.savedAt) savedAt = parsed.savedAt;
    } catch {}

    res.json({
      exists: true,
      savedAt,
      fileSizeBytes: stat.size,
      formattedSize: `${(stat.size / 1024).toFixed(1)} KB`,
      count,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to get backup status" });
  }
});

// GET /api/vault/resources - External Agent API: query and filter vault resources
app.get("/api/vault/resources", async (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_FILE_PATH)) {
      return res.json({ success: true, count: 0, resources: [] });
    }
    const content = await fsPromises.readFile(BACKUP_FILE_PATH, "utf8");
    const parsed = JSON.parse(content);
    let items: any[] = parsed.resources || [];

    const { type, tag, q } = req.query;
    if (type && typeof type === "string") {
      items = items.filter((i) => i.type === type);
    }
    if (tag && typeof tag === "string") {
      const searchTag = tag.toLowerCase();
      items = items.filter((i) => Array.isArray(i.tags) && i.tags.some((t: string) => t.toLowerCase() === searchTag));
    }
    if (q && typeof q === "string") {
      const query = q.toLowerCase();
      items = items.filter(
        (i) =>
          (i.title && i.title.toLowerCase().includes(query)) ||
          (i.summary && i.summary.toLowerCase().includes(query)) ||
          (i.metadata?.domain && i.metadata.domain.toLowerCase().includes(query))
      );
    }

    res.json({
      success: true,
      totalAvailable: parsed.resources?.length || 0,
      matchedCount: items.length,
      resources: items.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        summary: r.summary,
        tags: r.tags || [],
        url: r.url || "",
        domain: r.metadata?.domain || "",
        docType: r.metadata?.docType || "",
        entities: r.metadata?.entities || [],
        relations: r.metadata?.relations || [],
        rawUrl: `/api/vault/resources/${r.id}/raw`,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to query vault resources" });
  }
});

// GET /api/vault/resources/:id/raw - External Agent API: download pure OKF v0.2 Markdown with YAML frontmatter
app.get("/api/vault/resources/:id/raw", async (req, res) => {
  try {
    const { id } = req.params;
    if (!fs.existsSync(BACKUP_FILE_PATH)) {
      return res.status(404).send("Knowledge Vault storage empty or not found.");
    }
    const content = await fsPromises.readFile(BACKUP_FILE_PATH, "utf8");
    const parsed = JSON.parse(content);
    const items: any[] = parsed.resources || [];
    const item = items.find((r) => r.id === id);

    if (!item) {
      return res.status(404).send(`Resource with ID '${id}' not found.`);
    }

    let markdown = item.metadata?.markdownContent || "";
    if (!markdown || !markdown.startsWith("---")) {
      // Build standard OKF v0.2 YAML frontmatter dynamically if missing
      const frontmatter = [
        "---",
        `okf_version: "0.2"`,
        `title: ${JSON.stringify(item.title || "Untitled")}`,
        `type: ${JSON.stringify(item.type || "concept")}`,
        `domain: ${JSON.stringify(item.metadata?.domain || "General Knowledge")}`,
        `tags: ${JSON.stringify(item.tags || [])}`,
        `entities: ${JSON.stringify(item.metadata?.entities || [])}`,
        `relations: ${JSON.stringify(item.metadata?.relations || [])}`,
        `created_at: ${JSON.stringify(item.createdAt || new Date().toISOString())}`,
        "---",
        "",
        `# ${item.title}`,
        "",
        item.summary || "",
        "",
        markdown || "",
      ].join("\n");
      markdown = frontmatter;
    }

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${(item.title || "document").replace(/[^a-zA-Z0-9_-]/g, "_")}.md"`);
    res.send(markdown);
  } catch (error: any) {
    res.status(500).send(`Error retrieving resource: ${error?.message}`);
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Knowledge Vault server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
