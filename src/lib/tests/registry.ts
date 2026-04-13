import type { TestDef } from "../../types/test.types";

const registry = new Map<string, TestDef>();

export function registerTest(def: TestDef): void {
  registry.set(def.id, def);
}

export function registerSuite(defs: TestDef[]): void {
  for (const def of defs) {
    registerTest(def);
  }
}

export function getTest(id: string): TestDef | undefined {
  return registry.get(id);
}

export function getAllTests(): TestDef[] {
  return Array.from(registry.values());
}

export function getTestsByTag(tag: string): TestDef[] {
  return getAllTests().filter((t) => t.tag === tag);
}

export function getAllTags(): string[] {
  return [...new Set(getAllTests().map((t) => t.tag))];
}

/** Drop every registered test whose id matches the predicate. */
export function unregisterWhere(predicate: (def: TestDef) => boolean): number {
  let removed = 0;
  for (const [id, def] of registry) {
    if (predicate(def)) {
      registry.delete(id);
      removed++;
    }
  }
  return removed;
}
