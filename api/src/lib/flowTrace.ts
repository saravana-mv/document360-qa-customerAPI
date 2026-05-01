/**
 * Flow Generation Debug Trace — collects diagnostic metadata during flow
 * generation so QA engineers can inspect what happened without Application
 * Insights access.
 *
 * Usage in generateFlow.ts:
 *   const trace = createTraceBuilder(projectId, oid, displayName);
 *   trace.setIdeaRef(idea);
 *   trace.setSpecSelection({ ... });
 *   trace.setPrompt(systemPrompt, userMessage);
 *   xml = trace.wrapPostProcessor("stripExtraRequestFields", xml, (x) => stripExtraRequestFields(x, specContext));
 *   trace.setModelUsage({ ... });
 *   const traceId = await trace.save();
 */

import { getFlowTracesContainer } from "./cosmosClient";

interface PostProcessorEntry {
  name: string;
  applied: boolean;
  changes: string[];
  error?: string;
}

export interface FlowTraceDocument {
  id: string;
  projectId: string;
  type: "flow-trace";
  createdAt: string;
  createdBy: { oid: string; name: string };

  ideaRef: {
    id: string;
    description: string;
    steps: string[];
    entities: string[];
  } | null;

  specSelection: {
    source: "server" | "client" | "ai-provided";
    totalBlobFiles: number;
    selectedFiles: string[];
    cappedAt: number;
    survivedFiles: string[];
    failedFiles: string[];
  };

  specContextHeaders: string[];

  stepContext: string | null;

  prompt: {
    systemPrompt: string;
    userMessage: string;
  };

  postProcessing: PostProcessorEntry[];

  model: {
    name: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
}

/** Extract ## path/filename.md headers from spec context string. */
function extractHeaders(specContext: string): string[] {
  const re = /^## ([\w/.-]+\.md)\s*$/gm;
  const headers: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(specContext)) !== null) headers.push(m[1]);
  return headers;
}

/** Summarize what changed between before/after XML (line-level diff). */
/** Find the current step number from surrounding XML context. */
function findStepContext(lines: string[], lineIndex: number): string {
  for (let i = lineIndex; i >= 0; i--) {
    const stepMatch = lines[i].match(/<step\s+number="(\d+)"/);
    if (stepMatch) return `[step ${stepMatch[1]}] `;
    const nameMatch = lines[i].match(/<name>([^<]+)<\/name>/);
    if (nameMatch) return `[${nameMatch[1]}] `;
  }
  return "";
}

function summarizeChanges(before: string, after: string): string[] {
  if (before === after) return [];
  const bLines = before.split("\n");
  const aLines = after.split("\n");
  const changes: string[] = [];

  // Simple: find lines added in `after` that aren't in `before`
  const bSet = new Set(bLines.map(l => l.trim()));
  for (let li = 0; li < aLines.length; li++) {
    const trimmed = aLines[li].trim();
    if (trimmed && !bSet.has(trimmed)) {
      const ctx = findStepContext(aLines, li);
      // Summarize meaningful XML changes
      const epRef = trimmed.match(/<endpointRef>(.+)<\/endpointRef>/);
      if (epRef) { changes.push(`${ctx}Injected endpointRef: ${epRef[1]}`); continue; }
      const capture = trimmed.match(/<capture\s+variable="([^"]+)"/);
      if (capture) { changes.push(`${ctx}Added capture: ${capture[1]}`); continue; }
      if (trimmed.startsWith('"') && trimmed.includes(":")) {
        const field = trimmed.match(/"(\w+)"\s*:/);
        if (field) { changes.push(`${ctx}Added field: ${field[1]}`); continue; }
      }
      // Generic: just note the line was added (cap to avoid noise)
      if (changes.length < 20) {
        changes.push(`${ctx}+ ${trimmed.slice(0, 100)}`);
      }
    }
  }

  // Find lines removed
  const aSet = new Set(aLines.map(l => l.trim()));
  for (let li = 0; li < bLines.length; li++) {
    const trimmed = bLines[li].trim();
    if (trimmed && !aSet.has(trimmed)) {
      const ctx = findStepContext(bLines, li);
      if (trimmed.startsWith('"') && trimmed.includes(":")) {
        const field = trimmed.match(/"(\w+)"\s*:/);
        if (field) { changes.push(`${ctx}Removed field: ${field[1]}`); continue; }
      }
      const epRef = trimmed.match(/<endpointRef>(.+)<\/endpointRef>/);
      if (epRef) { changes.push(`${ctx}Replaced endpointRef: ${epRef[1]}`); continue; }
      if (changes.length < 30) {
        changes.push(`${ctx}- ${trimmed.slice(0, 100)}`);
      }
    }
  }

  return changes;
}

