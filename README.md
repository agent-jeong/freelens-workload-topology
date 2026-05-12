# Freelens Workload Topology

[![Release](https://img.shields.io/github/v/release/agent-jeong/freelens-workload-topology?display_name=tag)](https://github.com/agent-jeong/freelens-workload-topology/releases) [![License](https://img.shields.io/github/license/agent-jeong/freelens-workload-topology)](LICENSE)

[한국어](README.ko.md)

A Kubernetes topology extension for [FreeLens](https://github.com/freelensapp/freelens). It adds a **Workload Topology** page to the cluster view, visualizing resource relationships, real-time status, metrics, and pod logs in a single interactive graph.

Instead of jumping between Ingress, Service, Deployment, Pod, ConfigMap, and Secret detail screens, Workload Topology renders all connections as a navigable graph you can inspect at a glance.

## Preview

![Workload Topology Main](docs/assets/screenshot-main.png)

![Pod Logs Modal](docs/assets/screenshot-log.png)

## Why Workload Topology

Kubernetes relationships are spread across dozens of screens. This extension brings them together so you can answer questions like:

- Which Service is this Ingress routing to, and is the backend healthy?
- Which Pods belong to this Deployment, and what is their CPU/memory usage?
- Which ConfigMaps and Secrets does this workload reference?
- What is the blast radius if this resource fails?
- Why is this Pod in CrashLoopBackOff, and what do the events say?

## Supported Apps

| App | Version |
|---|---|
| FreeLens | 1.6.0+ |

The extension uses the FreeLens renderer API and requires no extra sidecar or cluster agent.

## Core Features

### Topology Graph
- Resource graph for **Ingress, Service, Deployment, CronJob, Job, Pod, ConfigMap, Secret**
- Automatic edge detection via Ingress backends, Service selectors, Deployment selectors, OwnerReferences, and Pod volume/env references
- Status indicators: `healthy`, `warning`, `danger`, `unknown`
- Namespace-aware browsing with per-namespace layout persistence
- CronJob/Job time-window filter (1h, 24h, 7d)
- Group cards for Pods and Jobs with expand/collapse
- Label-based filtering and resource name/kind search
- Problems Only filter to show only warning/danger resources and their connections
- Blast radius analysis to visualize the failure impact of a selected resource

### Detail Panel
- **Inspect tab** — resource summary, labels, Pod info (node, IP, image, restarts), Deployment replicas, Service ports, Ingress hosts, CronJob schedule
- **JSON tab** — collapsible tree with search/query, click-to-copy values, expand/collapse all, Secret data auto-masking
- **YAML tab** — live diff editor with apply warnings and direct Kubernetes API update (auto-removes `status` and `managedFields`)
- **Events tab** — related Kubernetes Events with type badges, repeat counts, source, and timestamp
- Resizable panel (drag from left edge)

### Pod Logs
- **Multi-pod log streaming** — up to 24 log streams displayed simultaneously
- **Search chips** — persistent filter chips with AND/OR logic
  - AND between chips, comma-separated OR within a chip
  - Include or Exclude mode (switch via chip context menu)
  - Disable/enable individual chips without deleting
- **Pod filter** — select specific pods within a group
- **Container filter** — filter by container (including init containers)
- **Severity filter** — 6 levels: error, warning, info, debug, trace, unknown (auto-detected from log content and structured JSON logs)
- **Time range filter** — date/time inputs for From/To bounds with Earliest/Latest edge selection and max line limits (100k, 200k, 500k, unlimited)
- **Live tail** — real-time log streaming with auto-scroll toggle
- **Previous logs** — view logs from prior container restarts
- **Tail control** — progressive loading (100, 300, 1,000, 5,000 lines) with Load Older option
- **Match navigation** — arrow keys to jump between search matches with match counter
- **Hidden messages** — right-click to exclude specific log lines, restore individually or all at once
- **Line wrap toggle** — on/off with adaptive virtual scrolling
- **Download** — export filtered logs as `.txt` file
- **JSON log parsing** — structured logs with trace ID extraction and logger name shortening
- **ANSI stripping** — clean display of color-coded logs
- **Stack trace detection** — auto-formatting of stack traces

### Shell Command
- Copy-to-clipboard `kubectl exec` command generation
- Pod and container selection for multi-pod groups
- Auto-completes `clear; (bash || ash || sh)` fallback sequence

### AI Analysis
- AI analysis prompt copy with auto-masked secrets (no external API calls)
- Event-based cause hints for problem diagnosis
- Paste-ready format for Claude or other AI tools

### Real-time Monitoring
- **Live mode** — 4-second auto-refresh cycle with visual indicator
- **Metrics-server integration** — real-time CPU/memory usage per Pod with request/limit comparison and percentage indicators
- **Issue panel** — up to 6 warning/danger resources with quick-jump navigation, expandable for more, hover tooltip with problem details
- **Toast notifications** — auto-dismissing alerts for resource status changes (e.g., healthy → warning)
- Graceful metrics fallback with diagnostic hints (not installed, forbidden, API unavailable, network error)

### Context Menu (Right-Click)
- Copy name / Copy JSON / Copy YAML
- Open pod logs
- Shell (copy kubectl exec command)
- Restart Pod (with confirmation for groups)
- Copy AI prompt

### Navigation & Interaction
- Canvas pan, zoom (0.3x–3x), minimap with draggable viewport, and grid toggle
- Drag nodes to rearrange; Shift+drag to multi-select (marquee)
- Edge hover highlighting and clickable resource cards
- Reset layout (individual node or all)
- Automatic columnar layout (Ingress → Service → Deployment → Pod → ConfigMap/Secret)

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `?` | Toggle keyboard shortcut help |
| `⌘K` | Search resources |
| `⌘G` | Toggle grid background |
| `⌘L` | Toggle Live mode (auto-refresh) |
| `⌘.` | Refresh resources |
| `⌘P` | Toggle Problems Only filter |
| `-` / `+` | Zoom out / Zoom in |
| `0` | Reset zoom & position |
| `Delete` | Reset selected node position |
| `Esc` | Close / Deselect |
| `Shift+Drag` | Multi-select (marquee) |
| `Right-click` | Context menu |
| `↑` / `↓` | Navigate search matches (in log modal) |
| `Enter` | Add search chip (in log modal) |
| `Backspace` | Remove last chip (in log modal, when input is empty) |

## Installation

### Install from GitHub Releases

1. Open the [latest release](https://github.com/agent-jeong/freelens-workload-topology/releases/latest).
2. Download the `.tgz` asset.
3. Open FreeLens and go to the **Extensions** screen.
4. Install the downloaded `.tgz` file.

### Build from Source

```shell
corepack pnpm install
corepack pnpm build
corepack pnpm pack
```

Then install the generated `.tgz` from the Extensions screen.

## Usage

1. Open a cluster in FreeLens.
2. Open **Workload Topology** from the cluster page menu.
3. Select a namespace.
4. Explore the topology graph — hover edges, click cards, drag nodes.
5. Use the detail panel to inspect YAML, events, and logs.
6. Right-click a resource for quick actions (logs, shell, AI analysis, restart).
7. Press `?` to view all keyboard shortcuts.

### Searching Logs

1. Click a Pod or Pods group, then open **Pod Logs** from the detail panel or context menu.
2. Type a keyword and press `Enter` to create a search chip.
3. Add more chips for AND filtering, or click a chip → **+ OR condition** to add OR terms.
4. Click a chip to access the menu: switch to Exclude mode, disable, or delete.
5. Use the severity, container, and pod dropdowns to narrow results.
6. Use the range filter for time-based log queries with date/time bounds.
7. Toggle **Live** to tail logs in real-time, or **Previous** to view prior restart logs.

## Metrics Server

To display real-time CPU and memory usage on Pod tooltips, the cluster needs a running [metrics-server](https://github.com/kubernetes-sigs/metrics-server).

This extension does not install or modify cluster-wide metrics components. In production clusters, ask the cluster administrator to verify the metrics-server deployment, APIService status, RBAC, and cluster security policy.

If metrics-server is not available, the topology continues to work normally without CPU/memory data. The extension provides diagnostic hints when metrics fail (not installed, forbidden, API unavailable, network error).

## Project Structure

```
src/
  main/index.ts                         # FreeLens main extension entry point
  renderer/index.tsx                    # Minimal renderer entry / page registration
  renderer/pages/WorkloadTopologyPage.tsx
                                       # Main topology page and cluster interactions
  renderer/components/                  # UI components (cards, detail panel, pod logs, minimap, etc.)
  renderer/topology/                    # Topology graph building, status, problems, edges
  renderer/utils/                       # Formatting, kube helpers, events, YAML/JSON/AI utilities
  renderer/types.ts                     # Shared renderer types
  renderer/constants.ts                 # Shared layout and UI constants
  renderer/styles.ts                    # Extension UI styles
electron.vite.config.ts  # Build configuration
package.json             # Extension metadata and scripts
```

## Development

```shell
corepack pnpm install
corepack pnpm build
```

| Command | Description |
|---|---|
| `pnpm build` | Production build |
| `pnpm type:check` | TypeScript type checking |
| `corepack pnpm pack` | Create installable `.tgz` package |

## Notes

- YAML apply removes `status` and `metadata.managedFields` before editing. Changes to `kind`, `metadata.name`, `metadata.namespace`, and Pod immutable fields will be rejected by the Kubernetes API.
- AI analysis prompt copy does not call any external API. Secret data, env values, and token/password/key fields are automatically masked.
- Pod log modal displays up to 24 log streams at once.
- If the Event API is unavailable, the event panel shows empty and topology loading continues normally.

## Contributing

Issues and pull requests are welcome.

When reporting bugs, please include:

- FreeLens version
- Kubernetes cluster version and provider
- Screenshot or short GIF when possible

## License

MIT