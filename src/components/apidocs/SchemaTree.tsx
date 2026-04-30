import { useState } from "react";
import type { Schema } from "../../types/spec.types";

const MAX_DEPTH = 6;

interface SchemaTreeProps {
  schema: Schema;
  name?: string;
  required?: boolean;
  depth?: number;
  defaultExpanded?: boolean;
  /** Internal: connector state from parent */
  _isLast?: boolean;
  /** Internal: which ancestor depths still have siblings below */
  _parentConnectors?: boolean[];
}

export function SchemaTree({
  schema,
  name,
  required,
  depth = 0,
  defaultExpanded = true,
  _isLast = true,
  _parentConnectors = [],
}: SchemaTreeProps) {
  const initialExpanded = defaultExpanded ? depth < 2 : false;
  const [expanded, setExpanded] = useState(initialExpanded);

  if (depth > MAX_DEPTH) {
    return (
      <div className="flex items-start">
        <TreeConnector depth={depth} isLast={_isLast} parentConnectors={_parentConnectors} />
        <span className="text-sm text-[#656d76] italic">...(max depth)</span>
      </div>
    );
  }

  // Collect child entries for objects/arrays
  const children = getChildren(schema);
  const requiredSet = new Set(schema.required ?? []);

  // oneOf / anyOf
  if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf ?? schema.anyOf ?? [];
    const label = schema.oneOf ? "oneOf" : "anyOf";
    return (
      <div>
        {name && (
          <PropertyRow
            name={name}
            schema={schema}
            required={required}
            depth={depth}
            isLast={_isLast}
            parentConnectors={_parentConnectors}
            isExpandable={false}
            expanded={false}
          />
        )}
        <div className="flex items-start">
          <TreeConnector depth={name ? depth + 1 : depth} isLast={false} parentConnectors={name ? [..._parentConnectors, !_isLast] : _parentConnectors} />
          <span className="text-sm text-[#656d76] italic">{label}</span>
        </div>
        {variants.map((v, i) => (
          <SchemaTree
            key={i}
            schema={v}
            depth={depth + 1}
            defaultExpanded={defaultExpanded}
            _isLast={i === variants.length - 1}
            _parentConnectors={name ? [..._parentConnectors, !_isLast] : _parentConnectors}
          />
        ))}
      </div>
    );
  }

  // Object with properties
  if (schema.type === "object" || schema.properties) {
    return (
      <div>
        {name ? (
          <PropertyRow
            name={name}
            schema={schema}
            required={required}
            depth={depth}
            isLast={_isLast}
            parentConnectors={_parentConnectors}
            isExpandable={children.length > 0}
            expanded={expanded}
            onToggle={() => setExpanded(e => !e)}
            collapsedSummary={`{${children.length} properties}`}
          />
        ) : depth === 0 && children.length > 0 ? (
          <div className="flex items-center gap-1.5 py-0.5">
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-sm text-[#656d76] hover:text-[#1f2328] select-none"
            >
              {expanded ? "▾" : "▸"}
            </button>
            <span className="text-sm font-mono text-[#656d76]">object</span>
          </div>
        ) : null}

        {expanded && children.map(([key, val], i) => (
          <SchemaTree
            key={key}
            schema={val}
            name={key}
            required={requiredSet.has(key)}
            depth={depth > 0 || name ? depth + 1 : depth + 1}
            defaultExpanded={defaultExpanded}
            _isLast={i === children.length - 1}
            _parentConnectors={name ? [..._parentConnectors, !_isLast] : _parentConnectors}
          />
        ))}

        {expanded && schema.additionalProperties && typeof schema.additionalProperties === "object" && (
          <div>
            <div className="flex items-start">
              <TreeConnector
                depth={depth + 1}
                isLast={true}
                parentConnectors={name ? [..._parentConnectors, !_isLast] : _parentConnectors}
              />
              <span className="text-sm text-[#656d76] italic">[additional properties]</span>
            </div>
            <SchemaTree
              schema={schema.additionalProperties as Schema}
              depth={depth + 2}
              defaultExpanded={defaultExpanded}
              _isLast={true}
              _parentConnectors={name ? [..._parentConnectors, !_isLast, false] : [..._parentConnectors, false]}
            />
          </div>
        )}
      </div>
    );
  }

  // Array
  if (schema.type === "array" && schema.items) {
    const itemsExpandable = hasChildren(schema.items);
    return (
      <div>
        {name && (
          <PropertyRow
            name={name}
            schema={schema}
            required={required}
            depth={depth}
            isLast={_isLast}
            parentConnectors={_parentConnectors}
            isExpandable={itemsExpandable}
            expanded={expanded}
            onToggle={itemsExpandable ? () => setExpanded(e => !e) : undefined}
            isArray
          />
        )}
        {(!itemsExpandable || expanded) && (
          <SchemaTree
            schema={schema.items}
            depth={depth + 1}
            defaultExpanded={defaultExpanded}
            _isLast={true}
            _parentConnectors={name ? [..._parentConnectors, !_isLast] : _parentConnectors}
          />
        )}
      </div>
    );
  }

  // Primitive / leaf
  return (
    <PropertyRow
      name={name}
      schema={schema}
      required={required}
      depth={depth}
      isLast={_isLast}
      parentConnectors={_parentConnectors}
      isExpandable={false}
      expanded={false}
    />
  );
}

