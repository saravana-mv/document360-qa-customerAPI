import { useMemo } from "react";

interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
  oldNum?: number;
  newNum?: number;
}

/** Simple line-level diff using longest common subsequence */
function computeLineDiff(a: string, b: string): DiffLine[] {
  const oldLines = a.split("\n");
  const newLines = b.split("\n");

  const m = oldLines.length;
  const n = newLines.length;

  // For large files, use a simpler O(n) approach
  if (m * n > 500_000) {
    return simpleDiff(oldLines, newLines);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m, j = n;
  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "same", text: oldLines[i - 1], oldNum: i, newNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "add", text: newLines[j - 1], newNum: j });
      j--;
    } else {
      stack.push({ type: "remove", text: oldLines[i - 1], oldNum: i });
      i--;
    }
  }

  while (stack.length) result.push(stack.pop()!);
  return result;
}

function simpleDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: "same", text: oldLines[oi], oldNum: oi + 1, newNum: ni + 1 });
      oi++; ni++;
    } else if (oi < oldLines.length && !newSet.has(oldLines[oi])) {
      result.push({ type: "remove", text: oldLines[oi], oldNum: oi + 1 });
      oi++;
    } else if (ni < newLines.length && !oldSet.has(newLines[ni])) {
      result.push({ type: "add", text: newLines[ni], newNum: ni + 1 });
      ni++;
    } else if (oi < oldLines.length) {
      result.push({ type: "remove", text: oldLines[oi], oldNum: oi + 1 });
      oi++;
    } else {
      result.push({ type: "add", text: newLines[ni], newNum: ni + 1 });
      ni++;
    }
  }
  return result;
}

export function XmlDiffView({ original, modified }: { original: string; modified: string }) {
  const diffLines = useMemo(() => computeLineDiff(original, modified), [original, modified]);

  return (
    <div className="flex-1 min-h-0 overflow-auto font-mono text-xs leading-5">
      <table className="w-full border-collapse">
        <tbody>
          {diffLines.map((line, i) => (
            <tr
              key={i}
              className={
                line.type === "add"
                  ? "bg-[#dafbe1]"
                  : line.type === "remove"
                    ? "bg-[#ffebe9]"
                    : ""
              }
            >
              <td className="w-8 text-right pr-2 select-none text-[#afb8c1] border-r border-[#d1d9e0]">
                {line.type !== "add" ? line.oldNum : ""}
              </td>
              <td className="w-8 text-right pr-2 select-none text-[#afb8c1] border-r border-[#d1d9e0]">
                {line.type !== "remove" ? line.newNum : ""}
              </td>
              <td className="w-5 text-center select-none font-bold" style={{
                color: line.type === "add" ? "#1a7f37" : line.type === "remove" ? "#d1242f" : "#afb8c1",
              }}>
                {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
              </td>
              <td className="whitespace-pre pl-2">{line.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
