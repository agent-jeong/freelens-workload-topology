import React from "react";
import type { TopologyKind, JsonFieldMeaning } from "../types";
import { formatJsonDetailValue } from "./format";

export function valueAtPath(value: any, path: string[]): any {
  return path.reduce((current, segment) => current?.[segment], value);
}

export function jsonFieldMeanings(kind: TopologyKind, object: any): JsonFieldMeaning[] {
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

export function jsonMeaningRows(kind: TopologyKind, object: any): Array<{ path: string; value: string; meaning: string }> {
  return jsonFieldMeanings(kind, object).map((field) => ({
    path: field.path.join("."),
    value: formatJsonDetailValue(valueAtPath(object, field.path), field.path),
    meaning: field.meaning
  }));
}

export function highlightedJson(json: string) {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function jsonMatches(value: unknown, query: string): boolean {
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