export interface TraceBuilder {
  setIdeaRef(idea: { id: string; description: string; steps: string[]; entities: string[] } | null): void;
  setSpecSelection(sel: FlowTraceDocument["specSelection"]): void;
  setSpecContext(specContext: string): void;
  setStepContext(text: string): void;
  setPrompt(systemPrompt: string, userMessage: string): void;
  /** Wraps a post-processor, recording before/after diff. Returns the processed XML. */
  wrapPostProcessor(name: string, xml: string, fn: (xml: string) => string): string;
  setModelUsage(usage: NonNullable<FlowTraceDocument["model"]>): void;
  /** Save to Cosmos (fire-and-forget). Returns the trace document ID. */
  save(): Promise<string>;
}

/** Max prompt size stored per field to stay under Cosmos 2MB doc limit. */
const MAX_PROMPT_SIZE = 150_000;

export function createTraceBuilder(
  projectId: string,
  oid: string,
  displayName: string,
): TraceBuilder {
  const traceId = `trace:${Date.now()}`;
  const doc: FlowTraceDocument = {
    id: traceId,
    projectId,
    type: "flow-trace",
    createdAt: new Date().toISOString(),
    createdBy: { oid, name: displayName },
    ideaRef: null,
    specSelection: { source: "client", totalBlobFiles: 0, selectedFiles: [], cappedAt: 0, survivedFiles: [], failedFiles: [] },
    specContextHeaders: [],
    stepContext: null,
    prompt: { systemPrompt: "", userMessage: "" },
    postProcessing: [],
    model: null,
  };

  return {
    setIdeaRef(idea) {
      doc.ideaRef = idea;
    },

    setSpecSelection(sel) {
      doc.specSelection = sel;
    },

    setSpecContext(specContext) {
      doc.specContextHeaders = extractHeaders(specContext);
    },

    setStepContext(text) {
      doc.stepContext = text.slice(0, MAX_PROMPT_SIZE);
    },

    setPrompt(systemPrompt, userMessage) {
      doc.prompt = {
        systemPrompt: systemPrompt.slice(0, MAX_PROMPT_SIZE),
        userMessage: userMessage.slice(0, MAX_PROMPT_SIZE),
      };
    },

    wrapPostProcessor(name, xml, fn) {
      try {
        const result = fn(xml);
        const changed = xml !== result;
        doc.postProcessing.push({
          name,
          applied: changed,
          changes: changed ? summarizeChanges(xml, result) : [],
        });
        return result;
      } catch (e) {
        doc.postProcessing.push({
          name,
          applied: false,
          changes: [],
          error: e instanceof Error ? e.message : String(e),
        });
        return xml; // return unchanged on error
      }
    },

    setModelUsage(usage) {
      doc.model = usage;
    },

    async save() {
      try {
        const container = await getFlowTracesContainer();
        await container.items.upsert(doc);
        console.log(`[flowTrace] Saved trace ${traceId} (${JSON.stringify(doc.prompt.systemPrompt).length + JSON.stringify(doc.prompt.userMessage).length} bytes prompts)`);
      } catch (e) {
        console.error(`[flowTrace] Failed to save trace ${traceId}:`, e);
      }
      return traceId;
    },
  };
}
