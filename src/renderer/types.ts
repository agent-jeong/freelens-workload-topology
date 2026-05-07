export type TopologyKind = "LoadBalancer" | "Ingress" | "Service" | "Deployment" | "CronJobs" | "CronJob" | "Jobs" | "Job" | "Pod" | "Pods" | "ConfigMap" | "Secret";
export type TopologyStatus = "healthy" | "warning" | "danger" | "unknown";

export type KubeObjectLike = {
  getName?: () => string;
  getNamespace?: () => string;
  getStatus?: () => string;
  toJSON?: () => unknown;
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    creationTimestamp?: string;
    ownerReferences?: Array<{ kind?: string; name?: string }>;
  };
  type?: string;
  spec?: any;
  status?: any;
};

export type KubeEventLike = KubeObjectLike & {
  action?: string;
  count?: number;
  deprecatedCount?: number;
  deprecatedFirstTimestamp?: string;
  deprecatedLastTimestamp?: string;
  deprecatedSource?: {
    component?: string;
    host?: string;
  };
  eventTime?: string;
  firstTimestamp?: string;
  involvedObject?: {
    kind?: string;
    name?: string;
    namespace?: string;
    uid?: string;
  };
  lastTimestamp?: string;
  message?: string;
  note?: string;
  regarding?: {
    kind?: string;
    name?: string;
    namespace?: string;
    uid?: string;
  };
  reason?: string;
  reportingComponent?: string;
  reportingController?: string;
  series?: {
    count?: number;
    lastObservedTime?: string;
  };
  source?: {
    component?: string;
    host?: string;
  };
};

export type ProblemReason = {
  severity: "warning" | "danger";
  message: string;
};

export type CauseHint = {
  reason: string;
  message: string;
};

export type ResourceSet = {
  ingresses: KubeObjectLike[];
  services: KubeObjectLike[];
  deployments: KubeObjectLike[];
  cronJobs: KubeObjectLike[];
  jobs: KubeObjectLike[];
  pods: KubeObjectLike[];
  configMaps: KubeObjectLike[];
  secrets: KubeObjectLike[];
  events: KubeEventLike[];
};

export type TopologyNode = {
  id: string;
  kind: TopologyKind;
  name: string;
  namespace: string;
  status: TopologyStatus;
  statusText: string;
  x: number;
  y: number;
  object: KubeObjectLike;
  editable: boolean;
  problems?: ProblemReason[];
  pods?: KubeObjectLike[];
};

export type TopologyEdge = {
  id: string;
  from: string;
  to: string;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type KubeApiLike = {
  update: (descriptor: { name: string; namespace?: string }, data: any) => Promise<unknown>;
  delete: (descriptor: { name: string; namespace?: string }) => Promise<unknown>;
};

export type PodLogEntry = {
  podName: string;
  namespace: string;
  containerName: string;
  text: string;
  error?: string;
};

export type PodLogOptions = {
  tailLines: number;
  previous: boolean;
};

export type PodLogLine = {
  id: string;
  podName: string;
  containerName: string;
  sourceIndex: number;
  timestamp?: string;
  message: string;
  displayMessage: string;
  wrappedDisplayMessage: string;
  severity: "error" | "warning" | "info" | "debug" | "trace" | "unknown";
  error?: boolean;
};

export type JsonFieldMeaning = {
  path: string[];
  meaning: string;
};

export type PodMetrics = {
  podName: string;
  namespace: string;
  cpu: number;
  memory: number;
};

export type MetricsResult = { ok: true; data: PodMetrics[] } | { ok: false; reason: string };

export type ContextMenuItem = {
  label: string;
  icon: string;
  onClick: () => void;
  separator?: boolean;
};
