// Tracks which flow files are "active" as tests. Only flows in this set
// get parsed and registered by the loader. Persisted in localStorage so
// the state survives page refreshes.
//
// - activateFlow(name)   — called when "Create test" saves a flow
// - deactivateFlow(name) — called when a single flow is deleted from TagNode
// - deactivateAll()      — called by "Delete all tests"
// - isFlowActive(name)   — checked by the loader before registering
// - getActiveFlows()     — returns the full set

const STORAGE_KEY = "flowforge:active-tests";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function save(set: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function getActiveFlows(): Set<string> {
  return load();
}

export function isFlowActive(name: string): boolean {
  return load().has(name);
}

export function activateFlow(name: string): void {
  const set = load();
  set.add(name);
  save(set);
}

export function deactivateFlow(name: string): void {
  const set = load();
  set.delete(name);
  save(set);
}

export function deactivateAll(): void {
  save(new Set());
}

/** Activate multiple flows at once (used by the seeder). */
export function activateFlows(names: string[]): void {
  const set = load();
  for (const n of names) set.add(n);
  save(set);
}
