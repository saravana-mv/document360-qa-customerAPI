import { useEffect, useState } from "react";
import { useConnectionsStore } from "../store/connections.store";
import { Spinner } from "../components/common/Spinner";
import { ConnectionFormModal } from "../components/connections/ConnectionFormModal";
import type { Connection } from "../lib/api/connectionsApi";

export function ConnectionsPage() {
  const { connections, loading, error, load, remove } = useConnectionsStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(conn: Connection) {
    if (!window.confirm(`Delete connection "${conn.name}"?\n\nScenarios using this connection will need to be reconfigured.`)) return;
    setDeleting(conn.id);
    try {
      await remove(conn.id);
    } catch (e) {
      alert(`Failed to delete: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-sm font-bold text-[#1f2328]">Connections</h1>
            <p className="text-xs text-[#656d76] mt-1">
              Register OAuth apps to authenticate FlowForge against external APIs.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md transition-colors border border-[#1a7f37]/80"
          >
            New connection
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-2.5 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && connections.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" className="text-[#656d76]" />
          </div>
        )}

        {/* Empty state */}
        {!loading && connections.length === 0 && (
          <div className="border border-[#d1d9e0] rounded-lg p-8 text-center bg-[#f6f8fa]">
            <svg className="w-10 h-10 text-[#656d76] mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.135a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.34 8.303" />
            </svg>
            <p className="text-sm font-medium text-[#1f2328] mb-1">No connections yet</p>
            <p className="text-xs text-[#656d76] mb-4">
              Create a connection to authenticate against your API using OAuth 2.0.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md transition-colors border border-[#1a7f37]/80"
            >
              New connection
            </button>
          </div>
        )}

        {/* Connection list */}
        {connections.length > 0 && (
          <div className="border border-[#d1d9e0] rounded-lg divide-y divide-[#d1d9e0] bg-white">
            {connections.map((conn) => (
              <div key={conn.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[#f6f8fa] transition-colors">
                {/* Icon */}
                <div className="w-8 h-8 rounded-full bg-[#ddf4ff] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.135a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.34 8.303" />
                  </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#1f2328] truncate">{conn.name}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-[#ddf4ff] text-[#0969da] rounded-full uppercase tracking-wide">
                      OAuth 2.0
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-[#656d76] font-mono truncate">{conn.clientId}</span>
                    {conn.hasSecret && (
                      <span className="text-xs text-[#1a7f37] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1a7f37]" />
                        Secret stored
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditing(conn)}
                    className="p-1.5 text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] rounded-md transition-colors"
                    title="Edit connection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void handleDelete(conn)}
                    disabled={deleting === conn.id}
                    className="p-1.5 text-[#656d76] hover:text-[#d1242f] hover:bg-[#ffebe9] rounded-md transition-colors disabled:opacity-50"
                    title="Delete connection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Redirect URI help text */}
        {connections.length > 0 && (
          <div className="mt-4 p-3 bg-[#f6f8fa] border border-[#d1d9e0] rounded-md">
            <p className="text-xs text-[#656d76]">
              <strong className="text-[#1f2328]">Redirect URI:</strong> When registering your OAuth app with the API provider,
              set the redirect URI to your FlowForge instance URL + the path shown in the connection details (e.g.{" "}
              <code className="bg-white px-1 rounded text-[#1f2328]">https://your-app.azurestaticapps.net/oauth/callback/&lt;id&gt;</code>).
            </p>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {showCreate && (
        <ConnectionFormModal onClose={() => setShowCreate(false)} />
      )}
      {editing && (
        <ConnectionFormModal connection={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
