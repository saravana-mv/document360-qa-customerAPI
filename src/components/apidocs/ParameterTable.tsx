import type { Parameter } from "../../types/spec.types";

interface Props {
  title: string;
  parameters: Parameter[];
}

export function ParameterTable({ title, parameters }: Props) {
  if (parameters.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">{title}</h4>
      <div className="border border-[#d1d9e0] rounded-md overflow-hidden">
        {parameters.map((p, i) => (
          <div
            key={p.name}
            className={`flex items-start gap-3 px-3 py-2 ${i > 0 ? "border-t border-[#d1d9e0]" : ""}`}
          >
            <div className="flex items-baseline gap-1.5 min-w-[140px] shrink-0">
              <span className="text-sm font-mono font-medium text-[#1f2328]">{p.name}</span>
              {p.required && (
                <span className="text-xs text-[#d1242f] font-medium">*</span>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-[#656d76]">
                  {p.schema?.type ?? "string"}
                  {p.schema?.format ? ` (${p.schema.format})` : ""}
                </span>
              </div>
              {p.description && (
                <p className="text-xs text-[#656d76]">{p.description}</p>
              )}
              {p.schema?.enum && (
                <p className="text-xs text-[#656d76]">
                  Enum: {p.schema.enum.map(v => `\`${v}\``).join(", ")}
                </p>
              )}
              {p.schema?.pattern && (
                <p className="text-xs text-[#656d76] font-mono">
                  Pattern: {p.schema.pattern}
                </p>
              )}
              {(p.example ?? p.schema?.example) != null && (
                <p className="text-xs text-[#656d76]">
                  Example: <code className="bg-[#f6f8fa] px-1 rounded text-[#1f2328]">{String(p.example ?? p.schema?.example)}</code>
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
