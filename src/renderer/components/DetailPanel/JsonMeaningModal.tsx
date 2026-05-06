import React, { useState, useEffect } from "react";
import type { TopologyKind } from "../../types";

export function JsonMeaningRow({ row }: { row: { path: string; value: string; meaning: string } }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = row.value.split("\n").length > 4 || row.value.length > 150;

  return (
    <div className="JsonMeaningModal__row">
      <code title={row.path}>{row.path}</code>
      <strong
        className={`JsonMeaningModal__value${isLong ? " is-expandable" : ""}${expanded ? " is-expanded" : ""}`}
        onClick={() => { if (isLong) setExpanded(!expanded); }}
        title={isLong ? (expanded ? "클릭하여 접기" : "클릭하여 펼치기") : row.value}
      >
        {row.value}
      </strong>
      <span>{row.meaning}</span>
    </div>
  );
}

export function JsonMeaningModal({
  kind,
  rows,
  onClose
}: {
  kind: TopologyKind;
  rows: Array<{ path: string; value: string; meaning: string }>;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="JsonMeaningModal__backdrop" onMouseDown={onClose}>
      <section className="JsonMeaningModal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="JSON field meanings">
        <header className="JsonMeaningModal__header">
          <div>
            <span>JSON Detail</span>
            <h3>{kind} 주요 항목</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">&times;</button>
        </header>
        <div className="JsonMeaningModal__table">
          <div className="JsonMeaningModal__head">
            <span>항목</span>
            <span>현재 값</span>
            <span>의미</span>
          </div>
          {rows.map((row) => (
            <JsonMeaningRow key={row.path} row={row} />
          ))}
        </div>
      </section>
    </div>
  );
}
