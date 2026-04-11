// Stub out the @azure/functions app registration so importing specFiles.ts
// in tests doesn't try to register real Azure Functions.
export const app = {
  http: jest.fn(),
};

// Re-export types used by the handlers so TypeScript is happy
export type HttpRequest = {
  method: string;
  query: URLSearchParams;
  json(): Promise<unknown>;
};

export type HttpResponseInit = {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
};

export type InvocationContext = Record<string, unknown>;
