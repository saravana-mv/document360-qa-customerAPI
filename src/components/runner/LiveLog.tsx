import { useEffect, useRef } from "react";
import { useRunnerStore } from "../../store/runner.store";

const levelColor = {
  info: "text-gray-300",
  success: "text-green-400",
  error: "text-red-400",
  warn: "text-yellow-400",
};

export function LiveLog() {
  const { log } = useRunnerStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  return (
    <div className="flex-1 bg-gray-900 rounded-lg p-3 overflow-y-auto font-mono text-xs space-y-0.5 min-h-0">
      {log.length === 0 && <span className="text-gray-500">Ready. Press Run to start.</span>}
      {log.map((entry) => (
        <div key={entry.id} className={`${levelColor[entry.level]}`}>
          <span className="text-gray-600">{new Date(entry.timestamp).toLocaleTimeString()}</span>
          {" "}
          {entry.tag && <span className="text-gray-500">[{entry.tag}]</span>}
          {" "}
          {entry.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
