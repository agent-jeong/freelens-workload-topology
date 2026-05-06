import type { TopologyKind } from "./types";

export const styleElementId = "freelens-workload-topology-styles";
export const cardWidth = 190;
export const cardHeight = 136;
export const topPadding = 76;
export const laneGap = 18;
export const minGroupHeight = 166;
export const canvasWidth = 1530;
export const minimapWidth = 210;
export const minimapHeight = 132;
export const layoutStoragePrefix = "freelens-workload-topology-layout";
export const podGroupThreshold = 2;
export const METRICS_INSTALL_CMD = "kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml";
export const METRICS_PATCH_CMD = "kubectl patch deployment metrics-server -n kube-system --type='json' -p='[{\"op\": \"add\", \"path\": \"/spec/template/spec/containers/0/args/-\", \"value\": \"--kubelet-insecure-tls\"}]'";
export const LOG_LINE_HEIGHT = 24;
export const LOG_OVERSCAN = 20;

export const columnX: Record<TopologyKind, number> = {
  LoadBalancer: 60,
  Ingress: 270,
  Service: 480,
  Deployment: 690,
  CronJobs: 270,
  CronJob: 480,
  Jobs: 690,
  Job: 690,
  Pod: 900,
  Pods: 900,
  ConfigMap: 1110,
  Secret: 1320
};

export const mainColumns: Array<{ kind: TopologyKind; label: string }> = [
  { kind: "LoadBalancer", label: "LoadBalancer" },
  { kind: "Ingress", label: "Ingress" },
  { kind: "Service", label: "Service" },
  { kind: "Deployment", label: "Deployment" },
  { kind: "Pod", label: "Pod(s)" },
  { kind: "ConfigMap", label: "ConfigMap" },
  { kind: "Secret", label: "Secret" }
];

export const cronZoneColumns: Array<{ kind: TopologyKind; label: string }> = [
  { kind: "CronJobs", label: "CronJobs" },
  { kind: "CronJob", label: "CronJob" },
  { kind: "Jobs", label: "Jobs" },
  { kind: "Pod", label: "Pod(s)" }
];
