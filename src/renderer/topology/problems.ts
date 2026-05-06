import type { KubeObjectLike, KubeEventLike, TopologyStatus, ProblemReason, CauseHint } from "../types";
import { getName, getLabels, labelsMatch, serviceSelector, deploymentTemplateLabels, ingressServiceNames, getNamespace } from "../utils/kube";
import { eventData } from "../utils/events";

export function uniqueProblems(problems: ProblemReason[]): ProblemReason[] {
  const seen = new Set<string>();

  return problems.filter((problem) => {
    const key = `${problem.severity}:${problem.message}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function podProblemReasons(pod: KubeObjectLike): ProblemReason[] {
  const problems: ProblemReason[] = [];
  const status = pod.getStatus?.() ?? pod.status?.phase ?? "Unknown";

  if (status === "Failed") {
    problems.push({ severity: "danger", message: "Pod phase is Failed" });
  } else if (status === "Pending" || status === "ContainerCreating") {
    problems.push({ severity: "warning", message: `Pod is ${status}` });
  }

  for (const container of pod.status?.containerStatuses ?? []) {
    const waiting = container.state?.waiting;
    const terminated = container.state?.terminated;

    if (waiting?.reason) {
      problems.push({
        severity: waiting.reason === "CrashLoopBackOff" ? "danger" : "warning",
        message: `${container.name ?? "container"} waiting: ${waiting.reason}${waiting.message ? ` - ${waiting.message}` : ""}`
      });
    }

    if (terminated?.reason && terminated.reason !== "Completed") {
      problems.push({
        severity: terminated.exitCode && terminated.exitCode !== 0 ? "danger" : "warning",
        message: `${container.name ?? "container"} terminated: ${terminated.reason}${terminated.exitCode !== undefined ? ` (exit ${terminated.exitCode})` : ""}`
      });
    }

    if ((container.restartCount ?? 0) > 0) {
      problems.push({ severity: "warning", message: `${container.name ?? "container"} restarted ${container.restartCount} time(s)` });
    }
  }

  return uniqueProblems(problems);
}

export function deploymentProblemReasons(deployment: KubeObjectLike): ProblemReason[] {
  const desired = deployment.spec?.replicas ?? 1;
  const available = deployment.status?.availableReplicas ?? 0;
  const unavailable = deployment.status?.unavailableReplicas ?? 0;
  const problems: ProblemReason[] = [];

  if (desired === 0) {
    problems.push({ severity: "warning", message: "Deployment is scaled to 0 replicas" });
  } else if (available < desired) {
    problems.push({ severity: "danger", message: `Only ${available}/${desired} replicas are available` });
  }

  if (unavailable > 0) {
    problems.push({ severity: "danger", message: `${unavailable} replica(s) unavailable` });
  }

  for (const condition of deployment.status?.conditions ?? []) {
    if (condition.status === "False" && (condition.reason || condition.message)) {
      problems.push({
        severity: condition.type === "Available" ? "danger" : "warning",
        message: `${condition.type ?? "Condition"}: ${condition.reason ?? condition.message}`
      });
    }
  }

  return uniqueProblems(problems);
}

export function serviceProblemReasons(service: KubeObjectLike, deployments: KubeObjectLike[], pods: KubeObjectLike[]): ProblemReason[] {
  const selector = serviceSelector(service);
  const hasTarget =
    deployments.some((deployment) => labelsMatch(selector, deploymentTemplateLabels(deployment))) ||
    pods.some((pod) => labelsMatch(selector, getLabels(pod)));

  if (hasTarget) {
    return [];
  }

  return [{ severity: "warning", message: selector ? "No Deployment or Pod matches this Service selector" : "Service has no selector" }];
}

export function ingressProblemReasons(ingress: KubeObjectLike, services: KubeObjectLike[]): ProblemReason[] {
  const serviceNames = ingressServiceNames(ingress);

  if (serviceNames.length === 0) {
    return [{ severity: "warning", message: "Ingress has no Service backend" }];
  }

  const missing = serviceNames.filter((serviceName) =>
    !services.some((service) => getNamespace(service) === getNamespace(ingress) && getName(service) === serviceName)
  );

  return missing.length > 0 ? [{ severity: "warning", message: `Missing Service backend: ${missing.join(", ")}` }] : [];
}

export function jobProblemReasons(job: KubeObjectLike): ProblemReason[] {
  const failed = job.status?.failed ?? 0;

  return failed > 0 ? [{ severity: "danger", message: `${failed} Job pod(s) failed` }] : [];
}

export function cronJobProblemReasons(cronJob: KubeObjectLike, jobs: KubeObjectLike[]): ProblemReason[] {
  const problems: ProblemReason[] = [];
  const failedJobs = jobs.filter((job) => (job.status?.failed ?? 0) > 0).length;

  if (cronJob.spec?.suspend) {
    problems.push({ severity: "warning", message: "CronJob is suspended" });
  }

  if (failedJobs > 0) {
    problems.push({ severity: "danger", message: `${failedJobs} recent Job(s) failed` });
  }

  return problems;
}

export function podGroupProblemReasons(pods: KubeObjectLike[]): ProblemReason[] {
  return uniqueProblems(pods.flatMap((pod) =>
    podProblemReasons(pod).map((problem) => ({
      ...problem,
      message: `${getName(pod)}: ${problem.message}`
    }))
  )).slice(0, 6);
}

export function issueSeverityRank(status: TopologyStatus): number {
  if (status === "danger") {
    return 0;
  }

  if (status === "warning") {
    return 1;
  }

  return 2;
}

export function causeHintForReason(reason: string | undefined): string | undefined {
  switch (reason) {
    case "BackOff":
    case "CrashLoopBackOff":
      return "Container keeps exiting. Check the last log lines, command args, required env vars, and readiness dependencies.";
    case "Failed":
      return "Operation failed. Check the event message first, then inspect the owning workload and recent Pod logs.";
    case "FailedCreate":
      return "Controller could not create child resources. Check quotas, admission policies, service account permissions, and invalid Pod spec fields.";
    case "FailedMount":
    case "UnableToMountVolumes":
      return "Volume mount failed. Check ConfigMap/Secret/PVC names, storage class, and node volume attach state.";
    case "FailedScheduling":
      return "Pod is unschedulable. Check node resources, node selectors, taints/tolerations, affinity, and PVC binding.";
    case "FailedPull":
    case "ImagePullBackOff":
    case "ErrImagePull":
      return "Image pull failed. Check image name/tag, registry credentials, imagePullSecrets, and registry/network access.";
    case "Killing":
      return "Container was stopped by kubelet. Check rollout activity, probes, preStop hooks, and termination grace period.";
    case "NodeNotReady":
      return "Node is not ready. Check node conditions before debugging the workload itself.";
    case "Pulled":
    case "Created":
    case "Started":
    case "Scheduled":
      return undefined;
    case "Unhealthy":
      return "Health probe is failing. Check liveness/readiness/startup probe path, port, timeout, and application startup time.";
    default:
      return undefined;
  }
}

export function causeHintsForEvents(events: KubeEventLike[]): CauseHint[] {
  const hints = new Map<string, CauseHint>();

  for (const event of events) {
    const data = eventData(event);
    const reason = data.reason;
    const message = causeHintForReason(reason);

    if (reason && message && !hints.has(reason)) {
      hints.set(reason, { reason, message });
    }
  }

  return [...hints.values()].slice(0, 4);
}
