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

function objectKey(object: KubeObjectLike): string {
  return `${getNamespace(object)}:${getName(object)}`;
}

function resourceLabel(kind: string, name: string): string {
  return `${kind}/${name}`;
}

function ownerLabel(object: KubeObjectLike): string | undefined {
  const owner = object.metadata?.ownerReferences?.[0];

  return owner?.kind && owner.name ? resourceLabel(owner.kind, owner.name) : undefined;
}

export function buildTopology(resources: ResourceSet, cronJobWindowHours: number) {
  const { ingresses, services, deployments, cronJobs, jobs, pods, configMaps, secrets } = resources;
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const rowByDeployment = new Map<string, number>();
  const rowByService = new Map<string, number>();
  const yByRow = new Map<number, number>();
  const sortedDeployments = [...deployments].sort((a, b) => getName(a).localeCompare(getName(b)));
  const allVisibleJobs = filterRecentJobs(jobs, cronJobWindowHours);
  const sortedCronJobs = [...cronJobs].sort((a, b) => getName(a).localeCompare(getName(b)));
  const jobsByCronJob = new Map<string, KubeObjectLike[]>();
  const visibleJobByKey = new Map(allVisibleJobs.map((job) => [objectKey(job), job]));
  const serviceByKey = new Map(services.map((service) => [objectKey(service), service]));
  const configMapByKey = new Map(configMaps.map((configMap) => [objectKey(configMap), configMap]));
  const secretByKey = new Map(secrets.map((secret) => [objectKey(secret), secret]));
  const podReferences = new Map<KubeObjectLike, ReturnType<typeof podReferenceNames>>();
  const firstPodByConfigMapKey = new Map<string, KubeObjectLike>();
  const firstPodBySecretKey = new Map<string, KubeObjectLike>();
  const edgeIds = new Set<string>();
  const pushEdge = (from: string, to: string) => {
    const id = `${from}->${to}`;

    if (edgeIds.has(id)) {
      return;
    }

    edgeIds.add(id);
    edges.push({ id, from, to });
  };

  for (const pod of pods) {
    const references = podReferenceNames(pod);

    podReferences.set(pod, references);

    for (const configMapName of references.configMaps) {
      const key = `${getNamespace(pod)}:${configMapName}`;

      if (!firstPodByConfigMapKey.has(key)) {
        firstPodByConfigMapKey.set(key, pod);
      }
    }

    for (const secretName of references.secrets) {
      const key = `${getNamespace(pod)}:${secretName}`;

      if (!firstPodBySecretKey.has(key)) {
        firstPodBySecretKey.set(key, pod);
      }
    }
  }

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

  const deploymentByPod = new Map<KubeObjectLike, KubeObjectLike>();
  const deploymentsByPod = new Map<KubeObjectLike, KubeObjectLike[]>();

  pods.forEach((pod) => {
    const matchingDeployments = sortedDeployments.filter((candidate) =>
      getNamespace(candidate) === getNamespace(pod) && labelsMatch(deploymentSelector(candidate), getLabels(pod))
    );
    const deployment = matchingDeployments[0];

    if (deployment) {
      deploymentByPod.set(pod, deployment);
      deploymentsByPod.set(pod, matchingDeployments);
    }
  });

  const rowForPod = (pod: KubeObjectLike, fallbackIndex: number) => {
    const deployment = deploymentByPod.get(pod);

    return deployment ? rowByDeployment.get(nodeId("Deployment", deployment)) ?? fallbackIndex : fallbackIndex;
  };
  const ownerChainForPod = (pod: KubeObjectLike): string[] => {
    const chain: string[] = [];
    const jobName = ownerName(pod, "Job");

    if (jobName) {
      const job = visibleJobByKey.get(`${getNamespace(pod)}:${jobName}`);
      const cronJobName = job ? ownerName(job, "CronJob") : undefined;

      if (cronJobName) {
        chain.push(resourceLabel("CronJob", cronJobName));
      }

      chain.push(resourceLabel("Job", jobName));
      chain.push(resourceLabel("Pod", getName(pod)));
      return chain;
    }

    const deployment = deploymentByPod.get(pod);

    if (deployment) {
      chain.push(resourceLabel("Deployment", getName(deployment)));
    }

    const directOwner = ownerLabel(pod);

    if (directOwner && !chain.includes(directOwner)) {
      chain.push(directOwner);
    }

    chain.push(resourceLabel("Pod", getName(pod)));

    return chain;
  };
  const ownerChainForPodGroup = (pods: KubeObjectLike[], fallbackLabel: string): string[] | undefined => {
    if (pods.length === 0) {
      return undefined;
    }

    const firstChain = ownerChainForPod(pods[0]);

    if (pods.every((pod) => {
      const chain = ownerChainForPod(pod);
      const prefix = chain.slice(0, -1);

      return prefix.length === firstChain.length - 1 && prefix.every((value, index) => value === firstChain[index]);
    })) {
      return [...firstChain.slice(0, -1), fallbackLabel];
    }

    return [fallbackLabel];
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
    LoadBalancer: 0, Ingress: 0, Service: 0, Deployment: 0, CronJobs: 0, CronJob: 0, Jobs: 0, Job: 0, Pod: 0, Pods: 0, ConfigMap: 0, Secret: 0
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

  const rowByIngress = new Map<string, number>();

  ingresses.forEach((ingress, index) => {
    const targetService = services.find((service) =>
      getNamespace(service) === getNamespace(ingress) && ingressServiceNames(ingress).includes(getName(service))
    );
    const row = targetService ? rowByService.get(nodeId("Service", targetService)) ?? index : index;

    rowByIngress.set(nodeId("Ingress", ingress), row);
    track(row, "Ingress");
  });

  const lbIngresses = ingresses.filter((ingress) => {
    const lbEntries = ingress.status?.loadBalancer?.ingress;
    return Array.isArray(lbEntries) && lbEntries.length > 0;
  });

  const lbByIngress = new Map<string, { ips: string[]; row: number }>();

  lbIngresses.forEach((ingress) => {
    const lbEntries = ingress.status.loadBalancer.ingress as Array<{ ip?: string; hostname?: string }>;
    const ips = lbEntries.map((e) => e.ip || e.hostname).filter(Boolean) as string[];
    const row = rowByIngress.get(nodeId("Ingress", ingress)) ?? 0;

    lbByIngress.set(nodeId("Ingress", ingress), { ips, row });
    track(row, "LoadBalancer");
  });

  podsByRow.forEach((rowPods, row) => {
    if (rowPods.length >= podGroupThreshold) {
      track(row, "Pods");
      return;
    }

    rowPods.forEach(() => track(row, "Pod"));
  });

  configMaps.forEach((configMap, index) => {
    const referencingPod = firstPodByConfigMapKey.get(objectKey(configMap));
    const row = referencingPod ? podRows.get(referencingPod) ?? index : index;

    track(row, "ConfigMap");
  });

  secrets.forEach((secret, index) => {
    const referencingPod = firstPodBySecretKey.get(objectKey(secret));
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

  lbIngresses.forEach((ingress) => {
    const ingressId = nodeId("Ingress", ingress);
    const lb = lbByIngress.get(ingressId);
    if (!lb) return;

    const lbName = lb.ips.join(", ");
    const lbId = `LoadBalancer:${getNamespace(ingress)}:${getName(ingress)}`;

    nodes.push({
      id: lbId,
      kind: "LoadBalancer",
      name: lbName,
      namespace: getNamespace(ingress),
      status: "healthy",
      statusText: `${lb.ips.length} endpoint(s)`,
      x: columnX.LoadBalancer,
      y: yFor(lb.row, "LoadBalancer"),
      object: {
        metadata: { name: lbName, namespace: getNamespace(ingress) },
        toJSON: () => ({
          kind: "LoadBalancer",
          metadata: { name: lbName, namespace: getNamespace(ingress) },
          source: getName(ingress),
          endpoints: lb.ips
        })
      },
      editable: false
    });

    pushEdge(lbId, ingressId);
  });

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
              pods: activePods,
              ownerChain: ownerChainForPodGroup(activePods, resourceLabel("Pods", `${activePods.length} active`))
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
              pods: completedPods,
              ownerChain: ownerChainForPodGroup(completedPods, resourceLabel("Pods", `${completedPods.length} completed`))
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
        pods: rowPods,
        ownerChain: ownerChainForPodGroup(rowPods, resourceLabel("Pods", name))
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
        pods: [pod],
        ownerChain: ownerChainForPod(pod)
      });
    });
  });

  configMaps.forEach((configMap, index) => {
    const referencingPod = firstPodByConfigMapKey.get(objectKey(configMap));
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
    const referencingPod = firstPodBySecretKey.get(objectKey(secret));
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
    for (const serviceName of ingressServiceNames(ingress)) {
      const service = serviceByKey.get(`${getNamespace(ingress)}:${serviceName}`);

      if (service) {
        pushEdge(nodeId("Ingress", ingress), nodeId("Service", service));
      }
    }
  }

  for (const service of services) {
    for (const deployment of deployments) {
      if (getNamespace(service) === getNamespace(deployment) && labelsMatch(serviceSelector(service), deploymentTemplateLabels(deployment))) {
        pushEdge(nodeId("Service", service), nodeId("Deployment", deployment));
      }
    }
  }

  for (const pod of pods) {
    for (const deployment of deploymentsByPod.get(pod) ?? []) {
      const to = groupedPodNodeByPod.get(pod) ?? nodeId("Pod", pod);

      pushEdge(nodeId("Deployment", deployment), to);
    }
  }

  if (sortedCronJobs.length > 0) {
    const groupId = `CronJobs:${getNamespace(sortedCronJobs[0])}:all`;

    for (const cronJob of sortedCronJobs) {
      const cronJobKey = `${getNamespace(cronJob)}:${getName(cronJob)}`;
      const cronJobId = nodeId("CronJob", cronJob);

      pushEdge(groupId, cronJobId);

      const cronJobJobs = jobsByCronJob.get(cronJobKey) ?? [];

      if (cronJobJobs.length > 0) {
        const jobsId = `Jobs:${cronJobKey}`;

        pushEdge(cronJobId, jobsId);

        const allJobPods = cronJobJobs.flatMap((job) => podsByJob.get(`${getNamespace(job)}:${getName(job)}`) ?? []);

        if (allJobPods.length > 0) {
          const activePods = allJobPods.filter(pod => pod.status?.phase !== "Succeeded");
          const completedPods = allJobPods.filter(pod => pod.status?.phase === "Succeeded");

          if (activePods.length > 0) {
            const activeId = `Pods:${cronJobKey}:active`;
            pushEdge(jobsId, activeId);
          }

          if (completedPods.length > 0) {
            const completedId = `Pods:${cronJobKey}:completed`;
            pushEdge(jobsId, completedId);
          }
        }
      }
    }
  }

  for (const pod of pods) {
    const references = podReferences.get(pod) ?? { configMaps: [], secrets: [] };

    const jobName = ownerName(pod, "Job");
    let podFrom: string;

    if (jobName) {
      const job = visibleJobByKey.get(`${getNamespace(pod)}:${jobName}`);
      const cronJobName = job ? ownerName(job, "CronJob") : undefined;

      podFrom = cronJobName ? `Pods:${getNamespace(pod)}:${cronJobName}:${pod.status?.phase === "Succeeded" ? "completed" : "active"}` : groupedPodNodeByPod.get(pod) ?? nodeId("Pod", pod);
    } else {
      podFrom = groupedPodNodeByPod.get(pod) ?? nodeId("Pod", pod);
    }

    for (const configMapName of references.configMaps) {
      const configMap = configMapByKey.get(`${getNamespace(pod)}:${configMapName}`);

      if (configMap) {
        pushEdge(podFrom, nodeId("ConfigMap", configMap));
      }
    }

    for (const secretName of references.secrets) {
      const secret = secretByKey.get(`${getNamespace(pod)}:${secretName}`);

      if (secret) {
        pushEdge(podFrom, nodeId("Secret", secret));
      }
    }
  }

  const cronZoneY = cronJobs.length > 0 ? (yByRow.get(cronJobRowStart) ?? topPadding) - 70 : 0;

  return { nodes, edges, cronZoneY };
}
