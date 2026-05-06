import React from "react";

export function DetailRow({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className={`TopologyDetails__row${onCopy ? " is-copyable" : ""}`} onClick={onCopy} title={onCopy ? `Click to copy ${label}` : value}>
      <span>{label}</span>
      <strong>{value}{onCopy ? <span className="TopologyDetails__copyIcon">&#x2398;</span> : null}</strong>
    </div>
  );
}

export function ActionRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <div
      className="TopologyDetails__row TopologyDetails__row--action"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      title={value}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
