# Specifiche Operative Claude Code (CLAUDE.md)

> **Integrazione con Claude Code, Anthropic CLI e Toolchain di Sviluppo Assistito**

---

## 1. Comandi di Sviluppo & Build

- **Avvio Server di Sviluppo**: `npm run dev` (Express + Vite unificati su porta 3000)
- **Controllo Tipi & Linter**: `npm run lint` (`tsc --noEmit`)
- **Compilazione di Produzione**: `npm run build` (`vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`)
- **Avvio Server Compilato**: `npm run start` (`node dist/server.cjs`)

---

## 2. Linee Guida per Claude Code

1. **Gestione del Grafo Topologico (`KnowledgeGraph.tsx`)**:
   - Qualsiasi modifica all'algoritmo di simulazione fisica D3 deve preservare i 5 livelli di relazione (ontologiche OKF, entità comuni, menzioni nel testo, tag condivisi, domini affini).
   - I colori degli archi devono mantenere l'armonia cromatica ad alto contrasto (Oro Champagne, Ciano, Ambra, Viola, Smeraldo).

2. **Formattazione dei Documenti OKF**:
   - I file Markdown esportati o renderizzati nel `KnowledgeReader` devono mantenere la separazione pulita tra frontmatter YAML e corpo del testo.
