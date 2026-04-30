import { useState } from "react";
import type { Schema } from "../../types/spec.types";

const MAX_DEPTH = 6;

interface Props {
  schema: Schema;
  name?: string;
  required?: boolean;
  depth?: number;
}

export function SchemaTree({ schema, name, required, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (depth > MAX_DEPTH) {
    return <div className="text-xs text-[#656d76] italic pl-4">…(max depth reached)</div>;
  }

  // oneOf / anyOf
  if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf ?? schema.anyOf ?? [];
    const label = schema.oneOf ? "oneOf" : "anyOf";
    return (
      <div className="pl-4">
        {name && <PropertyHeader name={name} schema={schema} required={required} />}
        <span className="text-xs text-[#656d76] italic">{label}</span>
        {variants.map((v, i) => (
          <SchemaTree key={i} schema={v} depth={depth + 1} />
        ))}
      </div>
    );
  }

  // Object
  if (schema.type === "object" || schema.properties) {
    const props = schema.properties ?? {};
    const requiredSet = new Set(schema.required ?? []);
    const hasProps = Object.keys(props).length > 0;

    return (
      <div className={depth > 0 ? "pl-4" : ""}>
        {name && <PropertyHeader name={name} schema={schema} required={required} />}
        {hasProps && (
          <>
            {depth > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-[#0969da] hover:underline ml-1"
              >
                {expanded ? "▾" : "▸"} {Object.keys(props).length} properties
              </button>
            )}
            {expanded && Object.entries(props).map(([key, val]) => (
              <SchemaTree
                key={key}
                schema={val}
                name={key}
                required={requiredSet.has(key)}
                depth={depth + 1}
              />
            ))}
          </>
        )}
        {schema.additionalProperties && typeof schema.additionalProperties === "object" && (
          <div className="pl-4">
            <span className="text-xs text-[#656d76] italic">[additional properties]</span>
            <SchemaTree schema={schema.additionalProperties as Schema} depth={depth + 1} />
          </div>
        )}
      </div>
    );
  }

  // Array
  if (schema.type === "array" && schema.items) {
    return (
      <div className={depth > 0 ? "pl-4" : ""}>
        {name && <PropertyHeader name={name} schema={schema} required={required} isArray />}
        <SchemaTree schema={schema.items} depth={depth + 1} />
      </div>
    );
  }

  // Primitive / leaf
  return (
    <div className={depth > 0 ? "pl-4" : ""}>
      <PropertyHeader name={name} schema={schema} required={required} />
    </div>
  );
}

function PropertyHeader({ name, schema, required, isArray }: {
  name?: string;
  schema: Schema;
  required?: boolean;
  isArray?: boolean;
}) {
  const typeStr = formatType(schema, isArray);

  return (
    <div className="flex items-baseline gap-1.5 py-0.5 min-h-[22px]">
      {name && (
        <span className="text-sm font-mono text-[#1f2328] font-medium">{name}</span>
      )}
      <span className="text-xs text-[#656d76]">{typeStr}</span>
      {required && (
        <span className="text-xs text-[#d1242f] font-medium">required</span>
      )}
      {schema.nullable && (
        <span className="text-xs text-[#656d76]">| null</span>
      )}
      {schema.readOnly && (
        <span className="text-xs text-[#656d76] italic">read-only</span>
      )}
      {schema.deprecated && (
        <span className="text-xs text-[#d1242f] italic line-through">deprecated</span>
      )}
      {schema.description && (
        <span className="text-xs text-[#656d76] ml-1 truncate max-w-[400px]" title={schema.description}>
          — {schema.description}
        </span>
      )}
    </div>
  );
}

function formatType(schema: Schema, isArray?: boolean): string {
  let base = schema.type ?? "any";
  if (schema.format) base += ` (${schema.format})`;
  if (schema.enum) base += ` enum[${schema.enum.length}]`;
  if (isArray) base = `array of ${schema.items?.type ?? "object"}`;
  if (schema.title) base = schema.title;
  if (schema.pattern) base += ` pattern: ${schema.pattern}`;
  if (schema.minLength != null || schema.maxLength != null) {
    base += ` [${schema.minLength ?? 0}..${schema.maxLength ?? "∞"}]`;
  }
  if (schema.minimum != null || schema.maximum != null) {
    base += ` [${schema.minimum ?? "-∞"}..${schema.maximum ?? "∞"}]`;
  }
  if (schema.default != null) base += ` default: ${JSON.stringify(schema.default)}`;
  return base;
}
