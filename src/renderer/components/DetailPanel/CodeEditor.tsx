import React, { useRef } from "react";
import { highlightYaml } from "../../utils/yaml";

export function CodeEditorWithLines({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const lineCount = Math.max(value.split("\n").length, 1);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);

  function syncScroll() {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  return (
    <div className="CodeEditor">
      <div className="CodeEditor__lines" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
      </div>
      <div className="CodeEditor__body">
        <pre ref={highlightRef} className="CodeEditor__highlight" aria-hidden="true">
          <code>{highlightYaml(value)}</code>
        </pre>
        <textarea
          ref={textareaRef}
          className="TopologyDetails__yaml"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
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
