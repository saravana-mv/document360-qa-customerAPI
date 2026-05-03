import { useState, useRef, useEffect, useCallback } from "react";
import {
  sendFlowChatMessage,
  parseIdeaFromReply,
  isIdeaSaved,
  type ChatMessage,
  type ChatIdea,
} from "../../lib/api/flowChatApi";
import {
  listChatSessions,
  getChatSession,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  type ChatSessionSummary,
} from "../../lib/api/flowChatSessionsApi";
import { useAiCostStore } from "../../store/aiCost.store";
import { SpecFilePicker } from "./SpecFilePicker";
import { useIdeaFoldersStore } from "../../store/ideaFolders.store";
import { useEntraAuthStore } from "../../store/entraAuth.store";
import type { IdeaMode } from "../../lib/api/specFilesApi";
import { ChatInputCard } from "./ideas-chat/ChatInputCard";
import { ExampleButtons } from "./ideas-chat/ExampleButtons";
import { ChatHistorySidebar } from "./ideas-chat/ChatHistorySidebar";

interface IdeasChatPanelProps {
  aiModel?: string;
  onIdeaAccepted: (idea: ChatIdea, destinationFolder?: string) => void;
  onClose: () => void;
  currentFolder?: string;
  currentMode?: IdeaMode;
}

let messageCounter = 0;
function nextId(): string {
  return `icmsg-${Date.now()}-${++messageCounter}`;
}

