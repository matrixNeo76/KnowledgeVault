import {
  EvidenceChunk,
  StructuredKnowledgeEntity,
  TypedRelationship,
  ContradictionRecord,
  ResourceItem
} from '../../types';

// ============================================================================
// DUAL-LAYER STORE & CONTRADICTION REGISTRY (In-Memory & Hybrid Storage)
// ============================================================================

class DualLayerKnowledgeStore {
  private evidenceChunks: Map<string, EvidenceChunk> = new Map();
  private entities: Map<string, StructuredKnowledgeEntity> = new Map();
  private relationships: Map<string, TypedRelationship> = new Map();
  private contradictions: Map<string, ContradictionRecord> = new Map();
  private initialized = false;

  constructor() {
    this.initSeedData();
  }

  private initSeedData() {
    if (this.initialized) return;
    this.initialized = true;

    // ------------------------------------------------------------------------
    // SEED CONTRADICTIONS (First-Class Registered Inconsistencies)
    // ------------------------------------------------------------------------
    const initialContradictions: ContradictionRecord[] = [
      {
        id: 'contradiction-api-key-storage',
        conceptId: 'concept-api-key-security',
        conceptName: 'API Key Security & Storage Policy',
        status: 'open',
        registeredAt: '2026-08-15T10:00:00Z',
        conflictingSources: [
          {
            sourceId: 'spec-security-rfc004',
            sourceTitle: 'Protocolli di Sicurezza Cloud Run (RFC-004)',
            statement: 'Nessuna API Key o segreto deve mai raggiungere il browser client. Tutte le richieste esterne devono transitare unicamente dal server proxy Express (/api/*).',
            owner: 'Security Architecture Team (@cloud-sec)',
            effectiveDate: '2026-06-01',
            validFrom: '2026-06-01',
            validTo: '2099-12-31',
            url: 'https://vault.internal/specs/rfc-004'
          },
          {
            sourceId: 'guide-rapid-prototyping',
            sourceTitle: 'Linee Guida Prototipazione Rapida e Demo UI',
            statement: 'Per velocizzare hackathon e test isolati in preview iframe, è consentito configurare le chiavi pubbliche client-side tramite variabili VITE_ se protette da domain restrictions.',
            owner: 'Developer Experience Group (@dx-lead)',
            effectiveDate: '2026-07-15',
            validFrom: '2026-07-15',
            validTo: '2099-12-31',
            url: 'https://vault.internal/guides/prototyping-rules'
          }
        ]
      },
      {
        id: 'contradiction-okf-domain-format',
        conceptId: 'concept-okf-metadata-domain',
        conceptName: 'OKF Specification: Metadata Domain Format',
        status: 'open',
        registeredAt: '2026-09-01T08:00:00Z',
        conflictingSources: [
          {
            sourceId: 'okf-v01-spec',
            sourceTitle: 'Open Knowledge Format v0.1 Legacy Spec',
            statement: 'Il campo domain deve essere rigorosamente una singola stringa tassonomica canonica (es. "Agentic AI").',
            owner: 'Ontology Committee 2025',
            effectiveDate: '2025-01-01',
            validFrom: '2025-01-01',
            validTo: '2026-03-31'
          },
          {
            sourceId: 'okf-v02-spec',
            sourceTitle: 'Open Knowledge Format v0.2 Standard',
            statement: 'Il campo domain supporta gerarchie con separatore dot-notation e array multidominio per cross-cutting concerns.',
            owner: 'Ontology Committee 2026',
            effectiveDate: '2026-04-01',
            validFrom: '2026-04-01',
            validTo: '2099-12-31'
          }
        ]
      },
      {
        id: 'contradiction-cache-persistence',
        conceptId: 'concept-cache-strategy',
        conceptName: 'Offline Cache Invalidation Strategy',
        status: 'open',
        registeredAt: '2026-08-20T14:30:00Z',
        conflictingSources: [
          {
            sourceId: 'indexeddb-driver-policy',
            sourceTitle: 'IndexedDB Driver Architecture Guidelines',
            statement: 'Tutte le letture offline devono essere servite in Cache-First per garantire tempi di risposta <10ms anche in caso di rete degradata.',
            owner: 'Offline Performance Guild',
            effectiveDate: '2026-05-10',
            validFrom: '2026-05-10',
            validTo: '2099-12-31'
          },
          {
            sourceId: 'firestore-realtime-policy',
            sourceTitle: 'Firestore Realtime Collaboration Protocol',
            statement: 'La coerenza dei dati collaborativi esige Network-First con invalidazione immediata della cache locale per prevenire conflitti di fork di stato.',
            owner: 'Data Sync Taskforce',
            effectiveDate: '2026-06-25',
            validFrom: '2026-06-25',
            validTo: '2099-12-31'
          }
        ]
      }
    ];

    initialContradictions.forEach(c => this.contradictions.set(c.id, c));

    // ------------------------------------------------------------------------
    // SEED ENTITIES (Structured Knowledge Layer)
    // ------------------------------------------------------------------------
    const initialEntities: StructuredKnowledgeEntity[] = [
      {
        id: 'concept-api-key-security',
        canonicalName: 'API Key Security Policy',
        aliases: ['API Security', 'Key Storage', 'Secret Isolation', 'Cloud Run Auth'],
        domain: 'Security & Cloud Governance',
        description: 'Standard di gestione, custodia e transito delle chiavi API di LLM e provider terzi.',
        entityType: 'policy',
        timeline: [
          {
            timestamp: '2025-01-01T00:00:00Z',
            state: 'CLIENT_ALLOWED_VITE',
            validFrom: '2025-01-01',
            validTo: '2026-05-31',
            description: 'Iniziale supporto a VITE_API_KEY nel bundle frontend.'
          },
          {
            timestamp: '2026-06-01T00:00:00Z',
            state: 'SERVER_ONLY_STRICT',
            validFrom: '2026-06-01',
            validTo: '2099-12-31',
            description: 'Obbligo architetturale: proxy Express /api/* con isolamento totale dei segreti dal browser.'
          }
        ]
      },
      {
        id: 'concept-okf-metadata-domain',
        canonicalName: 'Open Knowledge Format (OKF)',
        aliases: ['OKF v0.2', 'OKF Spec', 'Knowledge Schema'],
        domain: 'Knowledge Engineering',
        description: 'Standard aperto di interoperabilità e frontmatter YAML per documenti di conoscenza e agenti AI.',
        entityType: 'standard',
        timeline: [
          {
            timestamp: '2025-01-01T00:00:00Z',
            state: 'VERSION_0_1',
            validFrom: '2025-01-01',
            validTo: '2026-03-31',
            description: 'OKF v0.1: tassonomia statica a singola stringa.'
          },
          {
            timestamp: '2026-04-01T00:00:00Z',
            state: 'VERSION_0_2',
            validFrom: '2026-04-01',
            validTo: '2099-12-31',
            description: 'OKF v0.2: supporto esteso a grafo di entità, relazioni tipizzate e multidominio.'
          }
        ]
      },
      {
        id: 'concept-cekikj-epistemic',
        canonicalName: 'Architettura Epistemica Cekikj',
        aliases: ['Trilogia Cekikj', 'Zero-Guessing Layer', 'Persistent Knowledge Layer', 'Contradiction Gate'],
        domain: 'Agentic Systems & Epistemic Architecture',
        description: 'Framework epistemico basato su Typed Tools, Hard Bounds, Bitemporalità e Contradiction Gate esterno al loop.',
        entityType: 'architecture',
        timeline: [
          {
            timestamp: '2026-09-01T00:00:00Z',
            state: 'ADOPTED_SPEC',
            validFrom: '2026-09-01',
            validTo: '2099-12-31',
            description: 'Definizione formale della specifica di conformità per il Knowledge Vault.'
          }
        ]
      },
      {
        id: 'concept-typed-tools',
        canonicalName: 'Typed Tools Suite',
        aliases: ['8 Read-Only Tools', 'Cekikj Toolset', 'Bounded Tools'],
        domain: 'Agentic Systems',
        description: 'La suite di 8 strumenti con contratto rigido e risposta con flag insufficient: true per prevenire iterated guessing.',
        entityType: 'tool',
        timeline: [
          {
            timestamp: '2026-09-06T00:00:00Z',
            state: 'IMPLEMENTED',
            validFrom: '2026-09-06',
            validTo: '2099-12-31',
            description: 'Implementazione completa degli 8 strumenti tipizzati in sola lettura.'
          }
        ]
      },
      {
        id: 'concept-contradiction-gate',
        canonicalName: 'The Contradiction Gate',
        aliases: ['Out-of-Loop Composer', 'Gate Epistemico', 'Refusal Gate'],
        domain: 'AI Safety & Governance',
        description: 'Compositore a valle disaccoppiato che impedisce la sintesi generativa forzata su concetti contesi.',
        entityType: 'architecture',
        timeline: [
          {
            timestamp: '2026-09-06T00:00:00Z',
            state: 'ACTIVE',
            validFrom: '2026-09-06',
            validTo: '2099-12-31',
            description: 'Gate attivo esterno al ciclo di reasoning dell\'agente.'
          }
        ]
      }
    ];

    initialEntities.forEach(e => this.entities.set(e.id, e));

    // ------------------------------------------------------------------------
    // SEED RELATIONSHIPS (Ontology Edges)
    // ------------------------------------------------------------------------
    const initialRelationships: TypedRelationship[] = [
      {
        id: 'rel-cekikj-gate',
        sourceEntityId: 'concept-cekikj-epistemic',
        sourceEntityName: 'Architettura Epistemica Cekikj',
        targetEntityId: 'concept-contradiction-gate',
        targetEntityName: 'The Contradiction Gate',
        relationshipType: 'governs',
        weight: 1.0,
        validFrom: '2026-09-01',
        validTo: '2099-12-31',
        description: 'L\'architettura Cekikj impone il Contradiction Gate come meccanismo di rifiuto primario.'
      },
      {
        id: 'rel-cekikj-tools',
        sourceEntityId: 'concept-cekikj-epistemic',
        sourceEntityName: 'Architettura Epistemica Cekikj',
        targetEntityId: 'concept-typed-tools',
        targetEntityName: 'Typed Tools Suite',
        relationshipType: 'constrains',
        weight: 0.95,
        validFrom: '2026-09-01',
        validTo: '2099-12-31',
        description: 'L\'architettura costringe l\'agente all\'uso esclusivo di 8 Typed Tools con envelope standard.'
      },
      {
        id: 'rel-cekikj-okf',
        sourceEntityId: 'concept-cekikj-epistemic',
        sourceEntityName: 'Architettura Epistemica Cekikj',
        targetEntityId: 'concept-okf-metadata-domain',
        targetEntityName: 'Open Knowledge Format (OKF)',
        relationshipType: 'extends',
        weight: 0.9,
        validFrom: '2026-09-01',
        validTo: '2099-12-31',
        description: 'Estende la specifica OKF v0.2 con semantica di verifica e grounding a prova di allucinazione.'
      }
    ];

    initialRelationships.forEach(r => this.relationships.set(r.id, r));

    // ------------------------------------------------------------------------
    // SEED EVIDENCE CHUNKS (Evidence Layer)
    // ------------------------------------------------------------------------
    const initialChunks: EvidenceChunk[] = [
      {
        id: 'chunk-sec-01',
        documentId: 'doc-security-policy',
        documentTitle: 'Protocolli di Sicurezza Cloud Run (RFC-004)',
        text: 'Nessuna API Key o segreto deve mai raggiungere il browser client. Tutte le chiamate generative verso Gemini o fornitori esterni devono transitare dal server proxy Express (/api/*).',
        tokenCount: 42,
        canonicalEntityAnchors: ['concept-api-key-security'],
        validFrom: '2026-06-01',
        validTo: '2099-12-31',
        recordedAt: '2026-06-01T12:00:00Z'
      },
      {
        id: 'chunk-proto-01',
        documentId: 'doc-prototyping-guide',
        documentTitle: 'Linee Guida Prototipazione Rapida e Demo UI',
        text: 'Per prototipi e hackathon interni, le chiavi pubbliche di test possono essere caricate temporaneamente via VITE_ se isolate in container sandbox.',
        tokenCount: 35,
        canonicalEntityAnchors: ['concept-api-key-security'],
        validFrom: '2026-07-15',
        validTo: '2099-12-31',
        recordedAt: '2026-07-15T09:30:00Z'
      },
      {
        id: 'chunk-okf-01',
        documentId: 'doc-okf-spec-v02',
        documentTitle: 'Open Knowledge Format v0.2 Standard',
        text: 'Ogni documento conforme a OKF v0.2 deve dichiarare okf_version: "0.2" nel frontmatter YAML, accompagnato da entities canoniche e relations tipizzate per il calcolo del grafo topologico.',
        tokenCount: 48,
        canonicalEntityAnchors: ['concept-okf-metadata-domain'],
        validFrom: '2026-04-01',
        validTo: '2099-12-31',
        recordedAt: '2026-04-01T10:00:00Z'
      },
      {
        id: 'chunk-cekikj-thesis-01',
        documentId: 'doc-cekikj-trilogy',
        documentTitle: 'Trilogia Cekikj: Persistent Knowledge Layer',
        text: 'An agent\'s reasoning is bounded by the vocabulary of its tools. Sostituire la generica casella di ricerca con 8 Typed Tools read-only elimina le congetture iterate e costringe l\'agente ad ammettere l\'insufficienza dei dati.',
        tokenCount: 52,
        canonicalEntityAnchors: ['concept-cekikj-epistemic', 'concept-typed-tools'],
        validFrom: '2026-09-01',
        validTo: '2099-12-31',
        recordedAt: '2026-09-01T15:00:00Z'
      },
      {
        id: 'chunk-cekikj-gate-01',
        documentId: 'doc-cekikj-trilogy',
        documentTitle: 'Trilogia Cekikj: The Contradiction Gate',
        text: 'Governance che vive dentro il loop è consultiva; governance che sopravvive all\'agenzia deve vivere fuori di esso. Il Contradiction Gate valuta indipendentemente la trace e blocca la sintesi se trova collisioni aperte.',
        tokenCount: 46,
        canonicalEntityAnchors: ['concept-cekikj-epistemic', 'concept-contradiction-gate'],
        validFrom: '2026-09-01',
        validTo: '2099-12-31',
        recordedAt: '2026-09-01T15:00:00Z'
      }
    ];

    initialChunks.forEach(ch => this.evidenceChunks.set(ch.id, ch));
  }

