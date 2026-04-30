import type { Parameter } from "../../types/spec.types";

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
                type={p.schema?.type ?? "string"}
                format={p.schema?.format}
              />
              {p.required && (
                <span className="text-xs font-semibold text-[#d1242f]">REQUIRED</span>
              )}
            </div>

            {/* Description */}
            {p.description && (
              <p className="text-sm text-[#656d76] mt-1">{p.description}</p>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 empty:hidden">
              {(p.example ?? p.schema?.example) != null && (
                <MetaItem label="EXAMPLE">
                  <code className="font-mono text-[#1f2328]">{String(p.example ?? p.schema?.example)}</code>
                </MetaItem>
              )}

              {p.schema?.default != null && (
                <MetaItem label="DEFAULT">
                  <code className="font-mono text-[#1f2328]">{JSON.stringify(p.schema.default)}</code>
                </MetaItem>
              )}

              {p.schema?.pattern && (
                <MetaItem label="PATTERN">
                  <code className="font-mono text-[#1f2328]">{p.schema.pattern}</code>
                </MetaItem>
              )}

              {(p.schema?.minLength != null || p.schema?.maxLength != null) && (
                <MetaItem label="LENGTH">
                  <code className="font-mono text-[#1f2328]">
                    {p.schema?.minLength ?? 0}..{p.schema?.maxLength ?? "∞"}
                  </code>
                </MetaItem>
              )}

              {(p.schema?.minimum != null || p.schema?.maximum != null) && (
                <MetaItem label="RANGE">
                  <code className="font-mono text-[#1f2328]">
                    {p.schema?.minimum ?? "-∞"}..{p.schema?.maximum ?? "∞"}
                  </code>
                </MetaItem>
              )}
            </div>

            {/* Enum values */}
            {p.schema?.enum && p.schema.enum.length > 0 && (
              <div className="mt-2">
                <span className="text-xs font-semibold text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-1.5 py-0.5">
                  VALID VALUES
                </span>
                <ul className="mt-1.5 space-y-0.5 ml-1">
                  {p.schema.enum.map((v, j) => (
                    <li key={j} className="flex items-baseline gap-1.5 text-xs">
                      <span className="text-[#656d76]">•</span>
                      <code className="font-mono text-[#1f2328]">{String(v)}</code>
                    </li>
                  ))}
                </ul>
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
    <span className="text-xs flex items-baseline gap-1.5">
      <span className="font-semibold text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-1 py-px">
        {label}
      </span>
      {children}
    </span>
  );
}
