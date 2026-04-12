import { useEffect, useRef } from "react";
import { useRunnerStore } from "../../store/runner.store";

const levelColor = {
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

  return (
    <div className="flex-1 bg-[#0d1117] rounded-md p-3 overflow-y-auto font-mono text-xs space-y-0.5 min-h-0 border border-[#21262d]">
      {log.length === 0 && <span className="text-[#484f58]">Ready. Press Run to start.</span>}
      {log.map((entry) => (
        <div key={entry.id} className={`${levelColor[entry.level]}`}>
          <span className="text-[#484f58]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
          {" "}
          {entry.tag && <span className="text-[#656d76]">[{entry.tag}]</span>}
          {" "}
          {entry.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
