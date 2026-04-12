interface ProgressBarProps {
  total: number;
  done: number;
}

export function ProgressBar({ total, done }: ProgressBarProps) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="w-full bg-[#d1d9e0]/40 rounded-full h-1.5">
      <div
        className="bg-[#0969da] h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
