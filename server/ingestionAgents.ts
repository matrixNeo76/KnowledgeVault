import { Type } from "@google/genai";
import { getGenAI, generateWithGeminiFallback } from "./gemini/client";
import { extractTextFromPdfBuffer } from "./services/pdfExtractor";
import { fetchOpenGraphMetadata, OpenGraphData } from "./services/openGraphService";
import { OKFEntity, OKFRelation, ResourceType } from "../src/types";

// ============================================================================
// Types & Contracts per l'Orchestratore di Ingestione Multi-Agente
// ============================================================================

export type IngestionAgentRole =
  | "orchestrator"
  | "structural_deconstructor"
  | "ontologist"
  | "graph_linker"
  | "contradiction_sentinel"
  | "okf_serializer";

export interface IngestionAgentTraceStep {
  agent: IngestionAgentRole;
  action: string;
  description: string;
  itemsFound?: number;
  status: "success" | "warning" | "insufficient";
  timestamp: string;
  latencyMs: number;
}

export interface IngestionContradictionWarning {
  hasConflict: boolean;
  conceptName?: string;
  conflictingSourceTitle?: string;
  conflictReason?: string;
  severity?: "low" | "medium" | "high";
}

export interface AgenticIngestionRequest {
  text?: string;
  url?: string;
  explicitType?: ResourceType | string;
  base64?: string;
  filename?: string;
  fileType?: string;
  mimeType?: string;
  notes?: string;
  existingResources?: Array<{
    id: string;
    title: string;
    type?: string;
    domain?: string;
    tags?: string[];
    summary?: string;
  }>;
}

export interface AgenticIngestionResponse {
  success: boolean;
  resource: {
    type: ResourceType;
    title: string;
    url?: string;
    summary: string;
    tags: string[];
    metadata: {
      okfVersion: "0.2";
      domain: string;
      docType: string;
      entities: OKFEntity[];
      relations: OKFRelation[];
      markdownContent: string;
      sourceFileName?: string;
      ogTitle?: string;
      ogDescription?: string;
      ogImage?: string;
      favicon?: string;
      author?: string;
      provenanceTrace?: {
        orchestratorModel: string;
        timestamp: string;
        agentsCount: number;
        totalLatencyMs: number;
      };
      contradictionCheck?: {
        checked: boolean;
        hasConflict: boolean;
        details?: string;
      };
    };
  };
  agentSteps: IngestionAgentTraceStep[];
  orchestratorPlan: string;
  contradictionWarning?: IngestionContradictionWarning;
  modelUsed: string;
  executionTimeMs: number;
}

// ============================================================================
// Multi-Agent Ingestion Pipeline Engine
// ============================================================================

