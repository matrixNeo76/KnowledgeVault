import React from "react";
import { 
  FolderArchive, 
  BookOpen, 
  Github, 
  Cpu, 
  Sparkles, 
  Star, 
  Database,
  Layers,
  LogOut,
  LogIn,
  X,
  RefreshCw,
  BrainCircuit,
  Network,
  Download,
  Globe,
  Link2
} from "lucide-react";
import { ResourceType } from "../types";
import { User } from "firebase/auth";

interface SidebarProps {
  currentCategory: ResourceType | "all" | "favorites";
  onSelectCategory: (cat: ResourceType | "all" | "favorites") => void;
  counts: {
    all: number;
    knowledge: number;
    mcp_server: number;
    github_repo: number;
    ai_skill: number;
    article: number;
    link?: number;
    favorites: number;
  };
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onSeedDemo: () => void;
  isSeeding: boolean;
  onOpenKnowledgeUpload: () => void;
  onOpenExport?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentCategory,
  onSelectCategory,
  counts,
  user,
  onSignIn,
  onSignOut,
  isOpenMobile,
  onCloseMobile,
  onSeedDemo,
  isSeeding,
  onOpenKnowledgeUpload,
  onOpenExport,
}) => {
  const navItems: {
    id: ResourceType | "all" | "favorites";
    label: string;
    icon: React.ReactNode;
    count: number;
  }[] = [
    {
      id: "all",
      label: "Tutte le Risorse",
      icon: <Layers className="w-4 h-4" />,
      count: counts.all,
    },
    {
      id: "knowledge",
      label: "Knowledge (OKF v0.2)",
      icon: <BrainCircuit className="w-4 h-4 text-[#C5A059]" />,
      count: counts.knowledge || 0,
    },
    {
      id: "favorites",
      label: "Preferiti",
      icon: <Star className="w-4 h-4 text-[#C5A059]" />,
      count: counts.favorites,
    },
    {
      id: "mcp_server",
      label: "MCP Servers & Tools",
      icon: <Cpu className="w-4 h-4 text-[#38BDF8]" />,
      count: counts.mcp_server,
    },
    {
      id: "github_repo",
      label: "GitHub Repositories",
      icon: <Github className="w-4 h-4 text-[#A855F7]" />,
      count: counts.github_repo,
    },
    {
      id: "ai_skill",
      label: "AI Skills & Prompts",
      icon: <Sparkles className="w-4 h-4 text-[#10B981]" />,
      count: counts.ai_skill,
    },
    {
      id: "article",
      label: "Articoli & Guide",
      icon: <BookOpen className="w-4 h-4 text-[#F59E0B]" />,
      count: counts.article,
    },
    {
      id: "link",
      label: "Link & Web Tools",
      icon: <Globe className="w-4 h-4 text-[#06B6D4]" />,
      count: counts.link || 0,
    },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-xs"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 w-72 bg-[#0A0A0A] border-r border-[#1F1F1F] flex flex-col transition-transform duration-200 ease-in-out ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand Header */}
        <div className="p-6 border-b border-[#1F1F1F] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#222] to-[#111] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059]">
                <FolderArchive className="w-4 h-4" />
              </div>
              <h1 className="text-xl font-serif italic text-[#C5A059] tracking-tight font-semibold">
                Knowledge Vault
              </h1>
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#666] mt-1 pl-10">
              Dev & AI Knowledge Base
            </p>
          </div>
          <button 
            onClick={onCloseMobile}
            className="lg:hidden text-[#666] hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-widest text-[#444] px-4 mb-2 font-mono">
            COLLEZIONI
          </div>

          {navItems.map((item) => {
            const isActive = currentCategory === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectCategory(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-[#161616] border-l-2 border-[#C5A059] text-white shadow-xs"
                    : "text-[#888] hover:text-[#E0E0E0] hover:bg-[#111]"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
                    isActive
                      ? "bg-[#222] text-[#C5A059]"
                      : "bg-[#141414] text-[#555]"
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}

          {/* Upload OKF Knowledge Document Button */}
          <div className="pt-4 px-2 space-y-2">
            <button
              onClick={() => {
                onOpenKnowledgeUpload();
                onCloseMobile();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#141414] hover:bg-[#1C1C1C] border border-[#C5A059]/30 text-[#C5A059] text-xs font-mono transition-all shadow-md shadow-[#C5A059]/5"
            >
              <BrainCircuit className="w-4 h-4" />
              <span>Importa Doc OKF v0.2</span>
            </button>

            <button
              onClick={onSeedDemo}
              disabled={isSeeding}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#0F0F0F] hover:bg-[#141414] border border-[#2B2B2B] hover:border-[#C5A059]/40 text-[#AAA] hover:text-[#C5A059] text-xs font-mono transition-all shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? "animate-spin text-[#C5A059]" : "text-[#C5A059]"}`} />
              <span>{isSeeding ? "Caricamento Docs..." : "Carica Documentazione OKF v0.2"}</span>
            </button>
            {onOpenExport && (
              <button
                onClick={() => {
                  onOpenExport();
                  onCloseMobile();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#0F0F0F] hover:bg-[#141414] border border-[#2B2B2B] hover:border-[#C5A059]/40 text-[#AAA] hover:text-[#C5A059] text-xs font-mono transition-all shadow-xs"
              >
                <Download className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Esporta Backup Vault</span>
              </button>
            )}
          </div>
        </nav>

        {/* User / Firestore Status Footer */}
        <div className="p-4 border-t border-[#1F1F1F] bg-[#080808]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 overflow-hidden">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  className="w-8 h-8 rounded-full border border-[#C5A059]/40 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#1F1F1F] to-[#333] border border-[#444] flex items-center justify-center text-[11px] text-[#C5A059] font-bold">
                  {user?.displayName ? user.displayName.slice(0, 1).toUpperCase() : "U"}
                </div>
              )}

              <div className="text-xs truncate">
                <p className="text-white font-medium truncate">
                  {user ? (user.displayName || user.email || "Utente Autenticato") : "Modalità Locale"}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-[#666]">
                  <Database className="w-2.5 h-2.5 text-emerald-500" />
                  <span className="text-emerald-500 font-mono">Firestore Attivo</span>
                </div>
              </div>
            </div>

            {user ? (
              <button
                onClick={onSignOut}
                title="Disconnetti"
                className="p-1.5 text-[#666] hover:text-[#C5A059] hover:bg-[#141414] rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onSignIn}
                title="Accedi con Google"
                className="p-1.5 text-[#C5A059] hover:text-white hover:bg-[#161616] rounded-md transition-colors"
              >
                <LogIn className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
