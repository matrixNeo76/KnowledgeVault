import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Helper to get GoogleGenAI client lazily
let genAIClient: GoogleGenAI | null = null;
function getGenAI() {
  if (!genAIClient && process.env.GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return genAIClient;
}

// Fallback heuristic parser if Gemini API is unavailable or busy
function fallbackParse(rawText: string, explicitType?: string) {
  const text = rawText.trim();
  let type: "article" | "github_repo" | "mcp_server" | "ai_skill" | "knowledge" = "article";
  let title = "Risorsa senza titolo";
  let url = "";
  let summary = "";
  const tags: string[] = [];
  const metadata: Record<string, any> = {};

  // Check URL pattern
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    url = urlMatch[0];
  }

  // GitHub URL
  if (url.includes("github.com/")) {
    const ghMatch = url.match(/github\.com\/([^\/]+)\/([^\/\s#?]+)/i);
    if (ghMatch) {
      const owner = ghMatch[1];
      const repoName = ghMatch[2].replace(/\.git$/, "");
      title = `${owner}/${repoName}`;
      
      // Check if it might be an MCP server
      if (text.toLowerCase().includes("mcp") || text.toLowerCase().includes("model context protocol") || repoName.toLowerCase().includes("mcp")) {
        type = "mcp_server";
        tags.push("mcp", "model-context-protocol", "server");
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
      } else {
        type = "github_repo";
        tags.push("github", "open-source", repoName.toLowerCase());
        metadata.owner = owner;
        metadata.repoName = repoName;
        metadata.installCommand = `git clone https://github.com/${owner}/${repoName}.git`;
      }
      summary = `Repository GitHub ${owner}/${repoName}`;
    }
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
    // Article or general note
    type = (explicitType as any) || "article";
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    if (lines.length > 0) {
      title = lines[0].replace(/^#+\s*/, "").slice(0, 100);
      summary = lines.slice(1).join(" ").slice(0, 300) || lines[0];
    }
    tags.push("knowledge", "dev");
  }

  if (explicitType && ["article", "github_repo", "mcp_server", "ai_skill", "knowledge"].includes(explicitType)) {
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

// Resilient Gemini Generator with candidate models and reliable timeout
async function generateWithGeminiFallback(prompt: string, schema: any, timeoutMs = 15000) {
  const ai = getGenAI();
  if (!ai) return null;

  const candidateModels = [
    "gemini-3.7-flash",
    "gemini-2.5-flash",
  ];

  let lastError: any = null;

  for (const modelName of candidateModels) {
    try {
      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      if (response && response.text) {
        return { text: response.text, modelUsed: modelName };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini] ${modelName} skipped (${err?.status || err?.message})`);
    }
  }

  throw lastError || new Error("Gemini generation skipped");
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

// API: Analyze text/link and extract structured metadata using Gemini
app.post("/api/analyze-resource", async (req, res) => {
  try {
    const { input, explicitType } = req.body;
    if (!input || typeof input !== "string" || input.trim().length === 0) {
      return res.status(400).json({ error: "Input string is required" });
    }

    const trimmedInput = input.trim();
    const prompt = `You are an expert AI software architect and knowledge curator.
Analyze the following text or URL to extract structured information for a developer knowledge base.

Target Categories:
1. 'github_repo' - GitHub repositories, packages, tools
2. 'mcp_server' - Model Context Protocol servers, tools, connectors for Claude/Gemini/AI agents
3. 'knowledge' - Architecture documents, specifications, second-brain knowledge notes adhering to OKF v0.2 format
4. 'ai_skill' - AI System prompts, agents instructions, persona templates, workflow skills
5. 'article' - Blog posts, research papers, documentation, tutorials, architectural guides

User Raw Input:
"""
${trimmedInput}
"""
${explicitType ? `User requested type hint: ${explicitType}` : ""}

Instructions:
- Detect the exact resource type ('article', 'github_repo', 'mcp_server', 'ai_skill', or 'knowledge').
- Extract a clean, precise title.
- If a URL is present or inferred, extract it into 'url'.
- Write a clear, comprehensive summary (in Italian or English depending on context, favoring informative Italian).
- Generate 3 to 6 relevant lowercase tags (e.g. ['typescript', 'mcp', 'gemini', 'database', 'agents']).
- Fill type-specific metadata:
  - If github_repo: { owner, repoName, language, stars, installCommand }
  - If mcp_server: { protocol: 'stdio' | 'sse', command, args, env, configSnippet, toolsProvided }
  - If ai_skill: { skillType, recommendedModel, systemPrompt, triggerKeywords, exampleUsage }
  - If article: { author, readingTimeMin, keyTakeaways: [] }
  - If knowledge: { domain, docType, okfVersion: '0.2', entities: [], relations: [] }

Return pure JSON matching this exact structure:
{
  "type": "article" | "github_repo" | "mcp_server" | "ai_skill" | "knowledge",
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
          enum: ["article", "github_repo", "mcp_server", "ai_skill", "knowledge"],
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
            okfVersion: { type: Type.STRING },
            domain: { type: Type.STRING },
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
    if (explicitType && ["article", "github_repo", "mcp_server", "ai_skill", "knowledge"].includes(explicitType)) {
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
    }

    res.json({ result: parsedJson, source: parsedJson ? "gemini" : "fallback" });
  } catch (error: any) {
    console.error("Analysis handler exception:", error);
    const fallbackResult = fallbackParse(req.body.input || "", req.body.explicitType);
    res.json({ result: fallbackResult, source: "fallback-after-error", error: error?.message });
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