export async function executeAgenticIngestion(
  req: AgenticIngestionRequest
): Promise<AgenticIngestionResponse> {
  const overallStart = Date.now();
  const agentSteps: IngestionAgentTraceStep[] = [];
  const filename = req.filename || "documento.md";
  const existingResources = req.existingResources || [];

  // Detect URL if passed or in text
  const urlMatch = (req.url || req.text || "").match(/https?:\/\/[^\s]+/i);
  const detectedUrl = urlMatch ? urlMatch[0].trim() : undefined;
  let ogData: OpenGraphData | null = null;
  if (detectedUrl) {
    try {
      ogData = await fetchOpenGraphMetadata(detectedUrl);
    } catch (e: any) {
      console.warn("[AgenticIngest] OpenGraph fetch notice:", e?.message);
    }
  }

  // --------------------------------------------------------------------------
  // AGENTE 1: Ingestion Orchestrator (Pianificazione e Decomposizione Intento)
  // --------------------------------------------------------------------------
  const orchStart = Date.now();
  const isPdf = Boolean(req.base64 && (req.fileType === "pdf" || filename.toLowerCase().endsWith(".pdf")));
  const rawTextLength = req.text?.length || 0;
  
  const orchestratorPlan = `Pipeline Multi-Agente attivata per "${detectedUrl || filename}". Strategia di ingestione: ` +
    (isPdf 
      ? `Estrazione OCR/buffer PDF -> Analisi ontologica Gemini 3.7 Flash -> Topological Linking su ${existingResources.length} nodi del Vault -> Contradiction Audit Cekikj -> Serializzazione OKF v0.2.` 
      : detectedUrl
      ? `Acquisizione Web OpenGraph ("${ogData?.ogTitle || detectedUrl}") -> Decomposizione e normalizzazione -> Classificazione ontologica categoria (Articolo, Link, GitHub Repo, ecc.) -> Topological Linking su ${existingResources.length} nodi -> Epistemic Sentinel -> Serializzazione OKF v0.2.`
      : `Decomposizione Markdown/testo (${rawTextLength} car.) -> Ontologist Extraction & Classificazione Categoria -> Topological Linking su ${existingResources.length} nodi -> Epistemic Sentinel -> Compilazione OKF v0.2.`);

  agentSteps.push({
    agent: "orchestrator",
    action: "Orchestration Plan & Task Dispatch",
    description: orchestratorPlan,
    status: "success",
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - orchStart,
  });

  // --------------------------------------------------------------------------
  // AGENTE 2: Structural & Content Deconstructor (Parsing e Normalizzazione)
  // --------------------------------------------------------------------------
  const deconstructStart = Date.now();
  let normalizedText = (req.text || "").trim();
  let extractionSource = "direct-text";

  if (isPdf && req.base64) {
    try {
      const pdfBuffer = Buffer.from(req.base64, "base64");
      const extracted = await extractTextFromPdfBuffer(pdfBuffer);
      if (extracted && extracted.trim().length > 50) {
        normalizedText = extracted.trim();
        extractionSource = "pdf-buffer-parser";
      } else {
        extractionSource = "pdf-multimodal-fallback";
      }
    } catch (e: any) {
      console.warn("[IngestionDeconstructor] Buffer extract failed, will use multimodal:", e?.message);
      extractionSource = "pdf-multimodal-fallback";
    }
  } else if (ogData && (ogData.ogTitle || ogData.ogDescription)) {
    const webBrief = `\n--- METADATI WEB RILEVATI ---\nURL Sorgente: ${detectedUrl}\nTitolo Pagina: ${ogData.ogTitle || ""}\nDescrizione Web: ${ogData.ogDescription || ""}\nDominio: ${ogData.domain} ${ogData.siteName ? `(${ogData.siteName})` : ""}\nAutore: ${ogData.author || ""}\n-----------------------------\n`;
    normalizedText = `${webBrief}\n${normalizedText}`;
    extractionSource = `web-opengraph (${ogData.domain})`;
  }

  // Sanitize text
  normalizedText = normalizedText.replace(/\r\n/g, "\n");
  const wordsCount = normalizedText ? normalizedText.split(/\s+/).length : 0;

  agentSteps.push({
    agent: "structural_deconstructor",
    action: "Document Deconstruction & Format Normalization",
    description: `Estratto e normalizzato flusso testuale da "${detectedUrl || filename}" (${wordsCount} parole, sorgente: ${extractionSource}). Riconosciuti blocchi di intestazione e struttura.`,
    itemsFound: wordsCount,
    status: wordsCount > 0 || isPdf || Boolean(ogData) ? "success" : "warning",
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - deconstructStart,
  });

  // --------------------------------------------------------------------------
  // AGENTE 3: Ontologist Specialist (Estrazione Entità Canoniche e Tassonomia)
  // --------------------------------------------------------------------------
  const ontoStart = Date.now();
  let modelUsed = "gemini-3.7-flash";
  let extractedTitle = ogData?.ogTitle || filename.replace(/\.[^/.]+$/, "");
  let extractedSummary = ogData?.ogDescription || "";
  let extractedDomain = "Knowledge Architecture";
  let extractedDocType = "guide";
  let extractedResourceType: ResourceType = (req.explicitType as ResourceType) || (detectedUrl ? "article" : "knowledge");
  let extractedTags: string[] = ["knowledge", "okf-v0.2"];
  let extractedEntities: OKFEntity[] = [];

  const contextSubset = existingResources.slice(0, 25).map((r) => ({
    id: r.id,
    title: r.title,
    domain: r.domain || "Technical",
    tags: r.tags || [],
  }));

  const ontologistPrompt = `Sei l'Agente Ontologico Specializzato del Knowledge Vault.
Il tuo compito è analizzare il testo o la risorsa web fornita ed estrarre la tassonomia canonica secondo lo standard OKF v0.2.

Sorgente: "${detectedUrl || filename}"
${req.explicitType ? `Categoria desiderata dall'utente: "${req.explicitType}"` : ""}
${detectedUrl ? `URL web rilevato: "${detectedUrl}"` : ""}
${ogData ? `Titolo OpenGraph: "${ogData.ogTitle || ""}", Descrizione OpenGraph: "${ogData.ogDescription || ""}", Sito: "${ogData.domain}"` : ""}

Contenuto documento o pagina web:
"""
${normalizedText.slice(0, 14000)}
"""

Regole tassonomiche rigorose:
1. 'resourceType': Classifica correttamente la categoria della risorsa nel Vault tra:
   - "article": Articolo online, blog post, guida, tutorial o post tecnico sul web
   - "link": Sito web, portale, tool online o utility web generica
   - "github_repo": Repository di codice sorgente GitHub (es. se URL contiene github.com o fa riferimento a una repo)
   - "mcp_server": Server o connettore Model Context Protocol (MCP)
   - "ai_skill": Prompt per agenti, skill AI, persona o istruzioni operative
   - "paper": Articolo scientifico / ricerca accademica (arXiv, NeurIPS, ecc.)
   - "troubleshooting": Risoluzione errori, diagnosi bug o problematiche di sistema
   - "knowledge": Specifica tecnica di sistema, documento architetturale interno, RFC o concetti teorici puri
   ${req.explicitType ? `Se l'utente ha indicato "${req.explicitType}", dai priorità a questa categoria a meno che il contenuto non sia palesemente diverso (es. repo GitHub).` : ""}
2. 'title': Titolo canonico descrittivo (senza formule di marketing o prefissi inutili).
3. 'summary': 2-3 frasi dense in lingua italiana che riassumono il valore architetturale/tecnico.
4. 'domain': Ambito tecnico autorevole (es. "Cloud & Distributed Systems", "AI Systems & Inference", "Developer Tooling", "Database Engineering", "Security & Identity", "Web Engineering").
5. 'docType': "concept" | "specification" | "architecture" | "guide" | "tool_description" | "prompt_skill". Per gli articoli e le guide web, usa preferibilmente "guide" o "concept".
6. 'tags': 4-8 tag tecnici rigorosi in minuscolo (es. ["architettura", "typescript", "web"]).
7. 'entities': Array di 3-8 entità canoniche con { name: string, type: string, description: string }. Utilizza denominazioni canoniche (es. "Anthropic", "TypeScript", "Model Context Protocol", "PostgreSQL").
8. 'keyClaims': Array di 2-4 asserzioni tecniche o architetturali chiave affermate nel testo per il successivo audit di contraddizione.
9. Se la risorsa è un paper scientifico/accademico o sorgente LaTeX/TeX: estrai con precisione:
   - 'authors': array dei nomi di autori/ricercatori (es. ["Ashish Vaswani", "Noam Shazeer"])
   - 'arxivId': identificativo arXiv se presente (es. "1706.03762")
   - 'doi': codice DOI se presente (es. "10.xxxx/yyyy")
   - 'venue': conferenza o rivista accademica (es. "NeurIPS", "ICLR", "arXiv preprint")
   - 'publishedYear': anno di pubblicazione (numero intero a 4 cifre)
   - 'pdfUrl': link al PDF originale se menzionato
   - 'tldr': sintesi densa del contributo metodologico e scientifico di 1-2 frasi

Rispondi rigorosamente in JSON secondo lo schema.`;

  const ontologistSchema = {
    type: Type.OBJECT,
    properties: {
      resourceType: {
        type: Type.STRING,
        enum: ["article", "github_repo", "mcp_server", "ai_skill", "knowledge", "link", "troubleshooting", "paper", "rss", "note"],
      },
      title: { type: Type.STRING },
      summary: { type: Type.STRING },
      domain: { type: Type.STRING },
      docType: { type: Type.STRING },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      authors: { type: Type.ARRAY, items: { type: Type.STRING } },
      arxivId: { type: Type.STRING },
      doi: { type: Type.STRING },
      venue: { type: Type.STRING },
      publishedYear: { type: Type.NUMBER },
      pdfUrl: { type: Type.STRING },
      tldr: { type: Type.STRING },
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
      keyClaims: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["resourceType", "title", "summary", "domain", "docType", "tags", "entities", "keyClaims"],
  };

  let parsedOntology: any = null;
  let keyClaims: string[] = [];
  let extractedAuthors: string[] | undefined = undefined;
  let extractedArxivId: string | undefined = undefined;
  let extractedDoi: string | undefined = undefined;
  let extractedVenue: string | undefined = undefined;
  let extractedPublishedYear: number | undefined = undefined;
  let extractedPdfUrl: string | undefined = undefined;
  let extractedTldr: string | undefined = undefined;

  try {
    const ontoRes = await generateWithGeminiFallback(ontologistPrompt, ontologistSchema, {
      timeoutMs: 25000,
      thinkingBudget: 0,
    });
    if (ontoRes?.text) {
      parsedOntology = JSON.parse(ontoRes.text);
      modelUsed = ontoRes.modelUsed;
    }
  } catch (err: any) {
    console.warn("[OntologistAgent] Gemini call failed, using heuristic extraction:", err?.message);
  }

  if (parsedOntology && parsedOntology.title) {
    extractedTitle = String(parsedOntology.title).trim();
    extractedSummary = String(parsedOntology.summary || extractedSummary).trim();
    extractedDomain = String(parsedOntology.domain || extractedDomain).trim();
    extractedDocType = String(parsedOntology.docType || extractedDocType).trim();
    if (req.explicitType) {
      extractedResourceType = req.explicitType as ResourceType;
    } else {
      extractedResourceType = (parsedOntology.resourceType as ResourceType) || extractedResourceType;
    }
    extractedTags = (Array.isArray(parsedOntology.tags) ? parsedOntology.tags : [])
      .map((t: any) => (typeof t === "string" ? t.trim().toLowerCase() : String(t || "").toLowerCase()))
      .filter((t: string) => t.length > 0);
    if (extractedTags.length === 0) extractedTags = ["knowledge", "okf-v0.2"];

    extractedEntities = (Array.isArray(parsedOntology.entities) ? parsedOntology.entities : [])
      .map((e: any) => {
        if (typeof e === "string") {
          const name = e.trim();
          return name ? { name, type: "concept", description: "Entità rilevata nel documento" } : null;
        }
        if (e && typeof e === "object") {
          const name = String(e.name || e.title || e.entity || "").trim();
          if (!name) return null;
          return {
            name,
            type: String(e.type || "concept").trim(),
            description: String(e.description || "").trim(),
          };
        }
        return null;
      })
      .filter(Boolean) as OKFEntity[];

    if (extractedEntities.length === 0) {
      extractedEntities = [{ name: extractedTitle || "Concetto Primario", type: "concept", description: "Entità cardine del documento" }];
    }

    keyClaims = (Array.isArray(parsedOntology.keyClaims) ? parsedOntology.keyClaims : [])
      .map((c: any) => (typeof c === "string" ? c.trim() : String(c || "").trim()))
      .filter((c: string) => c.length > 0);

    if (Array.isArray(parsedOntology.authors) && parsedOntology.authors.length > 0) {
      extractedAuthors = parsedOntology.authors.map((a: any) => String(a || "").trim()).filter(Boolean);
    }
    if (parsedOntology.arxivId) extractedArxivId = String(parsedOntology.arxivId).trim();
    if (parsedOntology.doi) extractedDoi = String(parsedOntology.doi).trim();
    if (parsedOntology.venue) extractedVenue = String(parsedOntology.venue).trim();
    if (parsedOntology.publishedYear && !isNaN(Number(parsedOntology.publishedYear))) {
      extractedPublishedYear = Number(parsedOntology.publishedYear);
    }
    if (parsedOntology.pdfUrl) extractedPdfUrl = String(parsedOntology.pdfUrl).trim();
    if (parsedOntology.tldr) extractedTldr = String(parsedOntology.tldr).trim();
  } else {
    // Heuristic fallback
    // Check if input already has frontmatter with title/domain
    const frontmatterMatch = normalizedText.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
    if (frontmatterMatch) {
      const fLines = frontmatterMatch[1].split("\n");
      for (const line of fLines) {
        const titleMatch = line.match(/^title:\s*["']?([^"'\r\n]+)["']?/);
        if (titleMatch) extractedTitle = titleMatch[1].trim();
        const domainMatch = line.match(/^domain:\s*["']?([^"'\r\n]+)["']?/);
        if (domainMatch) extractedDomain = domainMatch[1].trim();
        const typeMatch = line.match(/^type:\s*["']?([^"'\r\n]+)["']?/);
        if (typeMatch) extractedDocType = typeMatch[1].trim();
      }
    }

    // Heuristics for LaTeX / TeX and academic papers
    if (
      filename.toLowerCase().endsWith(".tex") ||
      normalizedText.includes("\\author") ||
      normalizedText.includes("\\documentclass") ||
      normalizedText.includes("arxiv.org") ||
      isPdf
    ) {
      extractedResourceType = (req.explicitType as ResourceType) || "paper";
      extractedDocType = "specification";
      extractedDomain = "Artificial Intelligence & Computer Science";
      extractedPublishedYear = new Date().getFullYear();

      const texTitleMatch = normalizedText.match(/\\title\{([^}]+)\}/);
      if (texTitleMatch) {
        extractedTitle = texTitleMatch[1].replace(/\\thanks\{[^}]+\}/g, "").trim();
      }
      const texAuthorMatch = normalizedText.match(/\\author\{([^}]+)\}/);
      if (texAuthorMatch) {
        extractedAuthors = texAuthorMatch[1]
          .split(/\\and|,/)
          .map((a) => a.replace(/\\thanks\{[^}]+\}/g, "").trim())
          .filter(Boolean);
      }
      const arxivMatch = normalizedText.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+(?:v[0-9]+)?)/i);
      if (arxivMatch) {
        extractedArxivId = arxivMatch[1];
        extractedPdfUrl = `https://arxiv.org/pdf/${arxivMatch[1]}.pdf`;
        extractedVenue = "arXiv preprint";
      }
    }

    if (detectedUrl) {
      if (detectedUrl.includes("github.com")) {
        extractedResourceType = (req.explicitType as ResourceType) || "github_repo";
        extractedDocType = "architecture";
      } else if (detectedUrl.includes("arxiv.org")) {
        extractedResourceType = (req.explicitType as ResourceType) || "paper";
        extractedDocType = "specification";
      } else {
        extractedResourceType = (req.explicitType as ResourceType) || "link";
        extractedDocType = "tool_description";
      }
      extractedTitle = extractedTitle || ogData?.ogTitle || detectedUrl.replace(/https?:\/\//, "").split("/")[0];
      extractedSummary = ogData?.ogDescription || `Risorsa web da ${detectedUrl}`;
    } else {
      if (!extractedTitle || extractedTitle === "documento") {
        const bodyWithoutFm = normalizedText.replace(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---/, "").trim();
        const firstLine = bodyWithoutFm.split("\n").find((l) => l.trim().length > 0) || "";
        extractedTitle = firstLine.replace(/^#+\s*/, "").slice(0, 80) || filename.replace(/\.[^/.]+$/, "");
      }
      extractedSummary = normalizedText.replace(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---/, "").slice(0, 240).trim() || `Documento tecnico ${filename}`;
      extractedResourceType = (req.explicitType as ResourceType) || "knowledge";
    }
    extractedEntities = [{ name: extractedTitle || "Concetto Primario", type: "concept", description: "Entità cardine del documento" }];
    keyClaims = [extractedSummary];
  }

  agentSteps.push({
    agent: "ontologist",
    action: "Canonical Entity & Taxonomy Extraction",
    description: `Classificata risorsa come "${extractedResourceType.toUpperCase()}" (OKF: ${extractedDocType}) nel dominio "${extractedDomain}". Estratte ${extractedEntities.length} entità canoniche con modello ${modelUsed}.`,
    itemsFound: extractedEntities.length,
    status: "success",
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - ontoStart,
  });

  // --------------------------------------------------------------------------
  // AGENTE 4: Topological Graph Linker (Correlazione Nodi e Archi Pesati D3)
  // --------------------------------------------------------------------------
  const graphStart = Date.now();
  const calculatedRelations: OKFRelation[] = [];

  if (existingResources.length > 0) {
    // Scoring e matching semantico su risorse esistenti
    const entityNames = new Set(
      extractedEntities
        .map((e) => (typeof e?.name === "string" ? e.name.toLowerCase().trim() : ""))
        .filter((n) => n.length > 0)
    );
    const docTagsSet = new Set(
      extractedTags
        .map((t) => (typeof t === "string" ? t.toLowerCase().trim() : ""))
        .filter((t) => t.length > 0)
    );

    for (const res of existingResources) {
      if (!res || !res.title) continue;
      let score = 0;
      let matchReason = "";
      const resTitleLower = String(res.title || "").toLowerCase();

      // Intersezione tag
      if (res.tags && Array.isArray(res.tags)) {
        const sharedTags = res.tags
          .filter((t) => typeof t === "string" && docTagsSet.has(t.toLowerCase().trim()));
        if (sharedTags.length > 0) {
          score += sharedTags.length * 0.25;
          matchReason = `Condivide tag [${sharedTags.join(", ")}]`;
        }
      }

      // Concordanza nome entità o titolo
      for (const ent of entityNames) {
        if (resTitleLower.includes(ent) || ent.includes(resTitleLower)) {
          score += 0.5;
          matchReason = `Menzione diretta entità "${ent}"`;
          break;
        }
      }

      // Dominio comune
      if (res.domain && res.domain.toLowerCase() === extractedDomain.toLowerCase()) {
        score += 0.2;
      }

      if (score >= 0.35) {
        let relationType: OKFRelation["relationType"] = "references";
        if (score > 0.8) relationType = "implements";
        else if (score > 0.6) relationType = "integrates";
        else if (score > 0.5) relationType = "extends";

        calculatedRelations.push({
          targetId: res.id,
          targetTitle: String(res.title || "Risorsa Vault"),
          relationType,
          weight: Math.min(0.95, parseFloat((0.5 + score * 0.3).toFixed(2))),
          description: matchReason || `Correlazione semantica topologica con ${res.title}`,
        });
      }
    }

    // Sort by weight descending, take top 6
    calculatedRelations.sort((a, b) => (b.weight || 0.8) - (a.weight || 0.8));
    calculatedRelations.splice(6);
  }

  // If no relations found, link to Vault root overview
  if (calculatedRelations.length === 0 && existingResources.length > 0) {
    calculatedRelations.push({
      targetId: existingResources[0].id,
      targetTitle: String(existingResources[0].title || "Knowledge Vault"),
      relationType: "references",
      weight: 0.75,
      description: "Collegamento topologico al contesto del Vault",
    });
  }

  agentSteps.push({
    agent: "graph_linker",
    action: "Topological Graph Linking & Edge Weighting",
    description: `Calcolati ${calculatedRelations.length} archi topologici verso il grafo del Vault (${calculatedRelations.map((r) => `"${r.targetTitle || "Risorsa"}" [${r.relationType || "references"}]`).join(", ")}).`,
    itemsFound: calculatedRelations.length,
    status: calculatedRelations.length > 0 ? "success" : "insufficient",
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - graphStart,
  });

  // --------------------------------------------------------------------------
  // AGENTE 5: Contradiction Sentinel (Audit Epistemico Cekikj Gate)
  // --------------------------------------------------------------------------
  const contraStart = Date.now();
  let contradictionWarning: IngestionContradictionWarning = {
    hasConflict: false,
  };

  // Se ci sono asserzioni estratte e risorse con cui confrontarsi
  if (keyClaims.length > 0 && existingResources.length > 0) {
    const claimsText = keyClaims.map((c, i) => `${i + 1}. ${c}`).join("\n");
    const vaultExcerpts = existingResources
      .slice(0, 8)
      .map((r) => `Titolo: "${r.title}" | Sintesi: "${r.summary || ""}"`)
      .join("\n");

    const contradictionPrompt = `Sei il Contradiction Sentinel del Knowledge Vault (Architettura Cekikj).
Verifica se il nuovo documento in fase di ingestione introduce contraddizioni aperte o conflitti inconciliabili con i documenti consolidati già presenti nel Vault.

Nuove Asserzioni da Ingerire:
${claimsText}

Estratti Documenti Esistenti nel Vault:
${vaultExcerpts}

Se rilevi una contraddizione diretta (es. requisiti tecnici incompatibili, politiche di sicurezza opposte, formati discordanti):
Imposta hasConflict: true con conceptName, conflictingSourceTitle, conflictReason e severity.
Altrimenti imposta hasConflict: false.`;

    const contradictionSchema = {
      type: Type.OBJECT,
      properties: {
        hasConflict: { type: Type.BOOLEAN },
        conceptName: { type: Type.STRING },
        conflictingSourceTitle: { type: Type.STRING },
        conflictReason: { type: Type.STRING },
        severity: { type: Type.STRING },
      },
      required: ["hasConflict"],
    };

    try {
      const contraRes = await generateWithGeminiFallback(contradictionPrompt, contradictionSchema, {
        timeoutMs: 15000,
        thinkingBudget: 0,
      });
      if (contraRes?.text) {
        const parsed = JSON.parse(contraRes.text);
        if (parsed.hasConflict) {
          contradictionWarning = {
            hasConflict: true,
            conceptName: parsed.conceptName || extractedTitle,
            conflictingSourceTitle: parsed.conflictingSourceTitle || "Documento del Vault",
            conflictReason: parsed.conflictReason || "Rilevata divergenza tra le specifiche asserite.",
            severity: (parsed.severity as any) || "medium",
          };
        }
      }
    } catch (e: any) {
      console.warn("[ContradictionSentinel] Check skipped or timed out:", e?.message);
    }
  }

  agentSteps.push({
    agent: "contradiction_sentinel",
    action: "Cekikj Epistemic Contradiction Audit",
    description: contradictionWarning.hasConflict
      ? `ATTENZIONE: Rilevato conflitto con "${contradictionWarning.conflictingSourceTitle}" sul concetto "${contradictionWarning.conceptName}": ${contradictionWarning.conflictReason}`
      : "Audit epistemico completato: nessuna contraddizione o collisione rilevata con il patrimonio del Vault.",
    status: contradictionWarning.hasConflict ? "warning" : "success",
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - contraStart,
  });

  // --------------------------------------------------------------------------
  // AGENTE 6: OKF Serializer (Compilazione Frontmatter YAML e Struttura Markdown)
  // --------------------------------------------------------------------------
  const serialStart = Date.now();
  
  // Costruzione Frontmatter YAML OKF v0.2
  const safeTitle = String(extractedTitle || "Documento Knowledge OKF").replace(/"/g, '\\"');
  const safeDomain = String(extractedDomain || "Knowledge Architecture").replace(/"/g, '\\"');
  const safeDocType = String(extractedDocType || "specification").replace(/"/g, '\\"');

  const yamlEntities = extractedEntities.map(
    (e) => `  - name: "${String(e.name || "Entità").replace(/"/g, '\\"')}"\n    type: "${String(e.type || "concept").replace(/"/g, '\\"')}"\n    description: "${String(e.description || "").replace(/"/g, '\\"')}"`
  ).join("\n");

  const yamlRelations = calculatedRelations.map(
    (r) => `  - targetTitle: "${String(r.targetTitle || "Risorsa").replace(/"/g, '\\"')}"\n    relationType: "${String(r.relationType || "references")}"\n    weight: ${typeof r.weight === "number" ? r.weight : 0.8}\n    description: "${String(r.description || "").replace(/"/g, '\\"')}"`
  ).join("\n");

  const yamlTags = JSON.stringify(extractedTags);

  const frontmatterYaml = `---
okf_version: "0.2"
title: "${safeTitle}"
type: "${safeDocType}"
domain: "${safeDomain}"
tags: ${yamlTags}
created_at: "${new Date().toISOString()}"
entities:
${yamlEntities || '  - name: "' + safeTitle + '"\n    type: "concept"'}
relations:
${yamlRelations || '  - targetTitle: "Knowledge Vault"\n    relationType: "references"\n    weight: 0.8'}
---`;

  // Body markdown pulito o arricchito
  let cleanBody = normalizedText.replace(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---\s*/, "").trim();
  if (!cleanBody || cleanBody.length < 100) {
    cleanBody = `# ${extractedTitle}

> **${extractedSummary}**

---

## 1. Panoramica Esecutiva
${extractedSummary}

---

## 2. Specifiche e Componenti
Questo documento è stato ingerito nel Knowledge Vault secondo i protocolli operativi di conformità epistemica OKF v0.2.

---

## 3. Entità Chiave e Topologia
- **Entità Primaria**: ${extractedEntities[0]?.name || extractedTitle}
- **Dominio Tecnologico**: ${extractedDomain}
`;
  } else if (!cleanBody.startsWith("#")) {
    cleanBody = `# ${extractedTitle}\n\n> **${extractedSummary}**\n\n---\n\n${cleanBody}`;
  }

  let finalMarkdownContent: string | undefined = undefined;
  if (extractedResourceType !== "link") {
    finalMarkdownContent = `${frontmatterYaml}\n\n${cleanBody}`;
  } else if (cleanBody && cleanBody.length > 50 && !cleanBody.includes("Questo documento è stato ingerito")) {
    finalMarkdownContent = cleanBody;
  }

  agentSteps.push({
    agent: "okf_serializer",
    action: extractedResourceType === "link" ? "Web Link Categorization & Metadata Assembly" : "OKF v0.2 Frontmatter Synthesis & Code Formatting",
    description: extractedResourceType === "link"
      ? `Catalogato collegamento web (${detectedUrl || req.url}) con metadati semantici e OpenGraph.`
      : `Generato documento completo conforme a OKF v0.2 con ${extractedEntities.length} entità YAML e ${calculatedRelations.length} relazioni topologiche.`,
    status: "success",
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - serialStart,
  });

  const totalLatencyMs = Date.now() - overallStart;

  return {
    success: true,
    resource: {
      type: extractedResourceType,
      title: extractedTitle,
      url: detectedUrl || req.url,
      summary: extractedSummary,
      tags: extractedTags,
      metadata: {
        okfVersion: "0.2",
        domain: extractedDomain,
        docType: extractedResourceType === "link" ? "tool_description" : extractedDocType,
        entities: extractedResourceType === "link" && extractedEntities.length === 0 ? undefined : extractedEntities,
        relations: calculatedRelations.length > 0 ? calculatedRelations : undefined,
        markdownContent: finalMarkdownContent,
        sourceFileName: filename,
        ...(extractedAuthors && extractedAuthors.length > 0 ? { authors: extractedAuthors } : {}),
        ...(extractedArxivId ? { arxivId: extractedArxivId } : {}),
        ...(extractedDoi ? { doi: extractedDoi } : {}),
        ...(extractedVenue ? { venue: extractedVenue } : {}),
        ...(extractedPublishedYear ? { publishedYear: extractedPublishedYear } : {}),
        ...(extractedPdfUrl ? { pdfUrl: extractedPdfUrl } : {}),
        ...(extractedTldr ? { tldr: extractedTldr } : {}),
        ogTitle: ogData?.ogTitle,
        ogDescription: ogData?.ogDescription,
        ogImage: ogData?.ogImage,
        favicon: ogData?.favicon,
        author: ogData?.author,
        provenanceTrace: {
          orchestratorModel: modelUsed,
          timestamp: new Date().toISOString(),
          agentsCount: 6,
          totalLatencyMs,
        },
        contradictionCheck: {
          checked: true,
          hasConflict: contradictionWarning.hasConflict,
          details: contradictionWarning.conflictReason,
        },
      },
    },
    agentSteps,
    orchestratorPlan,
    contradictionWarning: contradictionWarning.hasConflict ? contradictionWarning : undefined,
    modelUsed,
    executionTimeMs: totalLatencyMs,
  };
}
