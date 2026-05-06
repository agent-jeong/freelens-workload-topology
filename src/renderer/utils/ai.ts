import YAML from "yaml";
import type { KubeEventLike, KubeObjectLike, TopologyNode, CauseHint } from "../types";
import { eventCount, eventData, eventSource, eventTimestamp } from "./events";
import { getName, objectForCopy } from "./kube";

export function isSensitiveKey(key: string): boolean {
  return /token|secret|password|passwd|credential|apikey|api-key|authorization|auth|cert|key$/i.test(key);
}

export function sanitizeForAi(value: unknown, path: string[] = []): unknown {
  const currentKey = path[path.length - 1] ?? "";
  const pathKey = path.join(".");

  if (pathKey === "metadata.managedFields") {
    return "[omitted]";
  }

  if (pathKey === "metadata.annotations") {
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value as Record<string, unknown>).map((key) => [key, "[redacted]"]))
      : "[redacted]";
  }

  if (pathKey === "data" || pathKey === "binaryData" || pathKey === "stringData") {
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value as Record<string, unknown>).map((key) => [key, "[redacted]"]))
      : "[redacted]";
  }

  if ((currentKey === "value" && path.includes("env")) || isSensitiveKey(currentKey)) {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item, index) => sanitizeForAi(item, [...path, String(index)]));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "managedFields")
        .map(([key, item]) => [key, sanitizeForAi(item, [...path, key])])
    );
  }

  return value;
}

export function compactYaml(value: unknown, maxLength = 5000): string {
  const text = YAML.stringify(value).trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n... [truncated]`;
}

export function aiEventSummary(events: KubeEventLike[]): Array<Record<string, unknown>> {
  return events.slice(0, 8).map((event) => {
    const data = eventData(event);

    return {
      type: data.type ?? "Normal",
      reason: data.reason,
      message: data.message ?? data.note ?? data.action,
      count: eventCount(data),
      source: eventSource(data),
      lastSeen: eventTimestamp(data)
    };
  });
}

export function aiRelatedSummary(node: TopologyNode): unknown {
  if (node.kind !== "Pods" || !node.pods?.length) {
    return undefined;
  }

  return node.pods.slice(0, 20).map((pod) => ({
    name: getName(pod),
    phase: pod.status?.phase ?? pod.getStatus?.(),
    restarts: pod.status?.containerStatuses?.reduce((total: number, container: any) => total + (container.restartCount ?? 0), 0) ?? 0,
    waiting: pod.status?.containerStatuses?.map((container: any) => container.state?.waiting?.reason).filter(Boolean)
  }));
}

export function buildAiAnalysisPrompt(node: TopologyNode, events: KubeEventLike[], causeHints: CauseHint[]): string {
  const sanitizedObject = sanitizeForAi(objectForCopy(node.object));
  const related = aiRelatedSummary(node);
  const context = {
    resource: {
      kind: node.kind,
      name: node.name,
      namespace: node.namespace,
      status: node.status,
      statusText: node.statusText
    },
    problemSummary: node.problems ?? [],
    ruleBasedCauseHints: causeHints,
    recentEvents: aiEventSummary(events),
    related,
    sanitizedObject
  };

  return [
    "You are assisting with Kubernetes workload troubleshooting.",
    "Analyze the sanitized resource context below. Do not assume hidden data. Treat Secret values, env values, tokens, and credentials as unavailable because they are intentionally redacted.",
    "",
    "Return the answer in Korean with this structure:",
    "1. 핵심 요약",
    "2. 가능성 높은 원인",
    "3. 근거가 되는 이벤트/상태",
    "4. 바로 확인할 항목",
    "5. 수정 전 주의사항",
    "",
    "Sanitized context:",
    "```yaml",
    compactYaml(context),
    "```"
  ].join("\n");
}
