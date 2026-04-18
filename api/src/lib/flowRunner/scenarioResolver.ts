// Resolves a scenario ID (flow file path) to its XML content from Cosmos DB.

import { getFlowsContainer } from "../cosmosClient";

interface ResolvedScenario {
  xml: string;
  fileName: string;
  projectId: string;
}

/**
 * Look up a flow by its file path (scenarioId) in the Cosmos flows container.
 * Returns the XML content or throws if not found.
 */
export async function resolveScenario(
  scenarioId: string,
  projectId: string,
): Promise<ResolvedScenario> {
  const container = await getFlowsContainer();

  // Try point-read by path (id = "flow:<path>")
  const docId = scenarioId.startsWith("flow:") ? scenarioId : `flow:${scenarioId}`;
  try {
    const { resource } = await container.item(docId, projectId).read<{
      id: string;
      projectId: string;
      type: string;
      path: string;
      xml: string;
    }>();
    if (resource?.xml) {
      return { xml: resource.xml, fileName: resource.path, projectId: resource.projectId };
    }
  } catch {
    // Point-read miss — try query fallback
  }

  // Fallback: query by path field
  const { resources } = await container.items
    .query<{ id: string; projectId: string; path: string; xml: string }>({
      query: "SELECT * FROM c WHERE c.projectId = @pid AND c.type = 'flow' AND c.path = @path",
      parameters: [
        { name: "@pid", value: projectId },
        { name: "@path", value: scenarioId },
      ],
    })
    .fetchAll();

  if (resources.length === 0) {
    throw new ScenarioNotFoundError(scenarioId);
  }

  const doc = resources[0];
  return { xml: doc.xml, fileName: doc.path, projectId: doc.projectId };
}

export class ScenarioNotFoundError extends Error {
  constructor(scenarioId: string) {
    super(`Scenario not found: ${scenarioId}`);
    this.name = "ScenarioNotFoundError";
  }
}
