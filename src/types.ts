export type ResourceType = 'article' | 'github_repo' | 'mcp_server' | 'ai_skill' | 'knowledge' | 'link' | 'troubleshooting' | 'paper' | 'rss' | 'note';

export interface OKFEntity {
  name: string;
  type: string;
  description?: string;
}

export interface OKFRelation {
  source?: string;
  sourceTitle?: string;
  target?: string;
  targetId?: string;
  targetTitle?: string;
  type?: string;
  relationType?: 'references' | 'implements' | 'depends_on' | 'extends' | 'related' | 'relates_to' | 'documents' | string;
  weight?: number;
  description?: string;
}

export interface ResourceMetadata {
  // GitHub specific
  owner?: string;
  repoName?: string;
  language?: string;
  stars?: number;
  installCommand?: string;

  // MCP Server specific
  protocol?: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  configSnippet?: string;
  toolsProvided?: string[];

  // AI Skill specific
  skillType?: string;
  recommendedModel?: string;
  systemPrompt?: string;
  triggerKeywords?: string[];
  exampleUsage?: string;

  // Article & Web Open Graph specific
  author?: string;
  readingTimeMin?: string | number;
  readingProgress?: number;
  readingStatus?: 'unread' | 'in_progress' | 'completed';
  keyTakeaways?: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  favicon?: string;
  siteName?: string;

  // AI Evaluation, Insights & Score
  useCases?: string[];
  pros?: string[];
  cons?: string[];
  score?: number; // 1-100 score of utility/relevance
  scoreRationale?: string;

  // AI Translation (Italian)
  translatedTitle?: string;
  translatedSummary?: string;
  translatedContent?: string;
  translatedAt?: string;
  translationLanguage?: string;

  // AI Executive Summary
  aiExecutiveSummary?: string;
  aiKeyTakeaways?: string[];
  aiTargetAudience?: string;
  aiActionItems?: string[];
  aiSummarizedAt?: string;

  // Troubleshooting & Problem Resolution specific
  affectedSystem?: string;
  rootCause?: string;
  attemptedFixes?: string[];
  solutionSteps?: string[];
  problemDescription?: string;
  errorLog?: string;

  // User Notes & Custom Annotations
  userNotes?: string;

  // Audio & Multimedia specific
  audioTranscript?: string;
  mediaType?: 'audio' | 'video' | 'image' | 'pdf' | 'document' | string;
  audioDurationSec?: number;
  sourceFileName?: string;
  sourceFileId?: string;

  // Google Drive & Google Docs specific
  gdocUrl?: string;
  gdocId?: string;
  gdocExportedAt?: string;
  gdriveSourceId?: string;
  gdriveSourceUrl?: string;

  // Scientific Paper specific
  authors?: string[];
  arxivId?: string;
  doi?: string;
  pdfUrl?: string;
  venue?: string;
  publishedYear?: number;
  tldr?: string;
  abstract?: string;

  // RSS Feed specific
  feedUrl?: string;
  feedFormat?: 'rss' | 'atom' | string;
  lastItemDate?: string;
  itemsCount?: number;

  // Note & Scratchpad specific
  noteCategory?: 'scratchpad' | 'memo' | 'prompt_idea' | 'architectural_memo' | string;
  isPinned?: boolean;
  colorTag?: string;

  // OKF v0.2 Knowledge specific
  okfVersion?: '0.2' | string;
  version?: string;
  docVersion?: string;
  maintainer?: string;
  status?: 'draft' | 'stable' | 'active' | 'deprecated' | 'experimental' | 'archived' | string;
  license?: string;
  dependencies?: string[];
  prerequisites?: string[];
  requirements?: string[];
  changelog?: string;
  targetAudience?: string;
  domain?: string;
  docType?: 'concept' | 'specification' | 'architecture' | 'guide' | 'snippet' | 'research' | 'paper' | 'tool_description' | 'prompt_skill' | string;
  entities?: (string | OKFEntity)[];
  relations?: OKFRelation[];
  markdownContent?: string;
  keyConcepts?: string[];
}

