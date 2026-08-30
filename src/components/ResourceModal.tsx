import React, { useState } from "react";
import { 
  X, 
  BookOpen, 
  Github, 
  Cpu, 
  Sparkles, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Edit3, 
  Save, 
  Terminal,
  Code2,
  Calendar,
  Star,
  BrainCircuit,
  FileCode,
  Layers,
  ArrowUpRight
} from "lucide-react";
import Markdown from "react-markdown";
import { ResourceItem, ResourceType } from "../types";
import { formatDate } from "../lib/dateUtils";

interface ResourceModalProps {
  resource: ResourceItem | null;
  onClose: () => void;
  onUpdate: (id: string, updatedData: Partial<ResourceItem>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export const ResourceModal: React.FC<ResourceModalProps> = ({
  resource,
  onClose,
  onUpdate,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Editable form state
  const [title, setTitle] = useState(resource?.title || "");
  const [url, setUrl] = useState(resource?.url || "");
  const [summary, setSummary] = useState(resource?.summary || "");
  const [tagsStr, setTagsStr] = useState((resource?.tags || []).join(", "));
  const [type, setType] = useState<ResourceType>(resource?.type || "article");
  const [mcpConfig, setMcpConfig] = useState(resource?.metadata?.configSnippet || "");
  const [systemPrompt, setSystemPrompt] = useState(resource?.metadata?.systemPrompt || "");
  const [installCommand, setInstallCommand] = useState(resource?.metadata?.installCommand || "");
  const [markdownContent, setMarkdownContent] = useState(resource?.metadata?.markdownContent || "");

  // Synchronize form when resource changes
  React.useEffect(() => {
    if (resource) {
      setTitle(resource.title || "");
      setUrl(resource.url || "");
      setSummary(resource.summary || "");
      setTagsStr((resource.tags || []).join(", "));
      setType(resource.type || "article");
      setMcpConfig(resource.metadata?.configSnippet || "");
      setSystemPrompt(resource.metadata?.systemPrompt || "");
      setInstallCommand(resource.metadata?.installCommand || "");
      setMarkdownContent(resource.metadata?.markdownContent || "");
      setIsEditing(false);
    }
  }, [resource]);

  // Escape key handler
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!resource) return null;

  const handleCopy = (text: string, sectionKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const tagsArray = tagsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const updatedMetadata = {
      ...resource.metadata,
      ...(mcpConfig ? { configSnippet: mcpConfig } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(installCommand ? { installCommand } : {}),
      ...(markdownContent ? { markdownContent } : {}),
    };

    const success = await onUpdate(resource.id, {
      title: title.trim(),
      url: url.trim() || "",
      summary: summary.trim(),
      tags: tagsArray,
      type,
      metadata: updatedMetadata,
    });

    setIsSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Sei sicuro di voler eliminare questa risorsa dal database?")) {
      setIsDeleting(true);
      const success = await onDelete(resource.id);
      setIsDeleting(false);
      if (success) {
        onClose();
      }
    }
  };

  const getTypeIcon = (t: ResourceType) => {
    switch (t) {
      case "knowledge":
        return <BrainCircuit className="w-4 h-4 text-[#C5A059]" />;
      case "github_repo":
        return <Github className="w-4 h-4 text-[#A855F7]" />;
      case "mcp_server":
        return <Cpu className="w-4 h-4 text-[#38BDF8]" />;
      case "ai_skill":
        return <Sparkles className="w-4 h-4 text-[#10B981]" />;
      case "article":
      default:
        return <BookOpen className="w-4 h-4 text-[#F59E0B]" />;
    }
  };

  const displayDate = formatDate(resource.createdAt || resource.updatedAt || new Date(), "full");

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-[#0D0D0D] border border-[#222] rounded-2xl w-full max-w-3xl max-h-[94vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="p-3.5 sm:p-5 border-b border-[#1C1C1C] flex items-center justify-between gap-2.5 bg-[#0A0A0A]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <span className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md bg-[#161616] border border-[#262626] text-[#C5A059] text-xs font-mono font-medium shrink-0">
              {getTypeIcon(resource.type)}
              <span className="capitalize">{resource.type === "knowledge" ? "OKF Knowledge" : resource.type.replace("_", " ")}</span>
            </span>

            {displayDate && (
              <span className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-[#777] truncate">
                <Calendar className="w-3 h-3 shrink-0 text-[#555]" />
                {displayDate}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 text-xs text-[#888] hover:text-white bg-[#141414] hover:bg-[#1F1F1F] border border-[#262626] px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Modifica</span>
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? "Salvataggio..." : "Salva"}</span>
              </button>
            )}

            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-1.5 sm:p-2 text-[#666] hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
              title="Elimina risorsa"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              aria-label="Chiudi finestra"
              className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-[#1C1C1C] hover:bg-[#2A2A2A] text-[#EEE] hover:text-white border border-[#333] transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6 flex-1 text-[#CCC]">
          {isEditing ? (
            /* Editing Form */
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                  Titolo
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Categoria
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  >
                    <option value="knowledge">Knowledge (OKF v0.2)</option>
                    <option value="article">Articolo</option>
                    <option value="github_repo">GitHub Repo</option>
                    <option value="mcp_server">MCP Server</option>
                    <option value="ai_skill">AI Skill</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    URL / Link
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                  Sommario / Descrizione
                </label>
                <textarea
                  rows={4}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                  Tag (separati da virgola)
                </label>
                <input
                  type="text"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  placeholder="mcp, typescript, ai, okf..."
                  className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                />
              </div>

              {type === "knowledge" && (
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Contenuto Markdown OKF v0.2
                  </label>
                  <textarea
                    rows={6}
                    value={markdownContent}
                    onChange={(e) => setMarkdownContent(e.target.value)}
                    placeholder="# Titolo OKF..."
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              )}

              {type === "mcp_server" && (
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Configurazione JSON MCP
                  </label>
                  <textarea
                    rows={4}
                    value={mcpConfig}
                    onChange={(e) => setMcpConfig(e.target.value)}
                    placeholder='{"mcpServers": { ... }}'
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#C5A059] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              )}

              {type === "ai_skill" && (
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    System Prompt / Istruzioni Skill
                  </label>
                  <textarea
                    rows={5}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Sei un assistente specializzato in..."
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              )}

              {type === "github_repo" && (
                <div>
                  <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                    Comando di Installazione / Clone
                  </label>
                  <input
                    type="text"
                    value={installCommand}
                    onChange={(e) => setInstallCommand(e.target.value)}
                    placeholder="git clone https://github.com/..."
                    className="w-full font-mono bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-[#CCC] focus:outline-none focus:border-[#C5A059]"
                  />
                </div>
              )}
            </div>
          ) : (
            /* Readonly Detail View */
            <>
              {/* Title & URL */}
              <div>
                <h2 className="text-xl sm:text-2xl font-serif text-white font-medium leading-snug">
                  {resource.title}
                </h2>

                {resource.url && (
                  <div className="mt-2 flex items-center gap-2">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#C5A059] hover:underline flex items-center gap-1.5 truncate"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{resource.url}</span>
                    </a>
                  </div>
                )}
              </div>

              {/* OKF Ontology Badges if available */}
              {resource.type === "knowledge" && (
                <div className="bg-[#120F0A] border border-[#C5A059]/30 rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <BrainCircuit className="w-4 h-4" />
                      <span>Specifiche Ontologiche OKF v0.2</span>
                    </div>

                    {resource.metadata?.domain && (
                      <span className="text-[10px] font-mono bg-[#1A1A1A] border border-[#333] text-[#AAA] px-2 py-0.5 rounded">
                        Dominio: {resource.metadata.domain}
                      </span>
                    )}
                  </div>

                  {resource.metadata?.entities && resource.metadata.entities.length > 0 && (
                    <div>
                      <div className="text-[11px] font-mono text-[#777] mb-1.5 uppercase">Entità Estratte:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {resource.metadata.entities.map((ent, idx) => {
                          const name = typeof ent === "string" ? ent : ent.name;
                          const entType = typeof ent === "string" ? "entity" : ent.type;
                          return (
                            <span key={idx} className="text-xs font-mono bg-[#1A160E] border border-[#C5A059]/20 text-[#D5B069] px-2 py-0.5 rounded">
                              <span className="text-[#888]">{entType}:</span> {name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {resource.metadata?.relations && resource.metadata.relations.length > 0 && (
                    <div>
                      <div className="text-[11px] font-mono text-[#777] mb-1.5 uppercase">Relazioni nel Grafo:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {resource.metadata.relations.map((rel, idx) => {
                          const src = rel.source || rel.sourceTitle || resource.title;
                          const tgt = rel.target || rel.targetTitle || rel.targetId || "";
                          const rType = rel.type || rel.relationType || "relates_to";
                          return (
                            <div key={idx} className="text-[11px] font-mono bg-[#16130C] border border-[#2D2413] text-[#CCC] p-2 rounded flex items-center justify-between">
                              <span className="font-semibold text-white truncate">{src}</span>
                              <span className="text-[10px] text-[#C5A059] px-1.5 bg-[#000]/40 rounded">{rType}</span>
                              <span className="font-semibold text-white truncate">{tgt}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Summary with Markdown */}
              <div className="bg-[#111] border border-[#1C1C1C] rounded-xl p-4 sm:p-5">
                <div className="text-[11px] font-mono uppercase text-[#666] mb-2 tracking-wider">
                  Descrizione & Note
                </div>
                <div className="text-sm leading-relaxed text-[#DDD] space-y-2 prose prose-invert max-w-none">
                  <Markdown>{resource.summary}</Markdown>
                </div>
              </div>

              {/* OKF Markdown Content Viewer */}
              {resource.type === "knowledge" && resource.metadata?.markdownContent && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <FileCode className="w-4 h-4" />
                      <span>Documento Markdown Integrale</span>
                    </div>

                    <button
                      onClick={() => handleCopy(resource.metadata?.markdownContent || "", "okfmd")}
                      className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                    >
                      {copiedSection === "okfmd" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiato</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#C5A059]" />
                          <span>Copia Markdown</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-xs font-mono text-[#CCC] bg-[#050505] p-3 rounded-lg overflow-x-auto border border-[#181818] max-h-60 overflow-y-auto leading-relaxed prose prose-invert">
                    <Markdown>{resource.metadata.markdownContent}</Markdown>
                  </div>
                </div>
              )}

              {/* MCP Specific Config block */}
              {resource.type === "mcp_server" && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <Code2 className="w-4 h-4" />
                      <span>Configurazione MCP (`claude_desktop_config.json`)</span>
                    </div>

                    <button
                      onClick={() => handleCopy(resource.metadata?.configSnippet || resource.metadata?.command || "", "mcp")}
                      className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                    >
                      {copiedSection === "mcp" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiato</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#C5A059]" />
                          <span>Copia JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="text-xs font-mono text-[#D5B069] bg-[#050505] p-3 rounded-lg overflow-x-auto border border-[#181818]">
                    {resource.metadata?.configSnippet || (
                      resource.metadata?.command 
                        ? `// Comando di avvio:\n${resource.metadata.command}` 
                        : "// Nessuna config JSON registrata"
                    )}
                  </pre>

                  {resource.metadata?.toolsProvided && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
                      <span className="text-[11px] font-mono text-[#666]">Tool forniti:</span>
                      {resource.metadata.toolsProvided.map((tool, idx) => (
                        <span key={idx} className="bg-[#141414] text-[#AAA] font-mono text-[10px] px-2 py-0.5 rounded border border-[#222]">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* AI Skill specific Prompt block */}
              {resource.type === "ai_skill" && resource.metadata?.systemPrompt && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                      <Sparkles className="w-4 h-4" />
                      <span>System Prompt & Istruzioni Skill</span>
                    </div>

                    <button
                      onClick={() => handleCopy(resource.metadata?.systemPrompt || "", "skill")}
                      className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                    >
                      {copiedSection === "skill" ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiato</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#C5A059]" />
                          <span>Copia Prompt</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="text-xs font-mono text-[#CCC] bg-[#050505] p-3 rounded-lg overflow-x-auto border border-[#181818] whitespace-pre-wrap leading-relaxed">
                    {resource.metadata.systemPrompt}
                  </pre>

                  {resource.metadata?.recommendedModel && (
                    <div className="mt-2 text-[11px] font-mono text-[#666]">
                      Modello suggerito: <span className="text-[#C5A059]">{resource.metadata.recommendedModel}</span>
                    </div>
                  )}
                </div>
              )}

              {/* GitHub Clone command */}
              {resource.type === "github_repo" && (
                <div className="bg-[#080808] border border-[#222] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#AAA]">
                      <Terminal className="w-4 h-4 text-[#C5A059]" />
                      <span>{resource.metadata?.installCommand || `git clone ${resource.url}`}</span>
                    </div>

                    <button
                      onClick={() => handleCopy(resource.metadata?.installCommand || `git clone ${resource.url}`, "clone")}
                      className="flex items-center gap-1 text-[11px] bg-[#161616] hover:bg-[#222] text-[#AAA] hover:text-white px-2.5 py-1 rounded-md border border-[#333] transition-colors"
                    >
                      {copiedSection === "clone" ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-[#C5A059]" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Tags */}
              {resource.tags && resource.tags.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono uppercase text-[#666] mb-2 tracking-wider">
                    Tag Associati
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {resource.tags.map((t, idx) => (
                      <span
                        key={idx}
                        className="text-xs font-mono bg-[#141414] text-[#AAA] border border-[#222] px-2.5 py-1 rounded-md"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