export function IdeasChatPanel({ aiModel, onIdeaAccepted, onClose, currentFolder, currentMode }: IdeasChatPanelProps) {
  // Existing state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingIdea, setPendingIdea] = useState<ChatIdea | null>(null);
  const [specFiles, setSpecFiles] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [mode, setMode] = useState<IdeaMode>(currentMode ?? "full");
  const [destinationFolder, setDestinationFolder] = useState(currentFolder ?? "");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Chat history state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionDeleteId, setSessionDeleteId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const folders = useIdeaFoldersStore((s) => s.folders);
  const principal = useEntraAuthStore((s) => s.principal);
  const firstName = principal?.userDetails?.split(/[\s._-]/)[0] ?? "there";

  const noFiles = specFiles.length === 0;
  const noFolder = !destinationFolder;
  const folderOptions = buildFolderOptions(folders);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // ── Chat history helpers ──

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const list = await listChatSessions();
      setSessions(list);
    } catch {
      // silently fail
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const autoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const currentMessages = messages;
      const currentSessionId = sessionId;
      if (currentMessages.length === 0) return;

      const title = currentMessages.find((m) => m.role === "user")?.content.slice(0, 80) ?? "Untitled";
      const payload = {
        id: currentSessionId ?? crypto.randomUUID(),
        title,
        messages: currentMessages.map((m) => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
        totalCost: 0,
        specFiles,
      };

      if (!currentSessionId) {
        setSessionId(payload.id);
        createChatSession(payload).catch(() => {});
      } else {
        updateChatSession(payload).catch(() => {});
      }
    }, 1500);
  }, [messages, sessionId, specFiles]);

  useEffect(() => {
    if (messages.length > 0) autoSave();
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [messages, autoSave]);

  const loadSession = useCallback(async (id: string) => {
    try {
      const session = await getChatSession(id);
      setSessionId(session.id);
      setMessages(session.messages as ChatMessage[]);
      if (session.specFiles?.length) setSpecFiles(session.specFiles);
      setSidebarOpen(false);
    } catch {
      // silently fail
    }
  }, []);

  const startNewSession = useCallback(() => {
    if (messages.length > 0 && !window.confirm("Start a new conversation? Current progress will be saved.")) return;
    setSessionId(null);
    setMessages([]);
    setPendingIdea(null);
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }, [messages.length]);

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await deleteChatSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) {
        setSessionId(null);
        setMessages([]);
        setPendingIdea(null);
      }
    } catch {
      // silently fail
    }
    setSessionDeleteId(null);
  }, [sessionId]);

  useEffect(() => {
    if (sidebarOpen) void loadSessions();
  }, [sidebarOpen, loadSessions]);

  // ── Send logic ──

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || noFiles) return;

    // Prepend mode context
    let fullMessage = trimmed;
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
  }, [messages, loading, specFiles, aiModel, pendingIdea, onIdeaAccepted, noFiles, mode, destinationFolder]);

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

  function handleSendPrompt(prompt: string) {
    setInput(prompt);
    // Send on next tick so input is set
    setTimeout(() => void sendMessage(prompt), 0);
  }

  const hasConversation = messages.length > 0;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div
          className="w-[700px] max-w-[95vw] h-[80vh] max-h-[800px] bg-white rounded-xl shadow-xl border border-[#d1d9e0]/70 flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header — slim */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#d1d9e0] shrink-0">
            {/* Burger menu */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1 rounded-md hover:bg-[#f6f8fa] transition-colors text-[#656d76] hover:text-[#1f2328]"
              title="Chat history"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-[#1f2328]">Ideas Chat</h2>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="text-[#656d76] hover:text-[#1f2328] transition-colors p-1 rounded-md hover:bg-[#f6f8fa]"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Sidebar + content wrapper */}
          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Chat history sidebar */}
            {sidebarOpen && (
              <ChatHistorySidebar
                sessions={sessions}
                sessionsLoading={sessionsLoading}
                currentSessionId={sessionId}
                sessionDeleteId={sessionDeleteId}
                onLoadSession={(id) => void loadSession(id)}
                onNewSession={startNewSession}
                onDeleteSession={(id) => void handleDeleteSession(id)}
                onSetDeleteId={setSessionDeleteId}
              />
            )}

            {/* Main content column */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              {/* ── Welcome state (no messages) ── */}
              {!hasConversation && !loading ? (
                <div className="flex-1 flex flex-col items-center justify-center px-6">
                  {/* Sparkle icon */}
                  <div className="w-12 h-12 rounded-full bg-[#1a7f37]/10 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-[#1a7f37]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-[#1f2328] mb-1">Welcome {firstName}!</h2>
                  <p className="text-sm text-[#656d76] mb-6">Describe what you want to test and AI will suggest ideas.</p>

                  {/* Centered input card */}
                  <div className="w-full max-w-[560px] mb-5">
                    <ChatInputCard
                      input={input}
                      onInputChange={setInput}
                      onSend={() => void sendMessage(input)}
                      onKeyDown={handleKeyDown}
                      disabled={noFiles}
                      loading={loading}
                      specFileCount={specFiles.length}
                      noFiles={noFiles}
                      onOpenPicker={() => setShowPicker(true)}
                      mode={mode}
                      onModeChange={setMode}
                      destinationFolder={destinationFolder}
                      onFolderChange={setDestinationFolder}
                      folderOptions={folderOptions}
                      textareaRef={textareaRef}
                    />
                  </div>

                  {/* Example buttons */}
                  <ExampleButtons onSendPrompt={handleSendPrompt} />
                </div>
              ) : (
                <>
                  {/* ── Conversation state (messages exist) ── */}
                  <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
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

                    {/* Pending idea card — inline in message flow */}
                    {pendingIdea && (
                      <div className="p-3 rounded-lg border border-[#1a7f37]/30 bg-[#dafbe1]/50">
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

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Bottom input card */}
                  <div className="px-4 pb-3 pt-2 shrink-0">
                    <ChatInputCard
                      input={input}
                      onInputChange={setInput}
                      onSend={() => void sendMessage(input)}
                      onKeyDown={handleKeyDown}
                      disabled={noFiles}
                      loading={loading}
                      specFileCount={specFiles.length}
                      noFiles={noFiles}
                      onOpenPicker={() => setShowPicker(true)}
                      mode={mode}
                      onModeChange={setMode}
                      destinationFolder={destinationFolder}
                      onFolderChange={setDestinationFolder}
                      folderOptions={folderOptions}
                      textareaRef={textareaRef}
                      placeholder="Describe what you want to test..."
                    />
                  </div>
                </>
              )}
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

/** Build a flat list of folders with indented display names */
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
