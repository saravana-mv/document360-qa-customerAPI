import { useCallback, useMemo, useRef, useState, lazy, Suspense } from "react";
import type { FlowIdea } from "../../lib/api/specFilesApi";
import type { GeneratedFlow } from "./FlowsPanel";
import { buildFlowPrompt } from "../../lib/flow/buildPrompt";
import { XmlCodeBlock } from "../common/XmlCodeBlock";
import { XmlDiffView } from "../common/XmlDiffView";
import { editFlowXml } from "../../lib/api/flowApi";
import { validateFlowXml } from "../../lib/tests/flowXml/validate";
import { useSetupStore } from "../../store/setup.store";
import { useAiCostStore } from "../../store/aiCost.store";

const XmlEditor = lazy(() => import("../common/XmlEditor").then(m => ({ default: m.XmlEditor })));

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: "bg-[#dafbe1] text-[#1a7f37] border-[#aceebb]",
  moderate: "bg-[#fff8c5] text-[#9a6700] border-[#f5e0a0]",
  complex: "bg-[#ffebe9] text-[#d1242f] border-[#ffcecb]",
};

interface Props {
  selectedIdea: FlowIdea | null;
  selectedFlow: GeneratedFlow | null;
  /** The idea that corresponds to selectedFlow (looked up via ideaId). */
  flowIdea?: FlowIdea | null;
  onDownloadFlow?: (flow: GeneratedFlow) => void;
  /** Generate flow for the currently selected idea */
  onGenerateFlow?: (ideaId: string) => void;
  /** Whether flow generation is currently in progress */
  generatingFlows?: boolean;
  /** Whether the selected flow already has tests created */
  isFlowMarked?: boolean;
  /** Create tests from the selected flow */
  onCreateTest?: (flow: GeneratedFlow) => void;
  /** Whether a "create test" operation is in progress */
  creatingTest?: boolean;
  /** Called when the flow XML is edited (manual or AI) */
  onUpdateFlowXml?: (ideaId: string, xml: string) => void;
  /** Whether the flow is locked (prevents editing) */
  isFlowLocked?: boolean;
  /** Tooltip for the lock icon */
  flowLockTooltip?: string;
  /** Whether the current user can unlock */
  canUnlockFlow?: boolean;
  /** Called when the user clicks the lock icon to unlock */
  onUnlockFlow?: () => void;
}

type FlowTab = "idea" | "flow-xml";

// ── Idea content (reused in both standalone and tabbed views) ──────────────

