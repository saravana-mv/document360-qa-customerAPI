// Re-exports from the API-backed module.
// This file preserves the import path for existing consumers while
// delegating all state to the server via Cosmos DB.
//
// IMPORTANT: All functions are now async. Callers that previously called
// these synchronously must be updated to await.

export {
  getActiveFlows,
  isFlowActive,
  activateFlow,
  activateFlows,
  deactivateFlow,
  deactivateAll,
} from "../../api/activeTestsApi";
