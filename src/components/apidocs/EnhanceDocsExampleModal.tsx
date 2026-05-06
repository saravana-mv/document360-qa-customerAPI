import { useEffect, useRef, useState } from "react";
import { Modal } from "../common/Modal";
import { XmlDiffView } from "../common/XmlDiffView";
import {
  enhanceDocsExample,
  EnhanceDocsExampleError,
  type EnhanceDocsExampleRequest,
  type EnhanceDocsExampleResponse,
} from "../../lib/api/enhanceDocsExampleApi";
import { uploadSpecFile, getSpecFileContent } from "../../lib/api/specFilesApi";
import { useAiCostStore } from "../../store/aiCost.store";
import { useSetupStore } from "../../store/setup.store";

interface Props {
  open: boolean;
  onClose: () => void;
  request: Omit<EnhanceDocsExampleRequest, "model"> | null;
  onSaved?: () => void;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "review"; result: EnhanceDocsExampleResponse }
  | { kind: "saving"; result: EnhanceDocsExampleResponse }
  | { kind: "saved" }
  | { kind: "error"; code: string; detail: string; extra: Record<string, unknown> };

function explainErrorCode(code: string, extra: Record<string, unknown>): string {
  switch (code) {
    case "no_openapi_block":
      return "This spec MD file has no parseable OpenAPI JSON block — there's nothing to enhance.";
    case "path_template_mismatch":
      return "The captured request path doesn't match any operation in this spec MD file. Make sure the file matches the endpoint you tried.";
    case "redaction_incomplete":
      return `The AI's response still contained traces of secrets (${(extra.kinds as string[] | undefined)?.join(", ") ?? "unknown"}). Try again — this is a safety guard.`;
    case "ai_invalid_json":
      return "The AI returned malformed output and a retry didn't help. Try again or switch model.";
    case "credit_denied":
      return `AI credits exhausted: ${(extra.reason as string | undefined) ?? "no remaining budget"}.`;
    case "insufficient_project_role":
      return "Only QA Managers and Owners can enhance docs examples.";
    case "spec_not_found":
      return "Spec MD file not found in storage.";
    default:
      return `Server returned error: ${code}`;
  }
}