function IdeaContent({ idea }: { idea: FlowIdea }) {
  const [promptCopied, setPromptCopied] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {/* Title & description */}
      <div>
        <h3 className="text-sm font-semibold text-[#1f2328]">{idea.title}</h3>
        <p className="text-sm text-[#656d76] mt-1.5 leading-relaxed">{idea.description}</p>
      </div>

      {/* Entities */}
      {idea.entities.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-[#656d76] uppercase tracking-wider mb-2">Entities</h4>
          <div className="flex items-center gap-1.5 flex-wrap">
            {idea.entities.map((e) => (
              <span key={e} className="text-[11px] px-2 py-0.5 rounded-full bg-[#ddf4ff] text-[#0969da] font-medium border border-[#b6e3ff]">{e}</span>
            ))}
          </div>
        </div>
      )}

      {/* Steps */}
      <div>
        <h4 className="text-[11px] font-semibold text-[#656d76] uppercase tracking-wider mb-2">Steps</h4>
        <ol className="space-y-2">
          {idea.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-[#1f2328]">
              <span className="w-5 h-5 rounded-full bg-[#eef1f6] text-[#656d76] flex items-center justify-center text-[11px] font-medium shrink-0 mt-0.5 border border-[#d1d9e0]">
                {i + 1}
              </span>
              <code className="font-mono text-[12px] leading-relaxed text-[#1f2328]">{step}</code>
            </li>
          ))}
        </ol>
      </div>

      {/* Flow-generation prompt */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-semibold text-[#656d76] uppercase tracking-wider">Prompt (Flow generation)</h4>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(buildFlowPrompt(idea));
                setPromptCopied(true);
                setTimeout(() => setPromptCopied(false), 1500);
              } catch { /* ignore */ }
            }}
            title="Copy prompt"
            className="flex items-center gap-1 text-xs text-[#656d76] hover:text-[#0969da] rounded-md px-1.5 py-0.5 hover:bg-[#ddf4ff] transition-colors"
          >
            {promptCopied ? (
              <>
                <svg className="w-3.5 h-3.5 text-[#1a7f37]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-[#1a7f37]">Copied</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <pre className="text-sm font-mono text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md p-3 whitespace-pre-wrap leading-relaxed">{buildFlowPrompt(idea)}</pre>
        <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-md bg-[#ddf4ff] border border-[#b6e3ff]">
          <svg className="w-4 h-4 text-[#0969da] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          <span className="text-xs text-[#0969da] leading-relaxed">
            When Flow XML is generated, the engine will add dependent setup/teardown steps (e.g. creating required parent resources referenced by foreign-key fields like <code className="font-mono bg-[#0969da]/10 px-1 rounded">category_id</code>).
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Small shared components ─────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      title={copied ? "Copied!" : "Copy"}
      className="shrink-0 text-[#afb8c1] hover:text-[#656d76] transition-colors"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-[#1a7f37]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
        </svg>
      )}
    </button>
  );
}


// ── Flow XML content with manual + AI edit ─────────────────────────────────

type EditMode = "view" | "manual" | "ai-prompt" | "ai-loading" | "ai-review";

function FlowXmlContent({ flow, validation, onUpdateXml, isLocked, lockTooltip, canUnlock, onUnlock }: {
  flow: GeneratedFlow;
  validation: ReturnType<typeof validateFlowXml> | null;
  onUpdateXml?: (xml: string) => void;
  isLocked?: boolean;
  lockTooltip?: string;
  canUnlock?: boolean;
  onUnlock?: () => void;
}) {
  const [editMode, setEditMode] = useState<EditMode>("view");
  const [draft, setDraft] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI Edit state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCost, setAiCost] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const aiModel = useSetupStore((s) => s.aiModel);

  const xmlContent = flow.xml;

  // ── Manual edit handlers ──────────────────────────────────────────────────

  function handleStartManualEdit() {
    if (!xmlContent) return;
    setDraft(xmlContent);
    setEditMode("manual");
    setValidationError(null);
    setSaveSuccess(false);
  }

  function handleCancelEdit() {
    setEditMode("view");
    setValidationError(null);
    setAiResult(null);
    setAiError(null);
    setAiCost(null);
    setAiPrompt("");
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
  }

  function handleSave(content?: string) {
    const toSave = content ?? draft;
    const result = validateFlowXml(toSave);
    if (!result.ok) {
      setValidationError(result.error ?? "Invalid XML");
      return;
    }
    setValidationError(null);
    onUpdateXml?.(toSave);
    setEditMode("view");
    setAiResult(null);
    setAiError(null);
    setAiCost(null);
    setAiPrompt("");
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  // ── AI Edit handlers ──────────────────────────────────────────────────────

  function handleStartAiEdit() {
    if (!xmlContent) return;
    setEditMode("ai-prompt");
    setAiPrompt("");
    setAiResult(null);
    setAiError(null);
    setAiCost(null);
    setValidationError(null);
    setSaveSuccess(false);
    setTimeout(() => promptRef.current?.focus(), 50);
  }

  const handleAiGenerate = useCallback(async () => {
    if (!xmlContent || !aiPrompt.trim()) return;
    setEditMode("ai-loading");
    setAiError(null);
    setAiCost(null);
    setValidationError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await editFlowXml(xmlContent, aiPrompt.trim(), aiModel, controller.signal);
      if (controller.signal.aborted) return;
      setAiResult(result.xml);
      setDraft(result.xml);
      if (result.usage) {
        setAiCost(`$${result.usage.costUsd.toFixed(4)} (${result.usage.totalTokens.toLocaleString()} tokens)`);
        useAiCostStore.getState().addAdhocCost(result.usage.costUsd);
      }
      setEditMode("ai-review");
    } catch (err) {
      if (controller.signal.aborted) return;
      setAiError(err instanceof Error ? err.message : String(err));
      setEditMode("ai-prompt");
    } finally {
      abortRef.current = null;
    }
  }, [xmlContent, aiPrompt, aiModel]);

  function handleAiAccept() {
    if (!aiResult) return;
    handleSave(aiResult);
  }

  function handleAiEditManually() {
    if (!aiResult) return;
    setDraft(aiResult);
    setEditMode("manual");
    setAiResult(null);
    setAiCost(null);
  }

  function handleAiRetry() {
    setAiResult(null);
    setEditMode("ai-prompt");
    setTimeout(() => promptRef.current?.focus(), 50);
  }

  // ── Non-done states ────────────────────────────────────────────────────────

  if (flow.status !== "done") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        {flow.status === "generating" && (
          <div className="flex items-center gap-2 py-8 justify-center">
            <svg className="w-5 h-5 text-[#0969da] animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-[#656d76]">Generating XML...</span>
          </div>
        )}
        {flow.status === "pending" && (
          <p className="text-sm text-[#656d76] text-center py-8">Waiting to generate...</p>
        )}
        {flow.status === "error" && (
          <div className="bg-[#ffebe9] border border-[#ffcecb] rounded-md p-3">
            <p className="text-sm text-[#d1242f]">{flow.error}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Render (done state with edit modes) ─────────────────────────────────

  const isView = editMode === "view";
  const isManual = editMode === "manual";
  const isAiPrompt = editMode === "ai-prompt";
  const isAiLoading = editMode === "ai-loading";
  const isAiReview = editMode === "ai-review";

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-2">
      {/* Header row with edit buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-mono text-[#656d76] flex-1 truncate">{flow.title}</span>

        {/* View mode — show edit buttons (disabled when locked) */}
        {isView && (
          <>
            <CopyButton value={xmlContent} />
            {isLocked && (
              canUnlock && onUnlock ? (
                <button
                  onClick={onUnlock}
                  title={lockTooltip}
                  className="shrink-0 text-[#bf8700] hover:text-[#953800] rounded-md p-1 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 4a2.5 2.5 0 1 0-5 0v2h5Z" clipRule="evenodd" />
                  </svg>
                </button>
              ) : (
                <span title={lockTooltip} className="shrink-0 text-[#bf8700] p-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 4a2.5 2.5 0 1 0-5 0v2h5Z" clipRule="evenodd" />
                  </svg>
                </span>
              )
            )}
            <button
              onClick={handleStartManualEdit}
              disabled={isLocked}
              title={isLocked ? lockTooltip : "Manual edit"}
              className="shrink-0 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] rounded-md p-1 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
            </button>
            <button
              onClick={handleStartAiEdit}
              disabled={isLocked}
              title={isLocked ? lockTooltip : "AI Edit"}
              className="shrink-0 text-[#656d76] hover:text-[#8250df] hover:bg-[#fbefff] rounded-md p-1 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
            </button>
          </>
        )}

        {/* Manual edit mode — cancel + save */}
        {isManual && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCancelEdit}
              className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSave()}
              className="text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] rounded-md px-2.5 py-1 transition-colors"
            >
              Validate & Save
            </button>
          </div>
        )}

        {/* AI prompt / loading mode — cancel */}
        {(isAiPrompt || isAiLoading) && (
          <button
            onClick={handleCancelEdit}
            className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] transition-colors"
          >
            Cancel
          </button>
        )}

        {/* AI review mode — discard, retry, edit manually, accept */}
        {isAiReview && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCancelEdit}
              className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleAiRetry}
              className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] transition-colors"
            >
              Retry
            </button>
            <button
              onClick={handleAiEditManually}
              className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] transition-colors"
            >
              Edit manually
            </button>
            <button
              onClick={handleAiAccept}
              className="text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a6f2f] rounded-md px-2.5 py-1 transition-colors"
            >
              Validate & Save
            </button>
          </div>
        )}
      </div>

      {/* AI prompt input */}
      {(isAiPrompt || isAiLoading) && (
        <div className="shrink-0 border border-[#d6d8de] rounded-md bg-[#f6f8fa] p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#8250df]">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            AI Edit
          </div>
          <textarea
            ref={promptRef}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleAiGenerate(); }}
            disabled={isAiLoading}
            placeholder='Describe changes… e.g. "Add an assertion to check data.title is not empty"'
            rows={3}
            className="w-full text-sm border border-[#d1d9e0] rounded-md px-3 py-2 bg-white placeholder-[#afb8c1] focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none resize-none disabled:opacity-60"
          />
          {aiError && (
            <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">
              {aiError}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#656d76]">{isAiLoading ? "" : "Ctrl+Enter to send"}</span>
            {isAiLoading ? (
              <button
                onClick={() => { abortRef.current?.abort(); abortRef.current = null; setEditMode("ai-prompt"); }}
                className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#d1242f]/90 rounded-md px-3 py-1.5 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                onClick={() => void handleAiGenerate()}
                disabled={!aiPrompt.trim()}
                className="text-sm font-medium text-white bg-[#8250df] hover:bg-[#7340c9] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-3 py-1.5 transition-colors flex items-center gap-1.5"
              >
                Generate
              </button>
            )}
          </div>
        </div>
      )}

      {/* AI review — diff info and cost */}
      {isAiReview && aiResult && (
        <div className="shrink-0 space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#ddf4ff] border border-[#54aeff66] rounded-md text-sm text-[#0969da]">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
            <span className="flex-1">Review the AI changes below. Green = added, red = removed.</span>
            {aiCost && <span className="text-xs text-[#656d76] shrink-0">{aiCost}</span>}
          </div>
        </div>
      )}

      {/* Validation error */}
      {validationError && (
        <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f] shrink-0">
          {validationError}
        </div>
      )}

      {/* Schema validation (view mode) */}
      {isView && validation && !validation.ok && (
        <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f] flex items-start gap-2 shrink-0">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A9.05 9.05 0 0 0 11.484 21h.032A9.05 9.05 0 0 0 12 2.714ZM12 17.25h.008v.008H12v-.008Z" />
          </svg>
          <div className="min-w-0">
            <div className="font-medium">Schema validation failed — cannot be marked for implementation</div>
            <div className="font-mono text-xs mt-0.5 break-all">{validation.error}</div>
          </div>
        </div>
      )}

      {/* Save success */}
      {saveSuccess && isView && (
        <div className="px-3 py-2 bg-[#dafbe1] border border-[#aceebb] rounded-md text-sm text-[#1a7f37] flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Flow XML updated successfully
        </div>
      )}

      {/* XML viewer / editor / diff */}
      <div className="border border-[#d1d9e0] rounded-md overflow-hidden bg-white flex-1 min-h-0 flex flex-col">
        {isManual ? (
          <Suspense fallback={<div className="p-4 text-sm text-[#afb8c1]">Loading editor…</div>}>
            <XmlEditor value={draft} onChange={(v) => { setDraft(v); setValidationError(null); }} height="100%" />
          </Suspense>
        ) : isAiReview && aiResult ? (
          <XmlDiffView original={xmlContent} modified={aiResult} />
        ) : (
          <XmlCodeBlock value={xmlContent} className="flex-1 min-h-0 overflow-auto" height="100%" />
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function DetailPanel({ selectedIdea, selectedFlow, flowIdea, onDownloadFlow, onGenerateFlow, generatingFlows, isFlowMarked, onCreateTest, creatingTest, onUpdateFlowXml, isFlowLocked, flowLockTooltip, canUnlockFlow, onUnlockFlow }: Props) {
  const [activeTab, setActiveTab] = useState<FlowTab>("idea");
  const validation = useMemo(
    () => (selectedFlow && selectedFlow.status === "done" ? validateFlowXml(selectedFlow.xml) : null),
    [selectedFlow?.status, selectedFlow?.xml],
  );

  // Nothing selected
  if (!selectedIdea && !selectedFlow) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <svg className="w-10 h-10 mx-auto text-[#d1d9e0]" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-xs text-[#656d76]">Select an idea or flow</p>
        </div>
      </div>
    );
  }

  // ── Flow selected — tabbed view (Idea + Flow XML) ──────────────────────
  if (selectedFlow) {
    const idea = flowIdea ?? null;
    const hasTabs = !!idea;

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Title row */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <span className="text-[13px] font-semibold text-[#1f2328] truncate flex-1">{selectedFlow.title}</span>
          {validation && (
            validation.ok ? (
              <span
                title={`Valid · ${validation.flow?.steps.length ?? 0} step${validation.flow?.steps.length === 1 ? "" : "s"}`}
                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-px rounded-full bg-[#dafbe1] text-[#1a7f37] border border-[#1a7f37]/30"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Valid · {validation.flow?.steps.length ?? 0} step{validation.flow?.steps.length === 1 ? "" : "s"}
              </span>
            ) : (
              <span
                title={validation.error ?? "Invalid"}
                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-px rounded-full bg-[#ffebe9] text-[#d1242f] border border-[#d1242f]/30"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A9.05 9.05 0 0 0 11.484 21h.032A9.05 9.05 0 0 0 12 2.714ZM12 17.25h.008v.008H12v-.008Z" />
                </svg>
                Invalid
              </span>
            )
          )}
          {selectedFlow.status === "done" && onDownloadFlow && (
            <button
              onClick={() => onDownloadFlow(selectedFlow)}
              title="Download XML"
              className="text-[#656d76] hover:text-[#0969da] rounded-md p-1 hover:bg-[#ddf4ff] transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          )}
        </div>

        {/* Tabs row */}
        {hasTabs && (
          <div className="flex items-center gap-1 px-4 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
            {(["idea", "flow-xml"] as FlowTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 text-[13px] font-semibold border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-[#fd8c73] text-[#1f2328]"
                    : "border-transparent text-[#656d76] hover:text-[#1f2328]"
                }`}
              >
                {tab === "idea" ? (
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                    </svg>
                    Idea
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                    </svg>
                    Flow XML
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        {hasTabs && activeTab === "idea" && idea ? (
          <IdeaContent idea={idea} />
        ) : (
          <FlowXmlContent
            flow={selectedFlow}
            validation={validation}
            onUpdateXml={onUpdateFlowXml ? (xml) => onUpdateFlowXml(selectedFlow.ideaId, xml) : undefined}
            isLocked={isFlowLocked}
            lockTooltip={flowLockTooltip}
            canUnlock={canUnlockFlow}
            onUnlock={onUnlockFlow}
          />
        )}

        {/* Create scenario bar */}
        {selectedFlow.status === "done" && validation?.ok && onCreateTest && (
          <div className="shrink-0 border-t border-[#d1d9e0] bg-[#f6f8fa] px-3 py-2 flex justify-center">
            {isFlowMarked ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-[#1a7f37] font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Scenario created
              </span>
            ) : (
              <button
                onClick={() => onCreateTest(selectedFlow)}
                disabled={creatingTest}
                className="flex items-center justify-center gap-1.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 disabled:bg-[#eef1f6] disabled:text-[#656d76] disabled:border-[#d1d9e0] text-white text-sm font-medium rounded-md px-3 py-1.5 transition-colors border border-[#1a7f37]/80"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {creatingTest ? "Creating..." : "Create scenario"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Idea selected (no flow yet) — standalone view ──────────────────────
  if (selectedIdea) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <span className="text-[13px] font-semibold text-[#1f2328] flex-1">Idea details</span>
          <span className={`text-[10px] px-1.5 py-px rounded-full font-medium border ${COMPLEXITY_COLORS[selectedIdea.complexity] ?? "bg-[#eef1f6] text-[#656d76] border-[#d1d9e0]"}`}>
            {selectedIdea.complexity}
          </span>
        </div>
        <IdeaContent idea={selectedIdea} />
        {onGenerateFlow && (
          <div className="shrink-0 border-t border-[#d1d9e0] bg-[#f6f8fa] px-3 py-2 flex justify-center">
            <button
              onClick={() => onGenerateFlow(selectedIdea.id)}
              disabled={generatingFlows}
              className="flex items-center justify-center gap-1.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 disabled:bg-[#eef1f6] disabled:text-[#656d76] disabled:border-[#d1d9e0] text-white text-sm font-medium rounded-md px-3 py-1.5 transition-colors border border-[#1a7f37]/80 disabled:border-[#d1d9e0]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              {generatingFlows ? "Generating..." : "Generate flow"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
