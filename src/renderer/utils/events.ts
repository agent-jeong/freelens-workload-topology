import type { KubeEventLike, TopologyNode } from "../types";
import { getEventNamespace, getName, objectForCopy } from "./kube";

export function eventData(event: KubeEventLike): KubeEventLike {
  return (objectForCopy(event) as KubeEventLike) ?? event;
}

export function eventTimestamp(event: KubeEventLike): string | undefined {
  const data = eventData(event);

  return data.eventTime ?? data.series?.lastObservedTime ?? data.lastTimestamp ?? data.deprecatedLastTimestamp ?? data.firstTimestamp ?? data.deprecatedFirstTimestamp ?? data.metadata?.creationTimestamp;
}

export function eventTimeValue(event: KubeEventLike): number {
  const timestamp = eventTimestamp(event);

  return timestamp ? new Date(timestamp).getTime() : 0;
}

export function formatEventTime(event: KubeEventLike): string {
  const timestamp = eventTimestamp(event);

  if (!timestamp) {
    return "unknown time";
  }

  const time = new Date(timestamp);

  if (Number.isNaN(time.getTime())) {
    return timestamp;
  }

  return time.toLocaleString();
}

export function eventCount(event: KubeEventLike): number {
  const data = eventData(event);

  return data.series?.count ?? data.count ?? data.deprecatedCount ?? 1;
}

export function eventSource(event: KubeEventLike): string | undefined {
  const data = eventData(event);

  return data.reportingController ?? data.reportingComponent ?? data.source?.component ?? data.deprecatedSource?.component ?? data.source?.host ?? data.deprecatedSource?.host;
}

export function eventMatchesNode(event: KubeEventLike, node: TopologyNode): boolean {
  const data = eventData(event);
  const involved = data.involvedObject ?? data.regarding;

  if (!involved?.kind || !involved.name) {
    return false;
  }

  const namespace = involved.namespace ?? getEventNamespace(data);

  if (namespace !== node.namespace) {
    return false;
  }

  if (node.kind === "Pods") {
    return involved.kind === "Pod" && (node.pods ?? []).some((pod) => getName(pod) === involved.name);
  }

  return involved.kind === node.kind && involved.name === node.name;
}

export function eventsForNode(events: KubeEventLike[], node: TopologyNode | undefined): KubeEventLike[] {
  if (!node) {
    return [];
  }

  return events
    .filter((event) => eventMatchesNode(event, node))
    .sort((left, right) => eventTimeValue(right) - eventTimeValue(left))
    .slice(0, 20);
}