export function EnhanceDocsExampleModal({ open, onClose, request, onSaved }: Props) {
  const aiModel = useSetupStore((s) => s.aiModel);
  const [state, setState] = useState<State>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  // Kick off the AI call when the modal opens.
  useEffect(() => {
    if (!open || !request) return;
    setState({ kind: "loading" });
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const result = await enhanceDocsExample({ ...request, model: aiModel }, controller.signal);
        useAiCostStore.getState().addAdhocCost(result.usage.costUsd);
        setState({ kind: "review", result });
      } catch (e) {
        if (controller.signal.aborted) return;
        if (e instanceof EnhanceDocsExampleError) {
          setState({ kind: "error", code: e.code, detail: explainErrorCode(e.code, e.extra), extra: e.extra });
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          setState({ kind: "error", code: "network_error", detail: msg, extra: {} });
        }
      }
    })();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [open, request, aiModel]);

  // Reset when the modal closes.
  useEffect(() => {
    if (!open) setState({ kind: "idle" });
  }, [open]);

  const handleConfirm = async () => {
    if (state.kind !== "review" || !request) return;
    setState({ kind: "saving", result: state.result });
    try {
      // 1. Save the per-endpoint MD (the file the user is viewing).
      await uploadSpecFile(request.specPath, state.result.updatedMd, "text/markdown");

      // 2. Patch _system/_swagger.json so the Documentation tab and other consumers
      //    (parsedSpec, endpointFileMap) pick up the new examples on next render.
      //    Best-effort: a swagger sync failure shouldn't fail the MD save.
      try {
        const swaggerPath = `${request.versionFolder}/_system/_swagger.json`;
        const swaggerRaw = await getSpecFileContent(swaggerPath);
        const swagger = JSON.parse(swaggerRaw) as Record<string, unknown>;
        const paths = swagger.paths as Record<string, unknown> | undefined;
        if (paths && typeof paths === "object") {
          const pathItem = paths[state.result.pathTemplate];
          if (pathItem && typeof pathItem === "object") {
            (pathItem as Record<string, unknown>)[state.result.method] = state.result.updatedOperation;
            await uploadSpecFile(swaggerPath, JSON.stringify(swagger, null, 2), "application/json");
          }
        }
      } catch (swaggerErr) {
        console.warn("[EnhanceDocsExample] _swagger.json sync failed (non-fatal):", swaggerErr);
      }

      setState({ kind: "saved" });
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ kind: "error", code: "save_failed", detail: `Could not save the updated spec: ${msg}`, extra: {} });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Enhance Docs example" maxWidth="max-w-6xl">
      {state.kind === "loading" && (
        <div className="flex items-center justify-center py-16 text-sm text-[#656d76]">
          <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Sanitizing and rewriting example…
        </div>
      )}

      {state.kind === "error" && (
        <div className="text-sm text-[#d1242f] bg-[#ffebe9] border border-[#ffcecb] rounded-md px-3 py-3">
          <div className="font-semibold mb-1">{state.code}</div>
          <div>{state.detail}</div>
        </div>
      )}

      {(state.kind === "review" || state.kind === "saving") && (
        <div className="flex flex-col h-[70vh]">
          <div className="flex items-center gap-3 flex-wrap mb-3 pb-3 border-b border-[#d1d9e0]">
            <span className="text-sm font-semibold text-[#1f2328]">
              {request?.method.toUpperCase()} {request?.pathTemplate}
            </span>
            <span className="text-xs text-[#656d76]">
              status {request?.capturedStatus}
            </span>
            <span className="ml-auto text-xs text-[#656d76]">
              ${state.result.usage.costUsd.toFixed(4)} · {state.result.usage.totalTokens.toLocaleString()} tokens
            </span>
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap text-xs">
            {state.result.updatedSliceSummary.addedNewResponseStatus && (
              <span className="px-2 py-0.5 rounded-full bg-[#dafbe1] text-[#1a7f37] border border-[#aceebb]">
                Added new response status
              </span>
            )}
            {state.result.updatedSliceSummary.responseExampleName && (
              <span className="px-2 py-0.5 rounded-full bg-[#ddf4ff] text-[#0969da] border border-[#b6e3ff]">
                {state.result.updatedSliceSummary.addedNewExample ? "Added" : "Updated"} response example: {state.result.updatedSliceSummary.responseExampleName}
              </span>
            )}
            {state.result.updatedSliceSummary.requestBodyExampleName && (
              <span className="px-2 py-0.5 rounded-full bg-[#ddf4ff] text-[#0969da] border border-[#b6e3ff]">
                Updated request example: {state.result.updatedSliceSummary.requestBodyExampleName}
              </span>
            )}
          </div>

          <div className="flex flex-col flex-1 min-h-0 border border-[#d1d9e0] rounded-md overflow-hidden">
            <XmlDiffView original={state.result.originalMd} modified={state.result.updatedMd} />
          </div>
        </div>
      )}

      {state.kind === "saved" && (
        <div className="text-sm text-[#1a7f37] bg-[#dafbe1] border border-[#aceebb] rounded-md px-3 py-3">
          Spec updated. Distilled cache rebuilds in the background — your next AI flow generation will pick up the new examples.
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {state.kind === "review" && (
          <>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-md border border-[#d1d9e0] text-[#1f2328] hover:bg-[#f6f8fa]"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleConfirm()}
              className="px-4 py-1.5 text-sm rounded-md bg-[#1f883d] hover:bg-[#1a7f37] text-white font-medium"
            >
              Confirm &amp; save
            </button>
          </>
        )}
        {state.kind === "saving" && (
          <button disabled className="px-4 py-1.5 text-sm rounded-md bg-[#eef1f6] text-[#656d76]">
            Saving…
          </button>
        )}
        {(state.kind === "error" || state.kind === "saved") && (
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-md border border-[#d1d9e0] text-[#1f2328] hover:bg-[#f6f8fa]"
          >
            Close
          </button>
        )}
        {state.kind === "loading" && (
          <button
            onClick={() => {
              abortRef.current?.abort();
              onClose();
            }}
            className="px-4 py-1.5 text-sm rounded-md border border-[#d1d9e0] text-[#1f2328] hover:bg-[#f6f8fa]"
          >
            Cancel
          </button>
        )}
      </div>
    </Modal>
  );
}
