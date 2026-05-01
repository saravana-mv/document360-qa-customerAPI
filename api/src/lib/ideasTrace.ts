/**
 * Ideas Generation Debug Trace — collects diagnostic metadata during idea
 * generation so QA engineers can inspect what happened without Application
 * Insights access.
 *
 * Usage in generateFlowIdeas.ts:
 *   const trace = createIdeasTraceBuilder(projectId, oid, displayName);
 *   trace.setRequest({ ... });
 *   trace.setSpecContext({ ... });
 *   trace.setPrompt(systemPrompt, userMessage);
 *   trace.setModelUsage({ ... });
 *   trace.setResult({ ... });
 *   const traceId = await trace.save();
 */

import { getFlowTracesContainer } from "./cosmosClient";

export interface IdeasTraceDocument {
  id: string;
  projectId: string;
  type: "ideas-trace";
  createdAt: string;
  createdBy: { oid: string; name: string };

  request: {
    folderPath: string;
    mode: string;
    maxCount: number;
    scope: string;
    prompt: string | null;
    filePaths: string[];
    existingIdeasCount: number;
  };

  specContext: {
    source: "explicit" | "single-file" | "folder";
    usedDigest: boolean;
    filesAnalyzed: number;
    totalSpecCharacters: number;
    fileNames: string[];
  };

  prompt: {
    systemPrompt: string;
    userMessage: string;
  };

  model: {
    name: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;

  result: {
    ideasGenerated: number;
    parseError: boolean;
    crossFolderAugmented: number;
  };
}

export interface IdeasTraceBuilder {
  setRequest(req: IdeasTraceDocument["request"]): void;
  setSpecContext(ctx: IdeasTraceDocument["specContext"]): void;
  setPrompt(systemPrompt: string, userMessage: string): void;
  setModelUsage(usage: NonNullable<IdeasTraceDocument["model"]>): void;
  setResult(result: IdeasTraceDocument["result"]): void;
  save(): Promise<string>;
}

/** Max prompt size stored per field to stay under Cosmos 2MB doc limit. */
const MAX_PROMPT_SIZE = 150_000;

export function createIdeasTraceBuilder(
  projectId: string,
  oid: string,
  displayName: string,
): IdeasTraceBuilder {
  const traceId = `ideas-trace:${Date.now()}`;
  const doc: IdeasTraceDocument = {
    id: traceId,
    projectId,
    type: "ideas-trace",
    createdAt: new Date().toISOString(),
    createdBy: { oid, name: displayName },
    request: {
      folderPath: "",
      mode: "full",
      maxCount: 0,
      scope: "folder",
      prompt: null,
      filePaths: [],
      existingIdeasCount: 0,
    },
    specContext: {
      source: "folder",
      usedDigest: false,
      filesAnalyzed: 0,
      totalSpecCharacters: 0,
      fileNames: [],
    },
    prompt: { systemPrompt: "", userMessage: "" },
    model: null,
    result: {
      ideasGenerated: 0,
      parseError: false,
      crossFolderAugmented: 0,
    },
  };

  return {
    setRequest(req) {
      doc.request = req;
    },

    setSpecContext(ctx) {
      doc.specContext = ctx;
    },

    setPrompt(systemPrompt, userMessage) {
      doc.prompt = {
        systemPrompt: systemPrompt.slice(0, MAX_PROMPT_SIZE),
        userMessage: userMessage.slice(0, MAX_PROMPT_SIZE),
      };
    },

    setModelUsage(usage) {
      doc.model = usage;
    },

    setResult(result) {
      doc.result = result;
    },

    async save() {
      try {
        const container = await getFlowTracesContainer();
        await container.items.upsert(doc);
        console.log(`[ideasTrace] Saved trace ${traceId} (${JSON.stringify(doc.prompt.systemPrompt).length + JSON.stringify(doc.prompt.userMessage).length} bytes prompts)`);
      } catch (e) {
        console.error(`[ideasTrace] Failed to save trace ${traceId}:`, e);
      }
      return traceId;
    },
  };
}
