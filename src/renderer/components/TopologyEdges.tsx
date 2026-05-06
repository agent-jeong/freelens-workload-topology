import React from "react";

export const TopologyEdges = React.memo(function TopologyEdges({
  edgePaths,
  showIssuesOnly,
  issueNodeIds,
  edgeRelationFn,
  canvasWidth,
  canvasHeight,
}: {
  edgePaths: Array<{ id: string; from: string; to: string; d: string }>;
  showIssuesOnly: boolean;
  issueNodeIds: Set<string>;
  edgeRelationFn: (fromId: string, toId: string) => string | undefined;
  canvasWidth: number;
  canvasHeight: number;
}) {
  return (
    <svg className="TopologyCanvas__edges" width={canvasWidth} height={canvasHeight}>
      {edgePaths.map((edge) => {
        if (showIssuesOnly && (!issueNodeIds.has(edge.from) || !issueNodeIds.has(edge.to))) {
          return null;
        }

        return (
          <path
            key={edge.id}
            className={edgeRelationFn(edge.from, edge.to)}
            d={edge.d}
          />
        );
      })}
    </svg>
  );
});
