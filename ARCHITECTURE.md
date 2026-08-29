# Architettura di Sistema - Knowledge Vault (ARCHITECTURE.md)

> **Documento di Architettura di Riferimento per Knowledge Vault, D3 Topology Engine, Cloud Firestore e OKF v0.2**

---

## 1. Schema Architetturale Generale

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

---

## 2. Componenti Core

### 2.1 KnowledgeGraph (`src/components/KnowledgeGraph.tsx`)
- Motore di layout fisico a forze (`d3.forceSimulation`) con cariche repulsive dinamiche, prevenzione collisioni e centratura reattiva.
- Risoluzione relazionale a 5 livelli:
  1. *Relazioni OKF v0.2 esplicite* (oro champagne con marcatori a freccia).
  2. *Entità ontologiche condivise* (ciano brillante).
  3. *Menzioni testuali incrociate* (viola).
  4. *Tag condivisi normalizzati* (ambra tratteggiata).
  5. *Dominio e categoria comune* (smeraldo).
- Supporto per **Hub Entità**, zoom continuo, drag & drop e selezione dettagliata con navigazione al lettore.

### 2.2 KnowledgeReader (`src/components/KnowledgeReader.tsx`)
- Renderizzatore Markdown con evidenziazione sintassi del codice, gestione tabelle, badge di dominio e schede informative.
- Scheda dedicata **"Grafo & Relazioni"** che mostra sia le relazioni dichiarate, sia la matrice di affinità calcolata con tutte le altre risorse salvate nel Vault.
- Funzionalità di esportazione rapida in `.md` conforme ad OKF v0.2.

### 2.3 Sistema di Diagnostica & Tracing
- Log unificato con identificatori univoci, timestamp e categorizzazione (`AUTH`, `FIRESTORE`, `CAPTURE`, `GEMINI_AI`).
- Interceptor degli eventi WebSocket di Vite per prevenire falsi allarmi nella sandbox.
