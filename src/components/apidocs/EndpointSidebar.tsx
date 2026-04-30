import { useMemo, useState } from "react";
import { MethodBadge } from "./MethodBadge";
import type { EndpointGroup, ParsedEndpointDoc } from "../../lib/spec/swaggerParser";

interface Props {
  groups: EndpointGroup[];
  selectedEndpoint: ParsedEndpointDoc | null;
  onSelectEndpoint: (ep: ParsedEndpointDoc) => void;
}

export function EndpointSidebar({ groups, selectedEndpoint, onSelectEndpoint }: Props) {
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(groups.map(g => g.tag)),
  );

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map(g => ({
        ...g,
        endpoints: g.endpoints.filter(ep =>
          ep.path.toLowerCase().includes(q) ||
          ep.summary.toLowerCase().includes(q) ||
          ep.method.toLowerCase().includes(q) ||
          (ep.operationId ?? "").toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.endpoints.length > 0);
  }, [groups, search]);

  function toggleGroup(tag: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }

  const totalEndpoints = groups.reduce((sum, g) => sum + g.endpoints.length, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="px-3 py-2 border-b border-[#d1d9e0] shrink-0">
        <div className="relative">
          <svg className="w-3.5 h-3.5 text-[#656d76] absolute left-2 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search endpoints..."
            className="w-full text-sm pl-7 pr-2 py-1.5 border border-[#d1d9e0] rounded-md outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] bg-white text-[#1f2328] placeholder-[#afb8c1]"
          />
        </div>
        <p className="text-xs text-[#656d76] mt-1">{totalEndpoints} endpoints</p>
      </div>

      {/* Endpoint list */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredGroups.map(group => {
          const isExpanded = expandedGroups.has(group.tag);
          return (
            <div key={group.tag}>
              <button
                onClick={() => toggleGroup(group.tag)}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-[#f6f8fa] transition-colors"
              >
                <svg className={`w-3 h-3 text-[#656d76] shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 16 16">
                  <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                </svg>
                <span className="text-sm font-semibold text-[#1f2328] truncate">{group.tag}</span>
                <span className="text-xs text-[#656d76] ml-auto shrink-0">{group.endpoints.length}</span>
              </button>
              {isExpanded && (
                <div className="pb-1">
                  {group.endpoints.map((ep, i) => {
                    const isSelected = selectedEndpoint === ep;
                    return (
                      <button
                        key={`${ep.method}-${ep.path}-${i}`}
                        onClick={() => onSelectEndpoint(ep)}
                        className={[
                          "w-full flex items-center gap-2 px-3 pl-7 py-1.5 text-left transition-colors",
                          isSelected
                            ? "bg-[#ddf4ff] text-[#0969da]"
                            : "text-[#1f2328] hover:bg-[#f6f8fa]",
                        ].join(" ")}
                        title={`${ep.method.toUpperCase()} ${ep.path}`}
                      >
                        <MethodBadge method={ep.method} size="xs" />
                        <span className="text-sm truncate flex-1">
                          {ep.summary || ep.path.split("/").pop() || ep.path}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filteredGroups.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-[#656d76]">
            No endpoints match your search.
          </div>
        )}
      </div>
    </div>
  );
}
