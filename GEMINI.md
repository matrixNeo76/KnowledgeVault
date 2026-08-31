# Google Gemini AI Engine Guidelines (GEMINI.md)

> **Linee Guida per l'Orchestrazione del Modello Gemini, Parsing Strutturato e Gestione Fallback**

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
