const mockRead = jest.fn();
jest.mock("../lib/cosmosClient", () => ({
  getSettingsContainer: jest.fn().mockResolvedValue({
    item: () => ({ read: mockRead }),
  }),
}));

import { injectProjectVariables, loadProjectVariables } from "../lib/projectVariables";

describe("injectProjectVariables", () => {
  it("returns base prompt unchanged when variables is empty", () => {
    expect(injectProjectVariables("Hello", [])).toBe("Hello");
  });

  it("appends variable table when variables present", () => {
    const result = injectProjectVariables("Base", [{ name: "foo", value: "bar" }]);
    expect(result).toContain("## Available Project Variables");
    expect(result).toContain("| Variable | Notes |");
    expect(result).toStartWith("Base");
  });

  it("shows correct {{proj.NAME}} format", () => {
    const result = injectProjectVariables("Base", [{ name: "myVar", value: "x" }]);
    expect(result).toContain("`{{proj.myVar}}`");
  });

  it("shows current value hint", () => {
    const result = injectProjectVariables("Base", [{ name: "a", value: "123" }]);
    expect(result).toContain("current value: `123`");
  });
});

describe("loadProjectVariables", () => {
  beforeEach(() => mockRead.mockReset());

  it("returns empty array for 'unknown' projectId", async () => {
    expect(await loadProjectVariables("unknown")).toEqual([]);
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("returns empty array for empty string projectId", async () => {
    expect(await loadProjectVariables("")).toEqual([]);
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("returns variables from Cosmos when found", async () => {
    const vars = [{ name: "projectId", value: "abc" }];
    mockRead.mockResolvedValue({ resource: { variables: vars } });
    expect(await loadProjectVariables("proj1")).toEqual(vars);
  });

  it("returns empty array when Cosmos throws", async () => {
    mockRead.mockRejectedValue(new Error("boom"));
    expect(await loadProjectVariables("proj1")).toEqual([]);
  });
});

expect.extend({
  toStartWith(received: string, prefix: string) {
    const pass = received.startsWith(prefix);
    return {
      pass,
      message: () => `expected string to ${pass ? "not " : ""}start with "${prefix}"`,
    };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toStartWith(prefix: string): R;
    }
  }
}
