---
okf_version: "0.2"
id: "spec-ingestion-pipeline-intelligence"
title: "Specifica della Pipeline di Ingestione, Estrazione AI e De-duplicazione OKF v0.2"
type: "specification"
domain: "Ingestion Pipelines & Agentic Extraction"
tags: ["okf", "specification", "ingestion", "gemini-3.7-flash", "structured-output", "opengraph", "conflict-resolver", "cekikj"]
entities:
  - name: "CaptureBar Engine"
    type: "component"
    description: "Componente frontend reattivo con supporto drag-and-drop, inserimento URL e selezione tipologia esplicita"
  - name: "OpenGraph Ingestion Service"
    type: "service"
    description: "Modulo backend che esegue scraping e parsing rapido dei metadati HTML (og:title, og:image, autore, favicon)"
  - name: "Gemini 3.7 Flash Structured Pipeline"
    type: "toolchain"
    description: "Pipeline generativa server-side vincolata da JSON Schema rigoroso conforme allo standard OKF v0.2"
  - name: "Local Heuristic Fallback Parser"
    type: "component"
    description: "Estrattore basato su regole deterministiche a latenza 0ms che garantisce il salvataggio anche in assenza di rete o quote AI"
  - name: "Conflict & Canonical De-duplicator"
    type: "pattern"
    description: "Algoritmo di riconciliazione che fonde ID locali temporanei e record Firestore remoti prevenendo schede duplicate"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "implements"
    weight: 1.0
    description: "Produce documenti rigorosamente strutturati secondo lo standard OKF v0.2"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "depends_on"
    weight: 0.95
    description: "Si integra con l'architettura a 3 livelli e con il server Express unificato"
  - targetTitle: "Guida alla Replicazione Completa del Vault per LLM e Sviluppatori (SYSTEM_REPLICATION_GUIDE)"
    relationType: "references"
    weight: 0.85
    description: "Fornisce i dettagli implementativi per gli endpoint /api/analyze-resource"
---

# Specifica della Pipeline di Ingestione, Estrazione AI e De-duplicazione

> **Stato**: STABILE / OPERATIVO  
> **Endpoint Primario**: `POST /api/analyze-resource`  
> **Architettura**: Multi-Stadio con Fallback Euristico a Latenza Zero

---

## 1. Ciclo di Vita dell'Ingestione (Le 5 Fasi di Cattura)

Ogni risorsa catturata tramite l'interfaccia utente (`src/components/CaptureBar.tsx`) o tramite API segue un flusso a 5 stati sequenziali:

```
[1. SENDING] ---> [2. ANALYZING] ---> [3. TRANSFORMING] ---> [4. SAVING] ---> [5. SUCCESS]
Invio payload     Scraping Web +      Normalizzazione OKF    Scrittura Cloud   Notifica UI e
e triage input    Gemini 3.7 Flash    ed estrazione entità   + Backup locale   focalizzazione
```

### Dettaglio degli Stati:
1. **`sending`**: Validazione iniziale del testo, rilevamento pattern (URL standard, GitHub repository, JSON MCP, Markdown raw).
2. **`analyzing`**: Estrazione metadati OpenGraph e chiamata all'endpoint `/api/analyze-resource`.
3. **`transforming`**: Animazione e feedback contestuale differenziato per categoria (`Articolo & Guida`, `Web Link`, `GitHub Repo`, `OKF Bozza`, `OKF Documento`).
4. **`saving`**: Persistenza concorrente: scrittura Firestore (timeout 20s) con scrittura parallela sul backup locale.
5. **`success`**: Emissione del log strutturato, aggiornamento dei contatori ed evidenziazione visiva della scheda appena creata.

---

## 2. Ingestione Web & OpenGraph Extraction

