import type { KubeObjectLike, TopologyStatus } from "../types";
import { labelsMatch, deploymentTemplateLabels, getLabels, serviceSelector } from "../utils/kube";

export function podStatus(pod: KubeObjectLike): TopologyStatus {
  const status = pod.getStatus?.() ?? pod.status?.phase ?? "Unknown";
  const waitingReason = pod.status?.containerStatuses?.find((container: any) => container.state?.waiting?.reason)?.state?.waiting?.reason;

  if (waitingReason === "CrashLoopBackOff" || status === "Failed") {
    return "danger";
  }

  if (status === "Running" || status === "Succeeded") {
    return "healthy";
  }

  if (status === "Pending" || status === "ContainerCreating") {
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

export function serviceStatus(service: KubeObjectLike, deployments: KubeObjectLike[], pods: KubeObjectLike[]): TopologyStatus {
  const selector = serviceSelector(service);

  if (!selector || Object.keys(selector).length === 0) {
    return "healthy";
  }

  const hasTarget =
    deployments.some((deployment) => labelsMatch(selector, deploymentTemplateLabels(deployment))) ||
    pods.some((pod) => labelsMatch(selector, getLabels(pod)));

  return hasTarget ? "healthy" : "warning";
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
