import { useState, useRef, useEffect, useCallback } from "react";
import {
  sendFlowChatMessage,
  parsePlanFromReply,
  isConfirmation,
  type ChatMessage,
  type FlowPlan,
} from "../../lib/api/flowChatApi";
import { generateFlowXml } from "../../lib/api/flowApi";
import { FlowPlanTree } from "./FlowPlanTree";
import { useAiCostStore } from "../../store/aiCost.store";
import type { FlowUsage } from "../../lib/api/specFilesApi";

interface FlowChatPanelProps {
  specFiles: string[];
  aiModel?: string;
  onFlowGenerated: (title: string, xml: string, usage: FlowUsage | null) => void;
  onClose: () => void;
}

let messageCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

export function FlowChatPanel({ specFiles, aiModel, onFlowGenerated, onClose }: FlowChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmedPlan, setConfirmedPlan] = useState<FlowPlan | null>(null);
  const [generatingXml, setGeneratingXml] = useState(false);
  const [sessionCost, setSessionCost] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Find the latest plan from messages
  const latestPlan = [...messages].reverse().find((m) => m.plan)?.plan ?? null;

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: nextId(), role: "user", content: trimmed, timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Build API message array (just role + content)
      const apiMsgs = updatedMessages.map((m) => ({ role: m.role, content: m.content }));
      const result = await sendFlowChatMessage(apiMsgs, specFiles, aiModel, ctrl.signal);

      if (ctrl.signal.aborted) return;

      const plan = parsePlanFromReply(result.reply);
      const confirmed = isConfirmation(result.reply);

      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: result.reply,
        plan,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Track cost
      if (result.usage) {
        setSessionCost((prev) => parseFloat((prev + result.usage.costUsd).toFixed(6)));
        useAiCostStore.getState().addAdhocCost(result.usage.costUsd);
      }

      // If the AI confirmed, auto-trigger XML generation with the latest plan
      if (confirmed) {
        const planToUse = plan ?? latestPlan;
        if (planToUse) {
          setConfirmedPlan(planToUse);
          await generateXmlFromPlan(planToUse, [...updatedMessages, assistantMsg]);
        }
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
  }, [messages, loading, specFiles, aiModel, latestPlan]);

  async function generateXmlFromPlan(plan: FlowPlan, _chatHistory: ChatMessage[]) {
    setGeneratingXml(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Build a flow prompt from the confirmed plan
      const prompt = buildPromptFromPlan(plan);
      const result = await generateFlowXml(prompt, specFiles, aiModel, ctrl.signal);

      if (ctrl.signal.aborted) return;

      // Track cost
      if (result.usage) {
        setSessionCost((prev) => parseFloat((prev + result.usage!.costUsd).toFixed(6)));
        useAiCostStore.getState().addAdhocCost(result.usage!.costUsd);
      }

      // Show the generated XML as a message
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: `Flow XML generated successfully. Review below and click **Accept** to save it.`,
          timestamp: Date.now(),
        },
      ]);

      // Notify parent — they handle the flow creation
      onFlowGenerated(plan.name, result.xml, result.usage);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const errMsg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: `Failed to generate XML: ${errMsg}`, timestamp: Date.now() },
      ]);
    } finally {
      if (!ctrl.signal.aborted) {
        setGeneratingXml(false);
        setLoading(false);
      }
      abortRef.current = null;
    }
  }

  function handleConfirmPlan() {
    if (!latestPlan) return;
    setConfirmedPlan(latestPlan);
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: "Looks good, generate the flow XML.", timestamp: Date.now() },
    ]);
    void generateXmlFromPlan(latestPlan, messages);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <svg className="w-4 h-4 text-[#8250df] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
        </svg>
        <span className="text-sm font-semibold text-[#1f2328]">Flow Designer</span>
        {sessionCost > 0 && (
          <span className="text-[11px] text-[#656d76] ml-1">${sessionCost.toFixed(4)}</span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => {
            abortRef.current?.abort();
            onClose();
          }}
          className="text-xs text-[#656d76] hover:text-[#1f2328] px-1.5 py-0.5 rounded hover:bg-[#eef1f6] transition-colors"
        >
          Close
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-full bg-[#8250df]/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-[#8250df]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-[#1f2328] mb-1">Design a test flow</p>
            <p className="text-xs text-[#656d76] max-w-[260px] mx-auto leading-relaxed">
              Describe what you want to test. I'll propose a flow plan, ask clarifying questions, and generate the XML when you're ready.
            </p>
            <div className="mt-4 space-y-1.5 text-xs text-[#656d76]">
              <p className="font-medium text-[#1f2328]">Try something like:</p>
              <button
                onClick={() => setInput("Create a flow to test creating a category, creating an article, updating the article title, then tear down")}
                className="block mx-auto text-[#0969da] hover:underline"
              >
                "Create, update, and teardown an article"
              </button>
              <button
                onClick={() => setInput("Test article SEO settings — create article, set SEO metadata, verify it, clean up")}
                className="block mx-auto text-[#0969da] hover:underline"
              >
                "Test article SEO settings lifecycle"
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
              msg.role === "user"
                ? "bg-[#0969da] text-white"
                : "bg-[#f6f8fa] border border-[#d1d9e0] text-[#1f2328]"
            }`}>
              {msg.role === "assistant" ? (
                <div className="text-sm leading-relaxed">
                  {renderAssistantContent(msg.content)}
                  {msg.plan && <FlowPlanTree plan={msg.plan} />}
                </div>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {(loading || generatingXml) && (
          <div className="flex justify-start">
            <div className="bg-[#f6f8fa] border border-[#d1d9e0] rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-[#656d76]">
                <svg className="w-3.5 h-3.5 animate-spin text-[#8250df]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {generatingXml ? "Generating flow XML…" : "Thinking…"}
              </div>
            </div>
          </div>
        )}

        {/* Confirm plan button — show when we have a plan but haven't confirmed yet */}
        {latestPlan && !confirmedPlan && !loading && !generatingXml && (
          <div className="flex justify-center py-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleConfirmPlan}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 border border-[#1a7f37]/80 rounded-md px-3 py-1.5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Generate flow XML
              </button>
              <span className="text-xs text-[#656d76]">or continue the conversation to refine the plan</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!generatingXml && (
        <div className="px-3 py-2 border-t border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={1}
              placeholder={messages.length === 0 ? "Describe the test flow you want to create…" : "Type a message…"}
              className="flex-1 text-sm border border-[#d1d9e0] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] resize-none leading-relaxed disabled:opacity-50 min-h-[36px] max-h-[120px]"
              style={{ height: "auto", overflow: "hidden" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={() => void sendMessage(input)}
              disabled={!input.trim() || loading}
              className="shrink-0 text-white bg-[#0969da] hover:bg-[#0860ca] rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-[#8b949e] mt-1">
            Press Enter to send · Shift+Enter for new line
            {specFiles.length > 0 && ` · ${specFiles.length} spec file${specFiles.length !== 1 ? "s" : ""} in context`}
          </p>
        </div>
      )}
    </div>
  );
}

/** Render assistant message content — strip flowplan blocks and render markdown-like text */
function renderAssistantContent(content: string): React.ReactNode[] {
  // Split by flowplan blocks
  const parts = content.split(/```flowplan\s*\n[\s\S]*?\n```/);
  return parts.map((part, i) => {
    const trimmed = part.trim();
    if (!trimmed) return null;
    // Simple markdown rendering — bold and newlines
    const segments = trimmed.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="whitespace-pre-wrap">
        {segments.map((seg, j) => {
          if (seg.startsWith("**") && seg.endsWith("**")) {
            return <strong key={j}>{seg.slice(2, -2)}</strong>;
          }
          return seg;
        })}
      </p>
    );
  }).filter(Boolean) as React.ReactNode[];
}

/** Build a prompt for XML generation from a confirmed plan */
function buildPromptFromPlan(plan: FlowPlan): string {
  const steps = plan.steps
    .map((s) => {
      let line = `  ${s.number}. ${s.method} ${s.path} — ${s.name}`;
      if (s.captures.length > 0) line += `\n     Captures: ${s.captures.join(", ")}`;
      if (s.assertions.length > 0) line += `\n     Assert: ${s.assertions.join(", ")}`;
      if (s.flags.length > 0) line += `\n     Flags: ${s.flags.join(", ")}`;
      return line;
    })
    .join("\n");

  return `Title: ${plan.name}
Description: ${plan.description}
Entities: ${plan.entity}

Steps:
${steps}

Generate the complete flow XML following the schema exactly. Include all captures, assertions, and flags as specified in the plan above.`;
}
