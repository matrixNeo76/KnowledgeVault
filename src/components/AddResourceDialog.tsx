import React, { useState } from "react";
import { 
  X, 
  Sparkles, 
  Plus, 
  BookOpen, 
  Github, 
  Cpu, 
  Bot, 
  Loader2,
  Wand2
} from "lucide-react";
import { ResourceItem, ResourceType } from "../types";

interface AddResourceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (newResource: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<boolean>;
  onAnalyzeWithAI: (input: string, explicitType?: ResourceType) => Promise<any>;
}

export const AddResourceDialog: React.FC<AddResourceDialogProps> = ({
  isOpen,
  onClose,
  onAdd,
  onAnalyzeWithAI,
}) => {
  if (!isOpen) return null;

  const [type, setType] = useState<ResourceType>("github_repo");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [mcpConfig, setMcpConfig] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [installCommand, setInstallCommand] = useState("");

  const [aiInputPrompt, setAiInputPrompt] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAIAutoFill = async () => {
    if (!aiInputPrompt.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const data = await onAnalyzeWithAI(aiInputPrompt.trim(), type);
      if (data) {
        if (data.title) setTitle(data.title);
        if (data.url) setUrl(data.url);
        if (data.summary) setSummary(data.summary);
        if (data.tags && Array.isArray(data.tags)) setTagsStr(data.tags.join(", "));
        if (data.type) setType(data.type);

        if (data.metadata?.configSnippet) setMcpConfig(data.metadata.configSnippet);
        if (data.metadata?.systemPrompt) setSystemPrompt(data.metadata.systemPrompt);
        if (data.metadata?.installCommand) setInstallCommand(data.metadata.installCommand);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const tagsArray = tagsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const metadata: Record<string, any> = {};
    if (type === "mcp_server" && mcpConfig) metadata.configSnippet = mcpConfig;
    if (type === "ai_skill" && systemPrompt) metadata.systemPrompt = systemPrompt;
    if (type === "github_repo" && installCommand) metadata.installCommand = installCommand;

    const success = await onAdd({
      type,
      title: title.trim(),
      url: url.trim() || "",
      summary: summary.trim(),
      tags: tagsArray,
      isFavorite: false,
      metadata,
    });

    setIsSubmitting(false);
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div 
        className="bg-[#0D0D0D] border border-[#222] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#1C1C1C] flex items-center justify-between bg-[#0A0A0A]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#161616] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059]">
              <Plus className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-lg font-serif text-white font-medium">
              Aggiungi Nuova Risorsa al Vault
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-[#666] hover:text-white hover:bg-[#1C1C1C] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* AI Auto-Fill Helper Box */}
          <div className="bg-[#111] border border-[#222] rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059] mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Fill Intelligente con Gemini</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={aiInputPrompt}
                onChange={(e) => setAiInputPrompt(e.target.value)}
                placeholder="Incolla un URL o testo grezzo da analizzare automaticamente..."
                className="w-full bg-[#080808] border border-[#262626] rounded-lg px-3 py-2 text-xs text-[#E0E0E0] placeholder-[#555] focus:outline-none focus:border-[#C5A059]"
              />
              <button
                type="button"
                onClick={handleAIAutoFill}
                disabled={!aiInputPrompt.trim() || isAnalyzing}
                className="bg-[#1C1C1C] hover:bg-[#252525] border border-[#333] text-[#C5A059] hover:text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                <span>Auto-Fill</span>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Category Selector */}
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#666] mb-1.5">
                Categoria Risorsa *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "github_repo", label: "GitHub Repo", icon: <Github className="w-3.5 h-3.5" /> },
                  { id: "mcp_server", label: "MCP Server", icon: <Cpu className="w-3.5 h-3.5" /> },
                  { id: "ai_skill", label: "AI Skill", icon: <Bot className="w-3.5 h-3.5" /> },
                  { id: "article", label: "Articolo", icon: <BookOpen className="w-3.5 h-3.5" /> },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setType(cat.id as ResourceType)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs transition-colors ${
                      type === cat.id
                        ? "bg-[#181818] border-[#C5A059] text-[#C5A059] font-medium"
                        : "bg-[#0A0A0A] border-[#222] text-[#777] hover:text-white"
                    }`}
                  >
                    {cat.icon}
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                Titolo *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="es. PostgreSQL MCP Server o nomerepo/framework"
                className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
              />
            </div>

            {/* URL */}
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                URL / Link Risorsa (opzionale)
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/..."
                className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
              />
            </div>

            {/* Summary */}
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                Descrizione / Sommario *
              </label>
              <textarea
                required
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Descrivi lo scopo, funzionalità o caratteristiche principali..."
                className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
              />
            </div>

            {/* Specific fields */}
            {type === "mcp_server" && (
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                  Configurazione JSON per Claude / Host MCP
                </label>
                <textarea
                  rows={3}
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
                  System Prompt / Istruzioni della Skill
                </label>
                <textarea
                  rows={4}
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
                  Comando Clone / Install
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

            {/* Tags */}
            <div>
              <label className="block text-[11px] font-mono uppercase text-[#666] mb-1">
                Tag Tematici (separati da virgola)
              </label>
              <input
                type="text"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="mcp, agents, typescript, react"
                className="w-full bg-[#111] border border-[#262626] rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#C5A059]"
              />
            </div>

            {/* Submit buttons */}
            <div className="pt-3 border-t border-[#1C1C1C] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs text-[#888] hover:text-white bg-[#141414] hover:bg-[#1C1C1C] border border-[#262626] transition-colors"
              >
                Annulla
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || !summary.trim()}
                className="px-5 py-2 rounded-lg text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvataggio nel DB...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Aggiungi al Vault</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
