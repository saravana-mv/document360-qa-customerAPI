import { useState } from "react";
import type { Schema } from "../../types/spec.types";
import { InlineCode, InlineMarkdown } from "./InlineMarkdown";

const MAX_DEPTH = 6;

interface SchemaTreeProps {
  schema: Schema;
  defaultExpanded?: boolean;
}

// ── Top-level entry ─────────────────────────────────────────────────────────

export function SchemaTree({ schema, defaultExpanded = false }: SchemaTreeProps) {
  // oneOf / anyOf — render first variant for now
  if (schema.oneOf?.length) {
    return <SchemaTree schema={schema.oneOf[0]} defaultExpanded={defaultExpanded} />;
  }
  if (schema.anyOf?.length) {
    return <SchemaTree schema={schema.anyOf[0]} defaultExpanded={defaultExpanded} />;
  }

  // Object with properties — render flat list
  if (schema.properties && Object.keys(schema.properties).length > 0) {
    return (
      <PropertyList
        schema={schema}
        defaultExpanded={defaultExpanded}
        pathPrefix=""
        depth={0}
      />
    );
  }

  // Array of objects — show "Array of object" hint then item properties
  if (schema.type === "array" && schema.items) {
    const items = schema.items;
    if (items.properties && Object.keys(items.properties).length > 0) {
      return (
        <div>
          <div className="text-sm text-[#656d76] italic mb-2">Array of object</div>
          <PropertyList
            schema={items}
            defaultExpanded={defaultExpanded}
            pathPrefix=""
            depth={0}
          />
        </div>
      );
    }
  }

  // Primitive / leaf at root
  return (
    <div className="text-sm text-[#656d76]">
      {formatType(schema)}
    </div>
  );
}

// ── Flat property list (rows separated by border-b) ─────────────────────────

function PropertyList({ schema, defaultExpanded, pathPrefix, depth }: {
  schema: Schema;
  defaultExpanded: boolean;
  pathPrefix: string;
  depth: number;
}) {
  const properties = schema.properties ?? {};
  const requiredSet = new Set(schema.required ?? []);
  const entries = Object.entries(properties);

  return (
    <div>
      {entries.map(([key, val], i) => (
        <PropertyRow
          key={key}
          name={key}
          schema={val}
          required={requiredSet.has(key)}
          pathPrefix={pathPrefix}
          defaultExpanded={defaultExpanded}
          depth={depth}
          isLast={i === entries.length - 1}
        />
      ))}
    </div>
  );
}

// ── Single property row ─────────────────────────────────────────────────────

function PropertyRow({ name, schema, required, pathPrefix, defaultExpanded, depth, isLast }: {
  name: string;
  schema: Schema;
  required?: boolean;
  pathPrefix: string;
  defaultExpanded: boolean;
  depth: number;
  isLast: boolean;
}) {
  const childrenSchema = getChildrenSchema(schema);
  const canExpand = childrenSchema !== null && depth < MAX_DEPTH;
  const [expanded, setExpanded] = useState(defaultExpanded && canExpand);

  const fullPath = pathPrefix ? `${pathPrefix}.${name}` : name;
  const typeStr = formatType(schema);

  return (
    <div className={`py-3 ${!isLast ? "border-b border-[#d1d9e0]" : ""}`}>
      {/* Name + type + flags */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-mono font-semibold text-[#1f2328]">{fullPath}</span>
        <span className="text-sm text-[#656d76]">{typeStr}</span>
        {required && (
          <span className="text-xs font-semibold text-[#d1242f]">REQUIRED</span>
        )}
        {schema.deprecated && (
          <span className="text-xs bg-[#fff8c5] text-[#9a6700] border border-[#f5e0a0] rounded px-1.5 py-0.5">
            DEPRECATED
          </span>
        )}
        {schema.readOnly && (
          <span className="text-xs text-[#656d76] italic">read-only</span>
        )}
      </div>

      {/* Description (with inline markdown for `code` and **bold**) */}
      {schema.description && (
        <p className="text-sm text-[#656d76] mt-1 leading-relaxed">
          <InlineMarkdown text={schema.description} />
        </p>
      )}

      {/* Enum values — pink-coded chips after the VALID VALUES pill */}
      {schema.enum && schema.enum.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-1.5 py-0.5">
            VALID VALUES
          </span>
          {schema.enum.map((v, i) => (
            <span key={i} className="inline-flex items-center">
              {i > 0 && <span className="text-[#656d76] mx-1">·</span>}
              <InlineCode>{String(v)}</InlineCode>
            </span>
          ))}
        </div>
      )}

      {/* Default */}
      {schema.default != null && !schema.enum && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-xs font-semibold text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-1.5 py-0.5">
            DEFAULT
          </span>
          <InlineCode>{JSON.stringify(schema.default)}</InlineCode>
        </div>
      )}

      {/* Pattern */}
      {schema.pattern && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-xs font-semibold text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-1.5 py-0.5">
            PATTERN
          </span>
          <InlineCode>{schema.pattern}</InlineCode>
        </div>
      )}

      {/* Show child attributes (collapsed) */}
      {canExpand && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 inline-flex items-center gap-1 text-sm text-[#656d76] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] hover:text-[#1f2328] hover:border-[#afb8c1] transition-colors"
        >
          <span className="text-base leading-none">+</span>
          <span>Show child attributes</span>
        </button>
      )}

      {/* Hide child attributes (expanded — bordered child card) */}
      {canExpand && expanded && childrenSchema && (
        <div className="mt-2 border border-[#d1d9e0] rounded-lg overflow-hidden bg-white">
          <button
            onClick={() => setExpanded(false)}
            className="w-full flex items-center gap-1 px-3 py-2 border-b border-[#d1d9e0] text-sm text-[#656d76] hover:bg-[#f6f8fa] hover:text-[#1f2328] transition-colors text-left"
          >
            <span className="text-base leading-none">×</span>
            <span>Hide child attributes</span>
          </button>
          <div className="px-3">
            <PropertyList
              schema={childrenSchema}
              defaultExpanded={defaultExpanded}
              pathPrefix={fullPath}
              depth={depth + 1}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatType(schema: Schema): string {
  const nullable = schema.nullable ? "nullable " : "";

  if (schema.enum) return `${nullable}enum`;

  if (schema.type === "array" && schema.items) {
    const items = schema.items;
    const itemType = (items.type === "object" || items.properties) ? "object" : (items.type ?? "any");
    return `${nullable}array of ${itemType}`;
  }

  if (schema.type === "object" || schema.properties) {
    return `${nullable}object`;
  }

  let base = schema.type ?? "any";
  if (schema.format) base = `${base} (${schema.format})`;

  return `${nullable}${base}`;
}

function getChildrenSchema(schema: Schema): Schema | null {
  if (schema.oneOf?.length) return getChildrenSchema(schema.oneOf[0]);
  if (schema.anyOf?.length) return getChildrenSchema(schema.anyOf[0]);
  if (schema.properties && Object.keys(schema.properties).length > 0) return schema;
  if (schema.type === "array" && schema.items) {
    if (schema.items.properties && Object.keys(schema.items.properties).length > 0) {
      return schema.items;
    }
  }
  return null;
}
