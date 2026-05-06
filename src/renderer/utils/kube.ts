import { Renderer } from "@freelensapp/extensions";
import type { KubeApiLike, KubeObjectLike, KubeEventLike, TopologyKind, ResourceSet } from "../types";

const { K8sApi } = Renderer;

export function getName(object: KubeObjectLike): string {
  return object.getName?.() ?? object.metadata?.name ?? "unknown";
}

export function getNamespace(object: KubeObjectLike): string {
  return object.getNamespace?.() ?? object.metadata?.namespace ?? "default";
}

export function getEventNamespace(event: KubeEventLike): string {
  return event.involvedObject?.namespace ?? event.regarding?.namespace ?? getNamespace(event);
}

export function getLabels(object: KubeObjectLike): Record<string, string> | undefined {
  return object.metadata?.labels;
}

export function labelsMatch(selector: Record<string, string> | undefined, labels: Record<string, string> | undefined): boolean {
  const entries = Object.entries(selector ?? {});

  return entries.length > 0 && entries.every(([key, value]) => labels?.[key] === value);
}

export function nodeId(kind: TopologyKind, object: KubeObjectLike): string {
  return `${kind}:${getNamespace(object)}:${getName(object)}`;
}

export function objectForCopy(object: KubeObjectLike): unknown {
  return JSON.parse(JSON.stringify(object));
}

export function stringifyObject(object: KubeObjectLike): string {
  return JSON.stringify(objectForCopy(object), null, 2);
}

export function objectTime(object: KubeObjectLike): number {
  const timestamp = object.status?.startTime ?? object.status?.completionTime ?? object.metadata?.creationTimestamp;

  return timestamp ? new Date(timestamp).getTime() : 0;
}

export function ownerName(object: KubeObjectLike, kind: string): string | undefined {
  return object.metadata?.ownerReferences?.find((owner) => owner.kind === kind)?.name;
}

export function serviceSelector(service: KubeObjectLike): Record<string, string> | undefined {
  return service.spec?.selector;
}

export function deploymentSelector(deployment: KubeObjectLike): Record<string, string> | undefined {
  return deployment.spec?.selector?.matchLabels ?? deployment.spec?.template?.metadata?.labels;
}

export function deploymentTemplateLabels(deployment: KubeObjectLike): Record<string, string> | undefined {
  return deployment.spec?.template?.metadata?.labels;
}

export function ingressServiceNames(ingress: KubeObjectLike): string[] {
  const names = new Set<string>();

  for (const rule of ingress.spec?.rules ?? []) {
    for (const path of rule.http?.paths ?? []) {
      const serviceName = path.backend?.service?.name ?? path.backend?.serviceName;

      if (serviceName) {
        names.add(serviceName);
      }
    }
  }

  const defaultBackend = ingress.spec?.defaultBackend?.service?.name ?? ingress.spec?.backend?.serviceName;

  if (defaultBackend) {
    names.add(defaultBackend);
  }

  return [...names];
}

export function podReferenceNames(pod: KubeObjectLike) {
  const configMaps = new Set<string>();
  const secrets = new Set<string>();

  for (const volume of pod.spec?.volumes ?? []) {
    if (volume.configMap?.name) {
      configMaps.add(volume.configMap.name);
    }

    if (volume.secret?.secretName) {
      secrets.add(volume.secret.secretName);
    }
  }

  const allContainers = [
    ...(pod.spec?.initContainers ?? []),
    ...(pod.spec?.containers ?? [])
  ];

  for (const container of allContainers) {
    for (const envFrom of container.envFrom ?? []) {
      if (envFrom.configMapRef?.name) {
        configMaps.add(envFrom.configMapRef.name);
      }

      if (envFrom.secretRef?.name) {
        secrets.add(envFrom.secretRef.name);
      }
    }

    for (const env of container.env ?? []) {
      if (env.valueFrom?.configMapKeyRef?.name) {
        configMaps.add(env.valueFrom.configMapKeyRef.name);
      }

      if (env.valueFrom?.secretKeyRef?.name) {
        secrets.add(env.valueFrom.secretKeyRef.name);
      }
    }
  }

  return { configMaps: [...configMaps], secrets: [...secrets] };
}

export function filterByNamespace(resources: ResourceSet, namespace: string): ResourceSet {
  return {
    ingresses: resources.ingresses.filter((resource) => getNamespace(resource) === namespace),
    services: resources.services.filter((resource) => getNamespace(resource) === namespace),
    deployments: resources.deployments.filter((resource) => getNamespace(resource) === namespace),
    cronJobs: resources.cronJobs.filter((resource) => getNamespace(resource) === namespace),
    jobs: resources.jobs.filter((resource) => getNamespace(resource) === namespace),
    pods: resources.pods.filter((resource) => getNamespace(resource) === namespace),
    configMaps: resources.configMaps.filter((resource) => getNamespace(resource) === namespace),
    secrets: resources.secrets.filter((resource) => getNamespace(resource) === namespace),
    events: resources.events.filter((event) => getEventNamespace(event) === namespace)
  };
}

export function namespaceOptions(resources: ResourceSet, namespaces: string[]) {
  const values = new Set(["default", ...namespaces]);

  Object.values(resources).forEach((items) => {
    items.forEach((item) => values.add(getNamespace(item)));
  });
  resources.events.forEach((event) => values.add(getEventNamespace(event)));

  return [...values].sort((left, right) => left.localeCompare(right));
}

export function visibleResourceCount(resources: ResourceSet): number {
  return (
    resources.ingresses.length +
    resources.services.length +
    resources.deployments.length +
    resources.cronJobs.length +
    resources.jobs.length +
    resources.pods.length +
    resources.configMaps.length +
    resources.secrets.length
  );
}

export function apiForKind(kind: TopologyKind): KubeApiLike {
  switch (kind) {
    case "Ingress":
      return K8sApi.ingressApi as KubeApiLike;
    case "Service":
      return K8sApi.serviceApi as KubeApiLike;
    case "Deployment":
      return K8sApi.deploymentApi as KubeApiLike;
    case "CronJob":
      return K8sApi.cronJobApi as KubeApiLike;
    case "Job":
      return K8sApi.jobApi as KubeApiLike;
    case "Pod":
      return K8sApi.podsApi as KubeApiLike;
    case "ConfigMap":
      return K8sApi.configMapApi as KubeApiLike;
    case "Secret":
      return K8sApi.secretsApi as KubeApiLike;
    default:
      throw new Error(`Editing is not supported for ${kind}`);
  }
}
