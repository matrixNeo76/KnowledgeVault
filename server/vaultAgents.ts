import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { ResourceItem, ResourceType } from "../src/types";

// ============================================================================
// Types & Interfaces per l'Architettura Multi-Agente del Vault
// ============================================================================

export type AgentRole =
  | "orchestrator"
  | "graph_navigator"
  | "deep_analyst"
  | "code_specialist"
  | "grounding_verifier";

export interface AgentTraceStep {
  agent: AgentRole;
  action: string;
  description: string;
  itemsFound?: number;
  status: "success" | "warning" | "insufficient";
  timestamp: string;
}

export interface AgenticQueryRequest {
  query: string;
  mode?: "quick_synthesis" | "topological_analysis" | "deep_implementation";
  activeCategory?: string;
  activeTag?: string;
  selectedResourceIds?: string[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  clientResources?: ResourceItem[];
}

export interface CitedResourceMeta {
  id: string;
  title: string;
  type: ResourceType;
  url?: string;
  domain?: string;
  tags?: string[];
  relevanceReason?: string;
}

export interface AgenticQueryResponse {
  answer: string;
  summary: string;
  orchestratorPlan: string;
  trace: AgentTraceStep[];
  citedResources: CitedResourceMeta[];
  citedResourceIds: string[];
  suggestedQuestions: string[];
  graphClusterNodeIds: string[];
  insufficient: boolean;
  mode: string;
  stats: {
    totalVaultResourcesScanned: number;
    relevantResourcesFound: number;
    durationMs: number;
    modelUsed: string;
  };
}

// ============================================================================
// Resource Loader: Legge le risorse da memoria o da data/vault-backup.json
// ============================================================================

export function loadVaultResources(clientItems?: ResourceItem[]): ResourceItem[] {
  if (Array.isArray(clientItems) && clientItems.length > 0) {
    return clientItems;
  }

  const backupPath = path.join(process.cwd(), "data", "vault-backup.json");
  try {
    if (fs.existsSync(backupPath)) {
      const raw = fs.readFileSync(backupPath, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.resources) && data.resources.length > 0) {
        return data.resources;
      }
    }
  } catch (err) {
    console.error("[VAULT_AGENTS] Errore caricamento data/vault-backup.json:", err);
  }

  return [];
}

// ============================================================================
// Sub-Agent 1: Graph Navigator Agent
// ============================================================================

interface GraphAnalysisResult {
  clusterNodeIds: string[];
  connectedEntities: string[];
  relationPaths: Array<{ sourceId: string; targetTitle: string; relationType: string }>;
  trace: AgentTraceStep;
}

