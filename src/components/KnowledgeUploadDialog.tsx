import React, { useState, useRef } from "react";
import { 
  X, 
  UploadCloud, 
  Sparkles, 
  Loader2, 
  BrainCircuit, 
  CheckCircle,
  FileCode,
  AlertCircle
} from "lucide-react";
import { ResourceItem } from "../types";

interface KnowledgeUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadProcessedDoc: (item: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<boolean>;
  existingResources: ResourceItem[];
}

export const KnowledgeUploadDialog: React.FC<KnowledgeUploadDialogProps> = ({
  isOpen,
  onClose,
  onUploadProcessedDoc,
  existingResources,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputText, setInputText] = useState("");
  const [fileName, setFileName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Escape key handler
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isProcessing) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isProcessing]);

  if (!isOpen) return null;

  // Read uploaded file content
  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      setInputText((e.target?.result as string) || "");
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleProcessAndSave = async () => {
    if (!inputText.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      const trimmedResources = existingResources.slice(0, 30).map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        tags: r.tags || [],
      }));

      const res = await fetch("/api/process-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText.trim(),
          filename: fileName || "documento.md",
          existingResources: trimmedResources,
        }),
      });

      if (!res.ok) {
        throw new Error(`Errore HTTP ${res.status}: Impossibile elaborare il testo.`);
      }

      const data = await res.json();
      const result = data.result;

      if (!result) {
        throw new Error("Risposta del server non valida.");
      }

      const ok = await onUploadProcessedDoc({
        type: "knowledge",
        title: result.title || fileName || "Documento Knowledge OKF",
        url: "",
        rawInput: inputText,
        summary: result.summary || inputText.slice(0, 300),
        tags: result.tags || ["knowledge", "okf-v0.2"],
        isFavorite: false,
        metadata: result.metadata || {},
      });

      if (ok) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      console.error("Knowledge upload error:", err);
      setErrorMessage(err.message || "Errore sconosciuto durante la conversione OKF");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-[#0D0D0D] border border-[#222] rounded-2xl w-full max-w-2xl max-h-[94vh] sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-[#1C1C1C] flex items-center justify-between gap-2.5 bg-[#0A0A0A]">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[#181818] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059] shrink-0">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-lg font-serif text-white font-medium truncate">
                Carica & Converti in OKF v0.2
              </h2>
              <p className="text-[9px] sm:text-[10px] text-[#666] font-mono truncate">
                Estrae concetti, ontologie e crea collegamenti al grafo
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Chiudi finestra"
            className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg bg-[#1C1C1C] hover:bg-[#2A2A2A] text-[#EEE] hover:text-white border border-[#333] transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
          {/* Dropzone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragActive
                ? "border-[#C5A059] bg-[#C5A059]/5"
                : "border-[#222] hover:border-[#333] bg-[#0A0A0A]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.pdf,.json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />

            <UploadCloud className="w-8 h-8 text-[#C5A059] mx-auto mb-2 opacity-80" />
            <p className="text-xs font-medium text-white">
              {fileName ? (
                <span className="text-[#C5A059] flex items-center justify-center gap-1.5 font-mono">
                  <FileCode className="w-4 h-4" /> {fileName}
                </span>
              ) : (
                "Trascina qui file .md, .txt, .pdf o clicca per sfogliare"
              )}
            </p>
            <p className="text-[10px] text-[#555] font-mono mt-1">
              Verrà convertito in standard Open Knowledge Format (OKF v0.2)
            </p>
          </div>

          {/* Raw Text Input / Editor */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[#666] mb-1.5">
              <span>Oppure incolla il testo o Markdown grezzo:</span>
              <span>{inputText.length} caratteri</span>
            </div>
            <textarea
              rows={8}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="# Inserisci documentazione o specifica tecnica..."
              className="w-full bg-[#111] border border-[#262626] rounded-xl p-3 text-xs text-[#CCC] font-mono focus:outline-none focus:border-[#C5A059]"
            />
          </div>

          {/* Error Message if any */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl flex items-start gap-2.5 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{errorMessage}</p>
                <p className="text-[10px] text-rose-400/80 font-mono mt-0.5">
                  Verifica la connessione o prova a salvare con un testo più breve.
                </p>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[#1C1C1C] flex items-center justify-between">
            <div className="text-[11px] font-mono text-[#666] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Linking verso {existingResources.length} risorse del Vault</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs text-[#888] hover:text-white bg-[#141414] border border-[#262626]"
              >
                Annulla
              </button>

              <button
                onClick={handleProcessAndSave}
                disabled={!inputText.trim() || isProcessing}
                className="px-5 py-2 rounded-lg text-xs text-black bg-[#C5A059] hover:bg-[#D5B069] font-medium transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-[#C5A059]/15"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analisi OKF & Grafo...</span>
                  </>
                ) : success ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-900" />
                    <span>Salvato nel Grafo!</span>
                  </>
                ) : (
                  <>
                    <BrainCircuit className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Converti e Salva OKF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
