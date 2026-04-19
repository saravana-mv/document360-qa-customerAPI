import { useCallback, useEffect, useMemo, useState } from "react";
import { listApiKeys, createApiKey, revokeApiKey } from "../../lib/api/apiKeysApi";
import type { ApiKeyInfo } from "../../lib/api/apiKeysApi";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";

// ── Icons ───────────────────────────────────────────────────────────────────

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [versionId, setVersionId] = useState("");
  const [authMethod, setAuthMethod] = useState<"oauth" | "apikey">("oauth");
  const [creating, setCreating] = useState(false);

  // Newly created key (shown once)
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revoking, setRevoking] = useState<string | null>(null);

  const versionConfigs = useScenarioOrgStore((s) => s.versionConfigs);
  const folders = useScenarioOrgStore((s) => s.folders);
  const versions = useMemo(() => {
    const vs = new Set<string>();
    for (const v of Object.keys(versionConfigs)) vs.add(v);
    for (const v of Object.keys(folders)) vs.add(v);
    return Array.from(vs).sort((a, b) => b.localeCompare(a));
  }, [versionConfigs, folders]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listApiKeys();
      setKeys(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate() {
    if (!name.trim() || !versionId) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createApiKey(name.trim(), versionId, authMethod);
      setNewKey(result.key);
      setCopied(false);
      setShowCreate(false);
      setName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    setError(null);
    try {
      await revokeApiKey(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevoking(null);
    }
  }

  function handleCopy() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <KeyIcon className="w-5 h-5 text-[#656d76]" />
        <span className="text-sm font-bold text-[#1f2328]">API Keys</span>
        <span className="text-xs text-[#656d76] ml-1">
          {keys.length} {keys.length === 1 ? "key" : "keys"}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => { setShowCreate(true); setNewKey(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-sm font-medium rounded-md transition-colors border border-[#1a7f37]/80"
        >
          <PlusIcon className="w-4 h-4" />
          New key
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
      <p className="text-sm text-[#656d76] mb-4">
        Authenticate external API calls to run scenarios via <code className="text-xs bg-[#f6f8fa] px-1 py-0.5 rounded border border-[#d1d9e0]">POST /api/run-scenario</code>.
      </p>

      {/* ── Newly created key banner ───────────────────────────── */}
      {newKey && (
        <div className="mb-4 p-3 bg-[#dafbe1] border border-[#aceebb] rounded-md">
          <p className="text-xs font-medium text-[#1a7f37] mb-1.5">
            API key created — copy it now, it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-white/70 px-2 py-1.5 rounded border border-[#aceebb] text-[#1f2328] select-all break-all">
              {newKey}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 p-1.5 rounded-md border border-[#aceebb] hover:bg-white/50 transition-colors"
              title="Copy to clipboard"
            >
              {copied
                ? <CheckIcon className="w-4 h-4 text-[#1a7f37]" />
                : <CopyIcon className="w-4 h-4 text-[#1a7f37]" />
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────── */}
      {error && (
        <div className="mb-4 p-2.5 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
          {error}
        </div>
      )}

      {/* ── Create form ────────────────────────────────────────── */}
      {showCreate && (
        <div className="mb-4 p-4 bg-[#f6f8fa] border border-[#d1d9e0] rounded-lg">
          <h3 className="text-sm font-semibold text-[#1f2328] mb-3">Create API key</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#1f2328] mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CI Pipeline"
                className="w-full px-2.5 py-1.5 border border-[#d1d9e0] rounded-md text-xs bg-white text-[#1f2328] placeholder:text-[#afb8c1] focus:outline-none focus:ring-1 focus:ring-[#0969da]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1f2328] mb-1">Version</label>
              <select
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#d1d9e0] rounded-md text-xs bg-white text-[#1f2328] focus:outline-none focus:ring-1 focus:ring-[#0969da]"
              >
                <option value="">Select version…</option>
                {versions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <p className="text-[10px] text-[#656d76] mt-0.5">
                The key will use this version's D360 credentials when running scenarios.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1f2328] mb-1">Auth method</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAuthMethod("oauth")}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    authMethod === "oauth"
                      ? "bg-[#ddf4ff] border-[#54aeff] text-[#0969da]"
                      : "bg-white border-[#d1d9e0] text-[#656d76] hover:bg-[#f6f8fa]"
                  }`}
                >
                  D360 OAuth
                </button>
                <button
                  onClick={() => setAuthMethod("apikey")}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    authMethod === "apikey"
                      ? "bg-[#ddf4ff] border-[#54aeff] text-[#0969da]"
                      : "bg-white border-[#d1d9e0] text-[#656d76] hover:bg-[#f6f8fa]"
                  }`}
                >
                  API Key
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-[5px] text-xs font-medium text-[#1f2328] bg-white border border-[#d1d9e0] rounded-md hover:bg-[#f6f8fa] transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={creating || !name.trim() || !versionId}
              onClick={handleCreate}
              className="px-3 py-[5px] text-xs font-medium text-white bg-[#1a7f37] border border-[#1a7f37]/80 rounded-md hover:bg-[#1a7f37]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating…" : "Create key"}
            </button>
          </div>
        </div>
      )}

      {/* ── Keys table ─────────────────────────────────────────── */}
      {loading ? (
        <p className="text-xs text-[#656d76] py-4 text-center">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-xs text-[#656d76] py-4 text-center">
          No API keys yet. Create one to start calling the FlowForge API.
        </p>
      ) : (
        <div className="border border-[#d1d9e0] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f6f8fa] border-b border-[#d1d9e0]">
                <th className="text-left px-3 py-2 font-medium text-[#656d76]">Name</th>
                <th className="text-left px-3 py-2 font-medium text-[#656d76]">Key</th>
                <th className="text-left px-3 py-2 font-medium text-[#656d76]">Version</th>
                <th className="text-left px-3 py-2 font-medium text-[#656d76]">Created</th>
                <th className="text-left px-3 py-2 font-medium text-[#656d76]">Last used</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-[#d1d9e0] last:border-0 hover:bg-[#f6f8fa]">
                  <td className="px-3 py-2 text-[#1f2328] font-medium">{k.name}</td>
                  <td className="px-3 py-2 font-mono text-[#656d76]">{k.keyPrefix}…</td>
                  <td className="px-3 py-2 text-[#656d76]">{k.versionId}</td>
                  <td className="px-3 py-2 text-[#656d76]">{formatDate(k.createdAt)}</td>
                  <td className="px-3 py-2 text-[#656d76]">{k.lastUsedAt ? formatDate(k.lastUsedAt) : "Never"}</td>
                  <td className="px-2 py-2">
                    <button
                      onClick={() => handleRevoke(k.id)}
                      disabled={revoking === k.id}
                      title="Revoke key"
                      className="p-1 rounded hover:bg-[#ffebe9] text-[#656d76] hover:text-[#d1242f] transition-colors disabled:opacity-50"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
