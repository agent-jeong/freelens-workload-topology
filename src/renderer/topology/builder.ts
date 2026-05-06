import type { KubeObjectLike, ResourceSet, TopologyNode, TopologyEdge } from "../types";
import { columnX, topPadding, cardHeight, laneGap, minGroupHeight, podGroupThreshold } from "../constants";
import type { TopologyKind } from "../types";
import { getName, getNamespace, getLabels, labelsMatch, nodeId, objectForCopy, objectTime, ownerName, serviceSelector, deploymentSelector, deploymentTemplateLabels, ingressServiceNames, podReferenceNames } from "../utils/kube";
import { podStatus, deploymentStatus, serviceStatus, summarizePodGroupStatus, jobsGroupStatus } from "./status";
import { uniqueProblems, podProblemReasons, deploymentProblemReasons, serviceProblemReasons, ingressProblemReasons, jobProblemReasons, cronJobProblemReasons, podGroupProblemReasons } from "./problems";

export function podGroupObject(namespace: string, name: string, pods: KubeObjectLike[]): KubeObjectLike {
  return {
    metadata: { name, namespace },
    toJSON: () => ({
      kind: "Pods",
      metadata: { name, namespace },
      summary: {
        total: pods.length,
        running: pods.filter((pod) => podStatus(pod) === "healthy").length,
        warning: pods.filter((pod) => podStatus(pod) === "warning").length,
        danger: pods.filter((pod) => podStatus(pod) === "danger").length
      },
      pods: pods.map((pod) => objectForCopy(pod))
    })
  };
}

export function cronJobsGroupObject(namespace: string, cronJobs: KubeObjectLike[], jobs: KubeObjectLike[]): KubeObjectLike {
  return {
    metadata: { name: `${cronJobs.length} cronjobs`, namespace },
    toJSON: () => ({
      kind: "CronJobs",
      metadata: { name: `${cronJobs.length} cronjobs`, namespace },
      summary: {
        total: cronJobs.length,
        active: cronJobs.filter((cronJob) => (cronJob.status?.active ?? []).length > 0).length,
        suspended: cronJobs.filter((cronJob) => cronJob.spec?.suspend).length,
        recentJobs: jobs.length,
        failedRecentJobs: jobs.filter((job) => (job.status?.failed ?? 0) > 0).length
      },
      cronJobs: cronJobs.map((cronJob) => objectForCopy(cronJob))
    })
  };
}

export function jobsGroupObject(namespace: string, name: string, jobs: KubeObjectLike[]): KubeObjectLike {
  const failed = jobs.filter((job) => (job.status?.failed ?? 0) > 0).length;
  const succeeded = jobs.filter((job) => (job.status?.succeeded ?? 0) > 0).length;

  return {
    metadata: { name, namespace },
    toJSON: () => ({
      kind: "Jobs",
      metadata: { name, namespace },
      summary: {
        total: jobs.length,
        succeeded,
        failed,
        active: jobs.length - succeeded - failed
      },
      jobs: jobs.map((job) => objectForCopy(job))
    })
  };
}

export function filterRecentJobs(jobs: KubeObjectLike[], hours: number) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  return jobs
    .filter((job) => objectTime(job) >= cutoff)
    .sort((left, right) => objectTime(right) - objectTime(left));
}

