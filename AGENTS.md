# Protocolli Operativi per Agenti Autonomi (AGENTS.md)

> **Regole di Ingaggio, Protocolli di Esecuzione e Vincoli di Sviluppo per Agenti AI nel Knowledge Vault**

---

## 1. Principi Fondamentali di Sviluppo

1. **Rispetto Rigoroso dello Standard OKF v0.2**:
   - Ogni documento tecnico inserito nel Vault deve includere il blocco frontmatter YAML con `okf_version: "0.2"`, `title`, `type`, `domain`, `tags`, `entities` e `relations`.
   - I tipi di documento consentiti sono: `concept`, `architecture`, `guide`, `specification`, `tool_description`, `prompt_skill`.

2. **Sicurezza e Isolamento Cloud**:
   - Nessuna chiave API deve mai essere esposta nel bundle client. Tutte le chiamate generative transitano dal backend Express (`/api/*`).
   - Le query su Firestore devono sempre filtrare per `where("userId", "==", uid)` per conformità con le regole `firestore.rules`.

3. **Integrità del Grafo Topologico**:
   - Quando viene creata o modificata una documentazione tecnica, l'agente deve verificare che le entità dichiarate utilizzino denominazioni canoniche (es. `Anthropic`, `TypeScript`, `Model Context Protocol`, `Google Cloud Firestore`) per consentire al motore di correlazione di tracciare automaticamente gli archi e le relazioni nel grafo D3.

---

## 2. Flusso di Cattura & Inserimento Risorse

Quando un agente ingerisce una risorsa:
- **Fase 1 (Parsing)**: Inviare il payload grezzo all'endpoint `/api/analyze-resource`.
- **Fase 2 (Validazione Struttura)**: Verificare la presenza di `type`, `title`, `summary`, `tags` e metadati conformi allo schema `ResourceItem`.
- **Fase 3 (Persistenza)**: Scrivere il documento sanitizzato su Firestore allegando `userId`, `createdAt: serverTimestamp()` e `updatedAt: serverTimestamp()`.
- **Fase 4 (Notifica & Tracing)**: Emettere un log strutturato con categoria `CAPTURE` e `FIRESTORE`.
