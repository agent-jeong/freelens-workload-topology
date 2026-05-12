# Freelens Workload Topology

[![Release](https://img.shields.io/github/v/release/agent-jeong/freelens-workload-topology?display_name=tag)](https://github.com/agent-jeong/freelens-workload-topology/releases) [![License](https://img.shields.io/github/license/agent-jeong/freelens-workload-topology)](LICENSE)

[English](README.md)

[FreeLens](https://github.com/freelensapp/freelens)용 Kubernetes 토폴로지 확장 프로그램입니다. 클러스터 뷰에 **Workload Topology** 페이지를 추가하여 리소스 간 관계, 실시간 상태, 메트릭, Pod 로그를 하나의 인터랙티브 그래프로 시각화합니다.

Ingress, Service, Deployment, Pod, ConfigMap, Secret 상세 화면을 오가는 대신, Workload Topology는 모든 연결 관계를 한눈에 파악할 수 있는 그래프로 렌더링합니다.

## 미리보기

![Workload Topology 메인](docs/assets/screenshot-main.png)

![Pod 로그 모달](docs/assets/screenshot-log.png)

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
- 레이블 기반 필터링 및 리소스 이름/종류 검색
- Problems Only 필터 — warning/danger 리소스와 연결된 리소스만 표시
- Blast Radius 분석 — 선택한 리소스의 장애 영향 범위 시각화

### 상세 패널
- **Inspect 탭** — 리소스 요약, 레이블, Pod 정보(노드, IP, 이미지, 재시작 횟수), Deployment 레플리카, Service 포트, Ingress 호스트, CronJob 스케줄
- **JSON 탭** — 접기/펼치기 트리, 검색/쿼리, 값 클릭 복사, 전체 펼치기/접기, Secret 데이터 자동 마스킹
- **YAML 탭** — 실시간 diff 에디터, 적용 전 경고, Kubernetes API 직접 업데이트 (`status`, `managedFields` 자동 제거)
- **Events 탭** — 관련 Kubernetes Events, 타입 배지, 반복 횟수, 소스, 타임스탬프
- 패널 크기 조절 (왼쪽 가장자리 드래그)

### Pod 로그
- **멀티 Pod 로그 스트리밍** — 최대 24개 로그 스트림 동시 표시
- **검색 칩** — AND/OR 논리를 지원하는 영구 필터 칩
  - 칩 간 AND, 쉼표 구분 OR (칩 내부)
  - Include 또는 Exclude 모드 (칩 컨텍스트 메뉴에서 전환)
  - 개별 칩 비활성화/활성화 (삭제 없이)
- **Pod 필터** — 그룹 내 특정 Pod 선택
- **컨테이너 필터** — 컨테이너별 필터링 (init 컨테이너 포함)
- **심각도 필터** — 6단계: error, warning, info, debug, trace, unknown (로그 내용 및 구조화된 JSON 로그에서 자동 감지)
- **시간 범위 필터** — From/To 날짜/시간 입력, Earliest/Latest 엣지 선택, 최대 라인 제한 (100k, 200k, 500k, 무제한)
- **Live tail** — 실시간 로그 스트리밍, 자동 스크롤 토글
- **이전 로그** — 이전 컨테이너 재시작 로그 조회
- **Tail 조절** — 점진적 로딩 (100, 300, 1,000, 5,000줄), Load Older 옵션
- **매치 탐색** — 화살표 키로 검색 결과 간 이동, 매치 카운터
- **메시지 숨기기** — 우클릭으로 특정 로그 라인 제외, 개별 또는 일괄 복원
- **줄바꿈 토글** — 적응형 가상 스크롤링과 함께 on/off
- **다운로드** — 필터링된 로그를 `.txt` 파일로 내보내기
- **JSON 로그 파싱** — 구조화된 로그의 trace ID 추출 및 로거 이름 축약
- **ANSI 제거** — 컬러 코드 로그의 깔끔한 표시
- **스택 트레이스 감지** — 스택 트레이스 자동 포맷팅

### Shell 명령어
- `kubectl exec` 명령어 생성 및 클립보드 복사
- 멀티 Pod 그룹에서 Pod 및 컨테이너 선택
- `clear; (bash || ash || sh)` 폴백 시퀀스 자동 완성

### AI 분석
- Secret 자동 마스킹 후 AI 분석 프롬프트 복사 (외부 API 호출 없음)
- 이벤트 기반 장애 원인 힌트
- Claude 등 AI 도구에 바로 붙여넣기 가능한 포맷

### 실시간 모니터링
- **Live 모드** — 4초 주기 자동 새로고침, 시각적 표시
- **Metrics-server 연동** — Pod별 실시간 CPU/메모리 사용량, request/limit 대비 비율 표시
- **이슈 패널** — 최대 6개 warning/danger 리소스 바로가기, 확장하여 더 보기, 호버 시 상세 정보
- **토스트 알림** — 리소스 상태 변경 시 자동 해제 알림 (예: healthy → warning)
- 메트릭 장애 시 진단 힌트 제공 (미설치, 권한 부족, API 불가, 네트워크 오류)

### 컨텍스트 메뉴 (우클릭)
- 이름 복사 / JSON 복사 / YAML 복사
- Pod 로그 열기
- Shell (kubectl exec 명령어 복사)
- Pod 재시작 (그룹의 경우 확인 팝업)
- AI 프롬프트 복사

### 탐색 및 인터랙션
- 캔버스 이동, 줌 (0.3x–3x), 드래그 가능한 뷰포트가 있는 미니맵, 그리드 토글
- 노드 드래그로 재배치; Shift+드래그로 다중 선택 (마키)
- Edge 호버 하이라이트 및 클릭 가능한 리소스 카드
- 레이아웃 리셋 (개별 노드 또는 전체)
- 자동 컬럼 레이아웃 (Ingress → Service → Deployment → Pod → ConfigMap/Secret)

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
| `↑` / `↓` | 검색 매치 탐색 (로그 모달) |
| `Enter` | 검색 칩 추가 (로그 모달) |
| `Backspace` | 마지막 칩 삭제 (로그 모달, 입력 비어있을 때) |

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

생성된 `.tgz` 파일을 Extensions 화면에서 설치합니다.

## 사용법

1. FreeLens에서 클러스터를 엽니다.
2. 클러스터 페이지 메뉴에서 **Workload Topology**를 선택합니다.
3. 네임스페이스를 선택합니다.
4. 토폴로지 그래프를 탐색합니다 — Edge 호버, 카드 클릭, 노드 드래그.
5. 상세 패널에서 YAML, 이벤트, 로그를 확인합니다.
6. 리소스를 우클릭하여 빠른 작업(로그, 셸, AI 분석, 재시작)을 실행합니다.
7. `?`를 눌러 전체 키보드 단축키를 확인합니다.

### 로그 검색하기

1. Pod 또는 Pod 그룹을 클릭한 후, 상세 패널 또는 컨텍스트 메뉴에서 **Pod Logs**를 엽니다.
2. 키워드를 입력하고 `Enter`를 눌러 검색 칩을 생성합니다.
3. 칩을 추가하면 AND 필터링, 칩 클릭 → **+ OR condition**으로 OR 조건을 추가합니다.
4. 칩을 클릭하면 메뉴가 나타납니다: Exclude 모드 전환, 비활성화, 삭제.
5. 심각도, 컨테이너, Pod 드롭다운으로 결과를 좁힙니다.
6. 시간 범위 필터로 날짜/시간 기반 로그 쿼리를 실행합니다.
7. **Live**를 토글하여 실시간 로그를 추적하거나, **Previous**로 이전 재시작 로그를 확인합니다.

## Metrics Server

Pod 툴팁에 실시간 CPU/메모리 사용량을 표시하려면 클러스터에 [metrics-server](https://github.com/kubernetes-sigs/metrics-server)가 실행 중이어야 합니다.

이 확장은 클러스터 전역 metrics 구성 요소를 설치하거나 변경하지 않습니다. 운영 클러스터에서는 클러스터 관리자에게 metrics-server 배포 상태, APIService 상태, RBAC, 클러스터 보안 정책 확인을 요청하세요.

metrics-server가 없어도 토폴로지는 CPU/메모리 데이터 없이 정상 동작합니다. 메트릭 장애 시 진단 힌트를 제공합니다 (미설치, 권한 부족, API 불가, 네트워크 오류).

## 프로젝트 구조

```
src/
  main/index.ts                         # FreeLens main extension 진입점
  renderer/index.tsx                    # 최소 renderer entry / 페이지 등록
  renderer/pages/WorkloadTopologyPage.tsx
                                       # 메인 토폴로지 페이지와 클러스터 상호작용
  renderer/components/                  # 카드, 상세 패널, Pod 로그, 미니맵 등 UI 컴포넌트
  renderer/topology/                    # 토폴로지 그래프 빌드, 상태, 문제 분석, edge
  renderer/utils/                       # 포맷팅, kube 헬퍼, events, YAML/JSON/AI 유틸
  renderer/types.ts                     # 공용 renderer 타입
  renderer/constants.ts                 # 공용 레이아웃 / UI 상수
  renderer/styles.ts                    # 확장 UI 스타일
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
| `corepack pnpm pack` | 설치 가능한 `.tgz` 패키지 생성 |

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