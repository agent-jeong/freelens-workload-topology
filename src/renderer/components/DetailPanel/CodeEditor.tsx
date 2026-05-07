import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { highlightYaml, applySearchMarks } from "../../utils/yaml";

export function CodeEditorWithLines({ value, readOnly, onChange }: { value: string; readOnly?: boolean; onChange: (value: string) => void }) {
  const lineCount = Math.max(value.split("\n").length, 1);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  function syncScroll() {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  const navigateToMatch = useCallback((index: number, query: string) => {
    if (!query || !textareaRef.current) return;

    const text = value.toLowerCase();
    const q = query.toLowerCase();
    const matches: number[] = [];
    let pos = 0;

    while (true) {
      const found = text.indexOf(q, pos);
      if (found === -1) break;
      matches.push(found);
      pos = found + 1;
    }

    setMatchCount(matches.length);

    if (matches.length === 0) {
      setMatchIndex(0);
      return;
    }

    const safeIndex = ((index % matches.length) + matches.length) % matches.length;
    setMatchIndex(safeIndex);

    const matchPos = matches[safeIndex];
    const textarea = textareaRef.current;

    const linesBefore = value.slice(0, matchPos).split("\n").length - 1;
    const lineHeight = textarea.scrollHeight / lineCount;
    const scrollTarget = linesBefore * lineHeight - textarea.clientHeight / 2;
    textarea.scrollTop = Math.max(0, scrollTarget);
    syncScroll();
  }, [value, lineCount]);

  useEffect(() => {
    if (searchOpen && searchQuery) {
      navigateToMatch(matchIndex, searchQuery);
    } else {
      setMatchCount(0);
      setMatchIndex(0);
    }
  }, [searchQuery, searchOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMod = event.metaKey || event.ctrlKey;

      if (isMod && event.key === "f") {
        event.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }

      if (event.key === "Escape" && searchOpen) {
        event.preventDefault();
        event.stopPropagation();
        setSearchOpen(false);
        setSearchQuery("");
      }
    }

    const container = textareaRef.current?.closest(".CodeEditor");
    if (!container) return;

    container.addEventListener("keydown", handleKeyDown as EventListener, true);
    return () => container.removeEventListener("keydown", handleKeyDown as EventListener, true);
  }, [searchOpen]);

  // Also capture Esc on the panel level to prevent closing detail panel
  useEffect(() => {
    if (!searchOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSearchOpen(false);
        setSearchQuery("");
      }
    }

    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [searchOpen]);

  function handleSearchKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      const next = event.shiftKey ? matchIndex - 1 : matchIndex + 1;
      navigateToMatch(next, searchQuery);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setSearchOpen(false);
      setSearchQuery("");
      textareaRef.current?.focus();
    }
  }

  const highlightedCode = useMemo(() => {
    const baseNodes = highlightYaml(value);
    if (!searchOpen || !searchQuery) return baseNodes;
    const { nodes, matchCount: count } = applySearchMarks(baseNodes, searchQuery, matchIndex);
    // Update matchCount via side effect is not ideal but keeps it in sync
    if (count !== matchCount) {
      setTimeout(() => setMatchCount(count), 0);
    }
    return nodes;
  }, [value, searchOpen, searchQuery, matchIndex]);

  return (
    <div className="CodeEditor">
      {searchOpen ? (
        <div className="CodeEditor__search">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Find..."
          />
          <span className="CodeEditor__searchCount">
            {searchQuery ? `${matchCount > 0 ? matchIndex + 1 : 0}/${matchCount}` : ""}
          </span>
          <button type="button" onClick={() => navigateToMatch(matchIndex - 1, searchQuery)} disabled={matchCount === 0}>&uarr;</button>
          <button type="button" onClick={() => navigateToMatch(matchIndex + 1, searchQuery)} disabled={matchCount === 0}>&darr;</button>
          <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>&times;</button>
        </div>
      ) : null}
      <div className="CodeEditor__lines" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
      </div>
      <div className="CodeEditor__body">
        <pre ref={highlightRef} className="CodeEditor__highlight" aria-hidden="true">
          <code>{highlightedCode}</code>
        </pre>
        <textarea
          ref={textareaRef}
          className="TopologyDetails__yaml"
          spellCheck={false}
          readOnly={readOnly}
          value={value}
          onChange={(event) => { if (!readOnly) onChange(event.target.value); }}
          onScroll={syncScroll}
        />
      </div>
    </div>
  );
}

export function DiffWithLines({ changes }: { changes: Array<{ kind: "same" | "removed" | "added"; text: string }> }) {
  return (
    <pre className="TopologyDetails__diff">
      {changes.length > 0 ? changes.map((change, index) => (
        <div key={`${change.kind}-${index}`} className={`diff-${change.kind}`}>
          <span>{index + 1}</span>
          <code>{change.text}</code>
        </div>
      )) : <div><span>1</span><code>No line diff available.</code></div>}
    </pre>
  );
}
