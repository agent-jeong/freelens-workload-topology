import { useEffect, useState } from "react";
import type { MetricsResult, PodMetrics } from "../types";
import { parseCpu, parseMem } from "../utils/format";
import { kubeApiBase } from "../utils/kube";

async function fetchPodMetrics(namespace: string, signal?: AbortSignal): Promise<MetricsResult> {
  try {
    const path = `/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods`;
    const url = `${kubeApiBase()}${path}`;

    const r = await fetch(url, { signal });
    if (!r.ok) {
      if (r.status === 404) return { ok: false, reason: "not-installed" };
      if (r.status === 503) return { ok: false, reason: "api-unavailable" };
      if (r.status === 403) return { ok: false, reason: "forbidden" };
      return { ok: false, reason: `http-${r.status}` };
    }
    const response = await r.json();

    if (!response) return { ok: false, reason: "empty-response" };

    const items = response?.items ?? [];

    if (!Array.isArray(items)) return { ok: false, reason: "invalid-response" };

    if (items.length === 0) {
      return { ok: true, data: [] };
    }

    const data = items.map((item: any) => {
      const containers = item.containers ?? [];
      let cpu = 0;
      let mem = 0;

      for (const c of containers) {
        if (c.usage?.cpu) cpu += parseCpu(c.usage.cpu);
        if (c.usage?.memory) mem += parseMem(c.usage.memory);
      }

      return {
        podName: item.metadata?.name ?? "",
        namespace: item.metadata?.namespace ?? namespace,
        cpu,
        memory: mem,
      };
    });

    return { ok: true, data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "aborted" };
    }
    return { ok: false, reason: "network-error" };
  }
}

export function useTopologyMetrics(selectedNamespace: string, isLive: boolean) {
  const [podMetrics, setPodMetrics] = useState<Map<string, PodMetrics>>(new Map());
  const [metricsHint, setMetricsHint] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMetrics() {
      const result = await fetchPodMetrics(selectedNamespace, controller.signal);

      if (controller.signal.aborted) return;

      if (result.ok) {
        setPodMetrics(new Map(result.data.map((m) => [m.podName, m])));
        setMetricsHint(null);
      } else if (result.reason !== "aborted") {
        setMetricsHint(result.reason);
      }
    }

    void loadMetrics();

    const interval = setInterval(loadMetrics, isLive ? 8000 : 30000);

    return () => { controller.abort(); clearInterval(interval); };
  }, [selectedNamespace, isLive]);

  return { podMetrics, metricsHint, setMetricsHint };
}
