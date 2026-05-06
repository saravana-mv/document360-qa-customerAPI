import { useMemo } from "react";
import { diffLines } from "diff";

interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
  oldNum?: number;
  newNum?: number;
}

/**
 * Line-level diff using jsdiff (Myers algorithm with anchor-based matching).
 * Handles JSON-like content with repeated lines (`}`, `},`, `]`) without
 * the spurious-alignment artefacts a naive LCS would produce.
 */
function computeLineDiff(a: string, b: string): DiffLine[] {
  const changes = diffLines(a, b, { newlineIsToken: false });
  const result: DiffLine[] = [];
  let oldNum = 0;
  let newNum = 0;
  for (const change of changes) {
    // Each change.value is one or more lines joined by \n; trailing \n means
    // the original ended with a newline. Splitting on \n and dropping the
    // final empty entry (when present) gives us per-line items.
    const parts = change.value.split("\n");
    if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    if (change.added) {
      for (const text of parts) {
        newNum++;
        result.push({ type: "add", text, newNum });
      }
    } else if (change.removed) {
      for (const text of parts) {
        oldNum++;
        result.push({ type: "remove", text, oldNum });
      }
    } else {
      for (const text of parts) {
        oldNum++;
        newNum++;
        result.push({ type: "same", text, oldNum, newNum });
      }
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
