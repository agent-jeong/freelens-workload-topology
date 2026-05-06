import React, { useState, useEffect } from "react";
import { isRecord, jsonMatches } from "../../utils/json";

export function JsonTree({
  data,
  name,
  line,
  path = [],
  query,
  secret,
  onCopy,
  expandState,
  onExpandAll
}: {
  data: unknown;
  name?: string;
  line?: number;
  path?: string[];
  query: string;
  secret: boolean;
  onCopy: (label: string, value: string) => void;
  expandState?: { open: boolean; tick: number };
  onExpandAll?: (value: boolean) => void;
}) {
  const defaultOpen = expandState ? expandState.open : path.length < 2;
  const [openState, setOpenState] = useState(defaultOpen);
  const isContainer = Array.isArray(data) || isRecord(data);
  const entries = Array.isArray(data)
    ? data.map((value, index) => [index.toString(), value] as const)
    : isRecord(data)
      ? Object.entries(data)
      : [];
  const matched = query.trim() ? jsonMatches(name ?? "", query) || jsonMatches(data, query) : false;
  const open = openState;
  const effectiveOpen = open || Boolean(query && matched);
  const masked = secret && path.length >= 1 && path[0] === "data" && !isContainer;
  const isArrayParent = Array.isArray(data);
  const pathLabel = path.join(".");

  useEffect(() => {
    if (expandState) {
      setOpenState(expandState.open);
    }
  }, [expandState]);

  if (!isContainer) {
    const displayValue = masked ? "\"********\"" : JSON.stringify(data);
    const copyValue = masked ? "" : typeof data === "string" ? data : JSON.stringify(data);

    return (
      <div
        className={`JsonTree__row${matched ? " is-match" : ""}`}
        onClick={() => onCopy(pathLabel || String(name), copyValue)}
        title={`Click to copy`}
      >
        {name !== undefined ? (
          <>
            <span className="JsonTree__key">{name}</span>
            <span className="JsonTree__colon">: </span>
          </>
        ) : null}
        <span className={`JsonTree__value value-${data === null ? "null" : typeof data}`}>{displayValue}</span>
      </div>
    );
  }

  const preview = !effectiveOpen && !isArrayParent && entries.length <= 4
    ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ").slice(0, 60)
    : null;

  const isRoot = path.length === 0;

  return (
    <div className={`JsonTree${isRoot ? " JsonTree--root" : ""}${matched ? " is-match" : ""}`}>
      <div className={`JsonTree__header${isRoot ? " JsonTree__header--root" : ""}`}>
        <button type="button" className="JsonTree__toggle" onClick={() => setOpenState((value) => !value)}>
          <span className="JsonTree__arrow">{effectiveOpen ? "▾" : "▸"}</span>
          {name !== undefined ? <strong>{name}</strong> : null}
          <em>{isArrayParent ? `Array[${entries.length}]` : `{${entries.length}}`}</em>
          {preview ? <span className="JsonTree__preview">{preview}</span> : null}
        </button>
        {isRoot && onExpandAll ? (
          <span className="JsonTree__rootActions">
            <button type="button" onClick={() => onExpandAll(true)}>Expand</button>
            <button type="button" onClick={() => onExpandAll(false)}>Collapse</button>
          </span>
        ) : null}
      </div>
      {effectiveOpen ? (
        <div className={`JsonTree__children${isArrayParent ? " is-array" : ""}`}>
          {entries.map(([key, value], index) => (
            <React.Fragment key={key}>
              {isArrayParent && index > 0 && (isRecord(value) || Array.isArray(value)) ? <div className="JsonTree__separator" /> : null}
              <JsonTree key={key} data={value} name={key} line={index + 1} path={[...path, key]} query={query} secret={secret} onCopy={onCopy} expandState={expandState} />
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}