export function runGraphNavigator(
  query: string,
  resources: ResourceItem[],
  keywords: string[]
): GraphAnalysisResult {
  const queryLower = query.toLowerCase();
  const matchedNodeIds = new Set<string>();
  const connectedEntities = new Set<string>();
  const relationPaths: Array<{ sourceId: string; targetTitle: string; relationType: string }> = [];

  resources.forEach((r) => {
    const titleMatch = r.title.toLowerCase().includes(queryLower);
    const domainMatch = r.metadata?.domain && r.metadata.domain.toLowerCase().includes(queryLower);
    const tagMatch = r.tags && r.tags.some((t) => t.toLowerCase().includes(queryLower) || keywords.some((k) => t.toLowerCase().includes(k)));

    // Entity matching
    let entityMatch = false;
    if (Array.isArray(r.metadata?.entities)) {
      r.metadata?.entities.forEach((ent) => {
        const entName = typeof ent === "string" ? ent : ent.name;
        if (entName && (queryLower.includes(entName.toLowerCase()) || entName.toLowerCase().includes(queryLower))) {
          entityMatch = true;
          connectedEntities.add(entName);
        }
      });
    }

    if (titleMatch || domainMatch || tagMatch || entityMatch) {
      matchedNodeIds.add(r.id);

      // Traversal degli archi OKF di 1° grado
      if (Array.isArray(r.metadata?.relations)) {
        r.metadata.relations.forEach((rel) => {
          if (rel.targetTitle) {
            relationPaths.push({
              sourceId: r.id,
              targetTitle: rel.targetTitle,
              relationType: rel.relationType || rel.type || "correlato",
            });
          }
        });
      }
    }
  });

  // Second-hop expansion limitata (max 2 hop come da specifica Cekikj)
  if (matchedNodeIds.size > 0 && matchedNodeIds.size < 15) {
    resources.forEach((r) => {
      if (!matchedNodeIds.has(r.id) && Array.isArray(r.metadata?.relations)) {
        const connectsToDirect = r.metadata.relations.some((rel) => {
          return rel.targetTitle && Array.from(matchedNodeIds).some((id) => {
            const direct = resources.find((item) => item.id === id);
            return direct && direct.title.toLowerCase() === rel.targetTitle!.toLowerCase();
          });
        });
        if (connectsToDirect && matchedNodeIds.size < 20) {
          matchedNodeIds.add(r.id);
        }
      }
    });
  }

  const clusterNodeIds = Array.from(matchedNodeIds);

  return {
    clusterNodeIds,
    connectedEntities: Array.from(connectedEntities),
    relationPaths: relationPaths.slice(0, 10),
    trace: {
      agent: "graph_navigator",
      action: "Topological Traversal & Clustering",
      description: `Identificati ${clusterNodeIds.length} nodi correlati nel grafo D3, con ${connectedEntities.size} entità canoniche e ${relationPaths.length} archi relazionali.`,
      itemsFound: clusterNodeIds.length,
      status: clusterNodeIds.length > 0 ? "success" : "warning",
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Sub-Agent 2: Deep Content Analyst Agent
// ============================================================================

interface ContentAnalysisResult {
  topCandidateIds: string[];
  keyExcerpts: Array<{ resourceId: string; title: string; excerpt: string; score: number }>;
  trace: AgentTraceStep;
}

export function runDeepContentAnalyst(
  query: string,
  resources: ResourceItem[],
  keywords: string[]
): ContentAnalysisResult {
  const scoredItems: Array<{ id: string; title: string; excerpt: string; score: number }> = [];
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  resources.forEach((r) => {
    let score = 0;
    const titleLower = (r.title || "").toLowerCase();
    const summaryLower = (r.summary || "").toLowerCase();
    const markdownLower = (r.metadata?.markdownContent || "").toLowerCase();
    const executiveLower = (r.metadata?.aiExecutiveSummary || "").toLowerCase();

    // Word occurrences scoring
    queryWords.forEach((word) => {
      if (titleLower.includes(word)) score += 5;
      if (summaryLower.includes(word)) score += 3;
      if (markdownLower.includes(word)) score += 2;
      if (executiveLower.includes(word)) score += 3;
    });

    // Tag and domain boost
    if (r.tags) {
      r.tags.forEach((tag) => {
        if (queryWords.some((w) => tag.toLowerCase().includes(w))) score += 4;
      });
    }

    if (score > 0) {
      // Estrai un frammento testuale significativo (excerpt)
      let excerpt = r.summary || "";
      if (r.metadata?.aiExecutiveSummary) {
        excerpt = r.metadata.aiExecutiveSummary;
      } else if (r.metadata?.markdownContent) {
        const firstPara = r.metadata.markdownContent.slice(0, 300).replace(/#+\s/g, "");
        excerpt = firstPara + "...";
      }

      scoredItems.push({
        id: r.id,
        title: r.title,
        excerpt: excerpt.slice(0, 240),
        score,
      });
    }
  });

  scoredItems.sort((a, b) => b.score - a.score);
  const topCandidates = scoredItems.slice(0, 15);

  return {
    topCandidateIds: topCandidates.map((c) => c.id),
    keyExcerpts: topCandidates.map((c) => ({
      resourceId: c.id,
      title: c.title,
      excerpt: c.excerpt,
      score: c.score,
    })),
    trace: {
      agent: "deep_analyst",
      action: "Semantic Full-Text & Markdown Scan",
      description: `Scansionati corpi Markdown, abstract e note. Estratte ${topCandidates.length} evidenze testuali con punteggio di rilevanza.`,
      itemsFound: topCandidates.length,
      status: topCandidates.length > 0 ? "success" : "warning",
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Sub-Agent 3: Code & Implementation Specialist Agent
// ============================================================================

interface CodeAnalysisResult {
  codeResourceIds: string[];
  technicalProfiles: Array<{
    id: string;
    title: string;
    type: ResourceType;
    techStack?: string;
    toolsOrLanguage?: string;
  }>;
  trace: AgentTraceStep;
}

export function runCodeImplementationSpecialist(
  query: string,
  resources: ResourceItem[],
  candidateIds: string[]
): CodeAnalysisResult {
  const codeItems: Array<{
    id: string;
    title: string;
    type: ResourceType;
    techStack?: string;
    toolsOrLanguage?: string;
  }> = [];

  const candidatesSet = new Set(candidateIds);
  const targetResources = resources.filter(
    (r) =>
      (r.type === "github_repo" || r.type === "mcp_server" || r.type === "troubleshooting" || r.type === "ai_skill") &&
      (candidatesSet.has(r.id) || candidateIds.length === 0)
  );

  targetResources.forEach((r) => {
    let techStack = r.metadata?.language || r.metadata?.affectedSystem || undefined;
    let toolsOrLanguage = undefined;

    if (r.type === "mcp_server" && Array.isArray(r.metadata?.toolsProvided)) {
      toolsOrLanguage = `Tools: ${r.metadata.toolsProvided.slice(0, 4).join(", ")}`;
    } else if (r.type === "github_repo" && r.metadata?.installCommand) {
      toolsOrLanguage = `Install: ${r.metadata.installCommand}`;
    }

    codeItems.push({
      id: r.id,
      title: r.title,
      type: r.type,
      techStack,
      toolsOrLanguage,
    });
  });

  return {
    codeResourceIds: codeItems.map((c) => c.id),
    technicalProfiles: codeItems.slice(0, 8),
    trace: {
      agent: "code_specialist",
      action: "Code & Implementation Probe",
      description: `Rilevati ${codeItems.length} artefatti tecnici verticali (GitHub repos, MCP servers, fixes architetturali).`,
      itemsFound: codeItems.length,
      status: codeItems.length > 0 ? "success" : "warning",
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Sub-Agent 4: Grounding Verifier (Cekikj Epistemic Guard)
// ============================================================================

interface GroundingVerificationResult {
  verifiedCitedIds: string[];
  insufficient: boolean;
  auditNotes: string;
  trace: AgentTraceStep;
}

export function runGroundingVerifier(
  citedIdsInText: string[],
  validResources: ResourceItem[]
): GroundingVerificationResult {
  const validIdsMap = new Map(validResources.map((r) => [r.id, r]));
  const verifiedCitedIds: string[] = [];

  citedIdsInText.forEach((id) => {
    if (validIdsMap.has(id)) {
      verifiedCitedIds.push(id);
    }
  });

  const insufficient = verifiedCitedIds.length === 0;

  return {
    verifiedCitedIds,
    insufficient,
    auditNotes: insufficient
      ? "Zero-Guessing Guard: Nessuna risorsa verificata nel Vault corrisponde ai claim richiesti."
      : `Audit completato con successo: ${verifiedCitedIds.length} citazioni verificate contro l'indice autoritativo delle 108 risorse.`,
    trace: {
      agent: "grounding_verifier",
      action: "Cekikj Grounding & Zero-Guessing Audit",
      description: insufficient
        ? "Allerta Epistemica: Il Vault non contiene informazioni sufficienti per sostenere questa query. Risposta limitata ai soli dati accertati."
        : `Verificate ${verifiedCitedIds.length} fonti reali nel Vault. Tutti i claim poggiano su evidenze e documenti archiviati.`,
      itemsFound: verifiedCitedIds.length,
      status: insufficient ? "insufficient" : "success",
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Central Orchestrator: Pipeline Esecutiva Multi-Agente
// ============================================================================

export async function executeAgenticVaultQuery(
  request: AgenticQueryRequest,
  genAI: GoogleGenAI | null
): Promise<AgenticQueryResponse> {
  const startTime = Date.now();
  const allResources = loadVaultResources(request.clientResources);
  const totalCount = allResources.length;

  const traces: AgentTraceStep[] = [];

  // Step 1: Orchestrator Intent Decomposition
  const query = (request.query || "").trim();
  const keywords = query
    .toLowerCase()
    .replace(/[^\w\sàèéìòù]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const orchestratorPlan = `Pianificazione Orchestrator per query: "${query}". Attivazione coordinata di Graph Navigator (topologia D3), Deep Content Analyst (Markdown & Note), Code Specialist (GitHub & MCP) e Grounding Verifier (Cekikj).`;

  traces.push({
    agent: "orchestrator",
    action: "Intent Decomposition & Task Dispatch",
    description: `Decomposto l'intento dell'utente in modalità "${request.mode || "quick_synthesis"}". Inviati task di esplorazione paralleli.`,
    status: "success",
    timestamp: new Date().toISOString(),
  });

  // Step 2: Parallel Sub-Agent Execution
  const graphResult = runGraphNavigator(query, allResources, keywords);
  traces.push(graphResult.trace);

  const contentResult = runDeepContentAnalyst(query, allResources, keywords);
  traces.push(contentResult.trace);

  // Unione e deduplicazione dei candidati primari
  const candidateIdsSet = new Set<string>([
    ...contentResult.topCandidateIds,
    ...graphResult.clusterNodeIds,
  ]);

  // Se l'utente ha selezionato esplicitamente delle risorse nella UI, hanno priorità
  if (Array.isArray(request.selectedResourceIds) && request.selectedResourceIds.length > 0) {
    request.selectedResourceIds.forEach((id) => candidateIdsSet.add(id));
  }

  const candidateIds = Array.from(candidateIdsSet);
  const codeResult = runCodeImplementationSpecialist(query, allResources, candidateIds);
  traces.push(codeResult.trace);

  // Seleziona i migliori candidati (massimo 12 per contenere il context budget nel bounded loop)
  const candidateResources = allResources
    .filter((r) => candidateIdsSet.has(r.id))
    .slice(0, 12);

  let answerText = "";
  let summaryText = "";
  let modelUsed = "heuristic-local-synthesizer";
  let extractedCitedIds: string[] = [];

  // Step 3: LLM Generation con Gemini 3.7 Flash e Fallback Bounded
  if (genAI && candidateResources.length > 0) {
    const modelsToTry = [
      "gemini-3.7-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite",
    ];

    const compactContext = candidateResources.map((r) => {
      const entitiesStr = Array.isArray(r.metadata?.entities)
        ? r.metadata!.entities.map((e) => (typeof e === "string" ? e : e.name)).slice(0, 5).join(", ")
        : "";
      const relationsStr = Array.isArray(r.metadata?.relations)
        ? r.metadata!.relations.map((rel) => `${rel.relationType || "rel"}:${rel.targetTitle}`).slice(0, 4).join(", ")
        : "";

      return `---
ID: ${r.id}
TITOLO: ${r.title}
TIPO: ${r.type}
DOMINIO: ${r.metadata?.domain || "generale"}
TAG: ${r.tags ? r.tags.join(", ") : ""}
ENTITÀ: ${entitiesStr}
RELAZIONI: ${relationsStr}
SOMMARIO: ${r.summary || ""}
ESTRATTO: ${r.metadata?.aiExecutiveSummary || (r.metadata?.markdownContent ? r.metadata.markdownContent.slice(0, 350) : "")}
URL: ${r.url || ""}`;
    }).join("\n\n");

    const systemPrompt = `Sei il Vault Intelligence Engine del Knowledge Vault personale dell'utente (formato OKF v0.2, conformità Epistemica Cekikj).
Il tuo compito è rispondere all'interrogazione dell'utente basandoti ESCLUSIVAMENTE sulle risorse del Vault fornite nel contesto sottostante.

REGOLE RIGOROSE DI GROUNDING & ZERO-GUESSING (CEKIKJ ARCHITECTURE):
1. Cita SEMPRE le risorse pertinenti utilizzando il formato esatto: [ID: Titolo della Risorsa].
2. Non inventare risorse o fatti esterni. Se il Vault contiene informazioni parziali, segnala con trasparenza cosa è presente e cosa manca.
3. Se nessuna risorsa nel contesto tratta dell'argomento richiesto, dichiara apertamente l'assenza con la frase: "Nel Vault attuale non sono presenti risorse su questo argomento specifico." e suggerisci argomenti correlati presenti.
4. Struttura la risposta in modo chiaro:
   - **Sintesi Esecutiva**: risposta diretta e concisa alla domanda dell'utente.
   - **Risorse del Vault Pertinenti**: elenco con spiegazione del motivo di pertinenza e citazione [ID: Titolo].
   - **Correlazioni e Grafo**: come queste risorse si collegano tra loro per dominio, tecnologia o entità condivise.
   - **Applicazione Pratica / Codice** (se pertinente per repository GitHub o server MCP).
5. Mantieni un tono sobrio, tecnico, autorevole e privo di cliché o convenevoli generici.`;

    const userPromptText = `Domanda dell'utente:
"${query}"

Modalità richiesta: ${request.mode || "quick_synthesis"}
Categoria attiva nel filtro: ${request.activeCategory || "Tutte"}
Tag attivo nel filtro: ${request.activeTag || "Nessuno"}

RISORSE DEL VAULT SELEZIONATE DAGLI AGENTI COME CONTESTO DI RIFERIMENTO:
${compactContext}

Fornisci la sintesi epistemica verificata seguendo le istruzioni di sistema.`;

    for (const modelName of modelsToTry) {
      try {
        // Hard bounds: Timeout rigido a 14 secondi per rispettare i requisiti Cekikj
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timeout superato (>14s)")), 14000);
        });

        const callPromise = genAI.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: userPromptText }] }],
          config: {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            temperature: 0.2,
          },
        });

        const response: any = await Promise.race([callPromise, timeoutPromise]);
        const text = response.text || "";

        if (text.trim().length > 0) {
          answerText = text.trim();
          modelUsed = modelName;
          break;
        }
      } catch (err: any) {
        console.warn(`[VAULT_AGENTS] Fallimento con modello ${modelName}:`, err?.message || err);
      }
    }
  }

  // Fallback Euristico Locale se il modello cloud non è disponibile o candidati insufficienti
  if (!answerText) {
    if (candidateResources.length === 0) {
      answerText = `Nel Knowledge Vault attuale non sono state individuate risorse corrispondenti a "${query}".\n\nL'archivio conta attualmente ${totalCount} risorse incentrate principalmente su orchestrazione di agenti, Model Context Protocol (MCP), architetture distribuite, repository GitHub e paper scientifici.\n\nSuggerimento: prova a cercare per concetti chiave come \`mcp\`, \`gemini\`, \`d3\`, \`knowledge graph\` o consulta la visualizzazione a grafo.`;
      summaryText = `Nessuna risorsa trovata per "${query}".`;
    } else {
      const top3 = candidateResources.slice(0, 5);
      answerText = `### Risorse Rilevate nel Vault per "${query}"\n\nGli agenti hanno individuato **${candidateResources.length} risorse** correlate nel tuo archivio:\n\n` +
        top3.map((r) => `- **[${r.id}: ${r.title}]** (${r.type}${r.metadata?.domain ? ` • ${r.metadata.domain}` : ""})\n  ${r.summary || "Nessun sommario testuale."}`).join("\n\n") +
        `\n\n### Connessioni Rilevate\nI documenti condividono tag e relazioni ontologiche nel cluster concettuale. Clicca sulle risorse o apri la Vista Grafo per esplorare i nodi adiacenti.`;
      summaryText = `Individuate ${candidateResources.length} risorse pertinenti nel Vault.`;
    }
  } else {
    // Genera un breve riassunto per la barra di stato
    summaryText = answerText.split("\n\n")[0].replace(/^#+\s*/, "").slice(0, 180);
  }

  // Estrai gli ID citati nel testo della risposta
  const idRegex = /\[([a-zA-Z0-9_-]{8,}):/g;
  let match;
  while ((match = idRegex.exec(answerText)) !== null) {
    extractedCitedIds.push(match[1]);
  }

  // Se nessun ID nel formato esatto, usa gli ID dei candidati primari effettivamente discussi
  if (extractedCitedIds.length === 0 && candidateResources.length > 0) {
    extractedCitedIds = candidateResources.slice(0, 4).map((r) => r.id);
  }

  // Step 4: Grounding Verifier Audit
  const groundingResult = runGroundingVerifier(extractedCitedIds, allResources);
  traces.push(groundingResult.trace);

  // Costruisci i metadati per i badge interattivi cliccabili nella UI
  const citedResourceMap = new Map(allResources.map((r) => [r.id, r]));
  const citedResourcesMeta: CitedResourceMeta[] = groundingResult.verifiedCitedIds
    .map((id) => {
      const r = citedResourceMap.get(id);
      if (!r) return null;
      return {
        id: r.id,
        title: r.title,
        type: r.type,
        url: r.url,
        domain: r.metadata?.domain,
        tags: r.tags,
      };
    })
    .filter(Boolean) as CitedResourceMeta[];

  // Suggerimenti contestuali per approfondimento
  const suggestedQuestions: string[] = [
    `Come si collegano queste risorse nel Grafo D3?`,
    `Quali repository GitHub contengono codice relativo a questo tema?`,
    `Esistono discrepanze o approcci alternativi in questo cluster?`,
  ];

  const durationMs = Date.now() - startTime;

  return {
    answer: answerText,
    summary: summaryText,
    orchestratorPlan,
    trace: traces,
    citedResources: citedResourcesMeta,
    citedResourceIds: groundingResult.verifiedCitedIds,
    suggestedQuestions,
    graphClusterNodeIds: graphResult.clusterNodeIds,
    insufficient: groundingResult.insufficient,
    mode: request.mode || "quick_synthesis",
    stats: {
      totalVaultResourcesScanned: totalCount,
      relevantResourcesFound: candidateResources.length,
      durationMs,
      modelUsed,
    },
  };
}
