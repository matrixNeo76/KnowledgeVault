# Knowledge Vault (OKF v0.2)

> **Repository di Conoscenza Ontologica, Schemi di Prompt e Toolchain per Agenti Autonomi ed Ingegneri IA**

---

## 🌟 Visione & Obiettivi

**Knowledge Vault** è un hub centralizzato e intelligente per sviluppatori, ingegneri del prompt e agenti IA autonomi. Permette di catalogare, arricchire, visualizzare e connettere documentazioni tecniche, specifiche di strumenti (MCP), repository GitHub e competenze di sistema attraverso lo standard aperto **OKF v0.2 (Open Knowledge Format)**.

---

## 📐 Funzionalità Chiave

1. **Topologia Dinamica a Grafo (D3.js Force Simulation)**:
   - Visualizzazione dei nodi e calcolo in tempo reale delle linee di relazione (archi ontologici OKF, entità condivise, sovrapposizione di tag, citazioni dirette e domini comuni).
   - Modalità interattiva **Hub Entità**, evidenziazione di vicinato su hover, etichette semantiche lungo i collegamenti e filtri multi-livello.

2. **Standard OKF v0.2 (Open Knowledge Format)**:
   - Frontmatter YAML standardizzato con dichiarazione esplicita di entità (`entities`), relazioni (`relations`), domini (`domain`), parole chiave di innesco (`triggerKeywords`) e prompt di sistema.
   - Esportazione ed importazione istantanea di file `.md` e bundle `.json`.

3. **Cattura Intelligente & Gemini 3.7 / 2.5 Flash Engine**:
   - Inserimento rapido di URL, repository GitHub, definizioni JSON di server MCP o testo grezzo.
   - Parsing semantico resiliente con fallback euristico locale e categorizzazione automatica.

4. **Archiviazione Cloud Persistente con Cloud Firestore**:
   - Autenticazione multi-metodo (Google Auth e sessioni anonime veloci).
   - Regole di sicurezza granulari con verifica di proprietà `userId` e validazione dei tipi di risorsa (`knowledge`, `mcp_server`, `github_repo`, `ai_skill`, `article`).

5. **Console di Diagnostica & Telemetria Real-Time**:
   - Monitoraggio continuo degli eventi di autenticazione, cattura, analisi LLM e sincronizzazione Firestore con report esportabile.

---

## 🛠️ Stack Tecnologico

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Framer Motion.
- **Data Visualization**: D3.js v7 (Force Simulation, Zoom Behaviors, SVG Glow filters).
- **Backend**: Node.js, Express, tsx/esbuild, `@google/genai` TypeScript SDK.
- **Database & Auth**: Google Cloud Firestore & Firebase Authentication.