// ── Tree connector line drawing ──────────────────────────────────────────────

function TreeConnector({ depth, isLast, parentConnectors }: {
  depth: number;
  isLast: boolean;
  parentConnectors: boolean[];
}) {
  if (depth === 0) return null;

  return (
    <span className="inline-flex shrink-0 font-mono text-sm text-[#d1d9e0] select-none leading-none">
      {parentConnectors.map((hasMore, i) => (
        <span key={i} className="inline-block w-5 text-center">
          {hasMore ? "│" : "\u00A0"}
        </span>
      ))}
      <span className="inline-block w-5 text-center">
        {isLast ? "└─" : "├─"}
      </span>
    </span>
  );
}

// ── Property row — name + type badge + required + description ────────────────

function PropertyRow({ name, schema, required, depth, isLast, parentConnectors, isExpandable, expanded, onToggle, collapsedSummary, isArray }: {
  name?: string;
  schema: Schema;
  required?: boolean;
  depth: number;
  isLast: boolean;
  parentConnectors: boolean[];
  isExpandable: boolean;
  expanded: boolean;
  onToggle?: () => void;
  collapsedSummary?: string;
  isArray?: boolean;
}) {
  const typeStr = formatType(schema, isArray);

  return (
    <div className="group">
      {/* Name + type + badges line */}
      <div className="flex items-center py-0.5 min-h-[28px]">
        <TreeConnector depth={depth} isLast={isLast} parentConnectors={parentConnectors} />
        {isExpandable && (
          <button
            onClick={onToggle}
            className="text-sm text-[#656d76] hover:text-[#1f2328] select-none w-4 shrink-0 text-center"
          >
            {expanded ? "▾" : "▸"}
          </button>
        )}
        {!isExpandable && depth > 0 && (
          <span className="w-4 shrink-0" />
        )}
        {name && (
          <span className="text-sm font-mono font-semibold text-[#1f2328] mr-2">{name}</span>
        )}
        <span className="text-xs font-mono bg-[#ddf4ff] text-[#0969da] rounded px-1.5 py-0.5 mr-2 whitespace-nowrap">
          {typeStr}
        </span>
        {required && (
          <span className="text-xs font-semibold text-[#d1242f] mr-2">REQUIRED</span>
        )}
        {schema.nullable && (
          <span className="text-xs font-mono text-[#656d76] mr-2">| null</span>
        )}
        {schema.readOnly && (
          <span className="text-xs text-[#656d76] italic mr-2">read-only</span>
        )}
        {schema.deprecated && (
          <span className="text-xs bg-[#fff8c5] text-[#9a6700] border border-[#f5e0a0] rounded px-1.5 py-0.5 mr-2">
            DEPRECATED
          </span>
        )}
        {!expanded && collapsedSummary && (
          <span className="text-xs text-[#656d76] italic">{collapsedSummary}</span>
        )}
      </div>
      {/* Description on its own line */}
      {schema.description && (
        <div className="flex">
          {depth > 0 && (
            <span className="inline-flex shrink-0 font-mono text-sm text-[#d1d9e0] select-none leading-none">
              {parentConnectors.map((hasMore, i) => (
                <span key={i} className="inline-block w-5 text-center">
                  {hasMore ? "│" : "\u00A0"}
                </span>
              ))}
              <span className="inline-block w-5 text-center">
                {isLast ? "\u00A0" : "│"}
              </span>
            </span>
          )}
          {depth > 0 && <span className="w-4 shrink-0" />}
          <p className="text-sm text-[#656d76] pl-0.5">{schema.description}</p>
        </div>
      )}
      {/* Enum values */}
      {schema.enum && schema.enum.length > 0 && (expanded || !isExpandable) && (
        <div className="flex">
          {depth > 0 && (
            <span className="inline-flex shrink-0 font-mono text-sm text-[#d1d9e0] select-none leading-none">
              {parentConnectors.map((hasMore, i) => (
                <span key={i} className="inline-block w-5 text-center">
                  {hasMore ? "│" : "\u00A0"}
                </span>
              ))}
              <span className="inline-block w-5 text-center">
                {isLast ? "\u00A0" : "│"}
              </span>
            </span>
          )}
          {depth > 0 && <span className="w-4 shrink-0" />}
          <div className="pl-0.5">
            <span className="text-xs font-semibold text-[#656d76]">VALID VALUES: </span>
            {schema.enum.map((v, i) => (
              <span key={i} className="text-sm font-mono text-[#1f2328]">
                {i > 0 && <span className="text-[#656d76]"> · </span>}
                {String(v)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatType(schema: Schema, isArray?: boolean): string {
  if (isArray) {
    const itemType = schema.items?.type ?? "object";
    return `array of ${itemType}`;
  }
  let base = schema.type ?? "any";
  if (schema.format) base += ` (${schema.format})`;
  if (schema.title) base = schema.title;
  return base;
}

function hasChildren(schema: Schema): boolean {
  if (schema.oneOf || schema.anyOf) return true;
  if (schema.properties && Object.keys(schema.properties).length > 0) return true;
  if (schema.type === "array" && schema.items) return hasChildren(schema.items);
  return false;
}

function getChildren(schema: Schema): [string, Schema][] {
  if (schema.properties) return Object.entries(schema.properties);
  return [];
}
