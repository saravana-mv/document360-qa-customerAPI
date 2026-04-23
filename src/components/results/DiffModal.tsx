import { useSpecStore } from "../../store/spec.store";
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
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [noChanges, setNoChanges] = useState(false);

  async function checkChanges() {
    if (!spec) return;
    setChecking(true);
    setError("");
    setNoChanges(false);
    try {
      const freshSpec = (await loadSpec(true)) as SwaggerSpec;
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
            <button onClick={updateBaseline} className="px-4 py-2 bg-[#1a7f37] text-white text-sm rounded-md hover:bg-[#1a7f37]/90">
              Update Baseline
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 bg-[#f6f8fa] text-[#1f2328] text-sm rounded-md hover:bg-[#eef1f6] border border-[#d1d9e0]">
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
            className="px-4 py-2 bg-[#0969da] text-white text-sm rounded-md hover:bg-[#0860ca] disabled:opacity-50 flex items-center gap-2"
          >
            {checking && <Spinner size="sm" className="text-white" />}
            {checking ? "Checking..." : "Check Now"}
          </button>
          {fingerprint && (
            <span className="text-xs text-[#656d76]">
              Baseline: {new Date(fingerprint.timestamp).toLocaleDateString()} · {fingerprint.operationCount} ops
            </span>
          )}
        </div>

        {error && <div className="p-3 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">{error}</div>}

        {noChanges && (
          <div className="p-3 bg-[#dafbe1] border border-[#aceebb] rounded-md text-sm text-[#1a7f37]">
            No changes detected — spec matches baseline.
          </div>
        )}

        {hasChanges && (
          <div className="space-y-3">
            {diff.added.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-[#1a7f37] mb-1">Added ({diff.added.length})</h4>
                {diff.added.map((ep) => (
                  <div key={`${ep.method}:${ep.path}`} className="text-xs font-mono text-[#1a7f37] py-0.5">
                    + {ep.method} {ep.path}
                  </div>
                ))}
              </div>
            )}
            {diff.removed.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-[#d1242f] mb-1">Removed ({diff.removed.length})</h4>
                {diff.removed.map((ep) => (
                  <div key={`${ep.method}:${ep.path}`} className="text-xs font-mono text-[#d1242f] py-0.5">
                    - {ep.method} {ep.path}
                  </div>
                ))}
              </div>
            )}
            {diff.changed.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-[#9a6700] mb-1">Changed ({diff.changed.length})</h4>
                {diff.changed.map((ep) => (
                  <div key={`${ep.method}:${ep.path}`} className="mb-2">
                    <div className="text-xs font-mono text-[#9a6700]">~ {ep.method} {ep.path}</div>
                    {ep.changes.map((c, i) => (
                      <div key={i} className="text-xs text-[#656d76] ml-4">• {c}</div>
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
