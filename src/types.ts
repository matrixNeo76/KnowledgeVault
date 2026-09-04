export type ResourceType = 'article' | 'github_repo' | 'mcp_server' | 'ai_skill' | 'knowledge' | 'link' | 'troubleshooting';

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

  // Google Drive & Google Docs specific
  gdocUrl?: string;
  gdocId?: string;
  gdocExportedAt?: string;
  gdriveSourceId?: string;
  gdriveSourceUrl?: string;

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
  category: 'CAPTURE' | 'GEMINI_AI' | 'FIRESTORE' | 'AUTH' | 'OKF_PARSER' | 'SYSTEM' | 'BACKUP' | 'CACHE';
  message: string;
  details?: any;
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
