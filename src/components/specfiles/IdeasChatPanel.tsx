import { useState, useRef, useEffect, useCallback } from "react";
import {
  sendFlowChatMessage,
  parseIdeaFromReply,
  isIdeaSaved,
  type ChatMessage,
  type ChatIdea,
} from "../../lib/api/flowChatApi";
import { useAiCostStore } from "../../store/aiCost.store";
import { SpecFilePicker } from "./SpecFilePicker";
import { IDEA_TEMPLATES } from "../../lib/ideaTemplates";
import { chipIcon } from "./GenerateIdeasModal";
import { useIdeaFoldersStore } from "../../store/ideaFolders.store";
import type { IdeaMode } from "../../lib/api/specFilesApi";

interface IdeasChatPanelProps {
  aiModel?: string;
  onIdeaAccepted: (idea: ChatIdea, destinationFolder?: string) => void;
  onClose: () => void;
  currentFolder?: string;
  currentMode?: IdeaMode;
}

const MODE_LABELS: Record<IdeaMode, string> = {
  full: "Full lifecycle",
  "no-prereqs": "Partial",
  "no-prereqs-no-teardown": "Minimal",
};

const MODE_DESCRIPTIONS: Record<IdeaMode, string> = {
  full: "Creates prerequisites, runs tests, tears down everything",
  "no-prereqs": "Uses {{proj.*}} variables for prerequisites, includes teardown",
  "no-prereqs-no-teardown": "No prerequisites, no teardown — quick smoke tests",
};

const MODES: IdeaMode[] = ["full", "no-prereqs", "no-prereqs-no-teardown"];

let messageCounter = 0;
function nextId(): string {
  return `icmsg-${Date.now()}-${++messageCounter}`;
}

