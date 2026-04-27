import type { AuditAction } from "../lib/auditLog";

const mockUpsert = jest.fn().mockResolvedValue({});
jest.mock("../lib/cosmosClient", () => ({
  getAuditLogContainer: jest.fn().mockResolvedValue({
    items: { upsert: (...args: unknown[]) => mockUpsert(...args) },
  }),
}));

// Flush fire-and-forget microtasks
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// Import after mocks are set up
import { audit } from "../lib/auditLog";
import { getAuditLogContainer } from "../lib/cosmosClient";

describe("audit()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls upsert with correct entry shape", async () => {
    audit("proj-1", "flow.create", { oid: "user-1", name: "Alice" });
    await flush();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const entry = mockUpsert.mock.calls[0][0];
    expect(entry.id).toMatch(/^audit:/);
    expect(entry.type).toBe("audit");
    expect(entry.projectId).toBe("proj-1");
    expect(typeof entry.timestamp).toBe("string");
    // Verify timestamp is a valid ISO string
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it("passes action, actor, target, and details correctly", async () => {
    const details = { before: "draft", after: "published" };
    audit(
      "proj-2",
      "flow.update",
      { oid: "user-2", name: "Bob" },
      "my-flow.flow.xml",
      details,
    );
    await flush();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const entry = mockUpsert.mock.calls[0][0];
    expect(entry.action).toBe("flow.update");
    expect(entry.actor).toEqual({ oid: "user-2", name: "Bob" });
    expect(entry.target).toBe("my-flow.flow.xml");
    expect(entry.details).toEqual(details);
  });

  it("works without target and details (optional params)", async () => {
    audit("proj-3", "project.reset", { oid: "user-3", name: "Carol" });
    await flush();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const entry = mockUpsert.mock.calls[0][0];
    expect(entry.action).toBe("project.reset");
    expect(entry.target).toBeUndefined();
    expect(entry.details).toBeUndefined();
  });

  it("swallows errors from upsert without throwing", async () => {
    mockUpsert.mockRejectedValueOnce(new Error("Cosmos write failed"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      audit("proj-4", "flow.delete", { oid: "user-4", name: "Dave" });
    }).not.toThrow();

    await flush();

    expect(spy).toHaveBeenCalledWith(
      "[audit] write failed:",
      "flow.delete",
      "Cosmos write failed",
    );
    spy.mockRestore();
  });

  it("swallows errors from getAuditLogContainer without throwing", async () => {
    (getAuditLogContainer as jest.Mock).mockRejectedValueOnce(
      new Error("Container unavailable"),
    );
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      audit("proj-5", "user.invite", { oid: "user-5", name: "Eve" });
    }).not.toThrow();

    await flush();

    expect(spy).toHaveBeenCalledWith(
      "[audit] write failed:",
      "user.invite",
      "Container unavailable",
    );
    expect(mockUpsert).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
