import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import type { FlowUsage, SpecFileItem } from "../../lib/api/specFilesApi";

interface FlowChatPanelProps {
  specFiles: string[];
  allSpecFiles?: SpecFileItem[];
  aiModel?: string;
  onFlowGenerated: (title: string, xml: string, usage: FlowUsage | null) => void;
  onClose: () => void;
}

let messageCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

/** Build a flat list of @ mention suggestions from spec files */
interface MentionItem {
  type: "file" | "folder";
  label: string;
  path: string;
}

function buildMentionItems(files: SpecFileItem[]): MentionItem[] {
  const items: MentionItem[] = [];
  const folderSet = new Set<string>();

  for (const f of files) {
    // Skip metadata files
    if (f.name.endsWith("/_sources.json") || f.name.includes("/_versions/") || f.name.endsWith("/.keep")) continue;

    // Collect folders
    const parts = f.name.split("/");
    let prefix = "";
    for (let i = 0; i < parts.length - 1; i++) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      folderSet.add(prefix);
    }

    // Add file (only .md files)
    if (f.name.endsWith(".md")) {
      items.push({ type: "file", label: f.name, path: f.name });
    }
  }

  // Add folders
  for (const folder of folderSet) {
    items.push({ type: "folder", label: folder + "/", path: folder });
  }

  // Sort: folders first, then files, alphabetically
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return items;
}

/** Resolve a mention to a list of .md file paths */
function resolveMention(item: MentionItem, allFiles: SpecFileItem[]): string[] {
  if (item.type === "file") return [item.path];
  const prefix = item.path.endsWith("/") ? item.path : `${item.path}/`;
  return allFiles
    .filter((f) => f.name.startsWith(prefix) && f.name.endsWith(".md") && !f.name.includes("/_versions/") && !f.name.endsWith("/_sources.json"))
    .map((f) => f.name);
}

export function FlowChatPanel({ specFiles, allSpecFiles, aiModel, onFlowGenerated, onClose }: FlowChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmedPlan, setConfirmedPlan] = useState<FlowPlan | null>(null);
  const [generatingXml, setGeneratingXml] = useState(false);
  const [sessionCost, setSessionCost] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // @ mention state
  const [referencedSpecs, setReferencedSpecs] = useState<MentionItem[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);

  const mentionItems = useMemo(() => buildMentionItems(allSpecFiles ?? []), [allSpecFiles]);

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionItems.filter((m) => m.label.toLowerCase().includes(q)).slice(0, 12);
  }, [mentionQuery, mentionItems]);

  // Resolve referenced specs to actual file paths
  const effectiveSpecFiles = useMemo(() => {
    if (referencedSpecs.length === 0) return specFiles;
    const files = referencedSpecs.flatMap((item) => resolveMention(item, allSpecFiles ?? []));
    const unique = [...new Set(files)];
    return unique;
  }, [referencedSpecs, specFiles, allSpecFiles]);

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
      const result = await sendFlowChatMessage(apiMsgs, effectiveSpecFiles, aiModel, ctrl.signal);

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
  }, [messages, loading, effectiveSpecFiles, aiModel, latestPlan]);

  async function generateXmlFromPlan(plan: FlowPlan, _chatHistory: ChatMessage[]) {
    setGeneratingXml(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Build a flow prompt from the confirmed plan
      const prompt = buildPromptFromPlan(plan);
      const result = await generateFlowXml(prompt, effectiveSpecFiles, aiModel, ctrl.signal);

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

  function handleSelectMention(item: MentionItem) {
    // Replace the @query in the input with nothing (mention goes to chips)
    if (mentionQuery !== null) {
      const atIdx = input.lastIndexOf("@");
      if (atIdx !== -1) {
        setInput(input.slice(0, atIdx) + input.slice(atIdx + 1 + mentionQuery.length));
      }
    }
    setMentionQuery(null);
    setMentionIndex(0);
    // Add to referenced specs if not already there
    if (!referencedSpecs.some((r) => r.path === item.path)) {
      setReferencedSpecs((prev) => [...prev, item]);
    }
    inputRef.current?.focus();
  }

  function removeMention(path: string) {
    setReferencedSpecs((prev) => prev.filter((r) => r.path !== path));
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);

    // Detect @ mention query
    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const atIdx = textBeforeCursor.lastIndexOf("@");
    if (atIdx !== -1 && (atIdx === 0 || /\s/.test(textBeforeCursor[atIdx - 1]))) {
      const query = textBeforeCursor.slice(atIdx + 1);
      // Only trigger if no space in query (single token)
      if (!/\s/.test(query)) {
        setMentionQuery(query);
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Mention dropdown navigation
    if (mentionQuery !== null && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelectMention(filteredMentions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

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
          {/* Referenced spec chips */}
          {referencedSpecs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {referencedSpecs.map((item) => (
                <span
                  key={item.path}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-[#ddf4ff] text-[#0969da] border border-[#b6e3ff]"
                >
                  {item.type === "folder" ? (
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  )}
                  <span className="truncate max-w-[180px]">{item.label}</span>
                  <button
                    onClick={() => removeMention(item.path)}
                    className="hover:text-[#d1242f] transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={1}
                placeholder={messages.length === 0 ? "Describe the test flow you want to create…" : "Type a message… Use @ to reference spec files"}
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

            {/* @ mention dropdown */}
            {mentionQuery !== null && filteredMentions.length > 0 && (
              <div
                ref={mentionDropdownRef}
                className="absolute bottom-full left-0 mb-1 w-full max-h-[200px] overflow-y-auto bg-white border border-[#d1d9e0] rounded-md shadow-lg z-20"
              >
                {filteredMentions.map((item, idx) => (
                  <button
                    key={item.path}
                    onClick={() => handleSelectMention(item)}
                    onMouseEnter={() => setMentionIndex(idx)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
                      idx === mentionIndex ? "bg-[#ddf4ff] text-[#0969da]" : "text-[#1f2328] hover:bg-[#f6f8fa]"
                    }`}
                  >
                    {item.type === "folder" ? (
                      <svg className="w-4 h-4 text-[#54aeff] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                    )}
                    <span className="truncate">{item.label}</span>
                    {item.type === "folder" && (
                      <span className="text-[10px] text-[#8b949e] ml-auto shrink-0">folder</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {mentionQuery !== null && filteredMentions.length === 0 && mentionQuery.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-full bg-white border border-[#d1d9e0] rounded-md shadow-lg z-20 px-3 py-2">
                <p className="text-xs text-[#656d76]">No matching spec files found</p>
              </div>
            )}
          </div>

          <p className="text-[10px] text-[#8b949e] mt-1">
            Press Enter to send · Shift+Enter for new line · Use <span className="font-semibold text-[#0969da]">@</span> to reference spec files
            {effectiveSpecFiles.length > 0 && ` · ${effectiveSpecFiles.length} spec file${effectiveSpecFiles.length !== 1 ? "s" : ""} in context`}
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
