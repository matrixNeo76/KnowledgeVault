import express from "express";
import path from "path";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

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
  let type: "article" | "github_repo" | "mcp_server" | "ai_skill" | "knowledge" | "link" = (explicitType as any) || "knowledge";
  let title = "Nuova Risorsa";
  let summary = "";
  let tags: string[] = [];
  let url = "";
  const metadata: Record<string, any> = {};

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
    summary = cleanParagraph.slice(0, 300) + (cleanParagraph.length > 300 ? "..." : "");

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
      summary = lines.slice(1).join(" ").slice(0, 300) || lines[0];
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

  if (explicitType && ["article", "github_repo", "mcp_server", "ai_skill", "knowledge", "link"].includes(explicitType)) {
    type = explicitType as any;
  }

  return {
    type,
    title,
    url,
    summary: summary || text.slice(0, 300),
    tags: Array.from(new Set(tags)),
    metadata,
  };
}

// Resilient Gemini Generator with valid candidate models and reliable timeout
async function generateWithGeminiFallback(prompt: string, schema: any, timeoutMs = 20000) {
  const ai = getGenAI();
  if (!ai) return null;

  // Use current supported models per guidelines (gemini-3.7-flash, gemini-flash-latest, gemini-3.1-flash-lite)
  const candidateModels = [
    "gemini-3.7-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
  ];

  for (const modelName of candidateModels) {
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
        return { text: response.text, modelUsed: modelName };
      }
    } catch (err: any) {
      const isQuota = err?.status === "RESOURCE_EXHAUSTED" || err?.message?.includes("quota") || err?.message?.includes("429");
      const isUnavailable = err?.status === "UNAVAILABLE" || err?.code === 503 || err?.message?.includes("503") || err?.message?.includes("high demand");
      
      if (isQuota) {
        console.warn(`[Gemini] ${modelName} quota limit reached, attempting next model...`);
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

// API Health
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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

    const prompt = `You are an expert Knowledge Graph Architect and Technical Writer.
Convert and enhance the following raw text/document into the Open Knowledge Format (OKF v0.2) specification.

Raw Document content (Filename: "${filename || 'document'}"):
"""
${rawText.slice(0, 8000)}
"""

Existing resources currently in the user's Vault for cross-linking:
${JSON.stringify(contextList, null, 2)}

OKF v0.2 Guidelines:
1. Extract a clear and authoritative title.
2. Write an executive summary in Italian.
3. Identify 3-7 technical tags.
4. Determine domain (e.g. 'ai-agents', 'mcp-ecosystem', 'backend-architecture', 'database', 'frontend', 'security').
5. Determine docType: 'concept' | 'specification' | 'architecture' | 'guide' | 'snippet' | 'research'.
6. Extract key entities: array of objects with { name: string, type: string, description: string }.
7. Build semantic relations with other existing items or key entities:
   array of { targetId?: string, targetTitle: string, relationType: 'references' | 'implements' | 'depends_on' | 'extends' | 'related', weight: number (0.1-1.0), description?: string }.
8. Generate the complete Markdown body adhering to OKF v0.2:
   - Include the full YAML frontmatter block starting with --- and ending with ---
   - Frontmatter must include: okf_version: "0.2", title, type, domain, tags, entities, relations, created_at.
   - In the markdown body, insert wikilinks [[Target Title]] or [[Key Concept]] for related entities.

Return JSON matching the schema.`;

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
      const generated = await generateWithGeminiFallback(prompt, schema);
      if (generated?.text) {
        parsed = JSON.parse(generated.text);
      }
    } catch (e: any) {
      console.warn("AI generation failed for process-knowledge, using fallback parser:", e?.message);
    }

    if (parsed && parsed.title) {
      return res.json({
        result: {
          type: "knowledge",
          title: parsed.title,
          summary: parsed.summary,
          tags: parsed.tags || ["knowledge", "okf-v0.2"],
          metadata: {
            okfVersion: "0.2",
            domain: parsed.domain || "general",
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
      : `---\nokf_version: "0.2"\ntitle: "${inferredTitle}"\ntype: "concept"\ndomain: "software-engineering"\ntags: ["knowledge", "okf-v0.2"]\ncreated_at: "${new Date().toISOString()}"\nentities:\n  - name: "${inferredTitle}"\n    type: "concept"\nrelations:\n  - target_title: "Knowledge Vault"\n    relation_type: "references"\n    weight: 0.85\n---\n\n# ${inferredTitle}\n\n${rawText}`;

    return res.json({
      result: {
        type: "knowledge",
        title: inferredTitle,
        summary: rawText.slice(0, 280) + "...",
        tags: ["knowledge", "okf-v0.2", "doc"],
        metadata: {
          okfVersion: "0.2",
          domain: "software-engineering",
          docType: "concept",
          markdownContent: okfDoc,
          entities: [{ name: inferredTitle, type: "concept", description: "Concetto primario" }],
          relations: contextList.slice(0, 2).map((c) => ({
            targetId: c.id,
            targetTitle: c.title,
            relationType: "references",
            weight: 0.8,
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
    const { input, explicitType } = req.body;
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
Analyze the following text or URL to extract structured information for a developer knowledge base.

Target Categories:
1. 'github_repo' - GitHub repositories, packages, tools (CRITICAL: any github.com URL must be classified as github_repo unless explicitType says otherwise)
2. 'mcp_server' - Model Context Protocol servers, tools, connectors for Claude/Gemini/AI agents
3. 'knowledge' - Architecture documents, specifications, second-brain knowledge notes adhering to OKF v0.2 format
4. 'ai_skill' - AI System prompts, agents instructions, persona templates, workflow skills
5. 'article' - Blog posts, research papers, documentation, tutorials, architectural guides
6. 'link' - Web links, online tools, SaaS platforms, portals, official sites, web apps, API references

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

Instructions:
- If input contains "github.com/" or is a repo format "owner/repo", set type to 'github_repo' (unless explicitType is specifically 'mcp_server' or 'knowledge').
- If input is a generic website or online tool URL (not a blog post or github repo), or if explicitType is 'link', classify as 'link'.
- Extract a clean, precise title. For GitHub repos, use 'owner/repo' or repo name.
- If a URL is present or inferred, format as full https:// URL.
- Write a clear, comprehensive summary (in Italian or English, favoring informative Italian).
- Generate 3 to 6 relevant lowercase tags (e.g. ['github', 'typescript', 'open-source', 'agents', 'web-tool']).
- Fill type-specific metadata:
  - If github_repo: { owner, repoName, language, installCommand: "git clone https://github.com/owner/repo.git" }
  - If mcp_server: { protocol: 'stdio' | 'sse', command, args, env, configSnippet, toolsProvided }
  - If ai_skill: { skillType, recommendedModel, systemPrompt, triggerKeywords, exampleUsage }
  - If article: { author, readingTimeMin, keyTakeaways: [], ogDescription, favicon, siteName, domain }
  - If link: { siteName, domain, favicon, ogDescription, ogImage }
  - If knowledge: { domain, docType, okfVersion: '0.2', entities: [], relations: [] }

Return pure JSON matching this exact structure:
{
  "type": "article" | "github_repo" | "mcp_server" | "ai_skill" | "knowledge" | "link",
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
          enum: ["article", "github_repo", "mcp_server", "ai_skill", "knowledge", "link"],
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

    // Ensure Knowledge resources have full OKF v0.2 metadata
    if (parsedJson.type === "knowledge") {
      parsedJson.metadata.okfVersion = parsedJson.metadata.okfVersion || "0.2";
      parsedJson.metadata.domain = parsedJson.metadata.domain || "Agentic Systems & AI";
      parsedJson.metadata.docType = parsedJson.metadata.docType || "concept";
      
      if (!parsedJson.metadata.markdownContent || parsedJson.metadata.markdownContent.trim().length === 0) {
        parsedJson.metadata.markdownContent = trimmedInput.startsWith("---")
          ? trimmedInput
          : `---\nokf_version: "0.2"\ntitle: "${parsedJson.title}"\ntype: "${parsedJson.metadata.docType}"\ndomain: "${parsedJson.metadata.domain}"\ntags: ${JSON.stringify(parsedJson.tags)}\ncreated_at: "${new Date().toISOString()}"\n---\n\n# ${parsedJson.title}\n\n${trimmedInput}`;
      }

      if (!parsedJson.metadata.entities || parsedJson.metadata.entities.length === 0) {
        parsedJson.metadata.entities = [
          { name: parsedJson.title, type: "concept", description: parsedJson.summary?.slice(0, 100) || "Elemento centrale" }
        ];
      }

      if (!parsedJson.metadata.relations) {
        parsedJson.metadata.relations = [];
      }
    } else if (parsedJson.type === "article" && parsedJson.url && parsedJson.url.startsWith("http")) {
      // If analyzing an article with a URL, try to scrape readable article body so full text is immediately available
      try {
        const scraped = await fetchArticleTextFromUrl(parsedJson.url, 4000);
        if (scraped.text && scraped.text.length > 150) {
          parsedJson.metadata.markdownContent = scraped.markdown || scraped.text;
        }
      } catch {}
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
