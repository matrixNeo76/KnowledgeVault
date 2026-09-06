import React, { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  Play,
  RotateCcw,
  Sparkles,
  Layers,
  Search,
  BookOpen,
  ArrowRight,
  GitCommit,
  Copy,
  Clock,
  ExternalLink,
  FlaskConical,
  Check,
  XCircle,
  HelpCircle,
  Scale,
  Unlock,
  Lock,
  FileCheck
} from "lucide-react";
import { executeBoundedCekikjLoop } from "../lib/cekikj/boundedEngine";
import { dualLayerStore } from "../lib/cekikj/dualLayerStore";
import { runCekikjValidationSuite, ValidationSuiteReport } from "../lib/cekikj/testRunner";
import { CekikjEngineResult, ContradictionRecord } from "../types";

interface CekikjInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotification?: (type: "success" | "error" | "info", msg: string) => void;
}

export const CekikjInspectorModal: React.FC<CekikjInspectorModalProps> = ({
  isOpen,
  onClose,
  onNotification
}) => {
  const [activeTab, setActiveTab] = useState<"runner" | "registry" | "tests" | "guide" | "spec">("runner");
  const [queryInput, setQueryInput] = useState("Qual è la regola per la memorizzazione e sicurezza delle API Key?");
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CekikjEngineResult | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Registry mitigation state
  const [registryRevision, setRegistryRevision] = useState(0);
  const [arbitratingId, setArbitratingId] = useState<string | null>(null);
  const [chosenSource, setChosenSource] = useState<string>("");
  const [arbitrationNotes, setArbitrationNotes] = useState<string>("");

  // Test suite state
  const [testReport, setTestReport] = useState<ValidationSuiteReport | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  if (!isOpen) return null;

  // Reactively re-read when registryRevision changes
  const allContradictions: ContradictionRecord[] = dualLayerStore.getAllContradictions();
  const openConflictsCount = allContradictions.filter(c => c.status === 'open').length;
  const resolvedConflictsCount = allContradictions.filter(c => c.status === 'resolved').length;

  const handleRunQuery = async (customQuery?: string) => {
    const q = customQuery || queryInput;
    if (!q.trim()) return;

    setIsRunning(true);
    try {
      const res = await executeBoundedCekikjLoop(q);
      setLastResult(res);
      if (res.status === 'REFUSAL_CONTRADICTION') {
        onNotification?.("info", "Contradiction Gate: sintesi bloccata su conflitto documentato.");
      } else if (res.status === 'INSUFFICIENT_KNOWLEDGE') {
        onNotification?.("info", "Zero-Guessing: dati insufficienti per comporre una risposta.");
      } else {
        onNotification?.("success", `Esecuzione completata in ${res.trace.totalDurationMs}ms (${res.trace.roundsCount}/8 round).`);
      }
    } catch (err: any) {
      onNotification?.("error", `Errore durante il ciclo epistemico: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleStartArbitration = (conflict: ContradictionRecord) => {
    setArbitratingId(conflict.id);
    const defaultSource = conflict.conflictingSources[0]?.sourceTitle || "";
    setChosenSource(defaultSource);

    if (conflict.id === 'conflict-api-key-policy') {
      setArbitrationNotes("Adottata formalmente la policy Server-Side Strict di Cloud Run RFC-004. L'esposizione di chiavi via VITE_ nel bundle client è vietata e deprecata a partire dalla v0.2.");
    } else if (conflict.id === 'conflict-okf-domain') {
      setArbitrationNotes("Standard OKF v0.2 confermato come canonico: le entità canoniche e le relazioni tipizzate sono obbligatorie nel frontmatter YAML per alimentare il grafo topologico D3.");
    } else if (conflict.id === 'conflict-cache-policy') {
      setArbitrationNotes("Adottata architettura Stale-While-Revalidate con cache IndexedDB locale per offline e rivalidazione automatica al ritorno della rete.");
    } else {
      setArbitrationNotes(`Conflitto arbitrato: confermata la precedenza alla fonte '${defaultSource}' come riferimento canonico.`);
    }
  };

  const handleConfirmArbitration = (conflictId: string) => {
    if (!arbitrationNotes.trim()) {
      onNotification?.("error", "Inserisci una motivazione per la risoluzione del conflitto.");
      return;
    }
    dualLayerStore.resolveContradiction(conflictId, arbitrationNotes, "Architetto del Vault (Utente)", chosenSource);
    setArbitratingId(null);
    setRegistryRevision(prev => prev + 1);
    onNotification?.("success", "Contraddizione mitigata e risolta! Il Contradiction Gate è ora sbloccato per questo argomento.");
  };

  const handleReopenConflict = (conflictId: string) => {
    dualLayerStore.reopenContradiction(conflictId);
    setRegistryRevision(prev => prev + 1);
    onNotification?.("info", "Conflitto riaperto. Il Contradiction Gate tornerà a bloccare le sintesi arbitrarie su questo tema.");
  };

  const handleTestConflictQuery = (conceptName: string) => {
    let q = `Qual è la regola per ${conceptName}?`;
    if (conceptName.toLowerCase().includes("api")) {
      q = "Qual è la regola per la memorizzazione e sicurezza delle API Key?";
    } else if (conceptName.toLowerCase().includes("okf") || conceptName.toLowerCase().includes("domain")) {
      q = "Qual è il formato corretto per il campo domain e le entità in OKF?";
    } else if (conceptName.toLowerCase().includes("cache") || conceptName.toLowerCase().includes("storage")) {
      q = "Qual è la strategia di memorizzazione e caching delle risorse nel Vault?";
    }
    setQueryInput(q);
    setActiveTab("runner");
    setTimeout(() => {
      handleRunQuery(q);
    }, 150);
  };

  const handleRunTestSuite = async () => {
    setIsRunningTests(true);
    try {
      const report = await runCekikjValidationSuite();
      setTestReport(report);
      if (report.allPassed) {
        onNotification?.("success", `Tutti i ${report.totalTests} test epistemici sono stati superati con successo!`);
      } else {
        onNotification?.("error", `${report.failedTests} test epistemici non hanno superato i criteri.`);
      }
    } catch (err: any) {
      onNotification?.("error", `Errore nella suite di test: ${err.message}`);
    } finally {
      setIsRunningTests(false);
    }
  };

  const copyAnswer = () => {
    if (!lastResult) return;
    navigator.clipboard.writeText(lastResult.answerText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
    onNotification?.("info", "Risposta copiata negli appunti");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
      <div 
        id="cekikj-inspector-modal"
        className="relative w-full max-w-5xl bg-[#0D0D0D] border border-[#262626] rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-neutral-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#222] bg-[#121212]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#C5A059]/15 border border-[#C5A059]/30 text-[#C5A059]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-wide text-neutral-100">
                  Motore Epistemico Cekikj (Zero-Guessing Layer)
                </h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#C5A059]/20 text-[#E5C17B] border border-[#C5A059]/40">
                  Hard Bounds & Contradiction Gate
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                Architettura Cekikj • Typed Tools (8) • Gate Esterno • Grounding Check
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-[#1A1A1A] p-1 rounded-lg border border-[#2E2E2E]">
              <button
                type="button"
                onClick={() => setActiveTab("runner")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === "runner"
                    ? "bg-[#C5A059] text-black shadow font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Trace & Console
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("registry")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "registry"
                    ? "bg-[#C5A059] text-black shadow font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <span>Registro Contraddizioni</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  openConflictsCount > 0 ? "bg-[#DC2626]/40 text-[#FCA5A5]" : "bg-[#10B981]/30 text-[#A7F3D0]"
                }`}>
                  {openConflictsCount} aperti
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("guide")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "guide"
                    ? "bg-[#C5A059] text-black shadow font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <HelpCircle className="w-3 h-3" />
                <span>Come Usarlo</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tests")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === "tests"
                    ? "bg-[#C5A059] text-black shadow font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <FlaskConical className="w-3 h-3" />
                <span>Test Suite</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("spec")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === "spec"
                    ? "bg-[#C5A059] text-black shadow font-semibold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                I 5 Pilastri
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#222] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {activeTab === "runner" && (
            <div className="space-y-6">
              {/* Query & Presets */}
              <div className="space-y-3 bg-[#141414] p-4 rounded-xl border border-[#222]">
                <label className="text-xs font-mono uppercase tracking-wider text-[#C5A059] flex items-center justify-between">
                  <span>Prompt di Interrogazione Epistemica</span>
                  <span className="text-[11px] text-neutral-400 lowercase font-sans">
                    Rifiuta di indovinare in assenza di evidenza certa
                  </span>
                </label>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                    <input
                      type="text"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      placeholder="Poni una domanda tecnica o testa un conflitto noto..."
                      className="w-full pl-9 pr-4 py-2 bg-[#0A0A0A] border border-[#2E2E2E] rounded-lg text-neutral-100 placeholder-neutral-500 text-sm focus:outline-none focus:border-[#C5A059]"
                      onKeyDown={(e) => e.key === "Enter" && handleRunQuery()}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRunQuery()}
                    disabled={isRunning}
                    className="px-4 py-2 bg-[#C5A059] hover:bg-[#D4AF37] disabled:opacity-50 text-black font-semibold rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {isRunning ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifica in corso...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Esegui Bounded Loop</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Preset Buttons for Quick Testing */}
                <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-neutral-400 font-mono text-[11px]">Test Suite Immediata:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const q = "Qual è la regola per la memorizzazione e sicurezza delle API Key?";
                      setQueryInput(q);
                      handleRunQuery(q);
                    }}
                    className="px-2.5 py-1 rounded bg-[#221A0F] text-[#F97316] border border-[#F97316]/30 hover:bg-[#F97316]/20 transition-colors"
                  >
                    ⚡ Refusal Test (Conflitto API Key)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const q = "Cosa prescrive lo standard Open Knowledge Format OKF?";
                      setQueryInput(q);
                      handleRunQuery(q);
                    }}
                    className="px-2.5 py-1 rounded bg-[#102018] text-[#34D399] border border-[#34D399]/30 hover:bg-[#34D399]/20 transition-colors"
                  >
                    📘 Concetto Verificato (OKF Spec)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const q = "Come si configura il cluster Quantum Fusion Vault 9.9?";
                      setQueryInput(q);
                      handleRunQuery(q);
                    }}
                    className="px-2.5 py-1 rounded bg-[#1A1A1A] text-neutral-300 border border-[#333] hover:bg-[#252525] transition-colors"
                  >
                    🚫 Insufficient Data (Zero-Guessing)
                  </button>
                </div>
              </div>

              {/* Execution Results */}
              {lastResult && (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${
                    lastResult.status === 'REFUSAL_CONTRADICTION'
                      ? 'bg-[#26120D] border-[#DC2626]/50 text-red-200'
                      : lastResult.status === 'INSUFFICIENT_KNOWLEDGE'
                      ? 'bg-[#1C1A0E] border-[#FBBF24]/40 text-amber-200'
                      : 'bg-[#0E1E14] border-[#10B981]/40 text-emerald-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      {lastResult.status === 'REFUSAL_CONTRADICTION' ? (
                        <ShieldAlert className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />
                      ) : lastResult.status === 'INSUFFICIENT_KNOWLEDGE' ? (
                        <AlertTriangle className="w-5 h-5 text-[#FBBF24] shrink-0 mt-0.5" />
                      ) : (
                        <ShieldCheck className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <span>
                            {lastResult.status === 'REFUSAL_CONTRADICTION' && "Contradiction Gate: Rifiuto di Sintesi Eseguito"}
                            {lastResult.status === 'INSUFFICIENT_KNOWLEDGE' && "Dati Insufficienti (Zero-Guessing Attivo)"}
                            {lastResult.status === 'SUCCESS' && "Risposta Verificata con Grounding Superato"}
                            {lastResult.status === 'BOUNDS_EXCEEDED_PARTIAL' && "Hard Bounds Scattati: Risposta su Dati Parziali"}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-current">
                            Status: {lastResult.status}
                          </span>
                        </div>
                        <p className="text-xs opacity-85 mt-1">
                          {lastResult.status === 'REFUSAL_CONTRADICTION' &&
                            "Rilevata collisione tra policy attive. Il sistema ha bloccato la composizione libera per impedire iterated guessing."}
                          {lastResult.status === 'INSUFFICIENT_KNOWLEDGE' &&
                            "Nessun chunk o nodo ontologico corrispondente trovato. Dichiarato insufficient: true."}
                          {lastResult.status === 'SUCCESS' &&
                            "Tutti i claim atomici mappano a evidenze o relazioni verificate nella trace."}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={copyAnswer}
                      className="px-3 py-1.5 rounded bg-black/40 hover:bg-black/60 border border-current text-xs flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                    >
                      {copiedText ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedText ? "Copiato" : "Copia Output"}</span>
                    </button>
                  </div>

                  {/* Hard Bounds Metrics Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-3 rounded-lg bg-[#141414] border border-[#222]">
                      <div className="text-[11px] font-mono text-neutral-400">Rounds di Tool-Call</div>
                      <div className="text-lg font-bold text-neutral-100 font-mono mt-0.5">
                        {lastResult.trace.roundsCount} <span className="text-xs text-neutral-500 font-normal">/ {lastResult.trace.maxRoundsLimit} max</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#141414] border border-[#222]">
                      <div className="text-[11px] font-mono text-neutral-400">Tempo Wall-Clock</div>
                      <div className="text-lg font-bold text-neutral-100 font-mono mt-0.5">
                        {lastResult.trace.totalDurationMs} <span className="text-xs text-neutral-500 font-normal">ms</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#141414] border border-[#222]">
                      <div className="text-[11px] font-mono text-neutral-400">Grounding Score</div>
                      <div className="text-lg font-bold text-neutral-100 font-mono mt-0.5">
                        {Math.round(lastResult.groundingReport.groundingScore * 100)}%
                        <span className="text-xs text-neutral-500 font-normal ml-1">
                          ({lastResult.groundingReport.verifiedClaimsCount}/{lastResult.groundingReport.totalClaims})
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#141414] border border-[#222]">
                      <div className="text-[11px] font-mono text-neutral-400">Archi & Nodi Esplorati</div>
                      <div className="text-lg font-bold text-neutral-100 font-mono mt-0.5">
                        {lastResult.entities.length} <span className="text-xs text-neutral-500 font-normal">nodi, {lastResult.traversedEdges.length} archi</span>
                      </div>
                    </div>
                  </div>

                  {/* Output Text */}
                  <div className="p-4 rounded-xl bg-[#0F0F0F] border border-[#2A2A2A] space-y-2">
                    <div className="text-xs font-mono uppercase text-[#C5A059] flex items-center justify-between">
                      <span>Testo di Risposta Composto dal Compositore</span>
                      <span className="text-[10px] text-neutral-500">Out-of-Loop Protected</span>
                    </div>
                    <pre className="text-xs font-mono leading-relaxed text-neutral-200 whitespace-pre-wrap max-h-60 overflow-y-auto bg-black/50 p-3 rounded-lg border border-[#1F1F1F]">
                      {lastResult.answerText}
                    </pre>
                  </div>

                  {/* Tool Call Trace Timeline */}
                  <div className="p-4 rounded-xl bg-[#141414] border border-[#222] space-y-3">
                    <div className="text-xs font-mono uppercase text-neutral-400 flex items-center justify-between">
                      <span>Trace Sequenziale di Esecuzione Tool (FSM)</span>
                      <span className="text-[10px] text-neutral-500">{lastResult.trace.toolCalls.length} invocazioni</span>
                    </div>

                    <div className="space-y-2">
                      {lastResult.trace.toolCalls.map((step, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-[#0A0A0A] border border-[#1E1E1E] flex items-center justify-between gap-4 text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#222] text-neutral-300 flex items-center justify-center text-[10px]">
                              {step.round}
                            </span>
                            <span className="font-semibold text-[#C5A059]">{step.tool}()</span>
                            <span className="text-neutral-400 truncate max-w-xs">{step.resultSummary}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {step.insufficient ? (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-[#EF4444]/20 text-[#F87171] border border-[#EF4444]/40">
                                insufficient: true
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-[#10B981]/20 text-[#34D399] border border-[#10B981]/40">
                                ok
                              </span>
                            )}
                            <span className="text-neutral-500 text-[10px]">{step.executionMs}ms</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "registry" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#141414] p-4 rounded-xl border border-[#222]">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#C5A059]" />
                    <span>Registro Ufficiale delle Contraddizioni & Mitigazione</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Quando due documenti esprimono regole opposte, il Gate blocca l'AI finché non mitighi il conflitto decidendo la fonte canonica.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-[#DC2626]/20 text-[#FCA5A5] border border-[#DC2626]/30">
                    {openConflictsCount} Conflitti Aperti
                  </span>
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-[#10B981]/20 text-[#A7F3D0] border border-[#10B981]/30">
                    {resolvedConflictsCount} Risolti
                  </span>
                </div>
              </div>

              {/* Explanatory Banner for Mitigation */}
              <div className="p-3.5 rounded-xl bg-[#0D1612] border border-[#10B981]/30 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-emerald-300">
                    Come Funziona la Mitigazione in Pratica
                  </div>
                  <p className="text-neutral-300 leading-relaxed">
                    Per ogni conflitto aperto, clicca su <strong>"Arbitra / Mitiga Conflitto"</strong>. 
                    Seleziona quale delle due fonti adotti come verità canonica nel Vault e inserisci la decisione di policy. 
                    Non appena lo stato diventa <strong>RESOLVED</strong>, il Contradiction Gate si sblocca e l'assistente risponderà con certezza seguendo la norma approvata!
                  </p>
                </div>
              </div>

              {/* Contradiction Cards */}
              <div className="space-y-4">
                {allContradictions.map((conflict) => {
                  const isOpenState = conflict.status === 'open';
                  const isArbitrating = arbitratingId === conflict.id;

                  return (
                    <div 
                      key={conflict.id} 
                      className={`p-4 rounded-xl border transition-all ${
                        isOpenState 
                          ? 'bg-[#141210] border-[#DC2626]/30 hover:border-[#DC2626]/50' 
                          : 'bg-[#0E1411] border-[#10B981]/30'
                      } space-y-3.5`}
                    >
                      {/* Top Header of Card */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#222] pb-3">
                        <div>
                          <div className="flex items-center gap-2.5">
                            {isOpenState ? (
                              <Lock className="w-4 h-4 text-[#EF4444]" />
                            ) : (
                              <Unlock className="w-4 h-4 text-[#10B981]" />
                            )}
                            <span className="font-semibold text-neutral-100 text-sm">{conflict.conceptName}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                              isOpenState 
                                ? 'bg-[#EF4444]/20 text-[#F87171] border border-[#EF4444]/30' 
                                : 'bg-[#10B981]/20 text-[#34D399] border border-[#10B981]/30'
                            }`}>
                              {isOpenState ? 'OPEN (GATE ATTIVO)' : 'RESOLVED (GATE SBLOCCATO)'}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-neutral-400 mt-1">
                            ID: {conflict.conceptId} • Registrato il {conflict.registeredAt.split('T')[0]}
                          </div>
                        </div>

                        {/* Quick action buttons */}
                        <div className="flex items-center gap-2 pt-2 sm:pt-0">
                          <button
                            type="button"
                            onClick={() => handleTestConflictQuery(conflict.conceptName)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#1F1F1F] hover:bg-[#2A2A2A] text-neutral-200 text-xs font-mono border border-[#333] transition-colors flex items-center gap-1.5 cursor-pointer"
                            title="Testa come risponde l'AI a questa query"
                          >
                            <Play className="w-3 h-3 fill-current text-[#C5A059]" />
                            <span>Testa nel Runner</span>
                          </button>

                          {isOpenState ? (
                            <button
                              type="button"
                              onClick={() => handleStartArbitration(conflict)}
                              className="px-3 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#D4AF37] text-black text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <Scale className="w-3.5 h-3.5" />
                              <span>Arbitra / Mitiga</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReopenConflict(conflict.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#2A1815] hover:bg-[#3B1E19] text-[#FCA5A5] text-xs font-mono border border-[#DC2626]/30 transition-colors cursor-pointer"
                            >
                              Riapri Conflitto
                            </button>
                          )}
                        </div>
                      </div>

                      {/* If Resolved: show resolution summary */}
                      {!isOpenState && conflict.resolutionNotes && (
                        <div className="p-3 rounded-lg bg-[#102018] border border-[#10B981]/40 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Mitigazione Convalidata da: {conflict.resolvedBy || "Architetto del Vault"}</span>
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400">
                              {conflict.resolvedAt?.split('T')[0]}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-200 pl-5 leading-relaxed">
                            {conflict.resolutionNotes}
                          </p>
                        </div>
                      )}

                      {/* Conflicting Sources Side-by-Side */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-mono uppercase text-neutral-400">
                          {isOpenState ? "Fonti in Conflitto Documentate:" : "Storico delle Fonti Contrapposte:"}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {conflict.conflictingSources.map((source, i) => (
                            <div key={i} className="p-3 rounded-lg bg-[#0A0A0A] border border-[#222] space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-[#C5A059] truncate max-w-[200px]">
                                  {source.sourceTitle}
                                </span>
                                <span className="text-[10px] font-mono text-neutral-400">
                                  Valido: {source.validFrom || source.effectiveDate}
                                </span>
                              </div>

                              <p className="text-xs text-neutral-300 italic border-l-2 border-[#C5A059]/60 pl-2">
                                "{source.statement}"
                              </p>

                              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-1">
                                <span>Owner: {source.owner}</span>
                                {source.url && (
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[#38BDF8] hover:underline flex items-center gap-1"
                                  >
                                    <span>Doc</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Inline Arbitration Form when active */}
                      {isArbitrating && (
                        <div className="p-4 rounded-xl bg-[#161208] border border-[#C5A059]/60 space-y-3.5 pt-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-[#E5C17B] flex items-center gap-1.5">
                              <Scale className="w-4 h-4 text-[#C5A059]" />
                              <span>Modulo di Arbitraggio Umano (Decisione di Policy)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setArbitratingId(null)}
                              className="text-neutral-400 hover:text-white text-xs"
                            >
                              Annulla
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs text-neutral-300 font-medium">
                              1. Seleziona quale fonte deve prevalere come Verità Canonica:
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {conflict.conflictingSources.map((s, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setChosenSource(s.sourceTitle)}
                                  className={`p-2 rounded-lg border text-left text-xs transition-all ${
                                    chosenSource === s.sourceTitle
                                      ? 'bg-[#C5A059]/20 border-[#C5A059] text-white font-semibold'
                                      : 'bg-[#0A0A0A] border-[#333] text-neutral-300 hover:border-[#555]'
                                  }`}
                                >
                                  <div className="font-semibold text-[#C5A059] truncate">{s.sourceTitle}</div>
                                  <div className="text-[10px] text-neutral-400">Owner: {s.owner}</div>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs text-neutral-300 font-medium">
                              2. Nota di Arbitraggio e Decisione di Policy:
                            </label>
                            <textarea
                              value={arbitrationNotes}
                              onChange={(e) => setArbitrationNotes(e.target.value)}
                              rows={3}
                              className="w-full p-2.5 bg-[#0A0A0A] border border-[#333] rounded-lg text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-[#C5A059]"
                              placeholder="Specifica le motivazioni, la data di entrata in vigore e l'eventuale deprecazione della vecchia fonte..."
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setArbitratingId(null)}
                              className="px-3 py-1.5 rounded-lg bg-[#222] hover:bg-[#2A2A2A] text-neutral-300 text-xs font-mono"
                            >
                              Annulla
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmArbitration(conflict.id)}
                              className="px-4 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#D4AF37] text-black text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Salva Risoluzione & Sblocca Gate</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: USER GUIDE (COME USARLO) */}
          {activeTab === "guide" && (
            <div className="space-y-5">
              <div className="bg-[#141414] p-5 rounded-xl border border-[#222] space-y-4">
                <div className="flex items-center gap-3 border-b border-[#222] pb-3">
                  <div className="p-2 rounded-lg bg-[#C5A059]/20 text-[#C5A059]">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-100">
                      Guida Pratica: Cos'è il Zero-Guessing e Come Mitigare le Contraddizioni
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Il manuale rapido per comprendere il valore epistemico nel lavoro di ogni giorno.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-[#0D0D0D] border border-[#222] space-y-2.5">
                    <div className="flex items-center gap-2 text-[#C5A059] font-semibold text-xs">
                      <span className="w-5 h-5 rounded-full bg-[#C5A059]/20 flex items-center justify-center font-mono text-[11px]">1</span>
                      <span>Il Problema dei Modelli AI</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Se un modello di linguaggio standard trova due documenti aziendali che dicono cose opposte, oppure se gli fai una domanda su qualcosa che non è presente nel vault, <strong>tira a indovinare</strong> (guessing). Genera una risposta allucinata o sceglie a caso una fonte, inducendo errori critici.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0D0D0D] border border-[#222] space-y-2.5">
                    <div className="flex items-center gap-2 text-[#C5A059] font-semibold text-xs">
                      <span className="w-5 h-5 rounded-full bg-[#C5A059]/20 flex items-center justify-center font-mono text-[11px]">2</span>
                      <span>Il Zero-Guessing Layer</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Il motore Cekikj adotta un principio radicale: <strong>meglio rifiutarsi che mentire</strong>.
                      Se i dati mancano risponde con <code>insufficient: true</code>. Se c'è una contraddizione aperta tra due policy, il <strong>Contradiction Gate</strong> intercetta la richiesta ed espone il contrasto senza inventare nulla.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0D0D0D] border border-[#222] space-y-2.5">
                    <div className="flex items-center gap-2 text-[#C5A059] font-semibold text-xs">
                      <span className="w-5 h-5 rounded-full bg-[#C5A059]/20 flex items-center justify-center font-mono text-[11px]">3</span>
                      <span>Come Risolverle (Mitigazione)</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Nel <strong>Registro Contraddizioni</strong> vedi l'elenco dei conflitti aperti. Clicchi su <strong>"Arbitra / Mitiga"</strong>, indichi quale fonte è la regola ufficiale e registri la policy. Il Gate passa a <strong>RESOLVED</strong> e l'agente ricomincia a rispondere seguendo la norma vincente!
                    </p>
                  </div>
                </div>

                {/* Practical Step-by-Step Exercise */}
                <div className="p-4 rounded-xl bg-[#12161A] border border-[#38BDF8]/30 space-y-3">
                  <span className="text-xs font-semibold text-[#38BDF8] uppercase font-mono tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Esperimento Pratico da Provare Adesso</span>
                  </span>
                  <ol className="list-decimal list-inside text-xs text-neutral-200 space-y-2 leading-relaxed">
                    <li>
                      <strong>Passo 1</strong>: Vai nella tab <em>Trace & Console</em> e premi il pulsante arancione <strong>"Conflitto API Key"</strong>. Vedrai il Gate rifiutare la risposta ed esporti le due policy discordanti (VITE client vs Express server).
                    </li>
                    <li>
                      <strong>Passo 2</strong>: Spostati nella tab <em>Registro Contraddizioni</em>. Troverai la card rossa <strong>"API Key Security Policy"</strong>. Clicca su <strong>"Arbitra / Mitiga"</strong>, scegli la fonte <em>RFC-004 Server-Side</em> e clicca <em>Salva Risoluzione</em>. La card diventerà verde (RESOLVED).
                    </li>
                    <li>
                      <strong>Passo 3</strong>: Clicca <strong>"Testa nel Runner"</strong> sulla card appena risolta. Noterai che ora il Gate lascia passare la richiesta e l'AI sintetizza con successo la risposta canonica con ancoraggio al 100%!
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {activeTab === "tests" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between bg-[#141414] p-4 rounded-xl border border-[#222]">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-[#C5A059]" />
                    <span>Suite di Certificazione Epistemica (Refusal & Grounding Tests)</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Verifica automatizzata dei 5 requisiti formali: Refusal Gate, Flag Insufficient, Hard Bounds, Bitemporalità, Grounding.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunTestSuite}
                  disabled={isRunningTests}
                  className="px-4 py-2 bg-[#C5A059] hover:bg-[#D4AF37] disabled:opacity-50 text-black font-semibold rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer"
                >
                  {isRunningTests ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Esecuzione in corso...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Esegui i 5 Test di Conformità</span>
                    </>
                  )}
                </button>
              </div>

              {testReport && (
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${
                    testReport.allPassed 
                      ? 'bg-[#0E1E14] border-[#10B981]/40 text-emerald-200' 
                      : 'bg-[#26120D] border-[#DC2626]/40 text-red-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      {testReport.allPassed ? (
                        <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
                      ) : (
                        <XCircle className="w-5 h-5 text-[#EF4444]" />
                      )}
                      <div>
                        <div className="font-semibold text-sm">
                          {testReport.allPassed 
                            ? 'Certificazione Epistemica Superata (100% Pass)' 
                            : `${testReport.failedTests} Fallimenti Rilevati`}
                        </div>
                        <div className="text-xs opacity-80 mt-0.5">
                          {testReport.passedTests}/{testReport.totalTests} test completati con successo in osservanza della specifica Cekikj.
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-mono px-3 py-1 rounded bg-black/40 border border-current">
                      {testReport.allPassed ? 'CEKIKJ-COMPLIANT' : 'NON-COMPLIANT'}
                    </span>
                  </div>

                  {/* Test Cards List */}
                  <div className="space-y-2.5">
                    {testReport.results.map((test) => (
                      <div
                        key={test.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          test.passed
                            ? 'bg-[#0C140F] border-[#163623]'
                            : 'bg-[#180C0A] border-[#3B1512]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-1 rounded mt-0.5 ${
                              test.passed ? 'bg-[#10B981]/20 text-[#34D399]' : 'bg-[#EF4444]/20 text-[#F87171]'
                            }`}>
                              {test.passed ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-neutral-200 text-xs">{test.name}</span>
                                <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-[#1C1C1C] text-neutral-400">
                                  {test.pillar}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-400 mt-1 font-mono leading-relaxed">
                                {test.details}
                              </p>
                            </div>
                          </div>

                          <span className="text-[11px] font-mono text-neutral-500 shrink-0">
                            {test.durationMs}ms
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "spec" && (
            <div className="space-y-4 max-w-3xl">
              <h3 className="text-sm font-semibold text-neutral-200">
                I 5 Pilastri di Conformità Architetturale Cekikj
              </h3>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222]">
                  <div className="font-semibold text-[#C5A059] flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    <span>1. Dual-Layer Knowledge (Evidence ◄► Ontology)</span>
                  </div>
                  <p className="text-neutral-400 mt-1">
                    Nessun retrieval opera solo su vettori o chunk grezzi isolati. Ogni evidenza testuale è ancorata a entità e concetti risolti con relazioni tipizzate.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222]">
                  <div className="font-semibold text-[#C5A059] flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    <span>2. Suite degli 8 Typed Tools con Flag Insufficient</span>
                  </div>
                  <p className="text-neutral-400 mt-1">
                    search_evidence, search_knowledge, resolve_entity, traverse, timeline, diff, list_contradictions, get_source. Nessuna chiamata a testo libero senza schema rigido.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222]">
                  <div className="font-semibold text-[#C5A059] flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>3. Bitemporalità & Intervalli di Vigenza</span>
                  </div>
                  <p className="text-neutral-400 mt-1">
                    Tracciamento esplicito delle date di validità (valid_from / valid_to). Il sistema risponde a "cosa valeva alla data X" senza confondere versioni storiche con lo stato attuale.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222]">
                  <div className="font-semibold text-[#C5A059] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    <span>4. The Contradiction Gate (Governance Out-of-Loop)</span>
                  </div>
                  <p className="text-neutral-400 mt-1">
                    Il gate vive fuori dal loop di reasoning. Se due policy collidono, il compositore a valle blocca la risposta arbitraria ed espone entrambe le fonti con owner e date.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222]">
                  <div className="font-semibold text-[#C5A059] flex items-center gap-2">
                    <GitCommit className="w-4 h-4" />
                    <span>5. Hard Bounds & Grounding Verificato</span>
                  </div>
                  <p className="text-neutral-400 mt-1">
                    Massimo 8 round di tool call, massimo 2 hop nel grafo, timeout wall-clock. Singola passata di verifica claim post-sintesi con rimozione di claim non provati.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#222] bg-[#121212] text-xs font-mono text-neutral-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Gate Active</span>
            </span>
            <span>•</span>
            <span>Max Rounds: 8</span>
            <span>•</span>
            <span>Max Hops: 2</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-[#222] hover:bg-[#333] text-neutral-200 text-xs font-sans transition-colors cursor-pointer"
          >
            Chiudi Console
          </button>
        </div>
      </div>
    </div>
  );
};