Se l'input corrisponde a un URL (`http://` o `https://`), il servizio `server/services/openGraphService.ts`:
1. Esegue una richiesta HTTP `GET` con timeout di 6.000ms e intestazioni User-Agent browser standard.
2. Estrae:
   - `og:title` o tag `<title>` HTML (con sanitizzazione entità HTML).
   - `og:description` o tag `<meta name="description">`.
   - `og:image` (immagine di copertina ad alta risoluzione).
   - `author` o tag `<meta name="author">`.
   - Favicon di dominio tramite Google Favicon Service (`https://www.google.com/s2/favicons?domain=...&sz=64`).
3. Se l'utente ha selezionato un tipo esplicito (es. **Articolo**), il sistema assegna rigorosamente tale tipo, impiegando il titolo editoriale estratto come titolo primario della risorsa.

---

## 3. Schema JSON Rigoroso Gemini 3.7 Flash (Structured Output)

Il backend interroga il modello `gemini-3.7-flash` tramite il modulo `@google/genai` server-side, forzando la risposta all'interno del seguente schema JSON:

```json
{
  "type": "article | github_repo | mcp_server | ai_skill | knowledge | link",
  "title": "Titolo descrittivo e sintetico",
  "summary": "Sintesi chiara e contestualizzata dell'argomento",
  "tags": ["tag1", "tag2", "tag3"],
  "metadata": {
    "okfVersion": "0.2",
    "domain": "Ambito applicativo",
    "docType": "concept | architecture | guide | specification | tool_description | prompt_skill",
    "entities": [
      {
        "name": "Nome Entità",
        "type": "technology | concept | framework | organization | toolchain | pattern",
        "description": "Ruolo dell'entità"
      }
    ],
    "relations": [
      {
        "targetTitle": "Titolo Risorsa Esistente",
        "relationType": "references | implements | depends_on | extends | documents",
        "weight": 0.85,
        "description": "Motivazione del collegamento"
      }
    ],
    "markdownContent": "Documento completo formattato in Markdown con frontmatter YAML conforme OKF v0.2",
    "useCases": ["Caso d'uso 1", "Caso d'uso 2"],
    "score": 85,
    "scoreRationale": "Valutazione dell'utilità tecnica"
  }
}
```

---

## 4. Gerarchia di Fallback a Latenza Zero

Per garantire che l'applicazione non interrompa mai l'operatività:

1. **Livello 1 (Cloud Primario)**: `gemini-3.7-flash` con Google Search Grounding attivo per l'arricchimento di URL e repo.
2. **Livello 2 (Cloud Fallback)**: `gemini-flash-latest` o `gemini-3.1-flash-lite` in caso di errori 503 temporanei o saturazione quota.
3. **Livello 3 (Local Rule-Based Parser)**: Funzione `localFallbackAnalyzeResource()` in `src/lib/ruleBasedParser.ts`.  
   - Esecuzione sincrona a **0ms** senza dipendenza da server esterni o connessione Internet.
   - Genera titolo pulito, tipo canonico, tag euristici, metadati OpenGraph e documento OKF v0.2 valido con frontmatter YAML generato deterministicamente.

---

## 5. Algoritmo di Riconciliazione e Prevenzione Duplicati (`conflictResolver.ts`)

Quando una risorsa viene salvata:
1. Viene calcolata la **Firma Canonica della Risorsa**:
   - Per risorse con URL: `url:${cleanUrl}` (URL normalizzato senza slash finale e senza parametri di tracking).
   - Per documenti interni senza URL: `title:${cleanTitle}` (se il titolo supera gli 8 caratteri e non appartiene alla lista dei titoli generici).
2. **Prevenzione Collisione Concorrente**:
   - Se durante la scrittura su Firestore il client riceve un errore di timeout ma il pacchetto era già in volo, il sistema controlla lo stato locale prima di generare un ID temporaneo `local-`.
   - Se una risorsa con la stessa firma canonica è già presente o arriva via `onSnapshot`, l'ID locale temporaneo viene fuso silenziosamente con il record remoto canonico, evitando qualsiasi duplicazione visiva a schermo.