export function buildTopology(resources: ResourceSet, cronJobWindowHours: number) {
  const { ingresses, services, deployments, cronJobs, jobs, pods, configMaps, secrets } = resources;
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const rowByDeployment = new Map<string, number>();
  const rowByService = new Map<string, number>();
  const yByRow = new Map<number, number>();
  const sortedDeployments = [...deployments].sort((a, b) => getName(a).localeCompare(getName(b)));
  const jobNamesWithLivePods = new Set(
    pods
      .map((pod) => {
        const jobName = ownerName(pod, "Job");

        return jobName ? `${getNamespace(pod)}:${jobName}` : null;
      })
      .filter(Boolean) as string[]
  );
  const recentJobs = filterRecentJobs(jobs, cronJobWindowHours);
  const livePodsJobs = jobs.filter((job) => {
    const key = `${getNamespace(job)}:${getName(job)}`;

    return !recentJobs.some((recentJob) => `${getNamespace(recentJob)}:${getName(recentJob)}` === key) && jobNamesWithLivePods.has(key);
  });
  const allVisibleJobs = [...recentJobs, ...livePodsJobs];
  const sortedCronJobs = [...cronJobs].sort((a, b) => getName(a).localeCompare(getName(b)));
  const jobsByCronJob = new Map<string, KubeObjectLike[]>();

  for (const job of allVisibleJobs) {
    const cronJobName = ownerName(job, "CronJob");

    if (!cronJobName) {
      continue;
    }

    const key = `${getNamespace(job)}:${cronJobName}`;
    const list = jobsByCronJob.get(key) ?? [];

    list.push(job);
    jobsByCronJob.set(key, list);
  }

  sortedDeployments.forEach((deployment, index) => {
    rowByDeployment.set(nodeId("Deployment", deployment), index);
  });

  const rowForPod = (pod: KubeObjectLike, fallbackIndex: number) => {
    const deployment = sortedDeployments.find((candidate) =>
      getNamespace(candidate) === getNamespace(pod) && labelsMatch(deploymentSelector(candidate), getLabels(pod))
    );

    return deployment ? rowByDeployment.get(nodeId("Deployment", deployment)) ?? fallbackIndex : fallbackIndex;
  };

  const podRows = new Map<KubeObjectLike, number>();

  pods.forEach((pod, index) => {
    podRows.set(pod, rowForPod(pod, index));
  });

  const podsByJob = new Map<string, KubeObjectLike[]>();

  pods.forEach((pod) => {
    const jobName = ownerName(pod, "Job");

    if (!jobName) {
      return;
    }

    const key = `${getNamespace(pod)}:${jobName}`;
    const jobPods = podsByJob.get(key) ?? [];

    jobPods.push(pod);
    podsByJob.set(key, jobPods);
  });

  const podsByRow = new Map<number, KubeObjectLike[]>();

  pods.forEach((pod) => {
    if (ownerName(pod, "Job")) {
      return;
    }

    const row = podRows.get(pod) ?? 0;
    const rowPods = podsByRow.get(row) ?? [];

    rowPods.push(pod);
    podsByRow.set(row, rowPods);
  });

  const groupedPodNodeByPod = new Map<KubeObjectLike, string>();

  podsByRow.forEach((rowPods, row) => {
    if (rowPods.length < podGroupThreshold) {
      return;
    }

    const firstPod = rowPods[0];
    const groupName = `${getNamespace(firstPod)} row ${row + 1} pods`;
    const groupId = `Pods:${getNamespace(firstPod)}:${row}`;

    rowPods.forEach((pod) => groupedPodNodeByPod.set(pod, groupId));
  });

  const emptyKindCounts = (): Record<TopologyKind, number> => ({
    Ingress: 0, Service: 0, Deployment: 0, CronJobs: 0, CronJob: 0, Jobs: 0, Job: 0, Pod: 0, Pods: 0, ConfigMap: 0, Secret: 0
  });
  const itemsByRow = new Map<number, Record<TopologyKind, number>>();
  const track = (row: number, kind: TopologyKind) => {
    const current = itemsByRow.get(row) ?? emptyKindCounts();

    current[kind] += 1;
    itemsByRow.set(row, current);
  };

  for (let row = 0; row < sortedDeployments.length; row += 1) {
    track(row, "Deployment");
  }

  services.forEach((service, index) => {
    const deployment = sortedDeployments.find((candidate) =>
      getNamespace(candidate) === getNamespace(service) && labelsMatch(serviceSelector(service), deploymentTemplateLabels(candidate))
    );
    const row = deployment ? rowByDeployment.get(nodeId("Deployment", deployment)) ?? index : index;

    rowByService.set(nodeId("Service", service), row);
    track(row, "Service");
  });

  ingresses.forEach((ingress, index) => {
    const targetService = services.find((service) =>
      getNamespace(service) === getNamespace(ingress) && ingressServiceNames(ingress).includes(getName(service))
    );
    const row = targetService ? rowByService.get(nodeId("Service", targetService)) ?? index : index;

    track(row, "Ingress");
  });

  podsByRow.forEach((rowPods, row) => {
    if (rowPods.length >= podGroupThreshold) {
      track(row, "Pods");
      return;
    }

    rowPods.forEach(() => track(row, "Pod"));
  });

  configMaps.forEach((configMap, index) => {
    const referencingPod = pods.find((pod) =>
      getNamespace(pod) === getNamespace(configMap) && podReferenceNames(pod).configMaps.includes(getName(configMap))
    );
    const row = referencingPod ? podRows.get(referencingPod) ?? index : index;

    track(row, "ConfigMap");
  });

  secrets.forEach((secret, index) => {
    const referencingPod = pods.find((pod) =>
      getNamespace(pod) === getNamespace(secret) && podReferenceNames(pod).secrets.includes(getName(secret))
    );
    const row = referencingPod ? podRows.get(referencingPod) ?? index : index;

    track(row, "Secret");
  });

  let actualMaxRow = -1;
  for (const row of itemsByRow.keys()) {
    if (row > actualMaxRow) actualMaxRow = row;
  }

  const cronJobRowStart = actualMaxRow + 1;
  const baseRows = cronJobRowStart + (cronJobs.length > 0 ? sortedCronJobs.length + 1 : 0);

  if (sortedCronJobs.length > 0) {
    track(cronJobRowStart, "CronJobs");

    sortedCronJobs.forEach((cronJob, index) => {
      const row = cronJobRowStart + index;
      const cronJobKey = `${getNamespace(cronJob)}:${getName(cronJob)}`;
      const cronJobJobs = jobsByCronJob.get(cronJobKey) ?? [];

      track(row, "CronJob");

      if (cronJobJobs.length > 0) {
        track(row, "Jobs");
      }

      const allJobPods = cronJobJobs.flatMap((job) => podsByJob.get(`${getNamespace(job)}:${getName(job)}`) ?? []);

      if (allJobPods.length > 0) {
        track(row, "Pods"); // We only track one slot to avoid shifting too much, we'll draw them side-by-side
      }
    });
  }

  let cursorY = topPadding;

  for (let row = 0; row < baseRows; row += 1) {
    if (row === cronJobRowStart && cronJobs.length > 0) {
      cursorY += 60;
    }

    const counts = itemsByRow.get(row);
    const maxItemsInColumn = counts ? Math.max(...Object.values(counts)) : 1;
    const groupHeight = Math.max(minGroupHeight, maxItemsInColumn * (cardHeight + laneGap) - laneGap + 34);

    yByRow.set(row, cursorY);
    cursorY += groupHeight;
  }

  const nextSlotByRowAndKind = new Map<string, number>();
  const yFor = (row: number, kind: TopologyKind) => {
    const key = `${row}:${kind}`;
    const slot = nextSlotByRowAndKind.get(key) ?? 0;

    nextSlotByRowAndKind.set(key, slot + 1);

    return (yByRow.get(row) ?? topPadding) + slot * (cardHeight + laneGap);
  };

  ingresses.forEach((ingress, index) => {
    const targetService = services.find((service) =>
      getNamespace(service) === getNamespace(ingress) && ingressServiceNames(ingress).includes(getName(service))
    );
    const row = targetService ? rowByService.get(nodeId("Service", targetService)) ?? index : index;

    nodes.push({
      id: nodeId("Ingress", ingress),
      kind: "Ingress",
      name: getName(ingress),
      namespace: getNamespace(ingress),
      status: targetService ? "healthy" : "warning",
      statusText: `${ingressServiceNames(ingress).length} service refs`,
      x: columnX.Ingress,
      y: yFor(row, "Ingress"),
      object: ingress,
      editable: true,
      problems: ingressProblemReasons(ingress, services)
    });
  });

  services.forEach((service, index) => {
    const row = rowByService.get(nodeId("Service", service)) ?? index;

    nodes.push({
      id: nodeId("Service", service),
      kind: "Service",
      name: getName(service),
      namespace: getNamespace(service),
      status: serviceStatus(service, deployments, pods),
      statusText: service.spec?.type ?? "ClusterIP",
      x: columnX.Service,
      y: yFor(row, "Service"),
      object: service,
      editable: true,
      problems: serviceProblemReasons(service, deployments, pods)
    });
  });

  sortedDeployments.forEach((deployment, index) => {
    const desired = deployment.spec?.replicas ?? 1;
    const available = deployment.status?.availableReplicas ?? 0;

    nodes.push({
      id: nodeId("Deployment", deployment),
      kind: "Deployment",
      name: getName(deployment),
      namespace: getNamespace(deployment),
      status: deploymentStatus(deployment),
      statusText: `${available}/${desired} available`,
      x: columnX.Deployment,
      y: yFor(index, "Deployment"),
      object: deployment,
      editable: true,
      problems: deploymentProblemReasons(deployment)
    });
  });

  if (sortedCronJobs.length > 0) {
    const activeCronJobs = sortedCronJobs.filter((cronJob) => (cronJob.status?.active ?? []).length > 0).length;
    const suspendedCronJobs = sortedCronJobs.filter((cronJob) => cronJob.spec?.suspend).length;
    const allCronJobJobs = sortedCronJobs.flatMap((cronJob) => jobsByCronJob.get(`${getNamespace(cronJob)}:${getName(cronJob)}`) ?? []);
    const failedJobs = allCronJobJobs.filter((job) => (job.status?.failed ?? 0) > 0).length;

    nodes.push({
      id: `CronJobs:${getNamespace(sortedCronJobs[0])}:all`,
      kind: "CronJobs",
      name: `${sortedCronJobs.length} cronjobs`,
      namespace: getNamespace(sortedCronJobs[0]),
      status: failedJobs > 0 ? "danger" : suspendedCronJobs > 0 ? "warning" : "healthy",
      statusText: `active ${activeCronJobs} / suspended ${suspendedCronJobs}`,
      x: columnX.CronJobs,
      y: yFor(cronJobRowStart, "CronJobs"),
      object: cronJobsGroupObject(getNamespace(sortedCronJobs[0]), sortedCronJobs, allCronJobJobs),
      editable: false,
      problems: uniqueProblems([
        ...(suspendedCronJobs > 0 ? [{ severity: "warning" as const, message: `${suspendedCronJobs} CronJob(s) suspended` }] : []),
        ...(failedJobs > 0 ? [{ severity: "danger" as const, message: `${failedJobs} recent Job(s) failed` }] : [])
      ])
    });

    sortedCronJobs.forEach((cronJob, index) => {
      const row = cronJobRowStart + index;
      const cronJobKey = `${getNamespace(cronJob)}:${getName(cronJob)}`;
      const cronJobJobs = jobsByCronJob.get(cronJobKey) ?? [];
      const isSuspended = cronJob.spec?.suspend;
      const cronJobFailed = cronJobJobs.some((job) => (job.status?.failed ?? 0) > 0);

      nodes.push({
        id: nodeId("CronJob", cronJob),
        kind: "CronJob",
        name: getName(cronJob),
        namespace: getNamespace(cronJob),
        status: cronJobFailed ? "danger" : isSuspended ? "warning" : "healthy",
        statusText: isSuspended ? "suspended" : `${cronJobJobs.length} jobs`,
        x: columnX.CronJob,
        y: yFor(row, "CronJob"),
        object: cronJob,
        editable: true,
        problems: cronJobProblemReasons(cronJob, cronJobJobs)
      });

      if (cronJobJobs.length > 0) {
        const jobsName = `${cronJobJobs.length} jobs`;

        nodes.push({
          id: `Jobs:${cronJobKey}`,
          kind: "Jobs",
          name: jobsName,
          namespace: getNamespace(cronJob),
          status: jobsGroupStatus(cronJobJobs),
          statusText: `${cronJobJobs.filter((job) => (job.status?.succeeded ?? 0) > 0).length}/${cronJobJobs.length} succeeded`,
          x: columnX.Jobs,
          y: yFor(row, "Jobs"),
          object: jobsGroupObject(getNamespace(cronJob), jobsName, cronJobJobs),
          editable: false,
          problems: uniqueProblems(cronJobJobs.flatMap(jobProblemReasons))
        });

        const allJobPods = cronJobJobs.flatMap((job) => podsByJob.get(`${getNamespace(job)}:${getName(job)}`) ?? []);

        if (allJobPods.length > 0) {
          const completedPods = allJobPods.filter(pod => pod.status?.phase === "Succeeded");
          const activePods = allJobPods.filter(pod => pod.status?.phase !== "Succeeded");

          if (activePods.length > 0) {
            nodes.push({
              id: `Pods:${cronJobKey}:active`,
              kind: "Pods",
              name: `${activePods.length} active`,
              namespace: getNamespace(cronJob),
              status: summarizePodGroupStatus(activePods),
              statusText: `${activePods.filter((pod) => podStatus(pod) === "healthy").length}/${activePods.length} healthy`,
              x: columnX.Pods,
              y: yFor(row, "Pods"),
              object: podGroupObject(getNamespace(cronJob), `${activePods.length} active pods`, activePods),
              editable: false,
              problems: podGroupProblemReasons(activePods),
              pods: activePods
            });
          }

          if (completedPods.length > 0) {
            const yPosition = activePods.length > 0 ? yFor(row, "Pods") - (cardHeight + laneGap) : yFor(row, "Pods");
            nodes.push({
              id: `Pods:${cronJobKey}:completed`,
              kind: "Pods",
              name: `${completedPods.length} completed`,
              namespace: getNamespace(cronJob),
              status: "healthy",
              statusText: `${completedPods.length} succeeded`,
              x: columnX.Pods + 190,
              y: yPosition,
              object: podGroupObject(getNamespace(cronJob), `${completedPods.length} completed pods`, completedPods),
              editable: false,
              problems: podGroupProblemReasons(completedPods),
              pods: completedPods
            });
          }
        }
      }
    });
  }

  podsByRow.forEach((rowPods, row) => {
    if (rowPods.length >= podGroupThreshold) {
      const firstPod = rowPods[0];
      const name = `${rowPods.length} pods`;
      const groupId = groupedPodNodeByPod.get(firstPod) ?? `Pods:${getNamespace(firstPod)}:${row}`;

      nodes.push({
        id: groupId,
        kind: "Pods",
        name,
        namespace: getNamespace(firstPod),
        status: summarizePodGroupStatus(rowPods),
        statusText: `${rowPods.filter((pod) => podStatus(pod) === "healthy").length}/${rowPods.length} healthy`,
        x: columnX.Pods,
        y: yFor(row, "Pods"),
        object: podGroupObject(getNamespace(firstPod), name, rowPods),
        editable: false,
        problems: podGroupProblemReasons(rowPods),
        pods: rowPods
      });
      return;
    }

    rowPods.forEach((pod) => {
      nodes.push({
        id: nodeId("Pod", pod),
        kind: "Pod",
        name: getName(pod),
        namespace: getNamespace(pod),
        status: podStatus(pod),
        statusText: pod.getStatus?.() ?? pod.status?.phase ?? "Unknown",
        x: columnX.Pod,
        y: yFor(row, "Pod"),
        object: pod,
        editable: true,
        problems: podProblemReasons(pod),
        pods: [pod]
      });
    });
  });

  configMaps.forEach((configMap, index) => {
    const referencingPod = pods.find((pod) =>
      getNamespace(pod) === getNamespace(configMap) && podReferenceNames(pod).configMaps.includes(getName(configMap))
    );
    const row = referencingPod ? podRows.get(referencingPod) ?? index : index;

    nodes.push({
      id: nodeId("ConfigMap", configMap),
      kind: "ConfigMap",
      name: getName(configMap),
      namespace: getNamespace(configMap),
      status: referencingPod ? "healthy" : "unknown",
      statusText: "configuration",
      x: columnX.ConfigMap,
      y: yFor(row, "ConfigMap"),
      object: configMap,
      editable: true
    });
  });

  secrets.forEach((secret, index) => {
    const referencingPod = pods.find((pod) =>
      getNamespace(pod) === getNamespace(secret) && podReferenceNames(pod).secrets.includes(getName(secret))
    );
    const row = referencingPod ? podRows.get(referencingPod) ?? index : index;

    nodes.push({
      id: nodeId("Secret", secret),
      kind: "Secret",
      name: getName(secret),
      namespace: getNamespace(secret),
      status: referencingPod ? "healthy" : "unknown",
      statusText: secret.type ?? "secret",
      x: columnX.Secret,
      y: yFor(row, "Secret"),
      object: secret,
      editable: true
    });
  });

  for (const ingress of ingresses) {
    for (const service of services) {
      if (getNamespace(ingress) === getNamespace(service) && ingressServiceNames(ingress).includes(getName(service))) {
        edges.push({ id: `${nodeId("Ingress", ingress)}->${nodeId("Service", service)}`, from: nodeId("Ingress", ingress), to: nodeId("Service", service) });
      }
    }
  }

  for (const service of services) {
    for (const deployment of deployments) {
      if (getNamespace(service) === getNamespace(deployment) && labelsMatch(serviceSelector(service), deploymentTemplateLabels(deployment))) {
        edges.push({ id: `${nodeId("Service", service)}->${nodeId("Deployment", deployment)}`, from: nodeId("Service", service), to: nodeId("Deployment", deployment) });
      }
    }
  }

  for (const deployment of deployments) {
    for (const pod of pods) {
      if (getNamespace(deployment) === getNamespace(pod) && labelsMatch(deploymentSelector(deployment), getLabels(pod))) {
        const to = groupedPodNodeByPod.get(pod) ?? nodeId("Pod", pod);
        const id = `${nodeId("Deployment", deployment)}->${to}`;

        if (!edges.some((edge) => edge.id === id)) {
          edges.push({ id, from: nodeId("Deployment", deployment), to });
        }
      }
    }
  }

  if (sortedCronJobs.length > 0) {
    const groupId = `CronJobs:${getNamespace(sortedCronJobs[0])}:all`;

    for (const cronJob of sortedCronJobs) {
      const cronJobKey = `${getNamespace(cronJob)}:${getName(cronJob)}`;
      const cronJobId = nodeId("CronJob", cronJob);

      edges.push({ id: `${groupId}->${cronJobId}`, from: groupId, to: cronJobId });

      const cronJobJobs = jobsByCronJob.get(cronJobKey) ?? [];

      if (cronJobJobs.length > 0) {
        const jobsId = `Jobs:${cronJobKey}`;

        edges.push({ id: `${cronJobId}->${jobsId}`, from: cronJobId, to: jobsId });

        const allJobPods = cronJobJobs.flatMap((job) => podsByJob.get(`${getNamespace(job)}:${getName(job)}`) ?? []);

        if (allJobPods.length > 0) {
          const activePods = allJobPods.filter(pod => pod.status?.phase !== "Succeeded");
          const completedPods = allJobPods.filter(pod => pod.status?.phase === "Succeeded");

          if (activePods.length > 0) {
            const activeId = `Pods:${cronJobKey}:active`;
            edges.push({ id: `${jobsId}->${activeId}`, from: jobsId, to: activeId });
          }

          if (completedPods.length > 0) {
            const completedId = `Pods:${cronJobKey}:completed`;
            edges.push({ id: `${jobsId}->${completedId}`, from: jobsId, to: completedId });
          }
        }
      }
    }
  }

  for (const pod of pods) {
    const references = podReferenceNames(pod);

    const jobName = ownerName(pod, "Job");
    let podFrom: string;

    if (jobName) {
      const job = allVisibleJobs.find((j) => getName(j) === jobName && getNamespace(j) === getNamespace(pod));
      const cronJobName = job ? ownerName(job, "CronJob") : undefined;

      podFrom = cronJobName ? `Pods:${getNamespace(pod)}:${cronJobName}:${pod.status?.phase === "Succeeded" ? "completed" : "active"}` : groupedPodNodeByPod.get(pod) ?? nodeId("Pod", pod);
    } else {
      podFrom = groupedPodNodeByPod.get(pod) ?? nodeId("Pod", pod);
    }

    for (const configMap of configMaps) {
      if (getNamespace(pod) === getNamespace(configMap) && references.configMaps.includes(getName(configMap))) {
        const id = `${podFrom}->${nodeId("ConfigMap", configMap)}`;

        if (!edges.some((edge) => edge.id === id)) {
          edges.push({ id, from: podFrom, to: nodeId("ConfigMap", configMap) });
        }
      }
    }

    for (const secret of secrets) {
      if (getNamespace(pod) === getNamespace(secret) && references.secrets.includes(getName(secret))) {
        const id = `${podFrom}->${nodeId("Secret", secret)}`;

        if (!edges.some((edge) => edge.id === id)) {
          edges.push({ id, from: podFrom, to: nodeId("Secret", secret) });
        }
      }
    }
  }

  const cronZoneY = cronJobs.length > 0 ? (yByRow.get(cronJobRowStart) ?? topPadding) - 70 : 0;

  return { nodes, edges, cronZoneY };
}
