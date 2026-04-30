import type { Schema } from "../../types/spec.types";

const MAX_DEPTH = 4;

const FORMAT_DEFAULTS: Record<string, unknown> = {
  uuid: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "date-time": "2024-01-15T09:30:00Z",
  date: "2024-01-15",
  email: "user@example.com",
  uri: "https://example.com",
  url: "https://example.com",
  hostname: "example.com",
  ipv4: "192.168.1.1",
  ipv6: "::1",
  int32: 0,
  int64: 0,
  float: 0.0,
  double: 0.0,
  byte: "dGVzdA==",
  binary: "<binary>",
  password: "********",
};

export function generateSchemaExample(schema: Schema, depth = 0): unknown {
  if (depth > MAX_DEPTH) return schema.type === "object" ? {} : null;

  // Explicit example or default first
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  // oneOf / anyOf — use first variant
  if (schema.oneOf?.length) return generateSchemaExample(schema.oneOf[0], depth);
  if (schema.anyOf?.length) return generateSchemaExample(schema.anyOf[0], depth);
  if (schema.allOf?.length) {
    const merged: Record<string, unknown> = {};
    for (const sub of schema.allOf) {
      const val = generateSchemaExample(sub, depth);
      if (val && typeof val === "object" && !Array.isArray(val)) {
        Object.assign(merged, val);
      }
    }
    return merged;
  }

  // Enum — first value
  if (schema.enum?.length) return schema.enum[0];

  const type = schema.type ?? (schema.properties ? "object" : "string");

  switch (type) {
    case "object": {
      const result: Record<string, unknown> = {};
      if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
          result[key] = generateSchemaExample(prop, depth + 1);
        }
      }
      return result;
    }
    case "array": {
      if (schema.items) {
        return [generateSchemaExample(schema.items, depth + 1)];
      }
      return [];
    }
    case "string": {
      if (schema.format && FORMAT_DEFAULTS[schema.format] !== undefined) {
        return FORMAT_DEFAULTS[schema.format];
      }
      return "string";
    }
    case "integer":
    case "number": {
      if (schema.format && FORMAT_DEFAULTS[schema.format] !== undefined) {
        return FORMAT_DEFAULTS[schema.format];
      }
      return schema.minimum ?? 0;
    }
    case "boolean":
      return true;
    default:
      return null;
  }
}
