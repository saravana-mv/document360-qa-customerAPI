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

interface IdeasChatPanelProps {
  aiModel?: string;
  onIdeaAccepted: (idea: ChatIdea) => void;
  onClose: () => void;
}

let messageCounter = 0;
function nextId(): string {
  return `icmsg-${Date.now()}-${++messageCounter}`;
}

export function IdeasChatPanel({ aiModel, onIdeaAccepted, onClose }: IdeasChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingIdea, setPendingIdea] = useState<ChatIdea | null>(null);
  const [specFiles, setSpecFiles] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const noFiles = specFiles.length === 0;

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

    const userMsg: ChatMessage = { id: nextId(), role: "user", content: trimmed, timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setPendingIdea(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const apiMsgs = updatedMessages.map((m) => ({ role: m.role, content: m.content }));
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
        onIdeaAccepted(pendingIdea);
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
  }, [messages, loading, specFiles, aiModel, pendingIdea, onIdeaAccepted, noFiles]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  function handleAcceptIdea() {
    if (pendingIdea) {
      onIdeaAccepted(pendingIdea);
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div
          className="w-[600px] max-w-[92vw] h-[70vh] max-h-[700px] bg-white rounded-xl shadow-xl border border-[#d1d9e0]/70 flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#d1d9e0] shrink-0">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
              <h2 className="text-sm font-semibold text-[#1f2328]">Ideas Chat</h2>
              {/* Spec file picker button */}
              <button
                onClick={() => setShowPicker(true)}
                className={`inline-flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 transition-colors ${
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
                          className="text-xs text-[#0969da] bg-[#ddf4ff] hover:bg-[#b6e3ff] px-2.5 py-1 rounded-full transition-colors"
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
                    ? "bg-[#0969da] text-white"
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
                  <p className="text-xs text-[#656d76] mt-0.5 line-clamp-2">{pendingIdea.description}</p>
                </div>
                <button
                  onClick={handleAcceptIdea}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 px-2.5 py-1.5 rounded-md transition-colors"
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
