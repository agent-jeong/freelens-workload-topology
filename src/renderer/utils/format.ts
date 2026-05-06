import YAML from "yaml";

export function formatAge(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export function parseCpu(value: string): number {
  if (value.endsWith("m")) return Number(value.slice(0, -1));
  if (value.endsWith("n")) return Number(value.slice(0, -1)) / 1e6;
  return Number(value) * 1000;
}

export function formatCpu(millis: number): string {
  if (millis >= 1000) return `${(millis / 1000).toFixed(1)} cores`;
  return `${Math.round(millis)}m`;
}

export function parseMem(value: string): number {
  const units: Record<string, number> = { Ki: 1024, Mi: 1048576, Gi: 1073741824, Ti: 1099511627776, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };

  for (const [suffix, multiplier] of Object.entries(units)) {
    if (value.endsWith(suffix)) return Number(value.slice(0, -suffix.length)) * multiplier;
  }

  return Number(value);
}

export function formatMem(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} Gi`;
  if (bytes >= 1048576) return `${Math.round(bytes / 1048576)} Mi`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ki`;
  return `${bytes} B`;
}

export function formatKeyValueMap(value: any): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }

  return Object.keys(value).length === 0 ? "{}" : YAML.stringify(value).trim();
}

export function formatContainers(value: any): string {
  if (!Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }
  if (value.length === 0) return "[]";

  const simplified = value.map((c: any) => ({
    name: c?.name ?? "container",
    image: c?.image ?? "-",
    ...(c?.ports?.length ? { ports: c.ports.map((p: any) => `${p.containerPort}${p.protocol ? `/${p.protocol}` : ""}`) } : {}),
    ...(c?.resources ? { resources: c.resources } : {})
  }));

  return YAML.stringify(simplified).trim();
}

export function formatContainerStatuses(value: any): string {
  if (!Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }
  if (value.length === 0) return "[]";

  const simplified = value.map((status: any) => ({
    name: status?.name ?? "container",
    ready: Boolean(status?.ready),
    restarts: status?.restartCount ?? 0,
    state: status?.state ? Object.keys(status.state)[0] : "unknown"
  }));

  return YAML.stringify(simplified).trim();
}

export function formatIngressRules(value: any): string {
  if (!Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }
  if (value.length === 0) return "[]";

  const simplified = value.map((rule: any) => ({
    host: rule?.host ?? "*",
    ...(rule?.http?.paths?.length ? {
      paths: rule.http.paths.map((path: any) => {
        const service = path?.backend?.service;
        const port = service?.port?.number ?? service?.port?.name ?? "-";
        return `${path?.path ?? "/"} -> ${service?.name ?? "-"}:${port}`;
      })
    } : {})
  }));

  return YAML.stringify(simplified).trim();
}

export function formatTls(value: any): string {
  if (!Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }
  if (value.length === 0) return "[]";

  const simplified = value.map((tls: any) => ({
    hosts: tls?.hosts ?? [],
    secret: tls?.secretName ?? "-"
  }));

  return YAML.stringify(simplified).trim();
}

export function formatLoadBalancerIngress(value: any): string {
  if (!Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }

  return value.map((entry) => entry?.ip ?? entry?.hostname ?? "-").join(", ") || "[]";
}

export function formatOwnerReferences(value: any): string {
  if (!Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }

  return value.map((owner) => `${owner?.kind ?? "Owner"}/${owner?.name ?? "-"}`).join(", ") || "[]";
}

export function formatConditions(value: any): string {
  if (!Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }
  if (value.length === 0) return "[]";

  const simplified = value.map((condition: any) => ({
    type: condition?.type ?? "condition",
    status: condition?.status ?? "-",
    ...(condition?.reason ? { reason: condition.reason } : {})
  }));

  return YAML.stringify(simplified).trim();
}

export function formatVolumes(value: any): string {
  if (!Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }
  if (value.length === 0) return "[]";

  const simplified = value.map((volume: any) => ({
    name: volume?.name ?? "volume",
    type: Object.keys(volume ?? {}).find((key) => key !== "name") ?? "unknown"
  }));

  return YAML.stringify(simplified).trim();
}

export function formatJsonDetailValue(value: any, path: string[]): string {
  const pathKey = path.join(".");

  if (value === undefined) {
    return "-";
  }

  if (value === null) {
    return "null";
  }

  if (pathKey === "metadata.labels" || pathKey === "metadata.annotations" || pathKey.endsWith(".matchLabels") || pathKey === "spec.selector" || pathKey.endsWith(".resources.requests") || pathKey.endsWith(".resources.limits")) {
    return formatKeyValueMap(value);
  }

  if (pathKey === "metadata.ownerReferences" || pathKey === "status.active") {
    return formatOwnerReferences(value);
  }

  if (pathKey === "spec.template.spec.containers" || pathKey === "spec.containers" || pathKey === "spec.template.spec.initContainers" || pathKey === "spec.initContainers") {
    return formatContainers(value);
  }

  if (pathKey === "status.containerStatuses") {
    return formatContainerStatuses(value);
  }

  if (pathKey === "spec.rules") {
    return formatIngressRules(value);
  }

  if (pathKey === "spec.tls") {
    return formatTls(value);
  }

  if (pathKey === "status.loadBalancer.ingress") {
    return formatLoadBalancerIngress(value);
  }

  if (pathKey === "status.conditions") {
    return formatConditions(value);
  }

  if (pathKey === "spec.volumes" || pathKey === "spec.template.spec.volumes") {
    return formatVolumes(value);
  }

  if (pathKey === "spec.template" || pathKey === "spec.jobTemplate") {
    const containers = value?.spec?.containers ?? value?.spec?.template?.spec?.containers;
    const restartPolicy = value?.spec?.restartPolicy ?? value?.spec?.template?.spec?.restartPolicy;
    const parts = [
      Array.isArray(containers) ? `containers: ${formatContainers(containers)}` : undefined,
      restartPolicy ? `restartPolicy: ${restartPolicy}` : undefined
    ].filter(Boolean);

    return parts.join(" | ") || formatJsonDetailValue(value, []);
  }

  if (pathKey === "spec.defaultBackend") {
    const service = value?.service;
    const port = service?.port?.number ?? service?.port?.name ?? "-";

    return service ? `${service.name ?? "-"}:${port}` : formatJsonDetailValue(value, []);
  }

  if (pathKey === "data" || pathKey === "binaryData" || pathKey === "stringData") {
    const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];

    return keys.length === 0 ? "{}" : `${keys.length} keys: ${keys.join(", ")}`;
  }

  if (Array.isArray(value)) {
    if (pathKey === "spec.ports") {
      return value.map((port) => {
        const fields = [
          port?.protocol ? `protocol: ${JSON.stringify(port.protocol)}` : undefined,
          port?.port !== undefined ? `port: ${port.port}` : undefined,
          port?.targetPort !== undefined ? `targetPort: ${port.targetPort}` : undefined,
          port?.nodePort !== undefined ? `nodePort: ${port.nodePort}` : undefined,
          port?.name ? `name: ${JSON.stringify(port.name)}` : undefined
        ].filter(Boolean);

        return fields.join(", ");
      }).filter(Boolean).join(" | ") || "[]";
    }

    if (value.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")) {
      return value.length === 0 ? "[]" : value.map(String).join(", ");
    }

    return value.length === 0 ? "[]" : `${value.length} items`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);

    return keys.length === 0 ? "{}" : `${keys.length} keys`;
  }

  return String(value);
}
