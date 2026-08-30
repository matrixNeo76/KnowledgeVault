import { ResourceItem } from "../types";

export const initialSampleResources: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">[] = [
  // 1. README / Panoramica Sistema
  {
    type: "knowledge",
    title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)",
    url: "https://github.com/knowledge-vault/system-readme",
    summary: "Documento centrale di visione, caratteristiche del Knowledge Vault, architettura a grafo topologico D3 e standard di interoperabilità per agenti autonomi.",
    tags: ["knowledge", "readme", "okf-v0.2", "architecture", "overview", "ai-agents"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      domain: "Knowledge Systems & AI Architecture",
      docType: "specification",
      entities: [
        { name: "Knowledge Vault", type: "system", description: "Piattaforma centrale per documentazione e ontologia AI" },
        { name: "OKF v0.2", type: "standard", description: "Open Knowledge Format specification" },
        { name: "KnowledgeGraph Engine", type: "component", description: "Motore di visualizzazione topologica a forze D3" },
        { name: "Cloud Firestore", type: "database", description: "Database NoSQL realtime e persistente" },
        { name: "Gemini 3.7 Flash", type: "ai_model", description: "Motore di elaborazione e strutturazione semantica" }
      ],
      relations: [
        { targetTitle: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)", relationType: "governs", weight: 0.95, description: "Definisce il quadro di riferimento per le operazioni degli agenti" },
        { targetTitle: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)", relationType: "implements", weight: 0.9, description: "Fornisce le linee guida di interazione per Claude" },
        { targetTitle: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)", relationType: "integrates", weight: 0.9, description: "Utilizza Gemini come motore di inferenza principale" },
        { targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)", relationType: "documents", weight: 1.0, description: "Espone l'architettura tecnica dettagliata" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
type: "specification"
domain: "Knowledge Systems & AI Architecture"
tags: ["knowledge", "readme", "okf-v0.2", "architecture", "overview", "ai-agents"]
created_at: "2026-08-29T10:00:00Z"
---

# Knowledge Vault (OKF v0.2)

> **Repository di Conoscenza Ontologica, Schemi di Prompt e Toolchain per Agenti Autonomi ed Ingegneri IA**

---

## 1. Visione del Progetto
Il **Knowledge Vault** è un hub avanzato per sviluppatori, ingegneri del prompt e agenti IA (Claude Code, Gemini, Copilot) che trasforma la documentazione tecnica in un **grafo topologico di conoscenza interconnessa**.

---

## 2. Funzionalità Chiave dell'Applicativo
- **Grafo Topologico D3 Force Simulation**: Simulazione a forze fisiche con risoluzione relazionale su 5 livelli (relazioni OKF, entità comuni, citazioni nel testo, tag, domini), supporto a nodi Hub Concetto, zoom continuo, fullscreen ed etichette semantiche lungo gli archi.
- **Cattura Intelligente & Gemini 3.7 / 2.5 Flash Engine**: Inserimento istantaneo di URL, repository GitHub, server MCP, prompt IA e documenti con parsing strutturato e fallback locale.
- **Standard OKF v0.2**: Frontmatter YAML rigoroso con entità, relazioni pesate, trigger keywords e compatibilità completa per esportazione markdown.
- **Knowledge Reader**: Visualizzatore Markdown con ispezione YAML e scheda dedicata "Grafo & Relazioni" con calcolo della matrice di affinità.
- **Persistenza Realtime Cloud Firestore**: Sincronizzazione multi-device immediata, autenticazione Google / Ospite e regole di sicurezza per utente.
- **Console di Diagnostica & Telemetria**: Monitoraggio real-time di eventi AUTH, FIRESTORE, CAPTURE e GEMINI con log scaricabile in formato JSON.
`
    }
  },

  // 2. AGENTS.md
  {
    type: "knowledge",
    title: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)",
    url: "https://github.com/knowledge-vault/agents-protocol",
    summary: "Linee guida di ingaggio, vincoli architetturali, protocolli di esecuzione e standard di persistenza per agenti intelligenti che operano sul Knowledge Vault.",
    tags: ["knowledge", "agents", "protocol", "okf-v0.2", "governance"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      domain: "Autonomous Agents & Governance",
      docType: "guide",
      entities: [
        { name: "Autonomous Agent", type: "concept", description: "Agente IA in grado di eseguire compiti e aggiornare il vault" },
        { name: "OKF v0.2", type: "standard", description: "Specifiche del formato dati accettato" },
        { name: "Cloud Firestore", type: "database", description: "Storage autoritativo per la conoscenza" },
        { name: "KnowledgeGraph Engine", type: "component", description: "Grafo semantico per la navigazione delle relazioni" }
      ],
      relations: [
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "references", weight: 0.9, description: "Fa riferimento alle specifiche generali" },
        { targetTitle: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)", relationType: "coordinates_with", weight: 0.85, description: "Allineamento operativo con i comandi di Claude" },
        { targetTitle: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)", relationType: "uses_engine", weight: 0.9, description: "Utilizza Gemini per la strutturazione dei metadati" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
type: "guide"
domain: "Autonomous Agents & Governance"
tags: ["knowledge", "agents", "protocol", "okf-v0.2", "governance"]
created_at: "2026-08-29T10:15:00Z"
---

# Protocolli Operativi per Agenti Autonomi

## 1. Regole di Inserimento Risorse
1. **Validazione dello Schema OKF v0.2**: L'agente non deve mai inserire testo non strutturato senza aver prima eseguito l'estrazione delle entità e delle relazioni.
2. **Nomi Canonici delle Entità**: Per garantire che il KnowledgeGraph crei i collegamenti corretti, utilizzare nomi standardizzati (es. \`Model Context Protocol\`, \`TypeScript\`, \`Cloud Firestore\`).
3. **Mantenimento dei Tag Semantici**: Allegare sempre almeno 3 tag rilevanti in formato lowercase.
`
    }
  },

  // 3. CLAUDE.md
  {
    type: "knowledge",
    title: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)",
    url: "https://github.com/knowledge-vault/claude-spec",
    summary: "Specifiche per l'integrazione di Claude Code nel workflow di sviluppo del Vault: comandi di build, linter, gestione dello stack e pattern di codifica React/TypeScript.",
    tags: ["knowledge", "claude", "anthropic", "cli", "workflow", "typescript"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      domain: "Developer Tooling & CLI",
      docType: "guide",
      entities: [
        { name: "Claude Code", type: "tool", description: "Agente CLI per terminale sviluppato da Anthropic" },
        { name: "Anthropic", type: "organization", description: "Sviluppatore di Claude e specifiche MCP" },
        { name: "TypeScript", type: "language", description: "Linguaggio di implementazione del progetto" },
        { name: "KnowledgeGraph Engine", type: "component", description: "Componente interattivo di rendering del grafo" }
      ],
      relations: [
        { targetTitle: "Claude Code: Guida al Terminale Agentico", relationType: "documents", weight: 0.95, description: "Approfondimento sul tool Claude Code" },
        { targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)", relationType: "relates_to", weight: 0.88, description: "Descrizione dell'architettura implementata" },
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "uses_protocol", weight: 0.92, description: "Integrazione con server e tool MCP" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)"
type: "guide"
domain: "Developer Tooling & CLI"
tags: ["knowledge", "claude", "anthropic", "cli", "workflow", "typescript"]
created_at: "2026-08-29T10:20:00Z"
---

# Specifiche Operative Claude Code (CLAUDE.md)

## 1. Comandi Essenziali
- **Dev Server**: \`npm run dev\`
- **Controllo Tipi**: \`npm run lint\` (\`tsc --noEmit\`)
- **Compilazione**: \`npm run build\`
- **Start Produzione**: \`npm run start\`

## 2. Best Practice per il Vault
- Utilizzare sempre colori ad alto contrasto per i link del grafo topologico.
- Mantenere le definizioni dei tipi in \`src/types.ts\`.
- Testare la coerenza delle relazioni bidirezionali prima di ogni rilascio.
`
    }
  },

  // 4. GEMINI.md
  {
    type: "knowledge",
    title: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)",
    url: "https://github.com/knowledge-vault/gemini-engine",
    summary: "Configurazione del motore analitico Gemini 3.7 / 2.5 Flash: prompt di sistema, schemi JSON di risposta, gestione dei timeout e fallback euristico locale.",
    tags: ["knowledge", "gemini", "ai-engine", "json-schema", "prompt-engineering"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      domain: "AI Model Engineering & Inference",
      docType: "specification",
      entities: [
        { name: "Gemini 3.7 Flash", type: "ai_model", description: "Modello primario per generazione di schemi JSON strutturati" },
        { name: "Gemini 2.5 Flash", type: "ai_model", description: "Modello secondario ad alta velocità e resilienza" },
        { name: "Google GenAI SDK", type: "sdk", description: "Libreria ufficiale per comunicazioni server-side sicure" },
        { name: "OKF v0.2", type: "standard", description: "Struttura di destinazione per le estrazioni del modello" }
      ],
      relations: [
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "powers", weight: 0.95, description: "Fornisce l'infrastruttura AI per l'intero vault" },
        { targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)", relationType: "integrates_into", weight: 0.9, description: "Integrato nel server Express backend" },
        { targetTitle: "Gemini 2.5 Structured Extractor", relationType: "implements_skill", weight: 0.95, description: "Skill specialistica per il parsing dei dati" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)"
type: "specification"
domain: "AI Model Engineering & Inference"
tags: ["knowledge", "gemini", "ai-engine", "json-schema", "prompt-engineering"]
created_at: "2026-08-29T10:25:00Z"
---

# Google Gemini AI Engine Guidelines

## 1. Pipeline di Analisi
1. **Ricezione Payload**: Il client invia il testo, snippet o URL a \`/api/analyze-resource\`.
2. **Generazione Strutturata**: Il server invoca \`gemini-3.7-flash\` con \`responseMimeType: "application/json"\`.
3. **Estrazione Ontologica**: Il modello produce entità, relazioni pesate, tag e frontmatter YAML.
4. **Timeout e Fallback**: Se la chiamata supera i 15 secondi, interviene l'estrattore euristico locale garantendo disponibilità al 100%.
`
    }
  },

  // 5. ARCHITECTURE.md
  {
    type: "knowledge",
    title: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)",
    url: "https://github.com/knowledge-vault/system-architecture",
    summary: "Descrizione dettagliata dell'architettura client-server: React 18, Express, motore di simulazione D3.js, sincronizzazione realtime con Cloud Firestore e sicurezza.",
    tags: ["knowledge", "architecture", "full-stack", "d3-graph", "firestore", "express"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      domain: "Software Architecture & Distributed Systems",
      docType: "architecture",
      entities: [
        { name: "KnowledgeGraph Engine", type: "component", description: "Motore di simulazione a forze D3" },
        { name: "Cloud Firestore", type: "database", description: "Database NoSQL scalabile per memorizzazione persistente" },
        { name: "Express Server", type: "backend", description: "Backend proxy per API protette e inferenza AI" },
        { name: "Knowledge Vault", type: "system", description: "Applicazione complessiva" }
      ],
      relations: [
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "detailed_in", weight: 1.0, description: "Documentazione architetturale completa" },
        { targetTitle: "Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)", relationType: "contains", weight: 0.95, description: "Dettaglio del sottosistema di rendering grafico" },
        { targetTitle: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)", relationType: "communicates_with", weight: 0.9, description: "Interfaccia con le API generative di backend" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)"
type: "architecture"
domain: "Software Architecture & Distributed Systems"
tags: ["knowledge", "architecture", "full-stack", "d3-graph", "firestore", "express"]
created_at: "2026-08-29T10:30:00Z"
---

# Architettura di Sistema Full-Stack

## 1. Topologia di Flusso Dati
- **Frontend SPA**: React 18 con rendering D3 e stato reattivo Firestore.
- **Backend Proxy**: Express 4/5 per gestione protetta delle chiavi API e isolamento dell'SDK Google GenAI.
- **Database & Identity**: Firestore per persistenza documenti e Firebase Auth per isolamento multi-utente.
`
    }
  },

  // 6. KnowledgeGraph Component Deep-Dive
  {
    type: "knowledge",
    title: "Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)",
    url: "https://github.com/knowledge-vault/knowledge-graph-engine",
    summary: "Specifiche tecniche dell'algoritmo di simulazione a forze fisiche, calcolo del peso degli archi, rilevamento entità condivise e filtri topologici interattivi.",
    tags: ["knowledge", "d3", "graph", "topology", "algorithms", "physics-simulation"],
    isFavorite: false,
    metadata: {
      okfVersion: "0.2",
      domain: "Data Visualization & Graph Theory",
      docType: "guide",
      entities: [
        { name: "KnowledgeGraph Engine", type: "component", description: "Engine basato su D3 v7 force simulation" },
        { name: "D3.js", type: "library", description: "Libreria per visualizzazioni dati guidate da documenti" },
        { name: "OKF v0.2", type: "standard", description: "Specifica ontologica che alimenta i nodi del grafo" }
      ],
      relations: [
        { targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)", relationType: "part_of", weight: 0.95, description: "Modulo grafico centrale dell'architettura" },
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "features_in", weight: 0.9, description: "Esposto come vista principale nella navbar" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)"
type: "guide"
domain: "Data Visualization & Graph Theory"
tags: ["knowledge", "d3", "graph", "topology", "algorithms", "physics-simulation"]
created_at: "2026-08-29T10:35:00Z"
---

# Motore Topologico D3 e Calcolo Relazioni

## 1. Gerarchia di Risoluzione degli Archi
Il componente valuta ogni coppia di documenti ed assegna un arco pesato:
1. **Relazioni OKF v0.2 Dirette** (Oro Champagne): Peso 1.0, freccia direzionale.
2. **Entità Ontologiche Condivise** (Ciano): Peso 0.85–1.0.
3. **Menzioni nel Testo** (Viola): Peso 0.80.
4. **Tag Comuni** (Ambra Tratteggiata): Peso 0.60–0.95.
5. **Dominio Congiunto** (Smeraldo): Peso 0.55.
`
    }
  },

  // 7. Claude Code Guide
  {
    type: "knowledge",
    title: "Claude Code: Guida al Terminale Agentico",
    url: "https://anthropic.com/claude-code",
    summary: "Guida completa allo strumento da riga di comando sviluppato da Anthropic per assistere gli sviluppatori direttamente nel terminale con loop agentico e integrazione Git.",
    tags: ["knowledge", "claude", "anthropic", "cli", "agentic-ai", "git"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      domain: "AI Development Tools",
      docType: "concept",
      entities: [
        { name: "Claude Code", type: "tool", description: "Agentic CLI tool" },
        { name: "Anthropic", type: "organization", description: "Creatore di Claude e del Model Context Protocol" },
        { name: "Git", type: "tool", description: "Sistema di controllo versione integrato nel loop agentico" }
      ],
      relations: [
        { targetTitle: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)", relationType: "documented_by", weight: 0.95, description: "Configurazione e comandi operativi" },
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "leverages", weight: 0.9, description: "Utilizzo di tool ed estensioni MCP" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Claude Code: Guida al Terminale Agentico"
type: "concept"
domain: "AI Development Tools"
tags: ["knowledge", "claude", "anthropic", "cli", "agentic-ai", "git"]
created_at: "2026-08-29T10:40:00Z"
---

# Claude Code

**Claude Code** è uno strumento a riga di comando (CLI) agentico sviluppato da Anthropic che porta l'intelligenza di Claude direttamente all'interno del terminale di sviluppo.

## Caratteristiche Principali
- **Loop Agentico Autonomo**: Esegue modifiche multi-file, lancia test e verifica compilazioni in autonomia.
- **Integrazione Git**: Genera commit informativi, gestisce branch e risolve conflitti.
- **Compatibilità MCP**: Connette server e strumenti esterni per interrogare database e documentazioni.
`
    }
  },

  // 8. Model Context Protocol Guide
  {
    type: "article",
    title: "Guida Completa al Model Context Protocol (MCP)",
    url: "https://modelcontextprotocol.io/introduction",
    summary: "Panoramica dettagliata sullo standard aperto MCP per connettere in modo sicuro assistenti e agenti intelligenti a fonti dati, IDE e strumenti esterni.",
    tags: ["article", "mcp", "architecture", "ai-agents", "standards"],
    isFavorite: false,
    metadata: {
      author: "Anthropic Engineering",
      readingTimeMin: "8 min",
      entities: [
        { name: "Model Context Protocol", type: "standard", description: "Standard aperto per l'interoperabilità dei tool IA" },
        { name: "Anthropic", type: "organization", description: "Autore della specifica MCP" }
      ],
      relations: [
        { targetTitle: "Claude Code: Guida al Terminale Agentico", relationType: "supported_by", weight: 0.9, description: "Supportato nativamente da Claude Code" },
        { targetTitle: "PostgreSQL MCP Server", relationType: "implements", weight: 0.95, description: "Esempio pratico di server MCP per database" },
        { targetTitle: "Filesystem MCP Server", relationType: "implements", weight: 0.95, description: "Server MCP per operazioni su filesystem" }
      ],
      keyTakeaways: [
        "Standard aperto per interoperabilità tool/dati",
        "Supporto trasporti stdio per locale e SSE per server remoti",
        "Separazione netta tra Client, Server e Host"
      ]
    }
  },

  // 9. PostgreSQL MCP Server
  {
    type: "mcp_server",
    title: "PostgreSQL MCP Server",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    summary: "Server MCP standard per consentire a modelli LLM ed agenti di esplorare schemi di database PostgreSQL, eseguire query in sola lettura e analizzare tabelle.",
    tags: ["mcp", "postgresql", "database", "agents", "tools"],
    isFavorite: true,
    metadata: {
      protocol: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
      entities: [
        { name: "Model Context Protocol", type: "standard", description: "Specifica implementata dal server" },
        { name: "PostgreSQL", type: "database", description: "Database relazionale di destinazione" }
      ],
      relations: [
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "implements_spec", weight: 0.95, description: "Implementazione ufficiale della specifica MCP" },
        { targetTitle: "Filesystem MCP Server", relationType: "sibling_tool", weight: 0.8, description: "Altro server MCP standard" }
      ],
      configSnippet: JSON.stringify({
        mcpServers: {
          postgres: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
          }
        }
      }, null, 2),
      toolsProvided: ["query", "list_tables", "describe_table"]
    }
  },

  // 10. Filesystem MCP Server
  {
    type: "mcp_server",
    title: "Filesystem MCP Server",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    summary: "Abilita lettura, scrittura, ricerca e manipolazione sicura dei file locali per agenti IA all'interno di directory consentite.",
    tags: ["mcp", "filesystem", "node", "local-dev"],
    isFavorite: false,
    metadata: {
      protocol: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"],
      entities: [
        { name: "Model Context Protocol", type: "standard", description: "Specifica implementata" },
        { name: "Filesystem", type: "concept", description: "Accesso sicuro al disco per agenti" }
      ],
      relations: [
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "implements_spec", weight: 0.95, description: "Implementazione ufficiale della specifica MCP" },
        { targetTitle: "PostgreSQL MCP Server", relationType: "sibling_tool", weight: 0.8, description: "Altro server MCP standard" }
      ],
      configSnippet: JSON.stringify({
        mcpServers: {
          filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
          }
        }
      }, null, 2),
      toolsProvided: ["read_file", "write_file", "list_directory", "search_files"]
    }
  },

  // 11. Senior Code Reviewer & Architect Skill
  {
    type: "ai_skill",
    title: "Senior Code Reviewer & Architect",
    url: "https://github.com/google/ai-studio-skills",
    summary: "Skill AI specializzata per effettuare code review approfondite, individuare memory leak, vulnerabilità di sicurezza e ottimizzare architetture TypeScript/React.",
    tags: ["skill", "prompt", "code-review", "architecture", "typescript"],
    isFavorite: false,
    metadata: {
      skillType: "System Persona & Evaluation",
      recommendedModel: "gemini-2.5-pro",
      entities: [
        { name: "TypeScript", type: "language", description: "Linguaggio oggetto di revisione" },
        { name: "React", type: "framework", description: "Framework UI esaminato per re-render e performance" }
      ],
      relations: [
        { targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)", relationType: "audits", weight: 0.85, description: "Valuta le scelte architetturali" },
        { targetTitle: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)", relationType: "guides", weight: 0.88, description: "Fornisce criteri di qualità per Claude" }
      ],
      systemPrompt: "Sei un Principal Software Architect. Analizza il codice fornito valutando:\n1. Robustezza e type-safety in TypeScript\n2. Performance e re-render avoidance in React\n3. Principi SOLID e pulizia del design architetturale\n4. Copertura dei casi limite e gestione errori",
      triggerKeywords: ["review", "refactor", "audit", "optimize"]
    }
  },

  // 12. Gemini Structured Extractor Skill
  {
    type: "ai_skill",
    title: "Gemini 2.5 Structured Extractor",
    url: "https://ai.google.dev/docs",
    summary: "Istruzioni di sistema per estrarre schemi JSON rigorosi da testo non strutturato con validazione dei campi e parsing resiliente.",
    tags: ["skill", "gemini", "json-schema", "prompt"],
    isFavorite: true,
    metadata: {
      skillType: "Data Extraction",
      recommendedModel: "gemini-2.5-flash",
      entities: [
        { name: "Gemini 3.7 Flash", type: "ai_model", description: "Modello generativo per JSON strutturato" },
        { name: "OKF v0.2", type: "standard", description: "Formato dati target per l'estrazione" }
      ],
      relations: [
        { targetTitle: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)", relationType: "implements", weight: 0.95, description: "Implementazione diretta dei prompt di sistema" },
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "powers_extraction", weight: 0.9, description: "Alimenta la barra di cattura rapida del vault" }
      ],
      systemPrompt: "Estrai esclusivamente oggetti JSON conformi allo schema specificato. Non includere blocchi markdown ```json o testo di accompagnamento. Valida tutti i tipi prima dell'emissione.",
      triggerKeywords: ["json", "extract", "parse", "schema"]
    }
  },

  // 13. GitHub Repo: Model Context Protocol Servers
  {
    type: "github_repo",
    title: "modelcontextprotocol/servers",
    url: "https://github.com/modelcontextprotocol/servers",
    summary: "Repository ufficiale Anthropic con la collezione di server di riferimento per Model Context Protocol (PostgreSQL, Filesystem, Git, SQLite, Slack, Brave Search).",
    tags: ["github", "mcp", "open-source", "servers", "tools", "anthropic"],
    isFavorite: true,
    metadata: {
      owner: "modelcontextprotocol",
      repoName: "servers",
      language: "TypeScript",
      installCommand: "git clone https://github.com/modelcontextprotocol/servers.git",
      entities: [
        { name: "Model Context Protocol", type: "standard", description: "Specifica MCP implementata dai server" },
        { name: "Anthropic", type: "organization", description: "Organizzazione promotrice dello standard" }
      ],
      relations: [
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "implements", weight: 0.95, description: "Implementazione ufficiale dei server di riferimento" },
        { targetTitle: "PostgreSQL MCP Server", relationType: "contains", weight: 0.9, description: "Modulo server PostgreSQL contenuto nella repo" }
      ]
    }
  },

  // 14. GitHub Repo: Anthropic Quickstarts
  {
    type: "github_repo",
    title: "anthropics/anthropic-quickstarts",
    url: "https://github.com/anthropics/anthropic-quickstarts",
    summary: "Progetti di avvio rapido e architetture di riferimento per la creazione di applicazioni, agenti autonomi e toolchain con l'API di Claude.",
    tags: ["github", "claude", "anthropic", "quickstart", "agents", "python", "typescript"],
    isFavorite: false,
    metadata: {
      owner: "anthropics",
      repoName: "anthropic-quickstarts",
      language: "Python / TypeScript",
      installCommand: "git clone https://github.com/anthropics/anthropic-quickstarts.git",
      entities: [
        { name: "Claude Code", type: "tool", description: "Strumenti CLI e API Anthropic" },
        { name: "Anthropic", type: "organization", description: "Creatore dei framework" }
      ],
      relations: [
        { targetTitle: "Claude Code: Guida al Terminale Agentico", relationType: "references", weight: 0.85, description: "Esempi di orchestrazione e workflow agentico" }
      ]
    }
  },

  // 15. GitHub Repo: Google Gemini Cookbook
  {
    type: "github_repo",
    title: "google-gemini/cookbook",
    url: "https://github.com/google-gemini/cookbook",
    summary: "Collezione ufficiale di guide, notebook e ricette di codice per l'utilizzo avanzato dei modelli Gemini 2.5 e Gemini 3.7 Flash con il Google GenAI SDK.",
    tags: ["github", "gemini", "google", "cookbook", "python", "ai-engine"],
    isFavorite: true,
    metadata: {
      owner: "google-gemini",
      repoName: "cookbook",
      language: "Python / Jupyter",
      installCommand: "git clone https://github.com/google-gemini/cookbook.git",
      entities: [
        { name: "Gemini 3.7 Flash", type: "ai_model", description: "Modello generativo di riferimento" },
        { name: "Google GenAI SDK", type: "sdk", description: "SDK per chiamate di inferenza" }
      ],
      relations: [
        { targetTitle: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)", relationType: "complements", weight: 0.9, description: "Esempi pratici e pattern di implementazione" }
      ]
    }
  }
];
