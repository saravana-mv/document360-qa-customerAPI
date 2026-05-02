import { useState } from "react";

interface ExampleCategory {
  key: string;
  label: string;
  prompts: string[];
}

const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    key: "crud",
    label: "CRUD lifecycle",
    prompts: [
      "Create full CRUD lifecycle for each entity — create, read, update, delete with assertions",
      "Test creating with all required fields, then verify retrieval returns exact same data",
      "Test update operations with partial changes and verify only modified fields changed",
    ],
  },
  {
    key: "errors",
    label: "Error handling",
    prompts: [
      "Test validation errors — missing required fields (400), invalid field values (422)",
      "Test not found scenarios — fetch, update, delete with non-existent IDs (404)",
      "Test duplicate creation and unique constraint violations (409)",
    ],
  },
  {
    key: "deps",
    label: "Dependencies",
    prompts: [
      "Test foreign key relationships — create parent, create child referencing parent, verify linkage",
      "Test cascading deletes — delete parent entity and verify child entities are cleaned up",
      "Test bulk create/update operations and verify each item individually",
    ],
  },
  {
    key: "states",
    label: "State transitions",
    prompts: [
      "Test publish/unpublish workflows — create draft, publish, verify status change, unpublish",
      "Test lock/unlock flows — lock entity, verify edit fails, unlock, verify edit succeeds",
      "Test permission boundaries — attempt actions without required role or token",
    ],
  },
  {
    key: "edge",
    label: "Edge cases",
    prompts: [
      "Test pagination — verify page sizes, empty pages, boundary offsets, sorting order",
      "Test field boundaries — empty strings, max length, special characters, zero/negative numbers",
      "Test concurrent operations — create two entities with same unique field, verify conflict",
    ],
  },
];

interface ExampleButtonsProps {
  onSendPrompt: (prompt: string) => void;
}

export function ExampleButtons({ onSendPrompt }: ExampleButtonsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="w-full max-w-[560px]">
      {/* Category pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        {EXAMPLE_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setExpanded(expanded === cat.key ? null : cat.key)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
              expanded === cat.key
                ? "bg-[#1f2328] text-white border-[#1f2328]"
                : "text-[#656d76] bg-[#f6f8fa] border-[#d1d9e0]/70 hover:border-[#afb8c1] hover:text-[#1f2328]"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Expanded prompts panel */}
      {expanded && (
        <div className="mt-3 rounded-lg border border-[#d1d9e0] bg-[#f6f8fa] overflow-hidden">
          {EXAMPLE_CATEGORIES.find((c) => c.key === expanded)?.prompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => onSendPrompt(prompt)}
              className="w-full text-left px-4 py-2.5 text-sm text-[#1f2328] hover:bg-[#eef1f6] transition-colors border-b border-[#d1d9e0]/50 last:border-b-0"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
