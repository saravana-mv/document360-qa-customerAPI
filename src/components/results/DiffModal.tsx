import { useSpecStore } from "../../store/spec.store";
import { useAuthStore } from "../../store/auth.store";
import { Modal } from "../common/Modal";
import { loadSpec } from "../../lib/spec/loader";
import { diffSpecs } from "../../lib/spec/differ";
import { computeFingerprint, saveFingerprint, loadFingerprint } from "../../lib/spec/fingerprint";
import type { SwaggerSpec } from "../../types/spec.types";
import { useState } from "react";
import { Spinner } from "../common/Spinner";

interface DiffModalProps {
  open: boolean;
  onClose: () => void;
}

export function DiffModal({ open, onClose }: DiffModalProps) {
  const { spec, diff, setDiff, fingerprint } = useSpecStore();
  const { token } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [noChanges, setNoChanges] = useState(false);

  async function checkChanges() {
    if (!spec) return;
    setChecking(true);
    setError("");
    setNoChanges(false);
    try {
      const freshSpec = (await loadSpec(true, token?.access_token)) as SwaggerSpec;
      const freshFp = await computeFingerprint(freshSpec);
      const stored = loadFingerprint();
      if (stored && stored.hash === freshFp.hash) {
        setNoChanges(true);
        setDiff(null);
      } else {
        const d = diffSpecs(spec, freshSpec);
        setDiff(d);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check changes");
    } finally {
      setChecking(false);
    }
  }

  function updateBaseline() {
    if (!spec) return;
    computeFingerprint(spec).then(saveFingerprint);
    setDiff(null);
    onClose();
  }

  const hasChanges = diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Spec Change Detection"
      maxWidth="max-w-2xl"
      footer={
        <>
          {hasChanges && (
            <button onClick={updateBaseline} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
              Update Baseline
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">
            {hasChanges ? "Run Anyway" : "Close"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={checkChanges}
            disabled={checking || !spec}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {checking && <Spinner size="sm" className="text-white" />}
            {checking ? "Checking..." : "Check Now"}
          </button>
          {fingerprint && (
            <span className="text-xs text-gray-400">
              Baseline: {new Date(fingerprint.timestamp).toLocaleDateString()} · {fingerprint.operationCount} ops
            </span>
          )}
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

        {noChanges && (
          <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
            No changes detected — spec matches baseline.
          </div>
        )}

        {hasChanges && (
          <div className="space-y-3">
            {diff.added.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-green-700 mb-1">Added ({diff.added.length})</h4>
                {diff.added.map((ep) => (
                  <div key={`${ep.method}:${ep.path}`} className="text-xs font-mono text-green-600 py-0.5">
                    + {ep.method} {ep.path}
                  </div>
                ))}
              </div>
            )}
            {diff.removed.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-red-700 mb-1">Removed ({diff.removed.length})</h4>
                {diff.removed.map((ep) => (
                  <div key={`${ep.method}:${ep.path}`} className="text-xs font-mono text-red-600 py-0.5">
                    - {ep.method} {ep.path}
                  </div>
                ))}
              </div>
            )}
            {diff.changed.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-yellow-700 mb-1">Changed ({diff.changed.length})</h4>
                {diff.changed.map((ep) => (
                  <div key={`${ep.method}:${ep.path}`} className="mb-2">
                    <div className="text-xs font-mono text-yellow-700">~ {ep.method} {ep.path}</div>
                    {ep.changes.map((c, i) => (
                      <div key={i} className="text-xs text-gray-600 ml-4">• {c}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
