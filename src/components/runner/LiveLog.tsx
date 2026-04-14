import { useEffect, useMemo, useRef } from "react";
import { useRunnerStore } from "../../store/runner.store";
import type { LogEntry } from "../../types/test.types";

const levelColor: Record<LogEntry["level"], string> = {
  info: "text-[#7d8590]",
  success: "text-[#3fb950]",
  error: "text-[#f85149]",
  warn: "text-[#d29922]",
};

export function LiveLog() {
  const { log } = useRunnerStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  // Build a set of testIds that appear for the first time at each index,
  // so we know when to render a header.
  const firstOccurrence = useMemo(() => {
    const seen = new Set<string>();
    const firsts = new Set<string>(); // entry ids that are first for their testId
    for (const entry of log) {
      if (entry.testId && !seen.has(entry.testId)) {
        seen.add(entry.testId);
        firsts.add(entry.id);
      }
    }
    return firsts;
  }, [log]);

  return (
    <div className="flex-1 bg-[#0d1117] rounded-md p-3 overflow-y-auto font-mono text-xs min-h-0 border border-[#21262d]">
      {log.length === 0 && <span className="text-[#484f58]">Ready. Press Run to start.</span>}
      {log.map((entry) => {
        const showHeader = firstOccurrence.has(entry.id);
        return (
          <div key={entry.id}>
            {/* Test name header — shown once when a new testId first appears */}
            {showHeader && entry.testName && (
              <div className="text-[#e6edf3] font-semibold mt-2 mb-0.5 first:mt-0">
                {entry.testName}
              </div>
            )}
            {/* Flow-level line (STARTED / COMPLETED) — no timestamp, blue, with star delimiters */}
            {!entry.testId && entry.tag ? (
              <div className="text-[#58a6ff] font-semibold mt-2 mb-0.5">
                {"****** "}[{entry.tag}] - {entry.message}{" ******"}
              </div>
            ) : (
              <div className={`${levelColor[entry.level]} ${entry.testId ? "pl-3" : ""}`}>
                <span className="text-[#484f58]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                {" "}
                {entry.message}
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
