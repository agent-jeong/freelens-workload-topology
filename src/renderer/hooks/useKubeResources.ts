import { useEffect, useRef, useState } from "react";
import { Renderer } from "@freelensapp/extensions";
import type { KubeEventLike, KubeObjectLike, ResourceSet } from "../types";
import { eventsApi, getName, namespaceOptions } from "../utils/kube";

const { K8sApi } = Renderer;

type ListResult<T> = {
  items: T[];
  error?: string;
};

async function listResource<T>(label: string, api?: { list: () => Promise<unknown> }): Promise<ListResult<T>> {
  try {
    if (!api) {
      return { items: [], error: `${label}: API is not available` };
    }

    return { items: (await api.list() ?? []) as T[] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";

    return { items: [], error: `${label}: ${message}` };
  }
}

export function useKubeResources() {
  const [resources, setResources] = useState<ResourceSet>({
    ingresses: [],
    services: [],
    deployments: [],
    cronJobs: [],
    jobs: [],
    pods: [],
    configMaps: [],
    secrets: [],
    events: []
  });
  const [namespaces, setNamespaces] = useState<string[]>(["default"]);
  const [selectedNamespace, setSelectedNamespace] = useState("default");
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resourceLoadWarning, setResourceLoadWarning] = useState<string | null>(null);
  const liveRefreshInFlight = useRef(false);
  const loadRequestSeq = useRef(0);

  async function loadResources(options: { silent?: boolean } = {}) {
    const requestSeq = ++loadRequestSeq.current;

    if (!options.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const [namespaceList, ingresses, services, deployments, cronJobs, jobs, pods, configMaps, secrets, events] = await Promise.all([
        listResource<KubeObjectLike>("Namespaces", K8sApi.namespacesApi),
        listResource<KubeObjectLike>("Ingresses", K8sApi.ingressApi),
        listResource<KubeObjectLike>("Services", K8sApi.serviceApi),
        listResource<KubeObjectLike>("Deployments", K8sApi.deploymentApi),
        listResource<KubeObjectLike>("CronJobs", K8sApi.cronJobApi),
        listResource<KubeObjectLike>("Jobs", K8sApi.jobApi),
        listResource<KubeObjectLike>("Pods", K8sApi.podsApi),
        listResource<KubeObjectLike>("ConfigMaps", K8sApi.configMapApi),
        listResource<KubeObjectLike>("Secrets", K8sApi.secretsApi),
        listResource<KubeEventLike>("Events", eventsApi())
      ]);
      const failures = [namespaceList, ingresses, services, deployments, cronJobs, jobs, pods, configMaps, secrets, events]
        .map((result) => result.error)
        .filter((message): message is string => Boolean(message));

      const nextNamespaces = namespaceOptions(
        {
          ingresses: ingresses.items,
          services: services.items,
          deployments: deployments.items,
          cronJobs: cronJobs.items,
          jobs: jobs.items,
          pods: pods.items,
          configMaps: configMaps.items,
          secrets: secrets.items,
          events: events.items
        },
        namespaceList.items.map(getName)
      );

      if (requestSeq === loadRequestSeq.current) {
        setResources({
          ingresses: ingresses.items,
          services: services.items,
          deployments: deployments.items,
          cronJobs: cronJobs.items,
          jobs: jobs.items,
          pods: pods.items,
          configMaps: configMaps.items,
          secrets: secrets.items,
          events: events.items
        });
        setNamespaces(nextNamespaces);
        setResourceLoadWarning(failures.length > 0 ? `Some resources could not be loaded: ${failures.join("; ")}` : null);
      }
    } catch (loadError) {
      if (requestSeq === loadRequestSeq.current) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load Kubernetes resources");
      }
    } finally {
      if (requestSeq === loadRequestSeq.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadResources();
  }, []);

  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      if (liveRefreshInFlight.current) {
        return;
      }

      liveRefreshInFlight.current = true;
      void loadResources({ silent: true }).finally(() => {
        liveRefreshInFlight.current = false;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [isLive]);

  return {
    resources,
    namespaces,
    selectedNamespace,
    setSelectedNamespace,
    isLive,
    setIsLive,
    loading,
    error,
    setError,
    resourceLoadWarning,
    loadResources,
  };
}
