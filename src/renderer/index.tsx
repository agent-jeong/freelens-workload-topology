import React, { useEffect, useMemo, useRef, useState } from "react";
import { Renderer } from "@freelensapp/extensions";
import YAML from "yaml";
import { topologyStyles } from "./styles";

type TopologyKind = "Ingress" | "Service" | "Deployment" | "CronJobs" | "CronJob" | "Jobs" | "Job" | "Pod" | "Pods" | "ConfigMap" | "Secret";
type TopologyStatus = "healthy" | "warning" | "danger" | "unknown";

type KubeObjectLike = {
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

type ResourceSet = {
  ingresses: KubeObjectLike[];
  services: KubeObjectLike[];
  deployments: KubeObjectLike[];
  cronJobs: KubeObjectLike[];
  jobs: KubeObjectLike[];
  pods: KubeObjectLike[];
  configMaps: KubeObjectLike[];
  secrets: KubeObjectLike[];
};

type TopologyNode = {
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
  pods?: KubeObjectLike[];
  metrics?: {
    cpu: number;    // in cores
    memory: number; // in MiB
  };
};

type TopologyEdge = {
  id: string;
  from: string;
  to: string;
};

type ViewportSize = {
  width: number;
  height: number;
};

type KubeApiLike = {
  update: (descriptor: { name: string; namespace?: string }, data: any) => Promise<unknown>;
};

export interface PodMetrics {
  metadata: { name: string; namespace: string; creationTimestamp: string };
  timestamp: string;
  window: string;
  containers: {
    name: string;
    usage: { cpu: string; memory: string };
  }[];
}

export interface PodMetricsList {
  kind: "PodMetricsList";
  apiVersion: "metrics.k8s.io/v1beta1";
  metadata: { selfLink: string };
  items: PodMetrics[];
}

export function parseK8sCpu(value: string): number {
  if (!value) return 0;
  if (value.endsWith('n')) return parseInt(value, 10) / 1e9; // nanocores -> cores
  if (value.endsWith('u')) return parseInt(value, 10) / 1e6; // microcores
  if (value.endsWith('m')) return parseInt(value, 10) / 1e3; // millicores
  return parseFloat(value);
}

export function parseK8sMemory(value: string): number {
  if (!value) return 0;
  // Convert to MiB
  if (value.endsWith('Ki')) return parseInt(value, 10) / 1024;
  if (value.endsWith('Mi')) return parseInt(value, 10);
  if (value.endsWith('Gi')) return parseInt(value, 10) * 1024;
  if (value.endsWith('Ti')) return parseInt(value, 10) * 1024 * 1024;
  if (value.endsWith('Pi')) return parseInt(value, 10) * 1024 * 1024 * 1024;
  if (value.endsWith('Ei')) return parseInt(value, 10) * 1024 * 1024 * 1024 * 1024;
  // SI units
  if (value.endsWith('k')) return parseInt(value, 10) * 1000 / (1024 * 1024);
  if (value.endsWith('M')) return parseInt(value, 10) * 1000 * 1000 / (1024 * 1024);
  if (value.endsWith('G')) return parseInt(value, 10) * 1000 * 1000 * 1000 / (1024 * 1024);
  // raw bytes
  return parseInt(value, 10) / (1024 * 1024);
}

type PodLogEntry = {
  podName: string;
  namespace: string;
  containerName: string;
  text: string;
  error?: string;
};

type PodLogOptions = {
  tailLines: number;
  previous: boolean;
};

type PodLogLine = {
  id: string;
  podName: string;
  containerName: string;
  sourceIndex: number;
  timestamp?: string;
  message: string;
  displayMessage: string;
  wrappedDisplayMessage: string;
  severity: "error" | "warning" | "info" | "debug" | "unknown";
  error?: boolean;
};

const { Component, K8sApi } = Renderer;
const styleElementId = "freelens-workload-topology-styles";
const cardWidth = 190;
const cardHeight = 136;
const topPadding = 76;
const laneGap = 18;
const minGroupHeight = 166;
const canvasWidth = 1320;
const minimapWidth = 210;
const minimapHeight = 132;
const layoutStoragePrefix = "freelens-workload-topology-layout";
const podGroupThreshold = 2;

const columnX: Record<TopologyKind, number> = {
  Ingress: 60,
  Service: 270,
  Deployment: 480,
  CronJobs: 60,
  CronJob: 270,
  Jobs: 480,
  Job: 480,
  Pod: 690,
  Pods: 690,
  ConfigMap: 900,
  Secret: 1110
};

const mainColumns: Array<{ kind: TopologyKind; label: string }> = [
  { kind: "Ingress", label: "Ingress" },
  { kind: "Service", label: "Service" },
  { kind: "Deployment", label: "Deployment" },
  { kind: "Pod", label: "Pod(s)" },
  { kind: "ConfigMap", label: "ConfigMap" },
  { kind: "Secret", label: "Secret" }
];

const cronZoneColumns: Array<{ kind: TopologyKind; label: string }> = [
  { kind: "CronJobs", label: "CronJobs" },
  { kind: "CronJob", label: "CronJob" },
  { kind: "Jobs", label: "Jobs" },
  { kind: "Pod", label: "Pod(s)" }
];

function getName(object: KubeObjectLike): string {
  return object.getName?.() ?? object.metadata?.name ?? "unknown";
}

function getNamespace(object: KubeObjectLike): string {
  return object.getNamespace?.() ?? object.metadata?.namespace ?? "default";
}

function getLabels(object: KubeObjectLike): Record<string, string> | undefined {
  return object.metadata?.labels;
}

function labelsMatch(selector: Record<string, string> | undefined, labels: Record<string, string> | undefined): boolean {
  const entries = Object.entries(selector ?? {});

  return entries.length > 0 && entries.every(([key, value]) => labels?.[key] === value);
}

function nodeId(kind: TopologyKind, object: KubeObjectLike): string {
  return `${kind}:${getNamespace(object)}:${getName(object)}`;
}

function objectForCopy(object: KubeObjectLike): unknown {
  return object.toJSON?.() ?? object;
}

function stringifyObject(object: KubeObjectLike): string {
  return JSON.stringify(objectForCopy(object), null, 2);
}

function formatKoreanTime(hourText: string, minuteText: string): string | undefined {
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }

  if (hour === 0 && minute === 0) {
    return "자정";
  }

  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;

  return `${period} ${displayHour}:${minute.toString().padStart(2, "0")}`;
}

function describeDayOfWeek(field: string): string | undefined {
  const normalized = field.toUpperCase();
  const days: Record<string, string> = {
    "0": "일요일",
    "1": "월요일",
    "2": "화요일",
    "3": "수요일",
    "4": "목요일",
    "5": "금요일",
    "6": "토요일",
    "7": "일요일",
    SUN: "일요일",
    MON: "월요일",
    TUE: "화요일",
    WED: "수요일",
    THU: "목요일",
    FRI: "금요일",
    SAT: "토요일"
  };

  if (days[normalized]) {
    return `매주 ${days[normalized]}`;
  }

  if (normalized === "1-5" || normalized === "MON-FRI") {
    return "월요일부터 금요일까지";
  }

  return undefined;
}

function describeCronSchedule(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);

  if (parts.length !== 5) {
    return "설명할 수 없는 cron 표현식";
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const time = formatKoreanTime(hour, minute);

  if (minute.startsWith("*/") && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `${minute.slice(2)}분마다`;
  }

  if (minute === "0" && hour.startsWith("*/") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `${hour.slice(2)}시간마다 정각`;
  }

  if (time && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `매일 ${time}`;
  }

  if (time && dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const day = describeDayOfWeek(dayOfWeek);

    return day ? `${day} ${time}` : "설명할 수 없는 cron 표현식";
  }

  if (time && dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
    if (dayOfMonth.startsWith("*/")) {
      return `${dayOfMonth.slice(2)}일마다 ${time}`;
    }

    return `매월 ${dayOfMonth}일 ${time}`;
  }

  if (time && dayOfMonth !== "*" && month !== "*" && dayOfWeek === "*") {
    return `매년 ${month}월 ${dayOfMonth}일 ${time}`;
  }

  if (minute.includes(",") && hour.includes(",") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const times = hour.split(",").map((hourPart) => formatKoreanTime(hourPart, minute.split(",")[0])).filter(Boolean);

    return times.length > 0 ? `매일 ${times.join(" 및 ")}` : "설명할 수 없는 cron 표현식";
  }

  if (time && hour.includes("-") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `매일 ${hour.replace("-", "시부터 ")}시까지 매시간`;
  }

  if (minute.startsWith("*/") && hour.includes("-") && dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
    const day = describeDayOfWeek(dayOfWeek);

    return day ? `${day} ${hour.replace("-", "시부터 ")}시까지 ${minute.slice(2)}분마다` : "설명할 수 없는 cron 표현식";
  }

  return "설명할 수 없는 cron 표현식";
}

function scheduleWithDescription(schedule: string, timeZone?: string): string {
  const description = describeCronSchedule(schedule);

  return timeZone ? `${description}, ${timeZone}` : description;
}

function valueAtPath(value: any, path: string[]): any {
  return path.reduce((current, segment) => current?.[segment], value);
}

type JsonFieldMeaning = {
  path: string[];
  meaning: string;
};

function formatKeyValueMap(value: any): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }

  return Object.keys(value).length === 0 ? "{}" : YAML.stringify(value).trim();
}

