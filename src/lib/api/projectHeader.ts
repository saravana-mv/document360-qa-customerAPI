// Provides the X-FlowForge-ProjectId header for all Cosmos-backed API calls.
// Reads from useSetupStore (Zustand allows getState() outside React).

import { useSetupStore } from "../../store/setup.store";

export function getProjectHeaders(): Record<string, string> {
  const pid = useSetupStore.getState().selectedProjectId;
  if (!pid) throw new Error("No project selected — cannot make API call");
  return { "X-FlowForge-ProjectId": pid };
}
