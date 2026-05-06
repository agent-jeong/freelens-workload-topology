import React, { useState } from "react";
import type { TopologyNode } from "../types";

export function IssuePanel({
  nodes,
  onSelect
}: {
  nodes: TopologyNode[];
  onSelect: (node: TopologyNode) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleNodes = expanded ? nodes : nodes.slice(0, 6);
  const hasMore = nodes.length > 6;

  return (
    <section className="IssuePanel">
      <div className="IssuePanel__header">
        <span className="IssuePanel__title">Problems</span>
        <span className="IssuePanel__count">{nodes.length}</span>
        {hasMore && (
          <button type="button" className="IssuePanel__toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Collapse" : `+${nodes.length - 6} more`}
          </button>
        )}
      </div>
      <div className="IssuePanel__grid">
        {visibleNodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className={`IssuePanel__card is-${node.status}`}
            onClick={() => onSelect(node)}
            title={node.problems?.map((p) => p.message).join("\n") ?? node.statusText}
          >
            <div className="IssuePanel__cardTop">
              <span className={`IssuePanel__dot is-${node.status}`} />
              <span className="IssuePanel__cardKind">{node.kind}</span>
            </div>
            <strong className="IssuePanel__cardName">{node.name}</strong>
            <em className="IssuePanel__cardMsg">{node.problems?.[0]?.message ?? node.statusText}</em>
          </button>
        ))}
      </div>
    </section>
  );
}