  // --------------------------------------------------------------------------
  // INGESTION & ANCHORING
  // --------------------------------------------------------------------------
  public indexResource(resource: ResourceItem) {
    if (!resource.id && !resource.title) return;
    const docId = resource.id || `doc-${Date.now()}`;
    const docTitle = resource.title;
    const content = resource.metadata?.markdownContent || resource.summary || '';

    // Estrarre entità dichiarate nel documento
    const entities = resource.metadata?.entities || [];
    const entityIds: string[] = [];

    entities.forEach((ent) => {
      const entName = typeof ent === "string" ? ent : (ent?.name || "Entità");
      const entDesc = typeof ent === "string" ? `Entità estratta da ${docTitle}` : (ent?.description || `Entità estratta da ${docTitle}`);
      const canonicalId = `entity-${entName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      entityIds.push(canonicalId);

      if (!this.entities.has(canonicalId)) {
        this.entities.set(canonicalId, {
          id: canonicalId,
          canonicalName: entName,
          aliases: [entName],
          domain: resource.metadata?.domain || 'General',
          description: entDesc,
          entityType: 'concept',
          timeline: [
            {
              timestamp: new Date().toISOString(),
              state: 'RECORDED',
              validFrom: '2026-01-01',
              validTo: '2099-12-31',
              description: `Registrata da risorsa "${docTitle}"`
            }
          ]
        });
      }
    });

    // Estrarre relazioni tipizzate dichiarate nel documento
    const relations = resource.metadata?.relations || [];
    relations.forEach((rel, rIdx) => {
      const targetTitle = rel.targetTitle || "Risorsa Correlata";
      const relType = rel.relationType || "references";
      const relWeight = typeof rel.weight === "number" ? rel.weight : 0.8;
      const relId = `rel-${docId}-${rIdx}`;
      const targetEntityId = `entity-${targetTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

      this.relationships.set(relId, {
        id: relId,
        sourceEntityId: entityIds[0] || `entity-${docTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        sourceEntityName: docTitle,
        targetEntityId,
        targetEntityName: targetTitle,
        relationshipType: relType as any,
        weight: relWeight,
        validFrom: '2026-01-01',
        validTo: '2099-12-31',
        description: rel.description || `Relazione estratta da "${docTitle}"`
      });
    });

    // Chunking euristico in paragrafi
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 30);
    paragraphs.forEach((para, idx) => {
      const chunkId = `chunk-${docId}-${idx}`;
      this.evidenceChunks.set(chunkId, {
        id: chunkId,
        documentId: docId,
        documentTitle: docTitle,
        text: para.trim(),
        tokenCount: Math.round(para.trim().length / 4),
        canonicalEntityAnchors: entityIds,
        validFrom: '2026-01-01',
        validTo: '2099-12-31',
        recordedAt: new Date().toISOString()
      });
    });
  }

  public syncResources(resources: ResourceItem[]) {
    if (!Array.isArray(resources)) return;
    resources.forEach(res => {
      this.indexResource(res);
    });
  }

  // --------------------------------------------------------------------------
  // RETRIEVAL & QUERYING
  // --------------------------------------------------------------------------
  public getAllChunks(asOfDate?: string): EvidenceChunk[] {
    const list = Array.from(this.evidenceChunks.values());
    if (!asOfDate) return list;
    return list.filter(c => {
      const from = c.validFrom || '1970-01-01';
      const to = c.validTo || '2099-12-31';
      return asOfDate >= from && asOfDate <= to;
    });
  }

  public getChunkById(id: string): EvidenceChunk | undefined {
    return this.evidenceChunks.get(id);
  }

  public getAllEntities(): StructuredKnowledgeEntity[] {
    return Array.from(this.entities.values());
  }

  public getEntityById(id: string): StructuredKnowledgeEntity | undefined {
    return this.entities.get(id);
  }

  public getAllRelationships(): TypedRelationship[] {
    return Array.from(this.relationships.values());
  }

  public getAllContradictions(): ContradictionRecord[] {
    return Array.from(this.contradictions.values());
  }

  public getContradictionByConceptId(conceptId: string): ContradictionRecord | undefined {
    return Array.from(this.contradictions.values()).find(
      c => c.conceptId === conceptId || c.conceptName.toLowerCase() === conceptId.toLowerCase()
    );
  }

  public registerContradiction(record: ContradictionRecord) {
    this.contradictions.set(record.id, record);
  }

  public resolveContradiction(
    id: string,
    resolutionNotes: string,
    resolvedBy = "Architetto del Vault",
    chosenSourceTitle?: string
  ): ContradictionRecord | null {
    const existing = this.contradictions.get(id);
    if (!existing) return null;

    const updated: ContradictionRecord = {
      ...existing,
      status: 'resolved',
      resolutionNotes: chosenSourceTitle 
        ? `[Fonte Canonica: ${chosenSourceTitle}] ${resolutionNotes}`
        : resolutionNotes,
      resolvedAt: new Date().toISOString(),
      resolvedBy
    };
    this.contradictions.set(id, updated);
    return updated;
  }

  public reopenContradiction(id: string): ContradictionRecord | null {
    const existing = this.contradictions.get(id);
    if (!existing) return null;

    const updated: ContradictionRecord = {
      ...existing,
      status: 'open',
      resolutionNotes: undefined,
      resolvedAt: undefined,
      resolvedBy: undefined
    };
    this.contradictions.set(id, updated);
    return updated;
  }
}

export const dualLayerStore = new DualLayerKnowledgeStore();