function formatContainers(value: any): string {
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

function formatContainerStatuses(value: any): string {
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

function formatIngressRules(value: any): string {
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

function formatTls(value: any): string {
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

function formatLoadBalancerIngress(value: any): string {
  if (!Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }

  return value.map((entry) => entry?.ip ?? entry?.hostname ?? "-").join(", ") || "[]";
}

function formatOwnerReferences(value: any): string {
  if (!Array.isArray(value)) {
    return formatJsonDetailValue(value, []);
  }

  return value.map((owner) => `${owner?.kind ?? "Owner"}/${owner?.name ?? "-"}`).join(", ") || "[]";
}

function formatConditions(value: any): string {
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

function formatVolumes(value: any): string {
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

function formatJsonDetailValue(value: any, path: string[]): string {
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

function jsonFieldMeanings(kind: TopologyKind, object: any): JsonFieldMeaning[] {
  const resourceName = object?.kind ?? kind;
  const fields: JsonFieldMeaning[] = [
    { path: ["apiVersion"], meaning: `${resourceName}가 사용하는 Kubernetes API 그룹과 버전` },
    { path: ["kind"], meaning: "Kubernetes 리소스 종류" },
    { path: ["metadata", "name"], meaning: `${resourceName} 리소스 이름` },
    { path: ["metadata", "namespace"], meaning: `${resourceName}가 속한 네임스페이스` },
    { path: ["metadata", "labels"], meaning: "리소스 선택, 그룹핑, 검색에 쓰이는 라벨" },
    { path: ["metadata", "annotations"], meaning: "컨트롤러나 도구가 참고하는 부가 메타데이터" },
    { path: ["metadata", "ownerReferences"], meaning: "이 리소스를 생성하거나 관리하는 상위 리소스" },
    { path: ["metadata", "creationTimestamp"], meaning: "리소스가 생성된 시각" },
    { path: ["status", "conditions"], meaning: "컨트롤러가 판단한 주요 상태 조건" }
  ];

  if (kind === "Ingress") {
    fields.push(
      { path: ["spec", "ingressClassName"], meaning: "Ingress를 처리할 컨트롤러 클래스" },
      { path: ["spec", "rules"], meaning: "호스트와 경로별 라우팅 규칙 목록" },
      { path: ["spec", "tls"], meaning: "HTTPS 인증서와 호스트 연결 설정" },
      { path: ["spec", "defaultBackend"], meaning: "규칙에 매칭되지 않을 때 사용할 기본 백엔드" },
      { path: ["status", "loadBalancer", "ingress"], meaning: "외부에서 접근 가능한 로드밸런서 주소" }
    );
  } else if (kind === "Service") {
    fields.push(
      { path: ["spec", "type"], meaning: "Service 노출 방식" },
      { path: ["spec", "selector"], meaning: "트래픽을 전달할 Pod 선택 조건" },
      { path: ["spec", "ports"], meaning: "Service 포트와 대상 컨테이너 포트 매핑" },
      { path: ["spec", "clusterIP"], meaning: "클러스터 내부 Service IP" },
      { path: ["spec", "externalIPs"], meaning: "외부에서 Service로 직접 접근할 IP 목록" },
      { path: ["spec", "loadBalancerIP"], meaning: "LoadBalancer 타입에서 요청한 고정 IP" },
      { path: ["spec", "sessionAffinity"], meaning: "클라이언트 요청을 같은 Pod로 유지할지 여부" },
      { path: ["status", "loadBalancer", "ingress"], meaning: "LoadBalancer가 할당한 외부 주소" }
    );
  } else if (kind === "Deployment") {
    fields.push(
      { path: ["spec", "replicas"], meaning: "원하는 Pod 복제본 수" },
      { path: ["spec", "strategy", "type"], meaning: "배포 업데이트 방식" },
      { path: ["spec", "selector", "matchLabels"], meaning: "Deployment가 관리할 Pod 선택 조건" },
      { path: ["spec", "template", "metadata", "labels"], meaning: "생성되는 Pod에 붙는 라벨" },
      { path: ["spec", "template", "spec", "containers"], meaning: "Pod에서 실행할 컨테이너 정의" },
      { path: ["spec", "template", "spec", "volumes"], meaning: "Pod에 마운트할 볼륨 정의" },
      { path: ["status", "readyReplicas"], meaning: "준비 완료된 Pod 수" },
      { path: ["status", "availableReplicas"], meaning: "사용 가능한 Pod 수" },
      { path: ["status", "updatedReplicas"], meaning: "최신 템플릿으로 업데이트된 Pod 수" },
      { path: ["status", "unavailableReplicas"], meaning: "아직 사용 불가능한 Pod 수" }
    );
  } else if (kind === "Pod") {
    fields.push(
      { path: ["spec", "nodeName"], meaning: "Pod가 배치된 노드 이름" },
      { path: ["spec", "serviceAccountName"], meaning: "Pod가 API 접근에 사용하는 ServiceAccount" },
      { path: ["spec", "restartPolicy"], meaning: "컨테이너 종료 시 재시작 정책" },
      { path: ["spec", "containers"], meaning: "Pod 안에서 실행되는 컨테이너 목록" },
      { path: ["spec", "initContainers"], meaning: "앱 컨테이너 전에 실행되는 초기화 컨테이너" },
      { path: ["spec", "volumes"], meaning: "Pod에 연결된 ConfigMap, Secret, PVC 등 볼륨" },
      { path: ["status", "phase"], meaning: "Pod의 현재 실행 단계" },
      { path: ["status", "podIP"], meaning: "Pod에 할당된 클러스터 내부 IP" },
      { path: ["status", "hostIP"], meaning: "Pod가 실행 중인 노드 IP" },
      { path: ["status", "containerStatuses"], meaning: "컨테이너별 준비 상태와 재시작 횟수" }
    );
  } else if (kind === "CronJob") {
    fields.push(
      { path: ["spec", "schedule"], meaning: "Job을 생성하는 cron 스케줄" },
      { path: ["spec", "timeZone"], meaning: "스케줄 해석에 사용할 시간대" },
      { path: ["spec", "suspend"], meaning: "스케줄 실행 중지 여부" },
      { path: ["spec", "concurrencyPolicy"], meaning: "이전 Job이 실행 중일 때 새 Job 처리 방식" },
      { path: ["spec", "successfulJobsHistoryLimit"], meaning: "보관할 성공 Job 기록 수" },
      { path: ["spec", "failedJobsHistoryLimit"], meaning: "보관할 실패 Job 기록 수" },
      { path: ["spec", "jobTemplate"], meaning: "스케줄 시 생성될 Job 템플릿" },
      { path: ["status", "lastScheduleTime"], meaning: "마지막으로 스케줄이 실행된 시각" },
      { path: ["status", "lastSuccessfulTime"], meaning: "마지막으로 성공한 실행 시각" },
      { path: ["status", "active"], meaning: "현재 실행 중인 Job 목록" }
    );
  } else if (kind === "Job") {
    fields.push(
      { path: ["spec", "parallelism"], meaning: "동시에 실행할 Pod 수" },
      { path: ["spec", "completions"], meaning: "성공해야 하는 Pod 완료 횟수" },
      { path: ["spec", "template"], meaning: "Job이 생성할 Pod 템플릿" },
      { path: ["spec", "backoffLimit"], meaning: "실패 시 재시도 허용 횟수" },
      { path: ["status", "active"], meaning: "현재 실행 중인 Pod 수" },
      { path: ["status", "succeeded"], meaning: "성공 완료한 Pod 수" },
      { path: ["status", "failed"], meaning: "실패한 Pod 수" },
      { path: ["status", "completionTime"], meaning: "Job이 완료된 시각" }
    );
  } else if (kind === "ConfigMap") {
    fields.push(
      { path: ["immutable"], meaning: "생성 후 데이터 변경 금지 여부" },
      { path: ["data"], meaning: "애플리케이션 설정 문자열 데이터" },
      { path: ["binaryData"], meaning: "base64로 저장된 바이너리 설정 데이터" }
    );
  } else if (kind === "Secret") {
    fields.push(
      { path: ["type"], meaning: "Secret 데이터 형식" },
      { path: ["immutable"], meaning: "생성 후 데이터 변경 금지 여부" },
      { path: ["data"], meaning: "base64로 인코딩된 민감 데이터" },
      { path: ["stringData"], meaning: "쓰기 전용 평문 Secret 데이터" }
    );
  } else if (kind === "Jobs") {
    fields.push(
      { path: ["summary", "total"], meaning: "그룹에 포함된 Job 총 개수" },
      { path: ["summary", "succeeded"], meaning: "성공 완료된 Job 개수" },
      { path: ["summary", "failed"], meaning: "실패한 Job 개수" },
      { path: ["jobs"], meaning: "그룹에 포함된 실제 Job JSON 목록" }
    );
  } else if (kind === "CronJobs") {
    fields.push(
      { path: ["summary", "total"], meaning: "그룹에 포함된 CronJob 총 개수" },
      { path: ["summary", "active"], meaning: "현재 실행 중인 CronJob 개수" },
      { path: ["summary", "suspended"], meaning: "실행이 중지된 CronJob 개수" },
      { path: ["summary", "recentJobs"], meaning: "현재 표시 범위 안의 최근 Job 개수" },
      { path: ["summary", "failedRecentJobs"], meaning: "최근 Job 중 실패한 Job 개수" },
      { path: ["cronJobs"], meaning: "그룹에 포함된 실제 CronJob JSON 목록" }
    );
  } else if (kind === "Pods") {
    fields.push(
      { path: ["summary", "total"], meaning: "그룹에 포함된 Pod 총 개수" },
      { path: ["summary", "running"], meaning: "정상 상태로 판단된 Pod 개수" },
      { path: ["summary", "warning"], meaning: "주의 상태 Pod 개수" },
      { path: ["summary", "danger"], meaning: "위험 상태 Pod 개수" },
      { path: ["pods"], meaning: "그룹에 포함된 실제 Pod JSON 목록" }
    );
  }

  return fields;
}

function jsonMeaningRows(kind: TopologyKind, object: any): Array<{ path: string; value: string; meaning: string }> {
  return jsonFieldMeanings(kind, object).map((field) => ({
    path: field.path.join("."),
    value: formatJsonDetailValue(valueAtPath(object, field.path), field.path),
    meaning: field.meaning
  }));
}

function editableObject(object: KubeObjectLike): any {
  const copy = JSON.parse(JSON.stringify(objectForCopy(object)));

  delete copy.status;

  if (copy.metadata) {
    delete copy.metadata.managedFields;
  }

  return copy;
}

function stringifyYaml(object: KubeObjectLike): string {
  return YAML.stringify(editableObject(object));
}

function apiForKind(kind: TopologyKind): KubeApiLike {
  if (kind === "Pods" || kind === "CronJobs" || kind === "Jobs") {
      throw new Error(`Grouped cards are read-only.
      Select an individual resource to edit YAML.`);
  }

  const apiByKind: Record<Exclude<TopologyKind, "Pods" | "CronJobs" | "Jobs">, KubeApiLike> = {
    Ingress: K8sApi.ingressApi,
    Service: K8sApi.serviceApi,
    Deployment: K8sApi.deploymentApi,
    CronJob: K8sApi.cronJobApi,
    Job: K8sApi.jobApi,
    Pod: K8sApi.podsApi,
    ConfigMap: K8sApi.configMapApi,
    Secret: K8sApi.secretsApi
  };

  return apiByKind[kind];
}

function layoutStorageKey(namespace: string): string {
  return `${layoutStoragePrefix}:${namespace}`;
}

function readStoredLayout(namespace: string): Record<string, { x: number; y: number }> {
  try {
    const raw = window.localStorage.getItem(layoutStorageKey(namespace));

    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStoredLayout(namespace: string, positions: Record<string, { x: number; y: number }>) {
  window.localStorage.setItem(layoutStorageKey(namespace), JSON.stringify(positions));
}

function summarizePodGroupStatus(pods: KubeObjectLike[]): TopologyStatus {
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

function podGroupObject(namespace: string, name: string, pods: KubeObjectLike[]): KubeObjectLike {
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

function cronJobsGroupObject(namespace: string, cronJobs: KubeObjectLike[], jobs: KubeObjectLike[]): KubeObjectLike {
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

function jobsGroupObject(namespace: string, name: string, jobs: KubeObjectLike[]): KubeObjectLike {
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

function jobsGroupStatus(jobs: KubeObjectLike[]): TopologyStatus {
  if (jobs.some((job) => (job.status?.failed ?? 0) > 0)) {
    return "danger";
  }

  if (jobs.every((job) => (job.status?.succeeded ?? 0) > 0)) {
    return "healthy";
  }

  return "warning";
}

function ownerName(object: KubeObjectLike, kind: string): string | undefined {
  return object.metadata?.ownerReferences?.find((owner) => owner.kind === kind)?.name;
}

function objectTime(object: KubeObjectLike): number {
  const timestamp = object.status?.startTime ?? object.status?.completionTime ?? object.metadata?.creationTimestamp;

  return timestamp ? new Date(timestamp).getTime() : 0;
}

function filterRecentJobs(jobs: KubeObjectLike[], hours: number) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  return jobs
    .filter((job) => objectTime(job) >= cutoff)
    .sort((left, right) => objectTime(right) - objectTime(left));
}

function connectedNodeIds(selectedNodeId: string | null, edges: TopologyEdge[]): Set<string> {
  if (!selectedNodeId) {
    return new Set();
  }

  const connected = new Set([selectedNodeId]);
  const queue = [selectedNodeId];

  while (queue.length > 0) {
    const current = queue.shift();

    for (const edge of edges) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : undefined;

      if (next && !connected.has(next)) {
        connected.add(next);
        queue.push(next);
      }
    }
  }

  return connected;
}

function yamlDiff(original: string, edited: string) {
  const originalLines = original.split("\n");
  const editedLines = edited.split("\n");
  const max = Math.max(originalLines.length, editedLines.length);
  const changes: Array<{ kind: "same" | "removed" | "added"; text: string }> = [];

  for (let index = 0; index < max; index += 1) {
    const originalLine = originalLines[index];
    const editedLine = editedLines[index];

    if (originalLine === editedLine) {
      if (originalLine !== undefined) {
        changes.push({ kind: "same", text: `  ${originalLine}` });
      }
      continue;
    }

    if (originalLine !== undefined) {
      changes.push({ kind: "removed", text: `- ${originalLine}` });
    }

    if (editedLine !== undefined) {
      changes.push({ kind: "added", text: `+ ${editedLine}` });
    }
  }

  return changes.filter((change) => change.kind !== "same").slice(0, 80);
}

function yamlWarnings(node: TopologyNode, yamlText: string) {
  const warnings: string[] = [];

  try {
    const parsed = YAML.parse(yamlText);
    const metadata = parsed?.metadata;

    if (parsed?.kind && parsed.kind !== node.kind) {
      warnings.push("Changing kind is not supported by Apply YAML.");
    }

    if (metadata?.name && metadata.name !== node.name) {
      warnings.push("Changing metadata.name may be rejected by Kubernetes.");
    }

    if (metadata?.namespace && metadata.namespace !== node.namespace) {
      warnings.push("Changing metadata.namespace may be rejected by Kubernetes.");
    }

    if (parsed?.status) {
      warnings.push("status is usually managed by Kubernetes and may be rejected.");
    }
  } catch {
    warnings.push("YAML has parse errors.");
  }

  if (node.kind === "Pod") {
    warnings.push("Many Pod fields are immutable; Deployment changes are usually safer.");
  }

  return warnings;
}

function highlightedJson(json: string) {
  const tokenPattern = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?=\s*:)|"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  json.replace(tokenPattern, (match, ...args) => {
    const offset = args[args.length - 2] as number;
    const suffix = json.slice(offset + match.length).match(/^\s*:/);

    if (offset > lastIndex) {
      nodes.push(json.slice(lastIndex, offset));
    }

    let tokenClass = "json-number";

    if (match.startsWith("\"")) {
      tokenClass = suffix ? "json-key" : "json-string";
    } else if (match === "true" || match === "false") {
      tokenClass = "json-boolean";
    } else if (match === "null") {
      tokenClass = "json-null";
    }

    nodes.push(<span key={`${offset}-${match}`} className={tokenClass}>{match}</span>);
    lastIndex = offset + match.length;

    return match;
  });

  if (lastIndex < json.length) {
    nodes.push(json.slice(lastIndex));
  }

  return nodes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function jsonMatches(value: unknown, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return false;
  }

  const visited = new WeakSet<object>();

  function search(current: unknown): boolean {
    if (current === null || current === undefined) {
      return String(current).includes(normalizedQuery);
    }

    if (typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
      return String(current).toLowerCase().includes(normalizedQuery);
    }

    if (typeof current !== "object") {
      return false;
    }

    if (visited.has(current)) {
      return false;
    }

    visited.add(current);

    if (Array.isArray(current)) {
      return current.some(search);
    }

    return Object.entries(current as Record<string, unknown>).some(([key, child]) =>
      key.toLowerCase().includes(normalizedQuery) || search(child)
    );
  }

  return search(value);
}

function JsonTree({
  data,
  name,
  line,
  path = [],
  query,
  secret,
  onCopy,
  expandState,
  onExpandAll
}: {
  data: unknown;
  name?: string;
  line?: number;
  path?: string[];
  query: string;
  secret: boolean;
  onCopy: (label: string, value: string) => void;
  expandState?: { open: boolean; tick: number };
  onExpandAll?: (value: boolean) => void;
}) {
  const defaultOpen = expandState ? expandState.open : path.length < 2;
  const [openState, setOpenState] = useState(defaultOpen);
  const isContainer = Array.isArray(data) || isRecord(data);
  const entries = Array.isArray(data)
    ? data.map((value, index) => [index.toString(), value] as const)
    : isRecord(data)
      ? Object.entries(data)
      : [];
  const matched = query.trim() ? jsonMatches(name ?? "", query) || jsonMatches(data, query) : false;
  const open = openState;
  const effectiveOpen = open || Boolean(query && matched);
  const masked = secret && path.length >= 1 && path[0] === "data" && !isContainer;
  const isArrayParent = Array.isArray(data);
  const pathLabel = path.join(".");

  useEffect(() => {
    if (expandState) {
      setOpenState(expandState.open);
    }
  }, [expandState]);

  if (!isContainer) {
    const displayValue = masked ? "\"********\"" : JSON.stringify(data);
    const copyValue = masked ? "" : typeof data === "string" ? data : JSON.stringify(data);

    return (
      <div
        className={`JsonTree__row${matched ? " is-match" : ""}`}
        onClick={() => onCopy(pathLabel || String(name), copyValue)}
        title={`Click to copy`}
      >
        {name !== undefined ? (
          <>
            <span className="JsonTree__key">{name}</span>
            <span className="JsonTree__colon">: </span>
          </>
        ) : null}
        <span className={`JsonTree__value value-${data === null ? "null" : typeof data}`}>{displayValue}</span>
      </div>
    );
  }

  const preview = !effectiveOpen && !isArrayParent && entries.length <= 4
    ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ").slice(0, 60)
    : null;

  const isRoot = path.length === 0;

  return (
    <div className={`JsonTree${isRoot ? " JsonTree--root" : ""}${matched ? " is-match" : ""}`}>
      <div className={`JsonTree__header${isRoot ? " JsonTree__header--root" : ""}`}>
        <button type="button" className="JsonTree__toggle" onClick={() => setOpenState((value) => !value)}>
          <span className="JsonTree__arrow">{effectiveOpen ? "▾" : "▸"}</span>
          {name !== undefined ? <strong>{name}</strong> : null}
          <em>{isArrayParent ? `Array[${entries.length}]` : `{${entries.length}}`}</em>
          {preview ? <span className="JsonTree__preview">{preview}</span> : null}
        </button>
        {isRoot && onExpandAll ? (
          <span className="JsonTree__rootActions">
            <button type="button" onClick={() => onExpandAll(true)}>Expand</button>
            <button type="button" onClick={() => onExpandAll(false)}>Collapse</button>
          </span>
        ) : null}
      </div>
      {effectiveOpen ? (
        <div className={`JsonTree__children${isArrayParent ? " is-array" : ""}`}>
          {entries.map(([key, value], index) => (
            <React.Fragment key={key}>
              {isArrayParent && index > 0 && (isRecord(value) || Array.isArray(value)) ? <div className="JsonTree__separator" /> : null}
              <JsonTree key={key} data={value} name={key} line={index + 1} path={[...path, key]} query={query} secret={secret} onCopy={onCopy} expandState={expandState} />
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function filterByNamespace(resources: ResourceSet, namespace: string): ResourceSet {
  return {
    ingresses: resources.ingresses.filter((resource) => getNamespace(resource) === namespace),
    services: resources.services.filter((resource) => getNamespace(resource) === namespace),
    deployments: resources.deployments.filter((resource) => getNamespace(resource) === namespace),
    cronJobs: resources.cronJobs.filter((resource) => getNamespace(resource) === namespace),
    jobs: resources.jobs.filter((resource) => getNamespace(resource) === namespace),
    pods: resources.pods.filter((resource) => getNamespace(resource) === namespace),
    configMaps: resources.configMaps.filter((resource) => getNamespace(resource) === namespace),
    secrets: resources.secrets.filter((resource) => getNamespace(resource) === namespace)
  };
}

function namespaceOptions(resources: ResourceSet, namespaces: string[]) {
  const values = new Set(["default", ...namespaces]);

  Object.values(resources).forEach((items) => {
    items.forEach((item) => values.add(getNamespace(item)));
  });

  return [...values].sort((left, right) => left.localeCompare(right));
}

function serviceSelector(service: KubeObjectLike): Record<string, string> | undefined {
  return service.spec?.selector;
}

function deploymentSelector(deployment: KubeObjectLike): Record<string, string> | undefined {
  return deployment.spec?.selector?.matchLabels ?? deployment.spec?.template?.metadata?.labels;
}

function deploymentTemplateLabels(deployment: KubeObjectLike): Record<string, string> | undefined {
  return deployment.spec?.template?.metadata?.labels;
}

function ingressServiceNames(ingress: KubeObjectLike): string[] {
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

function podReferenceNames(pod: KubeObjectLike) {
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

  for (const container of pod.spec?.containers ?? []) {
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

function serviceStatus(service: KubeObjectLike, deployments: KubeObjectLike[], pods: KubeObjectLike[]): TopologyStatus {
  const selector = serviceSelector(service);
  const hasTarget =
    deployments.some((deployment) => labelsMatch(selector, deploymentTemplateLabels(deployment))) ||
    pods.some((pod) => labelsMatch(selector, getLabels(pod)));

  return hasTarget ? "healthy" : "warning";
}

function deploymentStatus(deployment: KubeObjectLike): TopologyStatus {
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

function podStatus(pod: KubeObjectLike): TopologyStatus {
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

function buildTopology(resources: ResourceSet, cronJobWindowHours: number, podMetrics: Record<string, { cpu: number; memory: number }>) {
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
      editable: true
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
      editable: true
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
      editable: true
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
      editable: false
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
        editable: true
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
          editable: false
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
        const podsId = `Pods:${cronJobKey}:pods`;

        if (allJobPods.length > 0) {
          edges.push({ id: `${jobsId}->${podsId}`, from: jobsId, to: podsId });
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

      podFrom = cronJobName ? `Pods:${getNamespace(pod)}:${cronJobName}:pods` : groupedPodNodeByPod.get(pod) ?? nodeId("Pod", pod);
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

function ResourceIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "Ingress":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
      );
    case "Service":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M17 11h-2V9c0-1.66-1.34-3-3-3H8V4H2v6h6V8h4c.55 0 1 .45 1 1v2h-2l3 4 3-4zm-13 4h4v6H4v-6zm12 0h4v6h-4v-6z"/>
        </svg>
      );
    case "Deployment":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
        </svg>
      );
    case "Pod":
    case "Pods":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44A.991.991 0 013 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9zM12 4.15L6.04 7.5 12 10.85l5.96-3.35L12 4.15zM5 15.91l6 3.38v-6.71L5 9.21v6.7zM19 15.91v-6.7l-6 3.38v6.71l6-3.38z"/>
        </svg>
      );
    case "CronJob":
    case "CronJobs":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
        </svg>
      );
    case "Job":
    case "Jobs":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
        </svg>
      );
    case "ConfigMap":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
        </svg>
      );
    case "Secret":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
      );
  }
}

function TopologyCard({
  node,
  selected,
  onDragStart,
  relation,
  onSelect
}: {
  node: TopologyNode;
  selected: boolean;
  onDragStart: (event: React.MouseEvent, node: TopologyNode) => void;
  relation: "normal" | "connected" | "dimmed";
  onSelect: () => void;
}) {
  let extraInfoTitle = node.namespace;
  let extraInfoNode: React.ReactNode = null;

  if (node.kind === "CronJob") {
    const spec = node.object?.spec as any;
    if (spec?.schedule) {
      extraInfoTitle = `${node.namespace} | ${spec.schedule}${spec.suspend ? " (Paused)" : ""}`;
      extraInfoNode = (
        <>
          <span style={{ margin: "0 4px", opacity: 0.5 }}>|</span>
          {spec.schedule}
          {spec.suspend ? <span style={{ color: "#d99b20", marginLeft: "4px" }}>(Paused)</span> : ""}
        </>
      );
    }
  } else if (node.kind === "Pod") {
    const statuses = (node.object?.status as any)?.containerStatuses || [];
    const restarts = statuses.reduce((sum: number, cs: any) => sum + (cs.restartCount || 0), 0);
    if (restarts > 0) {
      extraInfoTitle = `${node.namespace} | Restarts: ${restarts}`;
      extraInfoNode = (
        <>
          <span style={{ margin: "0 4px", opacity: 0.5 }}>|</span>
          <span style={{ color: "#d44848", fontWeight: "bold" }}>Restarts: {restarts}</span>
        </>
      );
    }
  } else if (node.kind === "Deployment") {
    const status = node.object?.status as any;
    const spec = node.object?.spec as any;
    if (status && spec) {
      const ready = status.readyReplicas || 0;
      extraInfoTitle = `${node.namespace} | Ready: ${ready}/${spec.replicas}`;
      extraInfoNode = (
        <>
          <span style={{ margin: "0 4px", opacity: 0.5 }}>|</span>
          <span>Ready: {ready}/{spec.replicas}</span>
        </>
      );
    }
  } else if (node.kind === "Service") {
    const spec = node.object?.spec as any;
    if (spec?.ports?.length > 0) {
      const portsString = spec.ports.map((p: any) => `${p.port}${p.nodePort ? `:${p.nodePort}` : ""}`).join(", ");
      extraInfoTitle = `${node.namespace} | ${portsString}`;
      extraInfoNode = (
        <>
          <span style={{ margin: "0 4px", opacity: 0.5 }}>|</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", verticalAlign: "bottom", maxWidth: "90px" }}>{portsString}</span>
        </>
      );
    }
  } else if (node.kind === "Ingress") {
    const spec = node.object?.spec as any;
    if (spec?.rules?.length > 0) {
      const hosts = spec.rules.map((r: any) => r.host).filter(Boolean).join(", ");
      if (hosts) {
        extraInfoTitle = `${node.namespace} | ${hosts}`;
        extraInfoNode = (
          <>
            <span style={{ margin: "0 4px", opacity: 0.5 }}>|</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", verticalAlign: "bottom", maxWidth: "100px" }}>{hosts}</span>
          </>
        );
      }
    }
  }

  return (
    <button
      type="button"
      className={`TopologyCard kind-${node.kind} status-${node.status} relation-${relation}${selected ? " is-selected" : ""}`}
      style={{ left: node.x, top: node.y }}
      onClick={onSelect}
      onMouseDown={(event) => onDragStart(event, node)}
    >
      <div className="TopologyCard__header">
        <span className="TopologyCard__icon">
          <ResourceIcon kind={node.kind} />
        </span>
        <span className="TopologyCard__kind">{node.kind}</span>
      </div>
      <div className="TopologyCard__name" title={node.name}>{node.name}</div>
      <div className="TopologyCard__meta" title={extraInfoTitle}>
        {node.namespace}
        {extraInfoNode}
      </div>
      <div className="TopologyCard__status">{node.statusText}</div>
    </button>
  );
}

function TopologyMinimap({
  canvasHeight,
  canvasSize,
  nodes,
  offset,
  scale,
  onNavigate
}: {
  canvasHeight: number;
  canvasSize: ViewportSize;
  nodes: TopologyNode[];
  offset: { x: number; y: number };
  scale: number;
  onNavigate: (x: number, y: number) => void;
}) {
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const viewportDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const mapScale = Math.min((minimapWidth - 16) / canvasWidth, (minimapHeight - 16) / canvasHeight);
  const mapOffsetX = (minimapWidth - canvasWidth * mapScale) / 2;
  const mapOffsetY = (minimapHeight - canvasHeight * mapScale) / 2;
  const viewportWidth = Math.min(canvasWidth, canvasSize.width / scale);
  const viewportHeight = Math.min(canvasHeight, canvasSize.height / scale);
  const viewportX = Math.min(Math.max(-offset.x / scale, 0), Math.max(canvasWidth - viewportWidth, 0));
  const viewportY = Math.min(Math.max(-offset.y / scale, 0), Math.max(canvasHeight - viewportHeight, 0));

  function pointFromEvent(event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) {
    const rect = minimapRef.current?.getBoundingClientRect();

    if (!rect) {
      return undefined;
    }

    const x = Math.min(Math.max((event.clientX - rect.left - mapOffsetX) / mapScale, 0), canvasWidth);
    const y = Math.min(Math.max((event.clientY - rect.top - mapOffsetY) / mapScale, 0), canvasHeight);

    return { x, y };
  }

  function navigateFromEvent(event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) {
    const point = pointFromEvent(event);

    if (!point) {
      return;
    }

    const nextViewportX = point.x - viewportWidth / 2;
    const nextViewportY = point.y - viewportHeight / 2;

    const clampedX = Math.min(Math.max(nextViewportX, 0), Math.max(canvasWidth - viewportWidth, 0));
    const clampedY = Math.min(Math.max(nextViewportY, 0), Math.max(canvasHeight - viewportHeight, 0));

    onNavigate(clampedX + viewportWidth / 2, clampedY + viewportHeight / 2);
  }

  return (
    <div
      ref={minimapRef}
      className="TopologyMinimap"
      style={{ width: minimapWidth, height: minimapHeight }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        navigateFromEvent(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons !== 1) {
          return;
        }

        event.stopPropagation();
        navigateFromEvent(event);
      }}
      onPointerUp={(event) => {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {}
      }}
    >
      <svg width={minimapWidth} height={minimapHeight}>
        <g transform={`translate(${mapOffsetX}, ${mapOffsetY})`}>
          {nodes.map((node) => (
            <rect
              key={node.id}
              className={`status-${node.status}`}
              x={node.x * mapScale}
              y={node.y * mapScale}
              width={cardWidth * mapScale}
              height={cardHeight * mapScale}
              rx="2"
            />
          ))}
        </g>
      </svg>
      <div
        className="TopologyMinimap__viewport"
        style={{
          left: viewportX * mapScale + mapOffsetX,
          top: viewportY * mapScale + mapOffsetY,
          width: viewportWidth * mapScale,
          height: viewportHeight * mapScale
        }}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          event.stopPropagation();
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
          const point = pointFromEvent(event);
          if (point) {
            // @ts-ignore
            viewportDragRef.current = {
              offsetX: point.x - viewportX,
              offsetY: point.y - viewportY
            };
          }
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          event.stopPropagation();
          const point = pointFromEvent(event);
          if (point && viewportDragRef.current) {
            // @ts-ignore
            const drag: { offsetX: number; offsetY: number } = viewportDragRef.current;
            const nextViewportX = point.x - drag.offsetX;
            const nextViewportY = point.y - drag.offsetY;

            const clampedX = Math.min(Math.max(nextViewportX, 0), Math.max(canvasWidth - viewportWidth, 0));
            const clampedY = Math.min(Math.max(nextViewportY, 0), Math.max(canvasHeight - viewportHeight, 0));

            onNavigate(clampedX + viewportWidth / 2, clampedY + viewportHeight / 2);
          }
        }}
        onPointerUp={(event) => {
          viewportDragRef.current = null;
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {}
        }}
        onPointerCancel={() => {
          viewportDragRef.current = null;
        }}
      />
    </div>
  );
}

function DetailRow({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className={`TopologyDetails__row${onCopy ? " is-copyable" : ""}`} onClick={onCopy} title={onCopy ? `Click to copy ${label}` : value}>
      <span>{label}</span>
      <strong>{value}{onCopy ? <span className="TopologyDetails__copyIcon">&#x2398;</span> : null}</strong>
    </div>
  );
}

function ActionRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <div className="TopologyDetails__row TopologyDetails__row--action" onClick={onClick} title={value}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function JsonMeaningRow({ row }: { row: { path: string; value: string; meaning: string } }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = row.value.split("\n").length > 4 || row.value.length > 150;

  return (
    <div className="JsonMeaningModal__row">
      <code title={row.path}>{row.path}</code>
      <strong
        className={`JsonMeaningModal__value${isLong ? " is-expandable" : ""}${expanded ? " is-expanded" : ""}`}
        onClick={() => { if (isLong) setExpanded(!expanded); }}
        title={isLong ? (expanded ? "클릭하여 접기" : "클릭하여 펼치기") : row.value}
      >
        {row.value}
      </strong>
      <span>{row.meaning}</span>
    </div>
  );
}

function JsonMeaningModal({
  kind,
  rows,
  onClose
}: {
  kind: TopologyKind;
  rows: Array<{ path: string; value: string; meaning: string }>;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="JsonMeaningModal__backdrop" onMouseDown={onClose}>
      <section className="JsonMeaningModal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="JSON field meanings">
        <header className="JsonMeaningModal__header">
          <div>
            <span>JSON Detail</span>
            <h3>{kind} 주요 항목</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">&times;</button>
        </header>
        <div className="JsonMeaningModal__table">
          <div className="JsonMeaningModal__head">
            <span>항목</span>
            <span>현재 값</span>
            <span>의미</span>
          </div>
          {rows.map((row) => (
            <JsonMeaningRow key={row.path} row={row} />
          ))}
        </div>
      </section>
    </div>
  );
}

function highlightYaml(text: string): React.ReactNode[] {
  return text.split("\n").map((line, lineIndex) => {
    const nodes: React.ReactNode[] = [];

    if (/^\s*#/.test(line)) {
      nodes.push(<span key="c" className="yaml-comment">{line}</span>);
    } else {
      const keyMatch = line.match(/^(\s*)([\w.\-/]+)(\s*:\s*)(.*)/);

      if (keyMatch) {
        const [, indent, key, colon, rest] = keyMatch;

        nodes.push(indent);
        nodes.push(<span key="k" className="yaml-key">{key}</span>);
        nodes.push(<span key="co" className="yaml-colon">{colon}</span>);

        if (rest) {
          nodes.push(highlightYamlValue(rest));
        }
      } else {
        const listMatch = line.match(/^(\s*-\s*)(.*)/);

        if (listMatch) {
          const [, dash, rest] = listMatch;

          nodes.push(<span key="d" className="yaml-dash">{dash}</span>);

          const inlineKey = rest.match(/^([\w.\-/]+)(\s*:\s*)(.*)/);

          if (inlineKey) {
            const [, k, c, v] = inlineKey;

            nodes.push(<span key="lk" className="yaml-key">{k}</span>);
            nodes.push(<span key="lc" className="yaml-colon">{c}</span>);

            if (v) {
              nodes.push(highlightYamlValue(v));
            }
          } else {
            nodes.push(highlightYamlValue(rest));
          }
        } else {
          nodes.push(line);
        }
      }
    }

    return <React.Fragment key={lineIndex}>{nodes}{"\n"}</React.Fragment>;
  });
}

function highlightYamlValue(value: string): React.ReactNode {
  if (/^\s*#/.test(value)) {
    return <span className="yaml-comment">{value}</span>;
  }

  if (/^(true|false|yes|no|null|~)$/i.test(value.trim())) {
    return <span className="yaml-boolean">{value}</span>;
  }

  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value.trim())) {
    return <span className="yaml-number">{value}</span>;
  }

  if (/^["']/.test(value.trim())) {
    return <span className="yaml-string">{value}</span>;
  }

  return <span className="yaml-string">{value}</span>;
}

function CodeEditorWithLines({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const lineCount = Math.max(value.split("\n").length, 1);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);

  function syncScroll() {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  return (
    <div className="CodeEditor">
      <div className="CodeEditor__lines" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
      </div>
      <div className="CodeEditor__body">
        <pre ref={highlightRef} className="CodeEditor__highlight" aria-hidden="true">
          <code>{highlightYaml(value)}</code>
        </pre>
        <textarea
          ref={textareaRef}
          className="TopologyDetails__yaml"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={syncScroll}
        />
      </div>
    </div>
  );
}

function DiffWithLines({ changes }: { changes: Array<{ kind: "same" | "removed" | "added"; text: string }> }) {
  return (
    <pre className="TopologyDetails__diff">
      {changes.length > 0 ? changes.map((change, index) => (
        <div key={`${change.kind}-${index}`} className={`diff-${change.kind}`}>
          <span>{index + 1}</span>
          <code>{change.text}</code>
        </div>
      )) : <div><span>1</span><code>No line diff available.</code></div>}
    </pre>
  );
}

function TopologyDetails({
  node,
  copied,
  onApply,
  onCopy,
  onOpenLogs,
  onClose
}: {
  node: TopologyNode | undefined;
  copied: string | null;
  onApply: (node: TopologyNode, yamlText: string) => Promise<void>;
  onCopy: (label: string, value: string) => void;
  onOpenLogs: (node: TopologyNode) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"json" | "yaml">("json");
  const [yamlText, setYamlText] = useState("");
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [jsonQuery, setJsonQuery] = useState("");
  const [jsonExpandState, setJsonExpandState] = useState<{ open: boolean; tick: number } | undefined>();
  const [jsonMeaningOpen, setJsonMeaningOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(400);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!node) {
      setYamlText("");
      setApplyMessage(null);
      setApplyError(null);
      return;
    }

    setYamlText(stringifyYaml(node.object));
    setApplyMessage(null);
    setApplyError(null);
    setJsonMeaningOpen(false);
  }, [node?.id]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startX - event.clientX;
      setPanelWidth(Math.max(280, Math.min(800, resizeRef.current.startWidth + delta)));
    }

    function handleMouseUp() {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  function startResize(event: React.MouseEvent) {
    event.preventDefault();
    resizeRef.current = { startX: event.clientX, startWidth: panelWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  if (!node) {
    return (
      <aside className="TopologyDetails TopologyDetails--empty" style={{ width: panelWidth, minWidth: panelWidth }}>
        <div className="TopologyDetails__resize" onMouseDown={startResize} />
        <div className="TopologyDetails__empty">Select a resource to inspect details.</div>
      </aside>
    );
  }

  const activeNode = node;
  const json = stringifyObject(activeNode.object);
  const jsonObject = objectForCopy(activeNode.object);
  const yaml = stringifyYaml(activeNode.object);
  const diff = yamlDiff(yaml, yamlText);
  const warnings = yamlWarnings(activeNode, yamlText);
  const yamlChanged = yamlText !== yaml;
  const apiVersion = (jsonObject as any)?.apiVersion;
  const jsonMeanings = jsonMeaningRows(activeNode.kind, jsonObject);

  async function applyYaml() {
    setApplying(true);
    setApplyMessage(null);
    setApplyError(null);

    try {
      await onApply(activeNode, yamlText);
      setApplyMessage("Applied YAML");
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Failed to apply YAML");
    } finally {
      setApplying(false);
    }
  }

  return (
    <aside className="TopologyDetails" style={{ width: panelWidth, minWidth: panelWidth }}>
      <div className="TopologyDetails__resize" onMouseDown={startResize} />
      <div className="TopologyDetails__header">
        <div>
          <span>{node.kind}</span>
          <h3 title={node.name}>{node.name}</h3>
        </div>
        <button type="button" className="TopologyDetails__close" onClick={onClose} aria-label="Close">&times;</button>
      </div>

      {copied ? <div className="TopologyDetails__copied">Copied {copied}</div> : null}
      {applyMessage ? <div className="TopologyDetails__applied">{applyMessage}</div> : null}
      {applyError ? <div className="TopologyDetails__applyError">{applyError}</div> : null}

      <div className="TopologyDetails__info">
        <DetailRow label="Name" value={node.name} onCopy={() => onCopy("name", node.name)} />
        <DetailRow label="Namespace" value={node.namespace} onCopy={() => onCopy("namespace", node.namespace)} />
        {apiVersion ? <DetailRow label="apiVersion" value={String(apiVersion)} onCopy={() => onCopy("apiVersion", String(apiVersion))} /> : null}
        {node.pods?.length ? (
          <ActionRow
            label="Logs"
            value={node.pods.length > 1 ? `Open ${node.pods.length} pod logs` : "Open pod logs"}
            onClick={() => onOpenLogs(node)}
          />
        ) : null}

        {(() => {
          const spec = activeNode.object?.spec as any;
          const status = activeNode.object?.status as any;
          const metadata = activeNode.object?.metadata as any;
          const rows = [];

          if (metadata?.creationTimestamp) {
            const ageInfo = Math.floor((Date.now() - new Date(metadata.creationTimestamp).getTime()) / (1000 * 60 * 60 * 24));
            rows.push(<DetailRow key="age" label="Age" value={`${ageInfo} days`} />);
          }

          if (metadata?.labels) {
            const labelsCount = Object.keys(metadata.labels).length;
            const topLabels = Object.entries(metadata.labels).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(", ");
            const labelsStr = labelsCount > 3 ? `${topLabels} (+${labelsCount - 3})` : topLabels;
            rows.push(<DetailRow key="labels" label="Labels" value={labelsStr} onCopy={() => onCopy("labels", Object.entries(metadata.labels).map(([k, v]) => `${k}=${v}`).join("\n"))} />);
          }

          if (activeNode.kind === "Pod") {
            const nodeName = spec?.nodeName;
            const podIP = status?.podIP;
            const images = spec?.containers?.map((c: any) => c.image).join(", ");
            const restarts = status?.containerStatuses?.reduce((acc: number, cs: any) => acc + (cs.restartCount || 0), 0);

            if (nodeName) rows.push(<DetailRow key="node" label="Node" value={nodeName} onCopy={() => onCopy("node", nodeName)} />);
            if (podIP) rows.push(<DetailRow key="ip" label="Pod IP" value={podIP} onCopy={() => onCopy("ip", podIP)} />);
            if (images) rows.push(<DetailRow key="image" label="Image" value={images} onCopy={() => onCopy("image", images)} />);
            if (restarts > 0) rows.push(<DetailRow key="restarts" label="Restarts" value={String(restarts)} />);
            
          } else if (activeNode.kind === "Deployment") {
            const images = spec?.template?.spec?.containers?.map((c: any) => c.image).join(", ");
            const ready = status?.readyReplicas || 0;
            const replicas = spec?.replicas || 0;

            if (images) rows.push(<DetailRow key="image" label="Image" value={images} onCopy={() => onCopy("image", images)} />);
            rows.push(<DetailRow key="replicas" label="Replicas" value={`${ready} / ${replicas}`} />);
            
          } else if (activeNode.kind === "Service") {
            const type = spec?.type;
            const clusterIP = spec?.clusterIP;
            const ports = spec?.ports?.map((p: any) => `${p.port}${p.nodePort ? `:${p.nodePort}` : ""}/${p.protocol || "TCP"}`).join(", ");

            if (type) rows.push(<DetailRow key="type" label="Type" value={type} />);
            if (clusterIP) rows.push(<DetailRow key="clusterIP" label="Cluster IP" value={clusterIP} onCopy={() => onCopy("cluster ip", clusterIP)} />);
            if (ports) rows.push(<DetailRow key="ports" label="Ports" value={ports} onCopy={() => onCopy("ports", ports)} />);

          } else if (activeNode.kind === "Ingress") {
            const hosts = spec?.rules?.map((r: any) => r.host).filter(Boolean).join(", ");
            const endpoints = status?.loadBalancer?.ingress?.map((i: any) => i.ip || i.hostname).filter(Boolean).join(", ");
            
            if (hosts) rows.push(<DetailRow key="hosts" label="Hosts" value={hosts} onCopy={() => onCopy("hosts", hosts)} />);
            if (endpoints) rows.push(<DetailRow key="endpoints" label="Endpoint IP" value={endpoints} onCopy={() => onCopy("endpoints", endpoints)} />);
          } else if (activeNode.kind === "CronJob") {
            if (spec?.schedule) rows.push(<DetailRow key="schedule" label="Schedule" value={scheduleWithDescription(spec.schedule, spec.timeZone)} />);
            if (spec?.suspend !== undefined) rows.push(<DetailRow key="suspend" label="Suspend" value={String(spec.suspend)} />);
          }

          return rows;
        })()}

        <DetailRow label="JSON" value="Copy full JSON" onCopy={() => onCopy("JSON", json)} />
        <DetailRow label="YAML" value="Copy full YAML" onCopy={() => onCopy("YAML", yamlText)} />
      </div>

      <div className="TopologyDetails__tabs">
        <button type="button" className={mode === "json" ? "is-active" : ""} onClick={() => setMode("json")}>JSON</button>
        <button type="button" className={mode === "yaml" ? "is-active" : ""} onClick={() => setMode("yaml")}>YAML</button>
      </div>

      {mode === "json" ? (
        <div className="TopologyDetails__jsonView">
          <div className="TopologyDetails__summary">
            <button type="button" className="TopologyDetails__summaryButton" onClick={() => setJsonMeaningOpen(true)}>
              Detail
              <span>{jsonMeanings.length} key fields</span>
            </button>
          </div>
          <input
            className="TopologyDetails__jsonSearch"
            placeholder="Search Keyword"
            value={jsonQuery}
            onChange={(event) => setJsonQuery(event.target.value)}
          />
          <div className="TopologyDetails__jsonTree">
            <JsonTree data={jsonObject} query={jsonQuery} secret={activeNode.kind === "Secret"} onCopy={onCopy} expandState={jsonExpandState} onExpandAll={(open) => setJsonExpandState({ open, tick: Date.now() })} />
          </div>
          {jsonMeaningOpen ? <JsonMeaningModal kind={activeNode.kind} rows={jsonMeanings} onClose={() => setJsonMeaningOpen(false)} /> : null}
        </div>
      ) : (
        <>
          {!activeNode.editable ? <div className="TopologyDetails__applyError">Grouped Pod cards are read-only. Select an individual Pod to edit YAML.</div> : null}
          {warnings.length > 0 ? (
            <div className="TopologyDetails__warnings">
              {warnings.map((warning) => <div key={warning}>{warning}</div>)}
            </div>
          ) : null}
          <CodeEditorWithLines
            value={yamlText}
            onChange={(value) => {
              setYamlText(value);
              setApplyMessage(null);
              setApplyError(null);
            }}
          />
          {yamlChanged ? (
            <DiffWithLines changes={diff} />
          ) : null}
          <div className="TopologyDetails__applyActions">
            <button type="button" onClick={() => setYamlText(yaml)}>Reset YAML</button>
            <button type="button" disabled={applying || !activeNode.editable || !yamlChanged} onClick={() => void applyYaml()}>{applying ? "Applying..." : "Apply YAML"}</button>
          </div>
        </>
      )}
    </aside>
  );
}

function useTopologyStyles() {
  useEffect(() => {
    if (document.getElementById(styleElementId)) {
      return;
    }

    const styleElement = document.createElement("style");

    styleElement.id = styleElementId;
    styleElement.textContent = topologyStyles;
    document.head.appendChild(styleElement);
  }, []);
}

async function listOrEmpty(api: { list: () => Promise<unknown> }) {
  try {
    return await api.list() as KubeObjectLike[];
  } catch {
    return [];
  }
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");

  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function podContainers(pod: KubeObjectLike): string[] {
  const containers = [
    ...(pod.spec?.initContainers ?? []),
    ...(pod.spec?.containers ?? []),
    ...(pod.spec?.ephemeralContainers ?? [])
  ];
  const names = containers.map((container: any) => container?.name).filter((name: unknown): name is string => typeof name === "string" && name.length > 0);

  return names.length > 0 ? names : ["default"];
}

function podLogTargets(node: TopologyNode): Array<{ pod: KubeObjectLike; containerName: string }> {
  const pods = node.pods ?? (node.kind === "Pod" ? [node.object] : []);

  return pods.flatMap((pod) => podContainers(pod).map((containerName) => ({ pod, containerName })));
}

async function fetchPodLogEntry(pod: KubeObjectLike, containerName: string, options: PodLogOptions): Promise<PodLogEntry> {
  const podName = getName(pod);
  const namespace = getNamespace(pod);

  try {
    const text = await (K8sApi.podsApi as any).getLogs(
      { name: podName, namespace },
      {
        container: containerName === "default" ? undefined : containerName,
        tailLines: options.tailLines,
        timestamps: true,
        previous: options.previous
      }
    );

    return {
      podName,
      namespace,
      containerName,
      text: text || "No recent logs."
    };
  } catch (error) {
    return {
      podName,
      namespace,
      containerName,
      text: "",
      error: error instanceof Error ? error.message : "Failed to load pod logs."
    };
  }
}

function splitLogLine(line: string): { timestamp?: string; message: string } {
  // eslint-disable-next-line no-control-regex
  const plainLine = line.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  
  // Very aggressive regex to find any RFC3339/ISO-like timestamp near the start of the line
  // Supports: YYYY-MM-DD HH:mm:ss, YYYY-MM-DDTHH:mm:ss.SSSZ, YYYY/MM/DD, etc.
  const match = plainLine.match(/^(.*?)(\d{4}[-/]\d{2}[-/]\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)(.*)$/);

  if (match && match[1].length < 120 && match[2].length > 8) {
    return { timestamp: match[2], message: (match[1] + match[3]).trim() };
  }

  return { message: plainLine };
}

function detectLogSeverity(value: string): PodLogLine["severity"] {
  const normalized = value.toLowerCase();

  if (/\b(fatal|panic|error|exception|failed|failure|timeout|oomkilled|crashloop|stacktrace|err)\b/.test(normalized) || /\b(e|err)\b\s*[:\]]/.test(normalized)) {
    return "error";
  }

  if (/\b(warn|warning|retry|throttle|degraded|unhealthy)\b/.test(normalized) || /\b(w|warn)\b\s*[:\]]/.test(normalized)) {
    return "warning";
  }

  if (/\b(debug|trace|verbose)\b/.test(normalized) || /\b(d|dbug|trce)\b\s*[:\]]/.test(normalized)) {
    return "debug";
  }

  if (/\b(info|notice|started|listening|ready|success|completed)\b/.test(normalized) || /\b(i|info)\b\s*[:\]]/.test(normalized)) {
    return "info";
  }

  return "unknown";
}

function severityFromLevel(level: unknown): PodLogLine["severity"] {
  if (typeof level !== "string") {
    return "unknown";
  }

  const normalized = level.toLowerCase();

  if (normalized === "error" || normalized === "err" || normalized === "fatal") {
    return "error";
  }

  if (normalized === "warn" || normalized === "warning") {
    return "warning";
  }

  if (normalized === "debug" || normalized === "trace") {
    return "debug";
  }

  if (normalized === "info" || normalized === "notice") {
    return "info";
  }

  return "unknown";
}

function shortLoggerName(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) {
    return undefined;
  }

  return value.split(".").filter(Boolean).pop() ?? value;
}

function timestampFromJsonLog(value: any): string | undefined {
  const timestamp = value["@timestamp"] ?? value.timestamp ?? value.time ?? value.datetime ?? value.date ?? value.ts ?? value.timeMillis ?? value.t ?? value.log?.time ?? value.log?.timestamp ?? value.log?.date ?? value.metadata?.timestamp ?? value.metadata?.time ?? value.Time ?? value.Date ?? value.TIMESTAMP;

  if (typeof timestamp === "string" && timestamp) {
    return timestamp;
  }
  
  if (typeof timestamp === "number") {
    // If it's a number (e.g. timeMillis), convert to ISO string
    if (timestamp > 1e11) { // roughly year 1973, so it's probably milliseconds
      return new Date(timestamp).toISOString();
    } else { // probably seconds
      return new Date(timestamp * 1000).toISOString();
    }
  }

  const instant = value.instant;
  const epochSecond = instant?.epochSecond;
  const nanoOfSecond = instant?.nanoOfSecond;

  if (Number.isFinite(epochSecond)) {
    const datePrefix = new Date(Number(epochSecond) * 1000).toISOString().split(".")[0];
    const nano = Number.isFinite(nanoOfSecond) ? String(Number(nanoOfSecond)).padStart(9, "0") : "000000000";

    return `${datePrefix}.${nano}Z`;
  }

  return undefined;
}

function compactJsonLogValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  if (typeof value === "string") {
    return value.replace(/\s*\n\s*/g, " / ");
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);

    return keys.length === 0 ? "{}" : `{${keys.join(", ")}}`;
  }

  return String(value);
}

function wrappedJsonLogField(label: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "string" && value.includes("\n")) {
    return `  ${label}:\n${value.split("\n").map((line) => `    ${line}`).join("\n")}`;
  }

  return `  ${label}: ${compactJsonLogValue(value)}`;
}

function parseJsonLogMessage(value: string): { displayMessage: string; wrappedDisplayMessage: string; severity: PodLogLine["severity"]; timestamp?: string } | undefined {
  const trimmed = value.trim();

  let parsed: any = null;
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {}
  }

  if (parsed) {
    const level = parsed.level ?? parsed.severity ?? parsed.log?.level;
    const severity = severityFromLevel(level);
    const logger = shortLoggerName(parsed.loggerName ?? parsed.logger ?? parsed.log?.logger);
    const message = String(parsed.message ?? parsed.msg ?? parsed.log ?? trimmed);
    const name = logger ? `[${logger}] ` : "";
    
    const traceId = parsed.traceId ?? parsed.trace_id ?? parsed.contextMap?.traceId ?? parsed.contextMap?.trace_id ?? parsed.mdc?.traceId ?? parsed.mdc?.trace_id;
    const tracePrefix = traceId ? `[Trace: ${traceId}] ` : "";
    
    return {
      displayMessage: `${name}${tracePrefix}${compactJsonLogValue(message)}`,
      wrappedDisplayMessage: `${name}${tracePrefix}${message}`,
      severity,
      timestamp: timestampFromJsonLog(parsed)
    };
  }

  // Regex fallback for truncated JSON logs or Java Stack Trace chunks
  const isJsonLike = trimmed.startsWith("{") || trimmed.includes('":"');
  if (isJsonLike) {
    // 1. Try to parse it as a Java stack trace chunk
    const stackTraceMatch = trimmed.match(/(?:(?:\{"class":\s*")|^)([^"]+)",\s*"method":\s*"([^"]+)",\s*"file":\s*"([^"]+)",\s*"line":\s*(\d+)/);
    if (stackTraceMatch) {
      const className = stackTraceMatch[1].startsWith("{") ? stackTraceMatch[1].replace(/\{"class":"/, "") : stackTraceMatch[1];
      const trace = `  at ${className}.${stackTraceMatch[2]}(${stackTraceMatch[3]}:${stackTraceMatch[4]})`;
      return {
        displayMessage: trace,
        wrappedDisplayMessage: trace,
        severity: "unknown",
        timestamp: undefined
      };
    }

    // 2. Try to parse it as a standard truncated JSON log
    const levelMatch = trimmed.match(/"(?:level|severity)"\s*:\s*"([^"]+)"/i);
    const nameMatch = trimmed.match(/"(?:loggerName|logger|name)"\s*:\s*"([^"]+)"/i);
    const msgMatch = trimmed.match(/"(?:message|msg|log)"\s*:\s*"((?:\\"|[^"])*)"/i);
    const timeMatch = trimmed.match(/"(?:@timestamp|timestamp|time|datetime|date|ts)"\s*:\s*(?:"([^"]+)"|(\d+))/i);
    
    if (levelMatch || nameMatch || msgMatch) {
      const severity = severityFromLevel(levelMatch ? levelMatch[1] : undefined);
      const logger = shortLoggerName(nameMatch ? nameMatch[1] : undefined);
      const rawMessage = msgMatch ? msgMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : trimmed;
      const name = logger ? `[${logger}] ` : "";

      let timestamp = timeMatch ? (timeMatch[1] ?? timeMatch[2]) : undefined;
      if (timestamp && /^\d+$/.test(timestamp)) {
        const num = Number(timestamp);
        timestamp = new Date(num > 1e11 ? num : num * 1000).toISOString();
      }

      return {
        displayMessage: `${name}${compactJsonLogValue(rawMessage)}`,
        wrappedDisplayMessage: `${name}${rawMessage}`,
        severity,
        timestamp
      };
    }
  }

  return undefined;
}

function compactLogMessage(value: string): string {
  const match = value.match(/^\[[^\]]+\]\s+\[\s*(?:ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\s*\]\s+([^\s(]+)(?:\([^)]*\))?\s+-\s*(.*)$/i);

  if (!match) {
    return value;
  }

  return `${match[1]} - ${match[2]}`;
}

function wrappedLogMessage(value: string): string {
  const match = value.match(/^\[[^\]]+\]\s+\[\s*(?:ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\s*\]\s+(.+?\([^)]*\))\s+-\s*(.*)$/i);

  if (!match) {
    return compactLogMessage(value);
  }

  return `${match[1]} - ${match[2]}`;
}

function parsedLogDisplay(value: string): Pick<PodLogLine, "displayMessage" | "wrappedDisplayMessage" | "severity" | "timestamp"> {
  const jsonLog = parseJsonLogMessage(value);

  if (jsonLog) {
    return jsonLog;
  }

  return {
    displayMessage: compactLogMessage(value),
    wrappedDisplayMessage: wrappedLogMessage(value),
    severity: detectLogSeverity(value)
  };
}

function logLines(entries: PodLogEntry[]): PodLogLine[] {
  const lines: PodLogLine[] = entries.flatMap((entry, sourceIndex): PodLogLine[] => {
    if (entry.error) {
      return [{
        id: `${entry.namespace}:${entry.podName}:${entry.containerName}:error`,
        podName: entry.podName,
        containerName: entry.containerName,
        sourceIndex,
        timestamp: undefined,
        message: entry.error,
        displayMessage: entry.error,
        wrappedDisplayMessage: entry.error,
        severity: "error",
        error: true
      }];
    }

    return entry.text.split("\n").filter((line) => line.trim().length > 0).map((line, lineIndex) => {
      const parsed = splitLogLine(line);
      const display = parsedLogDisplay(parsed.message);

      let timestamp = parsed.timestamp ?? display.timestamp;

      // Final fallback: if no timestamp found yet, try to extract one from the beginning of the message
      if (!timestamp) {
        const fallbackMatch = parsed.message.match(/^(\d{4}[-/]\d{2}[-/]\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)/);
        if (fallbackMatch) {
          timestamp = fallbackMatch[1];
        }
      }

      return {
        id: `${entry.namespace}:${entry.podName}:${entry.containerName}:${lineIndex}`,
        podName: entry.podName,
        containerName: entry.containerName,
        sourceIndex,
        timestamp,
        message: parsed.message,
        displayMessage: display.displayMessage,
        wrappedDisplayMessage: display.wrappedDisplayMessage,
        severity: display.severity === "unknown" ? detectLogSeverity(parsed.message) : display.severity
      };
    });
  });

  return lines.sort((a, b) => {
    if (!a.timestamp || !b.timestamp) {
      return 0;
    }

    return a.timestamp.localeCompare(b.timestamp);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightLogText(value: string, query: string): React.ReactNode {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return value;
  }

  const parts = value.split(new RegExp(`(${escapeRegExp(normalizedQuery)})`, "ig"));

  return parts.map((part, index) => (
    part.toLowerCase() === normalizedQuery.toLowerCase()
      ? <mark key={index}>{part}</mark>
      : <React.Fragment key={index}>{part}</React.Fragment>
  ));
}

function cleanLogMessage(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1F\x7F-\x9F]/g, "").replace(/\s+/g, " ").trim();
}

function logMessageKey(line: Pick<PodLogLine, "displayMessage" | "message">): string {
  return cleanLogMessage(line.displayMessage || line.message);
}

function PodLogsModal({ node, onClose }: { node: TopologyNode; onClose: () => void }) {
  const [entries, setEntries] = useState<PodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [tailLines, setTailLines] = useState(300);
  const [live, setLive] = useState(true);
  const [previous, setPrevious] = useState(false);
  const [query, setQuery] = useState("");
  const [excludedMessages, setExcludedMessages] = useState<Set<string>>(new Set());
  const [selectedPods, setSelectedPods] = useState<string[]>([]);
  const [podFilterOpen, setPodFilterOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState("all");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [wrapLogs, setWrapLogs] = useState(false);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const logBodyRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    let cancelled = false;
    const targets = podLogTargets(node);
    const visibleTargets = targets.slice(0, 24);

    setLimitMessage(targets.length > visibleTargets.length ? `Showing first ${visibleTargets.length} of ${targets.length} log streams.` : null);

    async function loadLogs(showLoading: boolean) {
      if (showLoading) {
        setLoading(true);
        setEntries([]);
      }

      const loadedEntries = await Promise.all(visibleTargets.map(({ pod, containerName }) => fetchPodLogEntry(pod, containerName, { tailLines, previous })));

      if (!cancelled) {
        setEntries(loadedEntries);
        setLoading(false);
      }
    }

    void loadLogs(true);

    if (live && !previous) {
      const interval = window.setInterval(() => void loadLogs(false), 3000);

      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [node.id, tailLines, live, previous]);

  const allLines = useMemo(() => logLines(entries), [entries]);
  const podOptions = useMemo(() => [...new Set(allLines.map((line) => line.podName))].sort(), [allLines]);
  const containerOptions = useMemo(() => [...new Set(allLines.map((line) => line.containerName))].sort(), [allLines]);
  const filteredLines = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    let lines = allLines;

    if (excludedMessages.size > 0) {
      lines = lines.filter((line) => !excludedMessages.has(logMessageKey(line)));
    }

    if (selectedPods.length > 0) {
      lines = lines.filter((line) => selectedPods.includes(line.podName));
    }

    if (selectedContainer !== "all") {
      lines = lines.filter((line) => line.containerName === selectedContainer);
    }

    if (errorsOnly) {
      lines = lines.filter((line) => line.severity === "error" || line.severity === "warning");
    }

    if (!normalizedQuery) {
      return lines;
    }

    return lines.filter((line) =>
      line.message.toLowerCase().includes(normalizedQuery)
      || line.podName.toLowerCase().includes(normalizedQuery)
      || line.containerName.toLowerCase().includes(normalizedQuery)
      || line.timestamp?.toLowerCase().includes(normalizedQuery)
    );
  }, [allLines, query, selectedPods, selectedContainer, errorsOnly, excludedMessages]);
  const matchCount = query.trim() ? filteredLines.length : 0;
  const selectedMatchText = matchCount > 0 ? `${selectedMatchIndex + 1} / ${matchCount}` : query.trim() ? "0 / 0" : `${filteredLines.length} lines`;
  const podFilterLabel = selectedPods.length === 0 ? "All pods" : selectedPods.length === 1 ? selectedPods[0] : `${selectedPods.length} pods`;

  useEffect(() => {
    setSelectedMatchIndex(0);
  }, [query, selectedPods, selectedContainer, errorsOnly]);

  useEffect(() => {
    if (selectedMatchIndex >= filteredLines.length) {
      setSelectedMatchIndex(Math.max(0, filteredLines.length - 1));
    }
  }, [filteredLines.length, selectedMatchIndex]);

  useEffect(() => {
    if (!live || previous || query.trim() || !logBodyRef.current) {
      return;
    }

    logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
  }, [filteredLines, live, previous, query]);

  useEffect(() => {
    if (!query.trim() || matchCount === 0) {
      return;
    }

    lineRefs.current[selectedMatchIndex]?.scrollIntoView({ block: "center" });
  }, [selectedMatchIndex, matchCount, query]);

  function moveMatch(delta: number) {
    if (matchCount === 0) {
      return;
    }

    setSelectedMatchIndex((current) => (current + delta + matchCount) % matchCount);
  }

  function toggleSelectedPod(podName: string) {
    setSelectedPods((current) => (
      current.includes(podName)
        ? current.filter((selected) => selected !== podName)
        : [...current, podName]
    ));
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!query.trim() || matchCount === 0) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveMatch(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveMatch(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [query, matchCount]);

  return (
    <div className="PodLogsModal__backdrop" onMouseDown={onClose}>
      <section className="PodLogsModal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pod logs">
        <header className="PodLogsModal__header">
          <div>
            <span>Pod logs</span>
            <h3>{node.name}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">&times;</button>
        </header>
        <div className="PodLogsModal__toolbar">
          <label>
            <span>Tail</span>
            <select value={tailLines} onChange={(event) => setTailLines(Number(event.target.value))}>
              <option value={100}>100</option>
              <option value={300}>300</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
            </select>
          </label>
          <button type="button" className={live && !previous ? "is-active" : ""} disabled={previous} onClick={() => setLive((value) => !value)}>
            Live
          </button>
          <button
            type="button"
            className={previous ? "is-active" : ""}
            onClick={() => {
              setPrevious((value) => !value);
              setLive(false);
            }}
          >
            Previous
          </button>
          {excludedMessages.size > 0 && (
            <button
              type="button"
              className="is-danger"
              onClick={() => setExcludedMessages(new Set())}
            >
              Clear hidden ({excludedMessages.size})
            </button>
          )}
          <div className="PodLogsModal__podFilter">
            <span>Pod</span>
            <button type="button" onClick={() => setPodFilterOpen((value) => !value)}>{podFilterLabel}</button>
            {podFilterOpen ? (
              <div className="PodLogsModal__podMenu">
                <label>
                  <input type="checkbox" checked={selectedPods.length === 0} onChange={() => setSelectedPods([])} />
                  <span>All pods</span>
                </label>
                {podOptions.map((podName) => (
                  <label key={podName}>
                    <input type="checkbox" checked={selectedPods.includes(podName)} onChange={() => toggleSelectedPod(podName)} />
                    <span title={podName}>{podName}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <label>
            <span>Container</span>
            <select value={selectedContainer} onChange={(event) => setSelectedContainer(event.target.value)}>
              <option value="all">All containers</option>
              {containerOptions.map((containerName) => <option key={containerName} value={containerName}>{containerName}</option>)}
            </select>
          </label>
          <button
            type="button"
            className={errorsOnly ? "is-active is-danger" : ""}
            onClick={() => setErrorsOnly((value) => !value)}
          >
            Errors only
          </button>
          <button
            type="button"
            className={wrapLogs ? "is-active" : ""}
            onClick={() => setWrapLogs((value) => !value)}
          >
            Wrap
          </button>
          <input
            type="text"
            placeholder="Filter logs..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="PodLogsModal__count">{selectedMatchText}</span>
        </div>
        {limitMessage ? <div className="PodLogsModal__notice">{limitMessage}</div> : null}
        {loading ? (
          <div className="PodLogsModal__state">Loading pod logs...</div>
        ) : allLines.length === 0 ? (
          <div className="PodLogsModal__state">No pod logs available.</div>
        ) : (
          <div className={`PodLogsModal__terminal${wrapLogs ? " is-wrapped" : ""}`} ref={logBodyRef}>
            {filteredLines.map((line, index) => {
              const displayTimestamp = line.timestamp ? line.timestamp.replace("T", " ").replace("Z", "") : "";
              const displaySource = `${line.podName}/${line.containerName}`;

              return (
              <div
                key={line.id}
                ref={(element) => { lineRefs.current[index] = element; }}
                className={`PodLogsModal__line source-${line.sourceIndex % 8} severity-${line.severity}${line.error ? " is-error" : ""}${query.trim() && index === selectedMatchIndex ? " is-current-match" : ""}`}
              >
                <span className="PodLogsModal__time">{highlightLogText(displayTimestamp, query)}</span>
                <span className="PodLogsModal__severity">{line.severity === "unknown" ? "" : line.severity.toUpperCase()}</span>
                <span className="PodLogsModal__source" title={`${line.podName} / ${line.containerName}`}>{highlightLogText(displaySource, query)}</span>
                <span className="PodLogsModal__message" title={line.message}>{highlightLogText(wrapLogs ? line.wrappedDisplayMessage : line.displayMessage, query)}</span>
                <button
                  type="button"
                  className="PodLogsModal__excludeButton"
                  title="Hide similar logs"
                  onClick={() => setExcludedMessages(prev => {
                    const next = new Set(prev);
                    next.add(logMessageKey(line));
                    return next;
                  })}
                >
                  &minus;
                </button>
              </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function WorkloadTopologyPage() {
  useTopologyStyles();

  const [resources, setResources] = useState<ResourceSet>({
    ingresses: [],
    services: [],
    deployments: [],
    cronJobs: [],
    jobs: [],
    pods: [],
    configMaps: [],
    secrets: []
  });
  const [namespaces, setNamespaces] = useState<string[]>(["default"]);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState("default");
  const [cronJobWindowHours, setCronJobWindowHours] = useState(24);
  const [isLive, setIsLive] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [podMetrics, setPodMetrics] = useState<Record<string, { cpu: number; memory: number }>>({});
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [logModalNode, setLogModalNode] = useState<TopologyNode | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const marqueeStart = useRef<{ clientX: number; clientY: number; canvasX: number; canvasY: number } | null>(null);
  const nodeDragStart = useRef<{ ids: string[]; x: number; y: number; origins: Record<string, { x: number; y: number }>; wasAlreadySelected: boolean; didDrag: boolean } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const suppressLayoutSave = useRef(false);
  const liveRefreshInFlight = useRef(false);
  const [canvasSize, setCanvasSize] = useState<ViewportSize>({ width: 1, height: 1 });

  async function loadResources(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const [namespaceList, ingresses, services, deployments, cronJobs, jobs, pods, configMaps, secrets] = await Promise.all([
        listOrEmpty(K8sApi.namespacesApi),
        listOrEmpty(K8sApi.ingressApi),
        listOrEmpty(K8sApi.serviceApi),
        listOrEmpty(K8sApi.deploymentApi),
        listOrEmpty(K8sApi.cronJobApi),
        listOrEmpty(K8sApi.jobApi),
        listOrEmpty(K8sApi.podsApi),
        listOrEmpty(K8sApi.configMapApi),
        listOrEmpty(K8sApi.secretsApi)
      ]);

      let metricsRecord: Record<string, { cpu: number; memory: number }> = {};
      try {
        const apiBase = K8sApi.podsApi?.apiBase || "/api-kube/api/v1/pods";
        const clusterProxyPath = apiBase.split('/api/v1')[0];
        
        // Try multiple potential metrics paths
        const metricsPaths = [
          `${clusterProxyPath}/apis/metrics.k8s.io/v1beta1/pods`,
          `/api-kube/apis/metrics.k8s.io/v1beta1/pods`,
          `/api-resource/apis/metrics.k8s.io/v1beta1/pods`,
          `/apis/metrics.k8s.io/v1beta1/pods`,
          `${window.location.origin}${clusterProxyPath}/apis/metrics.k8s.io/v1beta1/pods`
        ];

        let res: Response | null = null;
        for (const path of metricsPaths) {
          try {
            const attempt = await fetch(path);
            if (attempt.ok) {
              res = attempt;
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        if (res && res.ok) {
          const data: PodMetricsList = await res.json();
          data.items.forEach((item) => {
            let cpu = 0;
            let memory = 0;
            item.containers.forEach((container) => {
              cpu += parseK8sCpu(container.usage.cpu);
              memory += parseK8sMemory(container.usage.memory);
            });
            metricsRecord[`${item.metadata.namespace}:${item.metadata.name}`] = { cpu, memory };
          });
        }
      } catch (err) {
        // Metrics server might not be available, fail silently
        console.warn("Failed to fetch pod metrics:", err);
      }

      setResources({ ingresses, services, deployments, cronJobs, jobs, pods, configMaps, secrets });
      setNamespaces(namespaceOptions({ ingresses, services, deployments, cronJobs, jobs, pods, configMaps, secrets }, namespaceList.map(getName)));
      setPodMetrics(metricsRecord);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Kubernetes resources");
    } finally {
      if (!options.silent) {
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
    }, 4000); // Poll every 4 seconds when Live Mode is active

    return () => clearInterval(interval);
  }, [isLive]);

  const filteredResources = useMemo(() => filterByNamespace(resources, selectedNamespace), [resources, selectedNamespace]);
  const baseTopology = useMemo(() => buildTopology(filteredResources, cronJobWindowHours, podMetrics), [filteredResources, cronJobWindowHours, podMetrics]);
  const topology = useMemo(() => ({
    edges: baseTopology.edges,
    cronZoneY: baseTopology.cronZoneY,
    nodes: baseTopology.nodes.map((node) => ({
      ...node,
      ...(manualPositions[node.id] ?? {})
    }))
  }), [baseTopology, manualPositions]);
  const nodeById = useMemo(() => new Map(topology.nodes.map((node) => [node.id, node])), [topology.nodes]);
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
  const canvasHeight = Math.max(640, topology.nodes.reduce((height, node) => Math.max(height, node.y + cardHeight + 80), 0));
  const resourceCount = Object.values(filteredResources).reduce((sum, list) => sum + list.length, 0);
  const availableNamespaces = useMemo(() => namespaceOptions(resources, namespaces), [resources, namespaces]);
  const connectedIds = useMemo(() => connectedNodeIds(selectedNodeId, topology.edges), [selectedNodeId, topology.edges]);

  const issueNodeIds = useMemo(() => {
    if (!showIssuesOnly) return new Set<string>();
    
    const issues = new Set<string>();
    topology.nodes.forEach(node => {
      if (node.status === "warning" || node.status === "danger") {
        issues.add(node.id);
      }
    });
    
    let changed = true;
    while(changed) {
      changed = false;
      topology.edges.forEach(edge => {
        if (issues.has(edge.from) && !issues.has(edge.to)) {
          issues.add(edge.to);
          changed = true;
        }
        if (issues.has(edge.to) && !issues.has(edge.from)) {
          issues.add(edge.from);
          changed = true;
        }
      });
    }
    return issues;
  }, [topology, showIssuesOnly]);

  useEffect(() => {
    if (selectedNodeId && !nodeById.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [nodeById, selectedNodeId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (logModalNode) {
          setLogModalNode(null);
          return;
        }

        setSelectedNodeId(null);
        setSelectedNodeIds(new Set());
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [logModalNode]);

  useEffect(() => {
    setManualPositions((current) => {
      const entries = Object.entries(current).filter(([nodeId]) => nodeById.has(nodeId));

      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [nodeById]);

  useEffect(() => {
    suppressLayoutSave.current = true;
    setManualPositions(readStoredLayout(selectedNamespace));
  }, [selectedNamespace]);

  useEffect(() => {
    if (suppressLayoutSave.current) {
      suppressLayoutSave.current = false;
      return;
    }

    writeStoredLayout(selectedNamespace, manualPositions);
  }, [manualPositions, selectedNamespace]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const updateCanvasSize = () => {
      setCanvasSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    };

    updateCanvasSize();

    const resizeObserver = new ResizeObserver(updateCanvasSize);

    resizeObserver.observe(canvas);

    return () => resizeObserver.disconnect();
  }, []);

  async function handleCopy(label: string, value: string) {
    await copyText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  }

  async function handleApplyYaml(node: TopologyNode, yamlText: string) {
    if (!node.editable) {
      throw new Error("This resource cannot be edited from the topology view.");
    }

    const parsed = YAML.parse(yamlText);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("YAML must describe a single Kubernetes resource object.");
    }

    const metadata = (parsed as any).metadata;
    const name = metadata?.name;
    const namespace = metadata?.namespace ?? node.namespace;

    if (!name || typeof name !== "string") {
      throw new Error("metadata.name is required.");
    }

    await apiForKind(node.kind).update({ name, namespace }, parsed);
    await loadResources();
    setSelectedNodeId(`${node.kind}:${namespace}:${name}`);
  }

  function navigateToCanvasPoint(x: number, y: number) {
    setOffset({
      x: canvasSize.width / 2 - x * scale,
      y: canvasSize.height / 2 - y * scale
    });
  }

  function handleCanvasWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const rect = event.currentTarget.getBoundingClientRect();
      const nextScale = Math.min(1.8, Math.max(0.45, scale * (event.deltaY > 0 ? 0.92 : 1.08)));
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const canvasX = (pointerX - offset.x) / scale;
      const canvasY = (pointerY - offset.y) / scale;

      setScale(nextScale);
      setOffset({
        x: pointerX - canvasX * nextScale,
        y: pointerY - canvasY * nextScale
      });
      return;
    }

    setOffset((current) => ({
      x: current.x - event.deltaX,
      y: current.y - event.deltaY
    }));
  }

  function handleNodeDragStart(event: React.MouseEvent, node: TopologyNode) {
    event.stopPropagation();

    const isMultiSelected = selectedNodeIds.has(node.id) && selectedNodeIds.size > 1;
    const dragIds = isMultiSelected ? [...selectedNodeIds] : [node.id];
    const origins: Record<string, { x: number; y: number }> = {};

    for (const id of dragIds) {
      const n = nodeById.get(id);

      if (n) {
        origins[id] = { x: n.x, y: n.y };
      }
    }

    nodeDragStart.current = {
      ids: dragIds,
      x: event.clientX,
      y: event.clientY,
      origins,
      wasAlreadySelected: selectedNodeId === node.id || selectedNodeIds.has(node.id),
      didDrag: false
    };

    if (!isMultiSelected) {
      setSelectedNodeId(node.id);
      setSelectedNodeIds(new Set([node.id]));
    }
  }

  return (
    <div className="WorkloadTopology">
      <div className="WorkloadTopology__toolbar">
        <div>
          <h2>Workload Topology</h2>
          <span>
            {resources.ingresses.length} Ingress / {resources.services.length} Service / {resources.deployments.length} Deployment / {resources.cronJobs.length} CronJob / {resources.jobs.length} Job / {resources.pods.length} Pod / {resources.configMaps.length} ConfigMap / {resources.secrets.length} Secret
          </span>
        </div>
        <div className="WorkloadTopology__actions">
          <label className="WorkloadTopology__namespace">
            <span>Namespace</span>
            <select
              value={selectedNamespace}
              onChange={(event) => {
                setSelectedNamespace(event.target.value);
                setSelectedNodeId(null);
              }}
            >
              {availableNamespaces.map((namespace) => (
                <option key={namespace} value={namespace}>{namespace}</option>
              ))}
            </select>
          </label>
          <label className="WorkloadTopology__namespace">
            <span>CronJobs</span>
            <select value={cronJobWindowHours} onChange={(event) => setCronJobWindowHours(Number(event.target.value))}>
              <option value={1}>1h</option>
              <option value={24}>24h</option>
              <option value={168}>7d</option>
            </select>
          </label>
          <button 
            type="button" 
            onClick={() => setShowIssuesOnly(prev => !prev)}
            style={{
              background: showIssuesOnly ? "rgba(212, 72, 72, 0.15)" : "var(--contentColor)",
              borderColor: showIssuesOnly ? "#d44848" : "var(--borderColor)",
              color: showIssuesOnly ? "#d44848" : "var(--textColorPrimary)",
              fontWeight: showIssuesOnly ? 600 : 400
            }}
          >
            Problems Only
          </button>
          <button 
            type="button" 
            onClick={() => setIsLive(prev => !prev)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: isLive ? "rgba(31, 191, 102, 0.15)" : "var(--contentColor)",
              borderColor: isLive ? "#1fbf66" : "var(--borderColor)",
              color: isLive ? "#1fbf66" : "var(--textColorPrimary)",
              fontWeight: isLive ? 600 : 400
            }}
          >
            <span style={{ 
              width: "8px", 
              height: "8px", 
              borderRadius: "50%", 
              background: isLive ? "#1fbf66" : "currentColor",
              opacity: isLive ? 1 : 0.4
            }} />
            Live
          </button>
          
          {Object.keys(manualPositions).length > 0 && (
            <button type="button" onClick={() => setManualPositions({})}>Reset layout</button>
          )}
          <button 
            type="button" 
            onClick={() => void loadResources()} 
            title="Refresh"
            style={{ fontWeight: 600, fontSize: "16px", padding: "0 8px" }}
          >
            ↻
          </button>
        </div>
      </div>

      {error ? <div className="WorkloadTopology__error">{error}</div> : null}
      {loading ? <div className="WorkloadTopology__state">Loading topology...</div> : null}
      {!loading && resourceCount === 0 ? <div className="WorkloadTopology__state">No supported Kubernetes resources found.</div> : null}

      <div className="WorkloadTopology__body">
        <div
          ref={canvasRef}
          className={`TopologyCanvas${showGrid ? "" : " TopologyCanvas--plain"}`}
          onWheel={handleCanvasWheel}
          onMouseDown={(event) => {
            if (event.shiftKey) {
              const rect = event.currentTarget.getBoundingClientRect();
              const canvasX = (event.clientX - rect.left - offset.x) / scale;
              const canvasY = (event.clientY - rect.top - offset.y) / scale;

              marqueeStart.current = { clientX: event.clientX, clientY: event.clientY, canvasX, canvasY };
              return;
            }

            dragStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
          }}
          onMouseMove={(event) => {
            if (marqueeStart.current) {
              const rect = event.currentTarget.getBoundingClientRect();
              const canvasX = (event.clientX - rect.left - offset.x) / scale;
              const canvasY = (event.clientY - rect.top - offset.y) / scale;
              const ms = marqueeStart.current;

              setMarquee({
                x1: Math.min(ms.canvasX, canvasX),
                y1: Math.min(ms.canvasY, canvasY),
                x2: Math.max(ms.canvasX, canvasX),
                y2: Math.max(ms.canvasY, canvasY)
              });
              return;
            }

            if (nodeDragStart.current) {
              const drag = nodeDragStart.current;
              drag.didDrag = true;
              const dx = (event.clientX - drag.x) / scale;
              const dy = (event.clientY - drag.y) / scale;

              setManualPositions((current) => {
                const next = { ...current };

                for (const id of drag.ids) {
                  const origin = drag.origins[id];

                  if (origin) {
                    next[id] = {
                      x: Math.max(0, origin.x + dx),
                      y: Math.max(topPadding, origin.y + dy)
                    };
                  }
                }

                return next;
              });
              return;
            }

            if (!dragStart.current) {
              return;
            }

            setOffset({
              x: dragStart.current.offsetX + event.clientX - dragStart.current.x,
              y: dragStart.current.offsetY + event.clientY - dragStart.current.y
            });
          }}
          onMouseLeave={() => {
            dragStart.current = null;
            nodeDragStart.current = null;
            marqueeStart.current = null;
            setMarquee(null);
          }}
          onMouseUp={(event) => {
            if (marqueeStart.current && marquee) {
              const hits = new Set<string>();

              for (const node of topology.nodes) {
                const nodeRight = node.x + cardWidth;
                const nodeBottom = node.y + cardHeight;

                if (node.x < marquee.x2 && nodeRight > marquee.x1 && node.y < marquee.y2 && nodeBottom > marquee.y1) {
                  hits.add(node.id);
                }
              }

              setSelectedNodeIds(hits);
              setSelectedNodeId(hits.size === 1 ? [...hits][0] : null);
              setMarquee(null);
              marqueeStart.current = null;
              return;
            }

            if (dragStart.current) {
              const dx = Math.abs(event.clientX - dragStart.current.x);
              const dy = Math.abs(event.clientY - dragStart.current.y);

              if (dx < 5 && dy < 5) {
                setSelectedNodeId(null);
                setSelectedNodeIds(new Set());
              }
            }

            dragStart.current = null;
            nodeDragStart.current = null;
            marqueeStart.current = null;
            setMarquee(null);
          }}
        >
          <button
            type="button"
            className={`TopologyCanvas__gridToggle${showGrid ? " is-active" : ""}`}
            onClick={() => setShowGrid((value) => !value)}
            title={showGrid ? "Hide grid" : "Show grid"}
          >
            Grid
          </button>
          <div className="TopologyCanvas__content" style={{ height: canvasHeight, transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
            <svg className="TopologyCanvas__edges" width={canvasWidth} height={canvasHeight}>
              {topology.edges.map((edge) => {
                if (showIssuesOnly && (!issueNodeIds.has(edge.from) || !issueNodeIds.has(edge.to))) {
                  return null;
                }

                const from = nodeById.get(edge.from);
                const to = nodeById.get(edge.to);

                if (!from || !to) {
                  return null;
                }

                return (
                  <path
                    key={edge.id}
                    className={selectedNodeId ? connectedIds.has(edge.from) && connectedIds.has(edge.to) ? "relation-connected" : "relation-dimmed" : undefined}
                    d={`M ${from.x + cardWidth} ${from.y + cardHeight / 2} C ${from.x + cardWidth + 42} ${from.y + cardHeight / 2}, ${to.x - 42} ${to.y + cardHeight / 2}, ${to.x} ${to.y + cardHeight / 2}`}
                  />
                );
              })}
            </svg>

            <div className="TopologyCanvas__columns">
              {mainColumns.map(({ kind, label }) => (
                <span key={kind} style={{ left: columnX[kind] }}>{label}</span>
              ))}
            </div>

            {topology.cronZoneY > 0 ? (
              <>
                <div className="TopologyCanvas__zoneSeparator" style={{ top: topology.cronZoneY }}>
                  <span>Scheduled Jobs</span>
                </div>
                <div className="TopologyCanvas__columns TopologyCanvas__columns--zone" style={{ top: topology.cronZoneY + 18 }}>
                  {cronZoneColumns.map(({ kind, label }) => (
                    <span key={kind} style={{ left: columnX[kind] }}>{label}</span>
                  ))}
                </div>
              </>
            ) : null}

            {topology.nodes.map((node) => {
              if (showIssuesOnly && !issueNodeIds.has(node.id)) {
                return null;
              }

              return (
                <TopologyCard
                key={node.id}
                node={node}
                selected={selectedNodeId === node.id || selectedNodeIds.has(node.id)}
                onDragStart={handleNodeDragStart}
                relation={selectedNodeId ? connectedIds.has(node.id) ? "connected" : "dimmed" : "normal"}
                onSelect={() => {
                  const wasAlreadySelected = nodeDragStart.current?.wasAlreadySelected;
                  const didDrag = nodeDragStart.current?.didDrag;

                  if (wasAlreadySelected && !didDrag) {
                    setSelectedNodeId(null);
                    setSelectedNodeIds(new Set());
                  } else if (!wasAlreadySelected) {
                    setSelectedNodeId(node.id);
                    setSelectedNodeIds(new Set([node.id]));
                  }
                }}
              />
              );
            })}
            {marquee ? (
              <div
                className="TopologyCanvas__marquee"
                style={{
                  left: marquee.x1,
                  top: marquee.y1,
                  width: marquee.x2 - marquee.x1,
                  height: marquee.y2 - marquee.y1
                }}
              />
            ) : null}
          </div>
          
          <div className="TopologyZoomControls">
            <button
              type="button"
              onClick={() => {
                setOffset({ x: 0, y: 0 });
                setScale(1);
              }}
              title="Reset View"
              style={{ width: "auto", padding: "0 8px", fontSize: "11px", fontWeight: 600 }}
            >
              Reset
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button type="button" onClick={() => setScale((value) => Math.max(0.45, value - 0.1))}>-</button>
              <span>{Math.round(scale * 100)}%</span>
              <button type="button" onClick={() => setScale((value) => Math.min(1.8, value + 0.1))}>+</button>
            </div>
          </div>

          <TopologyMinimap
            canvasHeight={canvasHeight}
            canvasSize={canvasSize}
            nodes={showIssuesOnly ? topology.nodes.filter(n => issueNodeIds.has(n.id)) : topology.nodes}
            offset={offset}
            scale={scale}
            onNavigate={navigateToCanvasPoint}
          />
        </div>
        <TopologyDetails
          node={selectedNode}
          copied={copied}
          onApply={handleApplyYaml}
          onCopy={handleCopy}
          onOpenLogs={setLogModalNode}
          onClose={() => setSelectedNodeId(null)}
        />
      </div>
      {logModalNode ? <PodLogsModal node={logModalNode} onClose={() => setLogModalNode(null)} /> : null}
    </div>
  );
}

function TopologyIcon(props: Renderer.Component.IconProps) {
  return <Component.Icon {...props} material="account_tree" tooltip="Topology" />;
}

export default class WorkloadTopologyRenderer extends Renderer.LensExtension {
  clusterPages = [
    {
      id: "workload-topology",
      components: {
        Page: WorkloadTopologyPage
      }
    }
  ];

  clusterPageMenus = [
    {
      id: "workload-topology",
      target: { pageId: "workload-topology" },
      title: "Workload Topology",
      orderNumber: 60,
      components: {
        Icon: TopologyIcon
      }
    }
  ];
}
