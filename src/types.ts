export type ResourceType = 'article' | 'github_repo' | 'mcp_server' | 'ai_skill' | 'knowledge';

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

  // Article specific
  author?: string;
  readingTimeMin?: string | number;
  keyTakeaways?: string[];

  // OKF v0.2 Knowledge specific
  okfVersion?: '0.2';
  domain?: string;
  docType?: 'concept' | 'specification' | 'architecture' | 'guide' | 'snippet' | 'research' | 'paper';
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

export interface FilterOptions {
  category: ResourceType | 'all' | 'favorites' | 'graph';
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
  category: 'CAPTURE' | 'GEMINI_AI' | 'FIRESTORE' | 'AUTH' | 'OKF_PARSER';
  message: string;
  details?: any;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
