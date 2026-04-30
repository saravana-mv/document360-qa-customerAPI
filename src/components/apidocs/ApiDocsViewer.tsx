import { useCallback, useEffect, useState } from "react";
import { ResizeHandle } from "../common/ResizeHandle";
import { EndpointSidebar } from "./EndpointSidebar";
import { EndpointDocView } from "./EndpointDocView";
import { parseSwaggerSpec, type ParsedEndpointDoc, type ParsedSpec } from "../../lib/spec/swaggerParser";
import { getSpecFileContent } from "../../lib/api/specFilesApi";

interface Props {
  /** Version folder path (e.g. "v3") — used to locate _system/_swagger.json */
  versionFolder: string;
}

export function ApiDocsViewer({ versionFolder }: Props) {
  const [parsedSpec, setParsedSpec] = useState<ParsedSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ParsedEndpointDoc | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { const v = localStorage.getItem("apidocs_sidebar_width"); if (v) return parseInt(v, 10); } catch { /* ignore */ }
    return 320;
  });
  useEffect(() => { try { localStorage.setItem("apidocs_sidebar_width", String(sidebarWidth)); } catch { /* ignore */ } }, [sidebarWidth]);

  const loadSpec = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const swaggerPath = `${versionFolder}/_system/_swagger.json`;
      const raw = await getSpecFileContent(swaggerPath);
      const parsed = parseSwaggerSpec(raw);
      setParsedSpec(parsed);
      // Auto-select first endpoint
      if (parsed.groups.length > 0 && parsed.groups[0].endpoints.length > 0) {
        setSelectedEndpoint(parsed.groups[0].endpoints[0]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("404") || msg.includes("Not Found")) {
        setError(null); // No swagger — caller handles fallback
        setParsedSpec(null);
      } else {
        setError(`Failed to load API spec: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [versionFolder]);

  useEffect(() => { void loadSpec(); }, [loadSpec]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">
        Loading API documentation…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2 max-w-sm">
          <p className="text-sm text-[#d1242f]">{error}</p>
          <button onClick={() => void loadSpec()} className="text-sm text-[#0969da] hover:underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!parsedSpec) return null; // No swagger available — caller will show Files tab

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Endpoint sidebar */}
      <div className="shrink-0 border-r border-[#d1d9e0] bg-white overflow-hidden" style={{ width: sidebarWidth }}>
        <EndpointSidebar
          groups={parsedSpec.groups}
          selectedEndpoint={selectedEndpoint}
          onSelectEndpoint={setSelectedEndpoint}
        />
      </div>
      <ResizeHandle width={sidebarWidth} onResize={setSidebarWidth} minWidth={220} maxWidth={500} />

      {/* Doc view */}
      {selectedEndpoint ? (
        <EndpointDocView
          endpoint={selectedEndpoint}
          securitySchemes={parsedSpec.securitySchemes}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">
          Select an endpoint to view its documentation
        </div>
      )}
    </div>
  );
}
