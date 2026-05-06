import type { TopologyEdge } from "../types";

export function connectedNodeIds(selectedNodeId: string | null, edges: TopologyEdge[]): Set<string> {
  if (!selectedNodeId) {
    return new Set();
  }

  const adj = new Map<string, string[]>();

  for (const edge of edges) {
    let list = adj.get(edge.from);
    if (!list) { list = []; adj.set(edge.from, list); }
    list.push(edge.to);

    let list2 = adj.get(edge.to);
    if (!list2) { list2 = []; adj.set(edge.to, list2); }
    list2.push(edge.from);
  }

  const connected = new Set([selectedNodeId]);
  const queue = [selectedNodeId];

  while (queue.length > 0) {
    const current = queue.pop()!;

    for (const neighbor of adj.get(current) ?? []) {
      if (!connected.has(neighbor)) {
        connected.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return connected;
}