export function IdeasChatPanel({ aiModel, onIdeaAccepted, onClose, currentFolder, currentMode }: IdeasChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingIdea, setPendingIdea] = useState<ChatIdea | null>(null);
  const [specFiles, setSpecFiles] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [mode, setMode] = useState<IdeaMode>(currentMode ?? "full");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [destinationFolder, setDestinationFolder] = useState(currentFolder ?? "");
  const [showSettings, setShowSettings] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const folders = useIdeaFoldersStore((s) => s.folders);

  const noFiles = specFiles.length === 0;
  const noFolder = !destinationFolder;

  // Build folder options
  const folderOptions = buildFolderOptions(folders);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || noFiles) return;

    // Prepend pattern focus if a template is selected
    let fullMessage = trimmed;
    if (selectedTemplate) {
      const template = IDEA_TEMPLATES.find((t) => t.key === selectedTemplate);
      if (template && template.prompt !== "__random__") {
        fullMessage = `[Focus: ${template.label}] ${trimmed}`;
      }
    }

    // Prepend mode context
    if (mode !== "full") {
      const modeLabel = mode === "no-prereqs" ? "No Prerequisites (with teardown)" : "Minimal (no prerequisites, no teardown)";
      fullMessage = `[Mode: ${modeLabel}] ${fullMessage}`;
    }

    const userMsg: ChatMessage = { id: nextId(), role: "user", content: trimmed, timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setPendingIdea(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Send with the enriched message but display the original
      const apiMsgs = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: fullMessage },
      ];
      const result = await sendFlowChatMessage(apiMsgs, specFiles, aiModel, ctrl.signal, "idea");

      if (ctrl.signal.aborted) return;

      const idea = parseIdeaFromReply(result.reply);
      const saved = isIdeaSaved(result.reply);

      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: result.reply,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (result.usage) {
        useAiCostStore.getState().addAdhocCost(result.usage.costUsd);
      }

      if (idea) {
        setPendingIdea(idea);
      }

      if (saved && pendingIdea) {
        onIdeaAccepted(pendingIdea, destinationFolder || undefined);
        setPendingIdea(null);
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const errMsg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: `Error: ${errMsg}`, timestamp: Date.now() },
      ]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
      abortRef.current = null;
    }
  }, [messages, loading, specFiles, aiModel, pendingIdea, onIdeaAccepted, noFiles, selectedTemplate, mode, destinationFolder]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  function handleAcceptIdea() {
    if (pendingIdea) {
      onIdeaAccepted(pendingIdea, destinationFolder || undefined);
      setPendingIdea(null);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: "Idea added to your collection.", timestamp: Date.now() },
      ]);
    }
  }

  // Clean up on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div
          className="w-[600px] max-w-[92vw] h-[70vh] max-h-[700px] bg-white rounded-xl shadow-xl border border-[#d1d9e0]/70 flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#d1d9e0] shrink-0">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
              <h2 className="text-sm font-semibold text-[#1f2328]">Ideas Chat</h2>
              {/* Spec file picker button */}
              <button
                onClick={() => setShowPicker(true)}
                className={`inline-flex items-center gap-1 text-sm font-medium rounded-md px-2 py-1 transition-colors ${
                  noFiles
                    ? "text-[#d1242f] bg-[#ffebe9] hover:bg-[#ffcecb]"
                    : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa]"
                }`}
                title="Select spec files"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                {noFiles ? "Select files" : `${specFiles.length} file${specFiles.length !== 1 ? "s" : ""}`}
              </button>
            </div>
            <div className="flex items-center gap-1">
              {/* Toggle settings panel */}
              <button
                onClick={() => setShowSettings((s) => !s)}
                className={`p-1 rounded-md transition-colors ${
                  showSettings
                    ? "text-[#1f2328] bg-[#f6f8fa]"
                    : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa]"
                }`}
                title={showSettings ? "Hide settings" : "Show settings"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="text-[#656d76] hover:text-[#1f2328] transition-colors p-1 -mr-1 rounded-md hover:bg-[#f6f8fa]"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Collapsible settings panel */}
          {showSettings && (
            <div className="px-5 py-3 border-b border-[#d1d9e0] bg-[#f6f8fa] space-y-3 shrink-0">
              {/* Destination folder + Mode row */}
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium text-[#656d76] mb-1 block">Destination</label>
                  <div className="relative">
                    <select
                      value={destinationFolder}
                      onChange={(e) => setDestinationFolder(e.target.value)}
                      className={`w-full appearance-none text-sm bg-white hover:bg-[#eef1f6] border rounded-lg pl-7 pr-7 py-1.5 outline-none cursor-pointer transition-colors ${
                        noFolder
                          ? "border-[#d1242f]/40 text-[#d1242f]"
                          : "border-[#d1d9e0] text-[#1f2328]"
                      }`}
                    >
                      <option value="">Select folder...</option>
                      {folderOptions.map((f) => (
                        <option key={f.path} value={f.path}>{f.display}</option>
                      ))}
                    </select>
                    <svg className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#656d76] pointer-events-none" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
                    </svg>
                    <svg className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#656d76] pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>
                <div className="w-36 shrink-0">
                  <label className="text-sm font-medium text-[#656d76] mb-1 block">Mode</label>
                  <div className="relative">
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as IdeaMode)}
                      className="w-full appearance-none text-sm text-[#1f2328] bg-white hover:bg-[#eef1f6] border border-[#d1d9e0] rounded-lg pl-3 pr-7 py-1.5 outline-none cursor-pointer transition-colors"
                      title={MODE_DESCRIPTIONS[mode]}
                    >
                      {MODES.map(m => (
                        <option key={m} value={m}>{MODE_LABELS[m]}</option>
                      ))}
                    </select>
                    <svg className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#656d76] pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Pattern chips */}
              <div>
                <label className="text-sm font-medium text-[#656d76] mb-1 block">Pattern</label>
                <div className="flex flex-wrap gap-1">
                  {IDEA_TEMPLATES.filter((t) => t.key !== "random").map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setSelectedTemplate(selectedTemplate === t.key ? null : t.key)}
                      className={`inline-flex items-center gap-1 text-sm font-medium pl-1.5 pr-2 py-1 rounded-full border transition-all ${
                        selectedTemplate === t.key
                          ? "bg-[#1f2328] text-white border-[#1f2328] shadow-sm"
                          : "bg-white text-[#656d76] border-[#d1d9e0]/70 hover:border-[#afb8c1] hover:text-[#1f2328]"
                      }`}
                      title={t.prompt}
                    >
                      <span className={selectedTemplate === t.key ? "opacity-80" : "opacity-60"}>{chipIcon(t.key, selectedTemplate === t.key)}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="text-center py-8 space-y-2">
                {noFiles ? (
                  <p className="text-sm text-[#656d76]">Select spec files to get started.</p>
                ) : (
                  <>
                    <p className="text-sm text-[#656d76]">Describe what you want to test and AI will suggest ideas.</p>
                    <div className="flex flex-wrap gap-2 justify-center mt-3">
                      {["CRUD lifecycle tests", "Error handling scenarios", "Cross-entity dependencies"].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => void sendMessage(suggestion)}
                          className="text-sm text-[#656d76] bg-[#f6f8fa] hover:bg-[#eef1f6] border border-[#d1d9e0]/70 px-2.5 py-1 rounded-full transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-[#1f2328] text-white"
                    : "bg-[#f6f8fa] text-[#1f2328] border border-[#d1d9e0]/50"
                }`}>
                  <MessageContent content={msg.content} />
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#f6f8fa] border border-[#d1d9e0]/50 rounded-lg px-3 py-2 text-sm text-[#656d76]">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Pending idea card */}
          {pendingIdea && (
            <div className="mx-5 mb-2 p-3 rounded-lg border border-[#1a7f37]/30 bg-[#dafbe1]/50">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1f2328] truncate">{pendingIdea.title}</p>
                  <p className="text-sm text-[#656d76] mt-0.5 line-clamp-2">{pendingIdea.description}</p>
                </div>
                <button
                  onClick={handleAcceptIdea}
                  disabled={noFolder}
                  className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] disabled:bg-[#d1d9e0] disabled:cursor-not-allowed px-2.5 py-1.5 rounded-md transition-colors"
                  title={noFolder ? "Select a destination folder first" : "Add idea to collection"}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Add idea
                </button>
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="px-5 pb-4 pt-2 border-t border-[#d1d9e0] shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={noFiles ? "Select spec files first..." : "Describe what you want to test..."}
                disabled={noFiles}
                rows={2}
                className="flex-1 text-sm px-3 py-2 border border-[#d1d9e0] rounded-lg outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]/30 resize-none text-[#1f2328] placeholder:text-[#afb8c1] disabled:bg-[#f6f8fa] disabled:cursor-not-allowed"
              />
              <button
                onClick={() => void sendMessage(input)}
                disabled={!input.trim() || loading || noFiles}
                className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#1f2328] hover:bg-[#1f2328]/85 disabled:bg-[#d1d9e0] text-white transition-colors"
                title={noFiles ? "Select spec files first" : "Send (Enter)"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Spec file picker sub-modal */}
      {showPicker && (
        <SpecFilePicker
          currentPaths={specFiles}
          onSave={setSpecFiles}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}

/** Render message content — strips ```idea blocks and renders inline */
function MessageContent({ content }: { content: string }) {
  // Strip idea JSON blocks for cleaner display
  const cleaned = content.replace(/```idea\s*\n[\s\S]*?\n```/g, "").trim();
  if (!cleaned) return <span className="text-[#656d76] italic">Idea proposed above.</span>;

  return (
    <div className="whitespace-pre-wrap break-words">
      {cleaned.split("\n").map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line.startsWith("**") && line.endsWith("**")
            ? <strong>{line.slice(2, -2)}</strong>
            : line}
        </span>
      ))}
    </div>
  );
}

/** Build a flat list of folders with indented display names for a <select> */
function buildFolderOptions(folders: { path: string; name: string; parentPath: string | null; order: number }[]): { path: string; display: string }[] {
  const result: { path: string; display: string }[] = [];
  const childMap = new Map<string | null, typeof folders>();
  for (const f of folders) {
    const key = f.parentPath ?? null;
    if (!childMap.has(key)) childMap.set(key, []);
    childMap.get(key)!.push(f);
  }
  for (const children of childMap.values()) {
    children.sort((a, b) => a.order - b.order);
  }
  function walk(parentPath: string | null, depth: number) {
    const children = childMap.get(parentPath) ?? [];
    for (const child of children) {
      const indent = "\u00A0\u00A0".repeat(depth);
      result.push({ path: child.path, display: `${indent}${child.name}` });
      walk(child.path, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}
