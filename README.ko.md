# Freelens Workload Topology

[![License](https://img.shields.io/github/license/agent-jeong/freelens-workload-topology)](LICENSE)

[English](README.md)

[FreeLens](https://github.com/freelensapp/freelens)용 Kubernetes 토폴로지 확장 프로그램입니다. 클러스터 뷰에 **Workload Topology** 페이지를 추가하여 리소스 간 관계, 실시간 상태, 메트릭, Pod 로그를 하나의 인터랙티브 그래프로 시각화합니다.

Ingress, Service, Deployment, Pod, ConfigMap, Secret 상세 화면을 오가는 대신, Workload Topology는 모든 연결 관계를 한눈에 파악할 수 있는 그래프로 렌더링합니다.

## 미리보기

![Workload Topology 스크린샷](docs/assets/screenshot.png)

<details>
  <summary>데모 GIF 보기</summary>

  ![Workload Topology 데모](docs/assets/demo.gif)
</details>

## 왜 Workload Topology인가

Kubernetes 리소스 관계는 수많은 화면에 흩어져 있습니다. 이 확장 프로그램은 이를 하나로 모아 다음과 같은 질문에 즉시 답할 수 있게 합니다:

- 이 Ingress가 라우팅하는 Service는 어디이고, 백엔드는 정상인가?
- 이 Deployment에 속한 Pod는 무엇이고, CPU/메모리 사용량은?
- 이 워크로드가 참조하는 ConfigMap과 Secret은?
- 이 리소스가 장애나면 영향 범위(Blast Radius)는?
- 이 Pod가 CrashLoopBackOff인 이유는? 이벤트는 뭐라고 하는가?

## 지원 앱

| 앱 | 버전 |
|---|---|
| FreeLens | 1.6.0+ |

FreeLens 렌더러 API를 사용하며, 별도의 사이드카나 클러스터 에이전트가 필요하지 않습니다.

## 주요 기능

### 토폴로지 그래프
- **Ingress, Service, Deployment, CronJob, Job, Pod, ConfigMap, Secret** 리소스 그래프
- Ingress backend, Service selector, Deployment selector, OwnerReference, Pod의 volume/env 참조를 통한 자동 Edge 연결
- 상태 표시: `healthy`, `warning`, `danger`, `unknown`
- 네임스페이스별 탐색 및 레이아웃 자동 저장
- CronJob/Job 시간 범위 필터 (1h, 24h, 7d)
- Pod 및 Job 그룹 카드 (펼치기/접기)

### 검사 및 디버깅
- **상세 패널** — 리소스 요약, 관련 Kubernetes Events, JSON 트리 검색
- **YAML 에디터** — 실시간 diff, 적용 전 경고, Kubernetes API 직접 업데이트
- **Pod 로그** — Live tail, 이전 로그, 컨테이너 필터, 심각도 필터, 키워드 검색, 줄바꿈, 중복 숨김, 가상 스크롤링
- **AI 분석 프롬프트** — Secret 자동 마스킹 후 복사 (외부 API 호출 없음)
- **Blast Radius** — 선택한 리소스의 장애 영향 범위 시각화

### 실시간 모니터링
- **Live 모드** — 4초 주기 자동 새로고침 및 자동 스크롤 토글
- **Metrics-server 연동** — Pod별 실시간 CPU/메모리 사용량 표시
- **이슈 패널** — warning/danger 리소스 바로가기 및 이벤트 기반 원인 힌트
- **실시간 알림** — 리소스 상태 변경 알림

### 탐색 및 인터랙션
- 캔버스 이동, 줌, 미니맵, 그리드 토글
- 노드 드래그로 재배치; Shift+드래그로 다중 선택
- Edge 호버 하이라이트 및 클릭 가능한 리소스 카드
- 우클릭 컨텍스트 메뉴
- 레이블 기반 필터링

### 키보드 단축키

| 키 | 동작 |
|---|---|
| `?` | 키보드 단축키 도움말 토글 |
| `⌘K` | 리소스 검색 |
| `⌘G` | 그리드 배경 토글 |
| `⌘L` | Live 모드 토글 (자동 새로고침) |
| `⌘.` | 리소스 새로고침 |
| `⌘P` | Problems Only 필터 토글 |
| `-` / `+` | 축소 / 확대 |
| `0` | 줌 및 위치 리셋 |
| `Delete` | 선택한 노드 위치 리셋 |
| `Esc` | 닫기 / 선택 해제 |
| `Shift+Drag` | 다중 선택 (마키) |
| `Right-click` | 컨텍스트 메뉴 |

## 설치

### GitHub Releases에서 설치

1. [최신 릴리즈](https://github.com/agent-jeong/freelens-workload-topology/releases/latest)를 엽니다.
2. `.tgz` 파일을 다운로드합니다.
3. FreeLens를 열고 **Extensions** 화면으로 이동합니다.
4. 다운로드한 `.tgz` 파일을 설치합니다.

### 소스에서 빌드

```shell
corepack pnpm install
corepack pnpm build
corepack pnpm pack
```

생성된 `freelens-workload-topology-1.0.0.tgz` 파일을 Extensions 화면에서 설치합니다.

## 사용법

1. FreeLens에서 클러스터를 엽니다.
2. 클러스터 페이지 메뉴에서 **Workload Topology**를 선택합니다.
3. 네임스페이스를 선택합니다.
4. 토폴로지 그래프를 탐색합니다 — Edge 호버, 카드 클릭, 노드 드래그.
5. 상세 패널에서 YAML, 이벤트, 로그를 확인합니다.
6. `?`를 눌러 전체 키보드 단축키를 확인합니다.

## Metrics Server

Pod 툴팁에 실시간 CPU/메모리 사용량을 표시하려면 클러스터에 [metrics-server](https://github.com/kubernetes-sigs/metrics-server)가 실행 중이어야 합니다.

```shell
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

자체 서명 인증서를 사용하는 로컬 클러스터(minikube, kind 등)의 경우:

```shell
kubectl patch deployment metrics-server -n kube-system --type='json' -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

metrics-server가 없어도 토폴로지는 CPU/메모리 데이터 없이 정상 동작합니다.

## 프로젝트 구조

```
src/
  main/index.ts        # FreeLens main extension 진입점
  renderer/index.tsx   # 토폴로지 페이지, 리소스 조회, 상세 패널, YAML 에디터, Pod 로그
  renderer/styles.ts   # 확장 UI 스타일
electron.vite.config.ts  # 빌드 설정
package.json             # 확장 메타데이터 및 스크립트
```

## 개발

```shell
corepack pnpm install
corepack pnpm build
```

| 명령어 | 설명 |
|---|---|
| `pnpm build` | 프로덕션 빌드 |
| `pnpm type:check` | TypeScript 타입 검사 |
| `pnpm pack` | 설치 가능한 `.tgz` 패키지 생성 |

## 참고 사항

- YAML 적용 시 `status`와 `metadata.managedFields`를 제거한 후 편집합니다. `kind`, `metadata.name`, `metadata.namespace` 및 Pod의 불변 필드 변경은 Kubernetes API에서 거부됩니다.
- AI 분석 프롬프트 복사는 외부 API를 호출하지 않습니다. Secret data, env 값, token/password/key 관련 필드는 자동으로 마스킹됩니다.
- Pod 로그 모달은 최대 24개의 로그 스트림을 동시에 표시합니다.
- Event API를 사용할 수 없는 경우 이벤트 패널은 비어 있는 상태로 표시되며, 토폴로지 조회는 정상 동작합니다.

## 기여

이슈와 풀 리퀘스트를 환영합니다.

버그 리포트 시 다음을 포함해 주세요:

- FreeLens 버전
- Kubernetes 클러스터 버전 및 프로바이더
- 가능하면 스크린샷 또는 짧은 GIF

## 라이선스

MIT