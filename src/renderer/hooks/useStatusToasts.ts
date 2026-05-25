import { useEffect, useRef, useState } from "react";
import type { TopologyNode, TopologyStatus } from "../types";

type StatusToast = {
  id: number;
  name: string;
  kind: string;
  from: TopologyStatus;
  to: TopologyStatus;
};

export function useStatusToasts(topologyNodes: TopologyNode[], isLive: boolean) {
  const [statusToasts, setStatusToasts] = useState<StatusToast[]>([]);
  const toastCounter = useRef(0);
  const prevNodeStatuses = useRef<Map<string, TopologyStatus>>(new Map());

  useEffect(() => {
    const prev = prevNodeStatuses.current;

    if (isLive && prev.size > 0) {
      const newToasts: StatusToast[] = [];

      for (const node of topologyNodes) {
        const oldStatus = prev.get(node.id);

        if (oldStatus && oldStatus !== node.status) {
          toastCounter.current += 1;
          newToasts.push({ id: toastCounter.current, name: node.name, kind: node.kind, from: oldStatus, to: node.status });
        }
      }

      if (newToasts.length > 0) {
        setStatusToasts((current) => [...current, ...newToasts].slice(-5));
        const ids = newToasts.map((t) => t.id);

        setTimeout(() => {
          setStatusToasts((current) => current.filter((t) => !ids.includes(t.id)));
        }, 5000);
      }
    }

    const next = new Map<string, TopologyStatus>();

    for (const node of topologyNodes) {
      next.set(node.id, node.status);
    }

    prevNodeStatuses.current = next;
  }, [topologyNodes, isLive]);

  return { statusToasts };
}
