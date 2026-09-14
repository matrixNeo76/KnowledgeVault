---
okf_version: "0.2"
id: "spec-gemini-ai-engine"
title: "Google Gemini AI Engine Guidelines (GEMINI.md)"
type: "specification"
domain: "AI Engineering & Structured Generation"
tags: ["okf", "specification", "gemini", "gemini-3.7-flash", "structured-output", "fallback", "json-schema"]
entities:
  - name: "Gemini 3.7 Flash"
    type: "technology"
    description: "Modello primario per l'estrazione analitica strutturata e sintesi topologica"
  - name: "Structured JSON Schema"
    type: "schema"
    description: "Definizione formale del payload JSON restituito dalla pipeline di analisi"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "governs"
    weight: 1.0
    description: "Definisce il formato di serializzazione prodotto da Gemini"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "implements"
    weight: 0.95
    description: "Specifica l'orchestrazione dei modelli e dei fallback"
---

# Google Gemini AI Engine Guidelines (GEMINI.md)

> **Linee Guida per l'Orchestrazione del Modello Gemini, Parsing Strutturato e Gestione Fallback**  
> *Per la documentazione tecnica canonica e i contratti formali dettagliati, consultare i documenti nella cartella `/docs`:*  
> 1. [`docs/OKF_v0.2_SPECIFICATION.md`](docs/OKF_v0.2_SPECIFICATION.md) — *Specifica Formale Ufficiale OKF v0.2*  
> 2. [`docs/SYSTEM_ARCHITECTURE_OKF.md`](docs/SYSTEM_ARCHITECTURE_OKF.md) — *Blueprint Architetturale Dettagliato*  
> 3. [`docs/INGESTION_PIPELINE_SPEC.md`](docs/INGESTION_PIPELINE_SPEC.md) — *Pipeline di Ingestione e Fallback Euristico*  
> 4. [`docs/SYSTEM_REPLICATION_GUIDE.md`](docs/SYSTEM_REPLICATION_GUIDE.md) — *Guida Operativa alla Replicazione Completa*  

---

## 1. Modelli e Priorità di Esecuzione

- **Modello Primario**: `gemini-3.7-flash` (massima velocità, precisione analitica e supporto a JSON Schema rigoroso).
- **Modelli di Fallback Cloud**: `gemini-flash-latest`, `gemini-3.1-flash-lite` (attivati automaticamente in caso di picchi di carico 503, degradazione temporanea o quote).
- **Fallback Euristico Locale**: Nel caso di indisponibilità di tutti i modelli o timeout (>15s), l'estrattore a regole locale estrae titolo, tag, frontmatter e valutazioni con latenza 0ms.

---

## 2. Schema di Risposta JSON Structured Output

L'endpoint di backend `/api/analyze-resource` riceve input eterogenei e produce un oggetto JSON rigoroso contenente:
- `type`: `knowledge` | `github_repo` | `mcp_server` | `ai_skill` | `article`
- `title`: Stringa descrittiva
- `summary`: Sintesi chiara in lingua italiana o inglese
- `tags`: Array di etichette in minuscolo
- `metadata`:
  - `okfVersion`: `"0.2"`
  - `domain`: Ambito di applicazione
  - `docType`: `"concept"` | `"architecture"` | `"guide"` | `"specification"`
  - `entities`: Array di oggetti con `{ name, type, description }`
  - `relations`: Array di oggetti con `{ targetTitle, relationType, weight, description }`
  - `markdownContent`: Testo formattato completo con frontmatter YAML