export interface ResourceItem {
  id: string;
  userId: string;
  type: ResourceType;
  title: string;
  url?: string;
  rawInput?: string;
  summary: string;
  tags: string[];
  isFavorite?: boolean;
  rating?: number;
  metadata: ResourceMetadata;
  createdAt?: any;
  updatedAt?: any;
}

export type ViewMode = 'grid' | 'table' | 'graph';

export type SortOption = 'newest' | 'oldest' | 'title' | 'title_desc' | 'type' | 'favorites';

export interface RawFileItem {
  id: string;
  userId: string;
  fileName: string;
  fileSize: number; // in bytes
  fileType: string; // extension or category (e.g. 'pdf', 'image', 'markdown', 'text', 'json', 'code')
  mimeType: string;
  status: 'raw' | 'converting' | 'converted_okf' | 'error';
  convertedResourceId?: string;
  convertedResourceTitle?: string;
  contentPreview?: string;
  textContent?: string;
  base64Data?: string; // stored for small files or memory cache
  hasChunks?: boolean;
  totalChunks?: number;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export type NavCategory = ResourceType | 'all' | 'favorites' | 'raw_files' | 'quota_monitor';

export interface QuotaTelemetryEvent {
  id: string;
  timestamp: string;
  service: 'FIRESTORE' | 'GEMINI';
  operation: string; // e.g. 'READ', 'WRITE', 'DELETE', 'LISTENER_EVENT', 'GENERATE_CONTENT', 'TRANSCRIPTION'
  caller: string; // e.g. 'onSnapshot', 'Auto-Sync', 'analyze-resource', 'saveResource'
  count?: number; // document count or token count
  latencyMs?: number;
  status: 'SUCCESS' | 'QUOTA_EXCEEDED' | 'RATE_LIMITED' | 'TIMEOUT' | 'ERROR';
  statusCode?: number; // e.g. 200, 429, 503
  details?: string;
}

export interface FirestoreDailyStats {
  dateKey: string;
  reads: number;
  writes: number;
  deletes: number;
  readLimit: number; // 50,000
  writeLimit: number; // 20,000
  deleteLimit: number; // 20,000
  activeListeners: number;
  lastError?: string;
  lastErrorCode?: string;
  isLockedOffline: boolean;
  lockReason?: string;
}

export interface GeminiDailyStats {
  requestsToday: number;
  dailyLimit: number; // 1,500
  requestsLastMinute: number;
  rpmLimit: number; // 15
  tokensLastMinute: number;
  tpmLimit: number; // 1,000,000
  quota429Count: number;
  error503Count: number;
  modelCounts: Record<string, number>;
  lastTestedAt?: string;
  status: 'OPERATIONAL' | 'RATE_LIMITED' | 'EXHAUSTED' | 'UNAVAILABLE';
}

export interface FilterOptions {
  category: NavCategory | 'graph';
  searchQuery: string;
  selectedTag: string | null;
  sortBy: SortOption;
}

export interface GraphNode {
  id: string;
  title: string;
  type: ResourceType | 'concept' | 'entity';
  tags: string[];
  domain?: string;
  degree?: number;
  summary?: string;
  isEntityNode?: boolean;
  entityType?: string;
  hopDistance?: number; // 0 = root, 1 = 1-hop, 2 = 2-hop
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relationType?: string;
  weight?: number;
  label?: string;
  description?: string;
  color?: string;
  sourceTitle?: string;
  targetTitle?: string;
}

export interface DiagnosticLog {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  category: 'CAPTURE' | 'GEMINI_AI' | 'FIRESTORE' | 'AUTH' | 'OKF_PARSER' | 'SYSTEM' | 'BACKUP' | 'CACHE' | 'LIFECYCLE';
  message: string;
  details?: any;
}

export type LifecycleStage = 
  | 'CAPTURE_INITIATED'
  | 'AI_ANALYSIS_SUCCESS'
  | 'AI_ANALYSIS_FALLBACK'
  | 'DATA_TRANSFORMATION'
  | 'OKF_SCHEMA_VALIDATION'
  | 'LOCAL_CREATION'
  | 'RAW_FILE_STAGED'
  | 'RAW_FILE_DELETED'
  | 'RAW_FILE_CONVERSION'
  | 'FIRESTORE_WRITE_START'
  | 'FIRESTORE_WRITE_SUCCESS'
  | 'FIRESTORE_WRITE_FAIL'
  | 'REALTIME_SNAPSHOT_RECEIVED'
  | 'CONFLICT_RECONCILIATION'
  | 'RESOURCE_COLLAPSED_DEDUPED'
  | 'RESOURCE_DROPPED_TOMBSTONE'
  | 'RESOURCE_DELETED'
  | 'FILTER_DISCREPANCY_CHECK';

export interface ResourceLifecycleEvent {
  id: string;
  timestamp: string;
  stage: LifecycleStage;
  resourceId?: string;
  resourceTitle?: string;
  resourceType?: string;
  status: 'info' | 'success' | 'warn' | 'error';
  message: string;
  details?: Record<string, any>;
}

export type DiagnosticActionId = 
  | 'RESET_OFFLINE_LOCK'
  | 'FORCE_SERVER_BACKUP'
  | 'TEST_CONNECTIVITY'
  | 'SWITCH_LOCAL_HEURISTIC'
  | 'EXPORT_EMERGENCY_JSON'
  | 'CLEAR_TRANSIENT_ERRORS';

export interface DiagnosticActionProposal {
  id: DiagnosticActionId;
  label: string;
  description: string;
  isPrimary?: boolean;
  risk: 'safe' | 'warning';
}

export interface DiagnosticAnalysisResult {
  explanation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  dataSafetyNote: string;
  suggestedActions: DiagnosticActionProposal[];
  source: 'heuristic' | 'gemini';
  modelUsed?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export type CaptureStage = 'idle' | 'sending' | 'analyzing' | 'saving' | 'success';

// ============================================================================
// CEKIKJ EPISTEMIC ARCHITECTURE TYPES (Zero-Guessing Knowledge Layer)
// ============================================================================

export interface EvidenceChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  text: string;
  tokenCount: number;
  canonicalEntityAnchors: string[]; // Canonical entity IDs or names
  validFrom?: string; // ISO string e.g. "2024-01-01"
  validTo?: string;   // ISO string or "infinity"
  recordedAt: string; // ISO timestamp
  metadata?: Record<string, any>;
}

export interface EntityTimelineState {
  timestamp: string;
  state: string;
  validFrom: string;
  validTo: string;
  description: string;
  sourceDocId?: string;
}

export interface StructuredKnowledgeEntity {
  id: string;
  canonicalName: string;
  aliases: string[];
  domain: string;
  description: string;
  entityType: 'concept' | 'architecture' | 'policy' | 'specification' | 'tool' | 'standard';
  timeline?: EntityTimelineState[];
  anchoredEvidenceIds?: string[];
  metadata?: Record<string, any>;
}

export interface TypedRelationship {
  id: string;
  sourceEntityId: string;
  sourceEntityName: string;
  targetEntityId: string;
  targetEntityName: string;
  relationshipType: 'governs' | 'constrains' | 'extends' | 'contradicts' | 'implements' | 'depends_on' | 'interfaces' | string;
  weight: number;
  validFrom?: string;
  validTo?: string;
  description?: string;
  sourceDocId?: string;
}

export interface ConflictingSourceItem {
  sourceId: string;
  sourceTitle: string;
  statement: string;
  owner: string;
  effectiveDate: string;
  validFrom?: string;
  validTo?: string;
  url?: string;
}

export interface ContradictionRecord {
  id: string;
  conceptId: string;
  conceptName: string;
  status: 'open' | 'resolved';
  conflictingSources: ConflictingSourceItem[];
  resolutionNotes?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  registeredAt: string;
  verificationMethod?: 'heuristic' | 'gemini_semantic' | 'manual';
  confidenceScore?: number;
  logicalConflictReason?: string;
}

export interface TypedToolTrace {
  tool: string;
  params: any;
  timestamp: string;
  executionMs: number;
}

export interface TypedToolEnvelope<T> {
  data: T | null;
  insufficient: boolean;
  trace: TypedToolTrace;
  error?: string;
  explanation?: string;
}

export interface ToolCallStep {
  round: number;
  tool: string;
  params: any;
  resultSummary: string;
  insufficient: boolean;
  touchedEntities: string[];
  executionMs: number;
}

export interface ExecutionTrace {
  id: string;
  query: string;
  roundsCount: number;
  maxRoundsLimit: number;
  toolCalls: ToolCallStep[];
  touchedEntities: string[];
  traversedEdges: string[];
  citedEvidenceIds: string[];
  boundsTripped?: {
    tripped: boolean;
    reason?: 'MAX_ROUNDS' | 'MAX_HOPS' | 'TIMEOUT' | 'EARLY_EXIT' | 'TOKEN_BUDGET';
    details?: string;
  };
  totalDurationMs: number;
}

export interface GroundingClaimCheck {
  claim: string;
  verified: boolean;
  supportingEvidenceIds: string[];
  supportingEdgeIds?: string[];
  rejectionReason?: string;
}

export interface GroundingReport {
  totalClaims: number;
  verifiedClaimsCount: number;
  prunedClaimsCount: number;
  groundingScore: number; // 0.0 to 1.0
  claims: GroundingClaimCheck[];
  pass: boolean;
}

export interface ContradictionGateEvaluation {
  gatePassed: boolean;
  status: 'PASS' | 'BLOCKED_CONTRADICTION';
  conflictsDetected: ContradictionRecord[];
  refusalPayload?: {
    conceptName: string;
    conflictingSources: ConflictingSourceItem[];
    gateMessage: string;
  };
}

export interface BoundedLoopConfig {
  maxRounds: number; // default 8
  maxHops: number;   // default 2
  timeoutMs: number; // default 12000
  tokenBudget: number;
}

export interface CekikjEngineResult {
  id: string;
  query: string;
  status: 'SUCCESS' | 'REFUSAL_CONTRADICTION' | 'BOUNDS_EXCEEDED_PARTIAL' | 'INSUFFICIENT_KNOWLEDGE';
  answerText: string;
  evidenceItems: EvidenceChunk[];
  entities: StructuredKnowledgeEntity[];
  traversedEdges: TypedRelationship[];
  trace: ExecutionTrace;
  gateEvaluation: ContradictionGateEvaluation;
  groundingReport: GroundingReport;
  timestamp: string;
}

export interface VaultHealthComparison {
  localCount: number;
  firestoreCount: number;
  delta: number; // local - firestore
  status: 'synced' | 'local_excess' | 'firestore_excess';
}

export interface TypeComparisonItem {
  type: ResourceType;
  label: string;
  localCount: number;
  firestoreCount: number;
  delta: number;
  match: boolean;
}

export interface OrphanResourceItem {
  id: string;
  title: string;
  type: ResourceType;
  location: 'local_only' | 'firestore_only';
  reason?: string;
  updatedAt?: string | number;
}

export interface VaultHealthCheckReport {
  id: string;
  timestamp: string;
  executionDurationMs: number;
  userId?: string;
  overallComparison: VaultHealthComparison;
  userOwnedComparison: VaultHealthComparison;
  systemSampleComparison: {
    localCount: number;
    description: string;
  };
  typeBreakdown: TypeComparisonItem[];
  orphanResources: OrphanResourceItem[];
  okfIntegrity: {
    localOkfCount: number;
    firestoreOkfCount: number;
    webLinksAsOkfCount: number;
    status: 'pass' | 'warning' | 'fail';
    notes: string;
  };
  firestoreQueryDetails: {
    collection: string;
    filterApplied: string;
    serverCountResult?: number;
    rawDocsFetched: number;
    hasQuotaError: boolean;
    errorCode?: string;
    errorMessage?: string;
  };
  healthStatus: 'HEALTHY' | 'DESYNCHRONIZED' | 'OFFLINE_CACHE' | 'ERROR';
}

