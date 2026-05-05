import type { Parameter } from "../../types/spec.types";
import { InlineCode, InlineMarkdown } from "./InlineMarkdown";

interface Props {
  title: string;
  parameters: Parameter[];
}

export function ParameterTable({ title, parameters }: Props) {
  if (parameters.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-[#1f2328] pb-2 border-b border-[#d1d9e0]">{title}</h4>
      <div className="border border-[#d1d9e0] rounded-lg overflow-hidden">
        {parameters.map((p, i) => (
          <div
            key={p.name}
            className={`px-4 py-3 ${i > 0 ? "border-t border-[#d1d9e0]" : ""}`}
          >
            {/* Name + type + required row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono font-semibold text-[#1f2328]">{p.name}</span>
              <TypeBadge
                type={p.schema?.enum ? "enum" : (p.schema?.type ?? "string")}
                format={p.schema?.enum ? undefined : p.schema?.format}
              />
              {p.required && (
                <span className="text-xs font-semibold text-[#d1242f]">REQUIRED</span>
              )}
            </div>

            {/* Description (with inline markdown for `code` and **bold**) */}
            {p.description && (
              <p className="text-sm text-[#656d76] mt-1 leading-relaxed">
                <InlineMarkdown text={p.description} />
              </p>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 empty:hidden items-baseline">
              {(p.example ?? p.schema?.example) != null && (
                <MetaItem label="EXAMPLE">
                  <InlineCode>{String(p.example ?? p.schema?.example)}</InlineCode>
                </MetaItem>
              )}

              {p.schema?.default != null && (
                <MetaItem label="DEFAULT">
                  <InlineCode>{JSON.stringify(p.schema.default)}</InlineCode>
                </MetaItem>
              )}

              {p.schema?.pattern && (
                <MetaItem label="PATTERN">
                  <InlineCode>{p.schema.pattern}</InlineCode>
                </MetaItem>
              )}

              {(p.schema?.minLength != null || p.schema?.maxLength != null) && (
                <MetaItem label="LENGTH">
                  <InlineCode>
                    {`${p.schema?.minLength ?? 0}..${p.schema?.maxLength ?? "∞"}`}
                  </InlineCode>
                </MetaItem>
              )}

              {(p.schema?.minimum != null || p.schema?.maximum != null) && (
                <MetaItem label="RANGE">
                  <InlineCode>
                    {`${p.schema?.minimum ?? "-∞"}..${p.schema?.maximum ?? "∞"}`}
                  </InlineCode>
                </MetaItem>
              )}
            </div>

            {/* Enum values — horizontal pink chips after the VALID VALUES pill */}
            {p.schema?.enum && p.schema.enum.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-1.5 py-0.5">
                  VALID VALUES
                </span>
                {p.schema.enum.map((v, j) => (
                  <span key={j} className="inline-flex items-center">
                    {j > 0 && <span className="text-[#656d76] mx-1">·</span>}
                    <InlineCode>{String(v)}</InlineCode>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeBadge({ type, format }: { type: string; format?: string }) {
  let label = type;
  if (format) label += ` (${format})`;
  return (
    <span className="text-xs font-mono bg-[#ddf4ff] text-[#0969da] rounded px-1.5 py-0.5">
      {label}
    </span>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="text-sm inline-flex items-center gap-1.5">
      <span className="text-xs font-semibold text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-1.5 py-0.5">
        {label}
      </span>
      {children}
    </span>
  );
}
