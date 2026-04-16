import { useCallback, useEffect, useRef, useState } from "react";
import MDEditor from "@uiw/react-md-editor";

interface Props {
  path: string;
  content: string;
  onClose?: () => void;
}

export function MarkdownViewer({ path, content, onClose }: Props) {
  const [raw, setRaw] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parts = path.split("/");
  const fileName = parts[parts.length - 1];
  const folder = parts.slice(0, -1).join(" / ");
  const isMarkdown = fileName.endsWith(".md");

  // Ctrl+F / Cmd+F to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchTerm("");
        clearHighlights();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  function clearHighlights() {
    if (!contentRef.current) return;
    const marks = contentRef.current.querySelectorAll("mark[data-search-highlight]");
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
        parent.normalize();
      }
    });
  }

  const highlight = useCallback((term: string, scrollToIdx: number) => {
    if (!contentRef.current) return 0;
    clearHighlights();
    if (!term) return 0;

    const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      textNodes.push(node);
    }

    const lowerTerm = term.toLowerCase();
    let totalMatches = 0;

    for (const textNode of textNodes) {
      const text = textNode.textContent ?? "";
      const lowerText = text.toLowerCase();
      if (!lowerText.includes(lowerTerm)) continue;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let searchIdx = lowerText.indexOf(lowerTerm, lastIdx);

      while (searchIdx !== -1) {
        if (searchIdx > lastIdx) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, searchIdx)));
        }
        const mark = document.createElement("mark");
        mark.setAttribute("data-search-highlight", "true");
        mark.textContent = text.slice(searchIdx, searchIdx + term.length);
        mark.style.backgroundColor = totalMatches === scrollToIdx ? "#fff176" : "#fff9c4";
        mark.style.color = "#1f2328";
        mark.style.borderRadius = "2px";
        mark.style.padding = "0 1px";
        if (totalMatches === scrollToIdx) {
          mark.style.outline = "2px solid #f9a825";
          mark.setAttribute("data-active", "true");
        }
        frag.appendChild(mark);
        totalMatches++;
        lastIdx = searchIdx + term.length;
        searchIdx = lowerText.indexOf(lowerTerm, lastIdx);
      }

      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      }

      textNode.parentNode?.replaceChild(frag, textNode);
    }

    // Scroll active match into view
    const active = contentRef.current.querySelector("mark[data-active]");
    active?.scrollIntoView({ block: "center", behavior: "smooth" });

    return totalMatches;
  }, []);

  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    const count = highlight(searchTerm, matchIndex);
    setMatchCount(count);
  }, [searchTerm, matchIndex, highlight, raw, content]);

  function handleSearchChange(term: string) {
    setSearchTerm(term);
    setMatchIndex(0);
  }

  function handleNext() {
    if (matchCount === 0) return;
    setMatchIndex((prev) => (prev + 1) % matchCount);
  }

  function handlePrev() {
    if (matchCount === 0) return;
    setMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }

  function handleClose() {
    setSearchOpen(false);
    setSearchTerm("");
    setMatchIndex(0);
    clearHighlights();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-[#1f2328] truncate block">{fileName}</span>
          {folder && <p className="text-xs text-[#656d76] truncate">{folder}</p>}
        </div>
        {/* Raw / Rendered toggle — only meaningful for markdown */}
        {isMarkdown && (
          <div className="flex items-center shrink-0 rounded-md overflow-hidden border border-[#d1d9e0] text-[13px]">
            <button
              onClick={() => setRaw(false)}
              className={`px-2.5 py-1 transition-colors ${!raw ? "bg-[#0969da] text-white" : "text-[#656d76] hover:bg-[#f6f8fa]"}`}
            >
              Rendered
            </button>
            <button
              onClick={() => setRaw(true)}
              className={`px-2.5 py-1 transition-colors ${raw ? "bg-[#0969da] text-white" : "text-[#656d76] hover:bg-[#f6f8fa]"}`}
            >
              Raw
            </button>
          </div>
        )}
        <button
          onClick={() => { setSearchOpen(!searchOpen); setTimeout(() => inputRef.current?.focus(), 0); }}
          title="Search (Ctrl+F)"
          className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors border ${searchOpen ? "text-[#0969da] bg-[#ddf4ff] border-[#b6e3ff]" : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] border-transparent hover:border-[#d1d9e0]"}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </button>
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] border border-transparent hover:border-[#d1d9e0] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <svg className="w-3.5 h-3.5 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.shiftKey ? handlePrev() : handleNext(); }
              if (e.key === "Escape") handleClose();
            }}
            placeholder="Search..."
            className="flex-1 text-sm border border-[#d1d9e0] rounded-md px-2 py-1 focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
          />
          {searchTerm && (
            <span className="text-xs text-[#656d76] shrink-0 tabular-nums">
              {matchCount > 0 ? `${matchIndex + 1} / ${matchCount}` : "No results"}
            </span>
          )}
          <button
            onClick={handlePrev}
            disabled={matchCount === 0}
            title="Previous (Shift+Enter)"
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
            </svg>
          </button>
          <button
            onClick={handleNext}
            disabled={matchCount === 0}
            title="Next (Enter)"
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={handleClose}
            title="Close search"
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto" ref={contentRef}>
        {isMarkdown && !raw ? (
          <div className="p-6 md-wrap-fix" data-color-mode="light">
            <style>{`
              .md-wrap-fix .wmde-markdown pre > code {
                white-space: pre-wrap !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
              }
              .md-wrap-fix .wmde-markdown pre {
                white-space: pre-wrap !important;
                overflow-wrap: break-word !important;
              }
              .md-wrap-fix .wmde-markdown table {
                table-layout: fixed;
                width: 100%;
              }
              .md-wrap-fix .wmde-markdown td,
              .md-wrap-fix .wmde-markdown th {
                white-space: normal !important;
                word-break: break-word !important;
              }
              .md-wrap-fix .wmde-markdown p,
              .md-wrap-fix .wmde-markdown li,
              .md-wrap-fix .wmde-markdown blockquote {
                overflow-wrap: break-word !important;
                word-break: break-word !important;
              }
            `}</style>
            <MDEditor.Markdown
              source={content}
              style={{ background: "transparent", fontFamily: "inherit" }}
            />
          </div>
        ) : (
          <pre className="p-6 text-[13px] font-mono text-[#1f2328] whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
