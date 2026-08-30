# Knowledge Vault (OKF v0.2)

> **Repository di Conoscenza Ontologica, Schemi di Prompt, Toolchain MCP e Grafo Topologico Semantico per Sviluppatori ed Agenti IA Autonomi**

[![Standard OKF](https://img.shields.io/badge/Standard-OKF%20v0.2-C5A059.svg)](https://github.com)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%205.8-3178C6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/Framework-React%2019-61DAFB.svg)](https://react.dev/)
[![D3.js](https://img.shields.io/badge/Visualization-D3.js%20v7-F9A03C.svg)](https://d3js.org/)
[![Google Gemini](https://img.shields.io/badge/AI%20Engine-Gemini%203.7%20%2F%202.5%20Flash-8E75B2.svg)](https://ai.google.dev/)
[![Firebase](https://img.shields.io/badge/Database-Cloud%20Firestore-FFCA28.svg)](https://firebase.google.com/)

---

## 🌟 Panoramica & Visione

**Knowledge Vault** è una piattaforma avanzata full-stack concepita per colmare il divario tra la documentazione tecnica tradizionale e le esigenze operative degli **Agenti Autonomi (come Claude Code, Gemini, Copilot)** e degli **Ingegneri del Prompt**.

A differenza dei comuni wiki o bookmark manager statici, Knowledge Vault trasforma ogni informazione (file markdown, repository GitHub, server MCP, prompt di sistema o articoli tecnici) in un **nodo ontologico interconnesso** governato dallo standard aperto **OKF v0.2 (Open Knowledge Format)**. 

Attraverso un **motore fisico a grafo in D3.js** e l'orchestrazione di **Google Gemini 3.7 / 2.5 Flash**, la piattaforma analizza, categorizza, correla e rende immediatamente interrogabile ed esportabile l'intero corpus di conoscenza tecnica.

---

## 🚀 Tutte le Funzionalità dell'Applicativo

### 1. 🧠 Topologia a Grafo Interattiva (D3 Force Simulation)
- **Motore di Layout Fisico a Forze**: Simulazione continua con cariche repulsive dinamiche, prevenzione delle collisioni basata sul grado di connessione e centratura dinamica.
- **Risoluzione Relazionale Multilivello**:
  - 🟡 **Relazioni Ontologiche OKF v0.2 Dirette** (Oro Champagne con freccia direzionale orientata): collegamenti formalmente dichiarati nei frontmatter YAML (es. `governs`, `implements`, `documents`, `powers`, `relates_to`).
  - 🔵 **Entità e Concetti Condivisi** (Ciano Elettrico): riconoscimento automatico di entità ontologiche comuni presenti nei metadati (es. *Anthropic, Claude, Model Context Protocol, TypeScript, React, Firestore*).
  - 🟣 **Citazioni e Menzioni nel Testo** (Viola): scansione semantica del corpo del testo e dei summary per individuare riferimenti incrociati ad altri documenti.
  - 🟠 **Tag Semantici Condivisi** (Ambra con linea tratteggiata): aggregazione per co-occorrenza di etichette tematiche.
  - 🟢 **Dominio & Ambito Comune** (Smeraldo): raggruppamento per settore tecnologico.
- **Modalità Hub Entità (Concept Nodes)**: Pulsante per generare nodi-ponte intermedi che raggruppano visualmente tutti i documenti attorno a un concetto chiave.
- **Etichette Semantiche sulle Linee**: Badge leggibili in tempo reale lungo gli archi con indicazione del tipo di legame.
- **Strumenti di Navigazione**: Zoom progressivo (`+` / `-`), reset vista, centratura automatica, modalità **Schermo Intero (Fullscreen)** e ricerca con filtraggio istantaneo del grafo.

---

### 2. ⚡ Cattura Intelligente & Gemini 3.7 / 2.5 Flash Engine
- **Quick Capture Bar Globale**: Input rapido con ridimensionamento automatico per catturare:
  - *URL generici ed articoli web* (estrazione testo e sintesi automatica).
  - *Repository GitHub* (estrazione owner, repo, comando clone e dipendenze).
  - *Configurazioni e Server MCP* (creazione istantanea di snippet JSON `mcpServers` compatibili con Claude Desktop e Claude Code).
  - *AI Prompts & Skills* (identificazione del ruolo di sistema, modello consigliato e parole chiave di trigger).
  - *Documenti Tecnici OKF v0.2*.
- **Structured JSON Schema via Gemini**: Output rigorosamente validato tramite `@google/genai` TypeScript SDK con latenza minima.
- **Fallback Euristico Locale a Latenza Zero**: Se la connessione o le API esterne sono degradate, interviene un motore di parsing a regole per garantire continuità di servizio al 100%.

---

### 3. 📖 Knowledge Reader & Visualizzatore OKF v0.2
- **Visualizzazione Markdown ad Alta Leggibilità**: Rendering fluido del corpo del documento con formattazione codice, tabelle e badge di stato.
- **Ispezione Metadati & Frontmatter YAML**: Scheda dedicata per visualizzare ed esaminare lo schema YAML puro conforme a OKF v0.2.
- **Scheda "Grafo & Relazioni" nel Reader**:
  - Elenco interattivo di tutte le relazioni ontologiche dichiarate con navigazione diretta al documento collegato con 1 clic.
  - Calcolo automatico della **Matrice di Affinità Semantica** con tutti gli altri documenti presenti nel Vault.
- **Esportazione Istantanea**: Download in formato `.md` standard con frontmatter YAML precompilato o copia del prompt di sistema negli appunti.

---

### 4. 🗂️ Gestione Risorse Multicanale & Visualizzazioni
- **Vista a Griglia (Card)** & **Vista a Tabella Densa**: Visualizzazione ordinabile e filtrabile per tipo di risorsa, data o preferiti.
- **Badge e Dati Specifici per Categoria**:
  - *MCP Server*: Visualizzazione dei tool forniti, protocollo (`stdio`/`sse`), comando eseguibile e snippet di configurazione con pulsante copia rapida.
  - *GitHub Repo*: Metadati su owner, repository e comando di installazione Git.
  - *AI Skill*: Visualizzazione prompt di sistema, modello consigliato (`gemini-2.5-pro`, `claude-3-7-sonnet`) e trigger keywords.
  - *Knowledge Document*: Versione OKF, tipo di documento (`concept`, `architecture`, `guide`, `specification`), entità e relazioni.
- **Filtri Rapidi**: Filtraggio per categoria (*Tutti, OKF Knowledge, MCP Server, GitHub Repo, AI Skills, Articoli*), preferiti (⭐) e per singolo Tag cliccabile.
- **Barra Statistiche di Sistema**: Metriche aggregate in tempo reale con conteggio documenti, server MCP, skill e densità dei collegamenti ontologici.

---

### 5. 📥 Importazione / Upload Documenti OKF
- **Upload Dialog Dedicato**: Supporto per drag & drop di file `.md`, `.txt` o incollamento diretto di testo grezzo.
- **Pipeline di Parsing e Sanitizzazione**: Validazione dei metadati, estrazione automatica dei tag e conversione nello standard OKF prima del salvataggio.

---

### 6. 🔒 Persistenza Cloud Firestore & Autenticazione
- **Sincronizzazione Realtime Multi-Device**: Aggiornamento reattivo immediato tramite listener `onSnapshot` di Google Cloud Firestore.
- **Autenticazione Flessibile**:
  - Accesso sicuro tramite **Google Account (Firebase Auth)**.
  - Accesso immediato con **Sessione Anonima / Ospite**.
- **Regole di Sicurezza Granulari (`firestore.rules`)**:
  - Isolamento rigoroso per `userId` (ogni utente accede solo alle proprie risorse).
  - Validazione dei tipi di campo e vincoli sui formati supportati.

---

### 7. 🛠️ Console di Diagnostica & Telemetria di Sistema
- **Drawer di Diagnostica Realtime**: Monitoraggio continuo e cronologia degli eventi di sistema con categorie dedicate:
  - `AUTH` (login, logout, session state).
  - `FIRESTORE` (operazioni di read, add, update, delete).
  - `CAPTURE` (analisi input, sanitizzazione payload).
  - `GEMINI_AI` (chiamate al modello, token usage, fallback).
- **Esportazione Log di Sistema**: Download del report di telemetria in formato JSON per auditing e debugging.
- **Inizializzazione Suite Documentale**: Pulsante dedicato per pre-caricare l'intera suite documentale del sistema (*README, AGENTS, CLAUDE, GEMINI, ARCHITECTURE, ecc.*) con le relazioni ontologiche predefinite.

---

## 🏛️ Specifiche dello Standard OKF v0.2 (Open Knowledge Format)

Ogni risorsa catalogata nel Vault adotta la seguente struttura di frontmatter YAML:

```yaml
---
okf_version: "0.2"
title: "Titolo Univoco del Documento"
type: "concept" # concept | architecture | guide | specification | tool_description | prompt_skill
domain: "Software Architecture & AI"
tags:
  - "knowledge"
  - "architecture"
  - "d3-graph"
entities:
  - name: "Claude Code"
    type: "tool"
    description: "Agentic CLI tool sviluppato da Anthropic"
  - name: "Cloud Firestore"
    type: "database"
    description: "NoSQL document store reattivo"
relations:
  - targetTitle: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
    relationType: "governs"
    weight: 0.95
    description: "Definisce il quadro di riferimento per le operazioni"
created_at: "2026-08-29T10:00:00Z"
---

# Titolo Documento

Corpo della documentazione formattato in Markdown con tabelle, blocchi di codice e specifiche tecniche.
```

---

## 🏗️ Architettura & Stack Tecnologico

```
+-------------------------------------------------------------------------+
|                              CLIENT (React 18 + SPA)                    |
|                                                                         |
|  +---------------------+   +---------------------+   +---------------+  |
|  |   KnowledgeGraph    |   |   KnowledgeReader   |   |   QuickBar    |  |
|  |  (D3 Force Network) |   |  (Markdown + OKF)   |   | & Diagnostics |  |
|  +----------^----------+   +----------^----------+   +-------^-------+  |
|             |                         |                      |          |
|             +-------------------------+----------------------+          |
|                                       |                                 |
|                           [ React State & Context ]                     |
+---------------------------------------|---------------------------------+
                                        |
           +----------------------------+----------------------------+
           | (Auth & Firestore Sync)                                 | (REST API)
           v                                                         v
+-----------------------+                         +-----------------------+
|  Cloud Firestore &    |                         |     Express Server    |
|  Firebase Auth        |                         |       (server.ts)     |
|                       |                         |                       |
| - collection("resources")                       | - /api/analyze-resource
| - Security rules per UID                        | - /api/ai-chat        |
| - Realtime onSnapshot                           | - Google GenAI SDK    |
+-----------------------+                         +-----------^-----------+
                                                              |
                                                              v
                                                  +-----------------------+
                                                  | Gemini 3.7 / 2.5 Flash|
                                                  |  (Structured Output)  |
                                                  +-----------------------+
```

| Layer | Tecnologie e Librerie |
|---|---|
| **Frontend Framework** | React 19 / 18, TypeScript 5.8, Vite 6 |
| **Data Visualization** | D3.js v7 (`d3-force`, `d3-zoom`, `d3-selection`) |
| **Styling & Icons** | Tailwind CSS v4, Lucide React, Framer Motion |
| **Content Rendering** | React Markdown, JetBrains Mono & Instrument Serif typography |
| **Backend & Proxy** | Node.js, Express, `tsx` runtime, `esbuild` compiler |
| **AI Inference** | `@google/genai` TypeScript SDK (Gemini 3.7 Flash & 2.5 Flash) |
| **Database & Auth** | Google Cloud Firestore (NoSQL realtime) & Firebase Authentication |

---

## 📦 Struttura del Progetto

```
├── .env.example              # Documentazione variabili d'ambiente (GEMINI_API_KEY)
├── README.md                 # Panoramica completa e documentazione di riferimento
├── AGENTS.md                 # Regole e protocolli per agenti autonomi
├── CLAUDE.md                 # Specifiche per Claude Code e workflow CLI
├── GEMINI.md                 # Linee guida prompt engineering e schema Gemini
├── ARCHITECTURE.md           # Dettaglio architetturale completo del sistema
├── firestore.rules           # Regole di sicurezza per Google Cloud Firestore
├── firebase-blueprint.json   # Schema e indici del database Firestore
├── server.ts                 # Server Express con endpoint API e Vite middleware
├── package.json              # Dipendenze e script di build
├── src/
│   ├── main.tsx              # Entry point React
│   ├── App.tsx               # Controller applicativo principale
│   ├── types.ts              # Interfacce TypeScript e schemi dati OKF v0.2
│   ├── lib/
│   │   ├── firebase.ts       # Inizializzazione Firebase Auth e Firestore
│   │   ├── sampleData.ts     # Suite documentale predefinita OKF v0.2
│   │   └── utils.ts          # Utility di formattazione e parsing
│   └── components/
│       ├── KnowledgeGraph.tsx        # Motore visualizzazione a grafo topologico D3
│       ├── KnowledgeReader.tsx       # Lettore Markdown & ispettore ontologico
│       ├── CaptureBar.tsx            # Barra di cattura rapida intelligente
│       ├── KnowledgeUploadDialog.tsx # Modale di upload e parsing documenti OKF
│       ├── ResourceCard.tsx          # Card interattiva con badge per categoria
│       ├── ResourceTable.tsx         # Vista tabellare avanzata
│       ├── ResourceModal.tsx         # Modale dettaglio e modifica risorsa
│       ├── Sidebar.tsx               # Barra laterale di navigazione e filtri
│       ├── Header.tsx                # Intestazione con search, auth e profilo
│       ├── StatsBanner.tsx           # Metriche aggregate e KPI della knowledge
│       └── DiagnosticDrawer.tsx      # Console di telemetria e log di sistema
```

---

## ⚡ Guida Rapida di Avvio

### 1. Installazione Dipendenze
```bash
npm install
```

### 2. Configurazione Variabili d'Ambiente
Crea un file `.env` basandoti su `.env.example`:
```env
GEMINI_API_KEY=tuo_api_key_google_gemini
```

### 3. Avvio in Modalità Sviluppo
```bash
npm run dev
```
L'applicazione sarà disponibile su `http://localhost:3000`.

### 4. Controllo Tipi & Build di Produzione
```bash
# Type check con TypeScript
npm run lint

# Build unificata frontend + backend CJS bundle
npm run build

# Avvio del server di produzione
npm run start
```

---

## 📄 Licenza

Distribuito sotto licenza **MIT**. Realizzato per la community open-source di sviluppatori ed ingegneri AI.
