import { RunControls } from "../runner/RunControls";
import { LiveLog } from "../runner/LiveLog";

export function ResultsPanel() {
  return (
    <div className="flex flex-col h-full">
      <RunControls />
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
        <LiveLog />
      </div>
    </div>
  );
}
