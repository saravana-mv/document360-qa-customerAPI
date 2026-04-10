import { createContext, useContext } from "react";

interface ExplorerContextValue {
  /** Increments each time an expand/collapse-all is triggered — nodes watch this to sync. */
  expandSignal: number;
  /** true = expand all, false = collapse all */
  expandAll: boolean;
}

export const ExplorerContext = createContext<ExplorerContextValue>({
  expandSignal: 0,
  expandAll: false,
});

export function useExplorerContext() {
  return useContext(ExplorerContext);
}
