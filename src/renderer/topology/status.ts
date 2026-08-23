import type { KubeObjectLike, TopologyStatus } from "../types";

function getLabels(object: KubeObjectLike): Record<string, string> | undefined {
  return object.metadata?.labels;
}

function labelsMatch(selector: Record<string, string> | undefined, labels: Record<string, string> | undefined): boolean {
  const entries = Object.entries(selector ?? {});

  return entries.length > 0 && entries.every(([key, value]) => labels?.[key] === value);
}

function serviceSelector(service: KubeObjectLike): Record<string, string> | undefined {
  return service.spec?.selector;
}

export function podStatus(pod: KubeObjectLike): TopologyStatus {
  const phase = pod.status?.phase ?? pod.getStatus?.() ?? "Unknown";
  const statuses = [...(pod.status?.initContainerStatuses ?? []), ...(pod.status?.containerStatuses ?? [])];
  const waitingReason = statuses.find((container: any) => container.state?.waiting?.reason)?.state?.waiting?.reason;
  const terminated = statuses.find((container: any) => container.state?.terminated?.reason && container.state.terminated.reason !== "Completed")?.state?.terminated;

  if (waitingReason === "CrashLoopBackOff" || waitingReason === "ImagePullBackOff" || waitingReason === "ErrImagePull" || phase === "Failed" || terminated?.exitCode > 0) {
    return "danger";
  }

  if (phase === "Running" || phase === "Succeeded") {
    return "healthy";
  }

  if (phase === "Pending" || waitingReason) {
    return "warning";
  }

  return "unknown";
}

export function deploymentStatus(deployment: KubeObjectLike): TopologyStatus {
  const desired = deployment.spec?.replicas ?? 1;
  const available = deployment.status?.availableReplicas ?? 0;
  const unavailable = deployment.status?.unavailableReplicas ?? 0;

  if (desired === 0) {
    return "warning";
  }

  if (available >= desired && unavailable === 0) {
    return "healthy";
  }

  return "danger";
}

export function serviceStatus(service: KubeObjectLike, pods: KubeObjectLike[]): TopologyStatus {
  const selector = serviceSelector(service);

  if (!selector || Object.keys(selector).length === 0) {
    return "healthy";
  }

  const hasTarget = pods.some((pod) => labelsMatch(selector, getLabels(pod)) && isPodReady(pod));

  return hasTarget ? "healthy" : "warning";
}

export function isPodReady(pod: KubeObjectLike): boolean {
  return pod.status?.phase === "Running" && (pod.status?.conditions ?? []).some((condition: any) => condition.type === "Ready" && condition.status === "True");
}

export function summarizePodGroupStatus(pods: KubeObjectLike[]): TopologyStatus {
  const statuses = pods.map(podStatus);

  if (statuses.includes("danger")) {
    return "danger";
  }

  if (statuses.includes("warning")) {
    return "warning";
  }

  if (statuses.every((status) => status === "healthy")) {
    return "healthy";
  }

  return "unknown";
}

export function jobsGroupStatus(jobs: KubeObjectLike[]): TopologyStatus {
  if (jobs.some((job) => (job.status?.failed ?? 0) > 0)) {
    return "danger";
  }

  if (jobs.every((job) => (job.status?.succeeded ?? 0) > 0)) {
    return "healthy";
  }

  return "warning";
}
