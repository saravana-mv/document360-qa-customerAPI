// Compact project-settings form used in the Scenario Manager LHS sidebar.
// Scope is intentionally narrow — only project-scoped fields, no
// Environment or Application settings.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSetupStore } from "../../store/setup.store";
import { useSpecStore } from "../../store/spec.store";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import { Spinner } from "../common/Spinner";

interface ProjectSettingsCardProps {
  /** When provided, called after "Save" succeeds instead of navigating. */
  onDone?: () => void;
}

export function ProjectSettingsCard({ onDone }: ProjectSettingsCardProps = {}) {
  const navigate = useNavigate();
  const setup = useSetupStore();
  const spec = useSpecStore();
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    if (!setup.selectedProjectId || !setup.selectedVersionId) {
      setup.setError("Please select a project version.");
      return;
    }
    if (!setup.langCode.trim()) {
      setup.setError("Please enter a language code.");
      return;
    }
    setStarting(true);
    try {
      setup.confirmSettings();
      const parsedTags = buildParsedTagsFromRegistry();
      spec.setSpec(null as never, parsedTags, null as never);
      if (onDone) {
        onDone();
      } else {
        navigate("/test");
      }
    } catch (err) {
      spec.setError(err instanceof Error ? err.message : "Failed to initialise scenarios");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3">
      <div className="bg-white rounded-md border border-[#d1d9e0] p-4">
        <h3 className="text-sm font-semibold text-[#1f2328] mb-0.5">Project settings</h3>
        <p className="text-xs text-[#656d76] mb-4">Select a project version and language before running scenarios.</p>

        <div className="space-y-3">
          {/* Version */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-[#1f2328] mb-1">
              Version
              {setup.loadingVersions && <Spinner size="sm" className="text-[#656d76]" />}
            </label>
            <select
              value={setup.selectedVersionId}
              onChange={(e) => setup.selectVersion(e.target.value)}
              disabled={setup.versions.length === 0}
              className="w-full px-2.5 py-1.5 border border-[#d1d9e0] rounded-md text-xs bg-[#f6f8fa] focus:bg-white text-[#1f2328] disabled:text-[#afb8c1]"
            >
              <option value="">{setup.loadingVersions ? "Loading..." : setup.versions.length === 0 ? "No versions" : "Select..."}</option>
              {setup.versions.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Language */}
          <div>
            <label className="block text-xs font-medium text-[#1f2328] mb-1">Language Code</label>
            <input
              type="text"
              value={setup.langCode}
              onChange={(e) => setup.setLangCode(e.target.value)}
              placeholder="en"
              className="w-full px-2.5 py-1.5 border border-[#d1d9e0] rounded-md text-xs bg-[#f6f8fa] focus:bg-white text-[#1f2328] placeholder:text-[#afb8c1]"
            />
          </div>

        </div>

        {setup.error && (
          <div className="mt-3 px-2.5 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
            {setup.error}
          </div>
        )}
        {spec.error && (
          <div className="mt-3 px-2.5 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
            {spec.error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={starting || !setup.selectedProjectId || !setup.selectedVersionId}
          className="mt-4 w-24 py-1.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 border border-[#1a7f37]/80"
        >
          {starting && <Spinner size="sm" className="text-white" />}
          {starting ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
