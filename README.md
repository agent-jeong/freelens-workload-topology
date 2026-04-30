# Freelens Workload Topology

Freelens에서 Kubernetes 워크로드와 관련 리소스의 관계를 토폴로지로 보여주는 확장 프로그램입니다. 클러스터 페이지 메뉴에 **Workload Topology** 항목을 추가하고, 현재 선택한 클러스터의 리소스를 조회해 연결 관계, 상태, 상세 JSON/YAML, Pod 로그를 한 화면에서 확인할 수 있게 합니다.

## 주요 기능

- Ingress, Service, Deployment, Pod, CronJob, Job, ConfigMap, Secret 관계 시각화
- Ingress backend, Service selector, Deployment selector, OwnerReference, Pod의 ConfigMap/Secret 참조를 기반으로 Edge 자동 연결
- 리소스 상태를 `healthy`, `warning`, `danger`, `unknown`으로 표시
- 네임스페이스 필터와 CronJob/Job 표시 기간 선택(1h, 24h, 7d)
- Problems Only 필터로 warning/danger 리소스와 연결된 관계만 표시
- Live 모드에서 4초 주기로 리소스 자동 새로고침
- Canvas pan/zoom, 미니맵, Grid 토글, 노드 드래그 및 네임스페이스별 레이아웃 저장
- Shift 드래그로 여러 노드 선택 및 선택된 관계 하이라이트
- 선택 리소스의 상세 정보, JSON 트리 검색, 주요 필드 설명, JSON/YAML 복사
- YAML 편집, 변경 diff, 적용 전 경고, Kubernetes API update 호출
- Pod 또는 Pod 그룹의 로그 조회, Live tail, previous logs, Pod/Container 필터, severity 필터, 검색, 줄바꿈, 유사 로그 숨김
- metrics.k8s.io API가 사용 가능한 클러스터에서 Pod CPU/Memory 사용량 조회 시도

## 지원 리소스

현재 렌더러는 다음 Freelens Kubernetes API를 조회합니다.

- Namespace
- Ingress
- Service
- Deployment
- CronJob
- Job
- Pod
- ConfigMap
- Secret

CronJob과 Job은 일반 워크로드 영역 아래의 **Scheduled Jobs** 영역에 별도로 배치됩니다. 다수 Pod나 Job은 그룹 카드로 묶이며, 그룹 카드는 조회와 로그 열기는 가능하지만 YAML 적용은 개별 리소스에서만 가능합니다.

## 요구 사항

- Node.js `>=22.16.0`
- pnpm `10.33.2` (`packageManager` 기준)
- Freelens `^1.6.0`
- Kubernetes 리소스 조회/수정 권한
- Pod 로그 기능 사용 시 Pod log 권한
- Pod 메트릭 표시 사용 시 metrics-server 또는 `metrics.k8s.io/v1beta1` API

## 개발

```sh
corepack pnpm install
corepack pnpm type:check
corepack pnpm build
```

빌드 결과물은 `out/main/index.js`와 `out/renderer/index.js`에 생성됩니다. `package.json`의 `main`, `renderer`, `files` 설정도 이 출력물을 기준으로 되어 있습니다.

## 패키징 및 설치

로컬에서 확장 패키지를 만들려면 빌드 후 pnpm pack을 실행합니다.

```sh
corepack pnpm build
corepack pnpm pack
```

생성된 `freelens-workload-topology-<version>.tgz` 파일을 Freelens 확장 프로그램 설치 화면에서 불러와 설치합니다. 현재 패키지 버전은 `0.2.4`입니다.

## 프로젝트 구조

- `src/main/index.ts`: Freelens main extension 진입점과 activate/deactivate 로그
- `src/renderer/index.tsx`: Workload Topology 페이지, Kubernetes 리소스 조회, 토폴로지 생성, 상세 패널, YAML 적용, Pod 로그 모달
- `src/renderer/styles.ts`: 확장 UI 스타일
- `electron.vite.config.ts`: main/renderer 빌드 설정과 Freelens/React external 처리
- `package.json`: 확장 메타데이터, 엔진 요구 사항, 빌드/타입체크 스크립트

## 동작 참고

- YAML 적용은 `status`와 `metadata.managedFields`를 제거한 객체를 기준으로 편집하며, `kind`, `metadata.name`, `metadata.namespace`, Pod의 immutable 필드 변경은 Kubernetes API에서 거부될 수 있습니다.
- Secret JSON 상세 화면에서는 `data` 하위 값이 마스킹됩니다.
- Pod 로그 모달은 최대 24개 로그 스트림을 먼저 표시합니다.
- Pod 메트릭은 여러 proxy path를 순차적으로 시도하며, API가 없거나 권한이 없으면 조용히 생략됩니다.
