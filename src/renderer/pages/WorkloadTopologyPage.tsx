import React, { useEffect, useMemo, useRef, useState } from "react";
import { Renderer } from "@freelensapp/extensions";
import YAML from "yaml";
import { TopologyDetails } from "../components/DetailPanel";
import { IssuePanel } from "../components/IssuePanel";
import { TopologyCard } from "../components/TopologyCard";
import { TopologyContextMenu } from "../components/TopologyContextMenu";
import { TopologyEdges } from "../components/TopologyEdges";
import { TopologyMinimap } from "../components/TopologyMinimap";
import { PodLogsModal } from "../components/PodLogsModal";
import {
  METRICS_INSTALL_CMD,
  METRICS_PATCH_CMD,
  canvasWidth,
  cardHeight,
  cardWidth,
  columnX,
  cronZoneColumns,
  mainColumns,
  styleElementId,
  topPadding
} from "../constants";
import { topologyStyles } from "../styles";
import { buildTopology } from "../topology/builder";
import { connectedNodeIds } from "../topology/edges";
import { causeHintsForEvents, issueSeverityRank } from "../topology/problems";
import type {
  ContextMenuItem,
  KubeEventLike,
  KubeObjectLike,
  MetricsResult,
  PodMetrics,
  ResourceSet,
  TopologyNode,
  TopologyStatus,
  ViewportSize
} from "../types";
import { buildAiAnalysisPrompt } from "../utils/ai";
import { parseCpu, parseMem } from "../utils/format";
import { eventsForNode } from "../utils/events";
import {
  apiForKind,
  filterByNamespace,
  getName,
  getNamespace,
  namespaceOptions,
  objectForCopy,
  stringifyObject,
  visibleResourceCount
} from "../utils/kube";
import { readStoredLayout, writeStoredLayout } from "../utils/layout";

const { K8sApi } = Renderer;

function useTopologyStyles() {
  useEffect(() => {
    let styleElement = document.getElementById(styleElementId);

    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = styleElementId;
      styleElement.textContent = topologyStyles;
      document.head.appendChild(styleElement);
    }

    return () => {
      styleElement?.remove();
    };
  }, []);
}

async function fetchPodMetrics(namespace: string): Promise<MetricsResult> {
  try {
    const api = K8sApi.podsApi as any;
    const path = `/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods`;

    // Use relative path through same-origin proxy
    const req = api.request;
    const apiBase = req?.config?.apiBase ?? "/api-kube";
    const url = `${apiBase}${path}`;

    const r = await fetch(url);
    if (!r.ok) {
      if (r.status === 404 || r.status === 503) return { ok: false, reason: "not-installed" };
      if (r.status === 403) return { ok: false, reason: "forbidden" };
      return { ok: false, reason: `http-${r.status}` };
    }
    const response = await r.json();

    if (!response) return { ok: false, reason: "empty-response" };

    const items = response?.items ?? [];

    if (!Array.isArray(items)) return { ok: false, reason: "invalid-response" };

    // metrics-server installed but returning errors (e.g. kubelet TLS issue)
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
  } catch {
    return { ok: false, reason: "network-error" };
  }
}

async function listOrEmpty(api?: { list: () => Promise<unknown> }) {
  try {
    if (!api) {
      return [];
    }

    return await api.list() as KubeObjectLike[];
  } catch {
    return [];
  }
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Freelens extension views can reject the async Clipboard API depending on
      // the runtime context. Fall back to the legacy selection-based copy path.
    }
  }

  const textarea = document.createElement("textarea");

  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");

  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard copy failed. Try copying from the JSON or YAML tab manually.");
  }
}

export function WorkloadTopologyPage() {
  useTopologyStyles();

  const [resources, setResources] = useState<ResourceSet>({
    ingresses: [],
    services: [],
    deployments: [],
    cronJobs: [],
    jobs: [],
    pods: [],
    configMaps: [],
    secrets: [],
    events: []
  });
  const [namespaces, setNamespaces] = useState<string[]>(["default"]);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TopologyNode } | null>(null);
  const [confirmRestart, setConfirmRestart] = useState<TopologyNode | null>(null);
  const [restartTarget, setRestartTarget] = useState<string>("");
  const [selectedNamespace, setSelectedNamespace] = useState("default");
  const [cronJobWindowHours, setCronJobWindowHours] = useState(24);
  const [isLive, setIsLive] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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
  const prevNodeStatuses = useRef<Map<string, TopologyStatus>>(new Map());
  const [podMetrics, setPodMetrics] = useState<Map<string, PodMetrics>>(new Map());
  const [metricsHint, setMetricsHint] = useState<string | null>(null);
  const [statusToasts, setStatusToasts] = useState<Array<{ id: number; name: string; kind: string; from: TopologyStatus; to: TopologyStatus }>>([]);
  const toastCounter = useRef(0);
  const [canvasSize, setCanvasSize] = useState<ViewportSize>({ width: 1, height: 1 });

  async function loadResources(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const [namespaceList, ingresses, services, deployments, cronJobs, jobs, pods, configMaps, secrets, events] = await Promise.all([
        listOrEmpty(K8sApi.namespacesApi),
        listOrEmpty(K8sApi.ingressApi),
        listOrEmpty(K8sApi.serviceApi),
        listOrEmpty(K8sApi.deploymentApi),
        listOrEmpty(K8sApi.cronJobApi),
        listOrEmpty(K8sApi.jobApi),
        listOrEmpty(K8sApi.podsApi),
        listOrEmpty(K8sApi.configMapApi),
        listOrEmpty(K8sApi.secretsApi),
        listOrEmpty((K8sApi as any).eventApi ?? (K8sApi as any).eventsApi)
      ]);

      const nextNamespaces = namespaceOptions(
        { ingresses, services, deployments, cronJobs, jobs, pods, configMaps, secrets, events: events as KubeEventLike[] },
        namespaceList.map(getName)
      );

      setResources({ ingresses, services, deployments, cronJobs, jobs, pods, configMaps, secrets, events: events as KubeEventLike[] });
      setNamespaces(nextNamespaces);
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

  useEffect(() => {
    let cancelled = false;

    async function loadMetrics() {
      const result = await fetchPodMetrics(selectedNamespace);

      if (cancelled) return;

      if (result.ok) {
        if (result.data.length > 0) {
          setPodMetrics(new Map(result.data.map((m) => [m.podName, m])));
        }
        setMetricsHint(null);
      } else {
        setMetricsHint(result.reason);
      }
    }

    void loadMetrics();

    const interval = setInterval(loadMetrics, isLive ? 8000 : 30000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedNamespace, isLive]);

  const filteredResources = useMemo(() => filterByNamespace(resources, selectedNamespace), [resources, selectedNamespace]);
  const topology = useMemo(() => buildTopology(filteredResources, cronJobWindowHours), [filteredResources, cronJobWindowHours]);
  const nodeById = useMemo(() => new Map(topology.nodes.map((node) => [node.id, node])), [topology.nodes]);
  const resolvedPos = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const node of topology.nodes) {
      const manual = manualPositions[node.id];
      map.set(node.id, manual ?? { x: node.x, y: node.y });
    }
    return map;
  }, [topology.nodes, manualPositions]);
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
  const selectedNodeEvents = useMemo(() => eventsForNode(filteredResources.events, selectedNode), [filteredResources.events, selectedNode]);
  const canvasHeight = Math.max(640, topology.nodes.reduce((height, node) => {
    const pos = resolvedPos.get(node.id);
    const y = pos ? pos.y : node.y;
    return Math.max(height, y + cardHeight + 80);
  }, 0));
  const resourceCount = visibleResourceCount(filteredResources);
  const availableNamespaces = useMemo(() => namespaceOptions(resources, namespaces), [resources, namespaces]);
  const availableLabels = useMemo(() => {
    const labelSet = new Set<string>();

    for (const node of topology.nodes) {
      const labels = node.object?.metadata?.labels;

      if (labels && typeof labels === "object") {
        for (const [k, v] of Object.entries(labels as Record<string, string>)) {
          labelSet.add(`${k}=${v}`);
        }
      }
    }

    return [...labelSet].sort();
  }, [topology.nodes]);
  const labelMatchIds = useMemo(() => {
    if (!labelFilter) return null;

    const matched = new Set<string>();

    for (const node of topology.nodes) {
      const labels = node.object?.metadata?.labels;

      if (labels && typeof labels === "object") {
        const entries = Object.entries(labels as Record<string, string>);

        if (entries.some(([k, v]) => `${k}=${v}` === labelFilter)) {
          matched.add(node.id);
        }
      }
    }

    return matched;
  }, [labelFilter, topology.nodes]);
  const connectedIds = useMemo(() => connectedNodeIds(selectedNodeId, topology.edges), [selectedNodeId, topology.edges]);
  const blastRadius = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodeById.get(selectedNodeId);
    if (!node || (node.status !== "danger" && node.status !== "warning")) return null;
    return { status: node.status, ids: connectedIds };
  }, [selectedNodeId, connectedIds, nodeById]);
  const searchMatchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    if (!q) return null;

    const matched = new Set<string>();

    for (const node of topology.nodes) {
      if (node.name.toLowerCase().includes(q) || node.kind.toLowerCase().includes(q)) {
        matched.add(node.id);
      }
    }

    return matched;
  }, [searchQuery, topology.nodes]);
  const searchMatchList = useMemo(() => {
    if (!searchMatchIds) return [];
    return topology.nodes.filter((n) => searchMatchIds.has(n.id));
  }, [searchMatchIds, topology.nodes]);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

  useEffect(() => {
    setSearchMatchIndex(0);
    if (searchMatchList.length > 0) {
      const first = searchMatchList[0];
      const pos = resolvedPos.get(first.id);
      const nx = pos ? pos.x : first.x;
      const ny = pos ? pos.y : first.y;
      navigateToCanvasPoint(nx + cardWidth / 2, ny + cardHeight / 2);
    }
  }, [searchMatchList]);

  const edgePaths = useMemo(() => topology.edges.map((edge) => {
    const fromPos = resolvedPos.get(edge.from);
    const toPos = resolvedPos.get(edge.to);
    if (!fromPos || !toPos) return null;
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      d: `M ${fromPos.x + cardWidth} ${fromPos.y + cardHeight / 2} C ${fromPos.x + cardWidth + 42} ${fromPos.y + cardHeight / 2}, ${toPos.x - 42} ${toPos.y + cardHeight / 2}, ${toPos.x} ${toPos.y + cardHeight / 2}`,
    };
  }).filter(Boolean) as Array<{ id: string; from: string; to: string; d: string }>, [topology.edges, resolvedPos]);

  const issueNodes = useMemo(() => topology.nodes
    .filter((node) => node.status === "danger" || node.status === "warning")
    .sort((left, right) =>
      issueSeverityRank(left.status) - issueSeverityRank(right.status) ||
      left.kind.localeCompare(right.kind) ||
      left.name.localeCompare(right.name)
    ), [topology.nodes]);
  const dangerCount = useMemo(() => issueNodes.filter((n) => n.status === "danger").length, [issueNodes]);
  const warningCount = useMemo(() => issueNodes.filter((n) => n.status === "warning").length, [issueNodes]);

  useEffect(() => {
    const prev = prevNodeStatuses.current;

    if (isLive && prev.size > 0) {
      const newToasts: typeof statusToasts = [];

      for (const node of topology.nodes) {
        const oldStatus = prev.get(node.id);

        if (oldStatus && oldStatus !== node.status) {
          toastCounter.current += 1;
          newToasts.push({ id: toastCounter.current, name: node.name, kind: node.kind, from: oldStatus, to: node.status });
        }
      }

      if (newToasts.length > 0) {
        setStatusToasts((current) => [...current, ...newToasts].slice(-5));
        const ids = newToasts.map((t) => t.id);

        setTimeout(() => {
          setStatusToasts((current) => current.filter((t) => !ids.includes(t.id)));
        }, 5000);
      }
    }

    const next = new Map<string, TopologyStatus>();

    for (const node of topology.nodes) {
      next.set(node.id, node.status);
    }

    prevNodeStatuses.current = next;
  }, [topology.nodes, isLive]);

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

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const inInput = !!(event.target as HTMLElement)?.closest("input, textarea, select");

      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === "Escape") {
        if (showHelp) { setShowHelp(false); return; }
        if (searchQuery) { setSearchQuery(""); searchInputRef.current?.blur(); return; }
        if (logModalNode) { setLogModalNode(null); return; }
        setSelectedNodeId(null);
        setSelectedNodeIds(new Set());
        return;
      }

      if (inInput) return;

      switch (event.key) {
        case "?": setShowHelp((v) => !v); break;
        case "g": setShowGrid((v) => !v); break;
        case "l": setIsLive((v) => !v); break;
        case ".": void loadResources(); break;
        case "p": setShowIssuesOnly((v) => !v); break;
        case "Backspace":
        case "Delete":
          if (selectedNodeId || selectedNodeIds.size > 0) {
            setManualPositions((prev) => {
              const next = { ...prev };
              if (selectedNodeId) delete next[selectedNodeId];
              selectedNodeIds.forEach((id) => delete next[id]);
              return next;
            });
          }
          break;
        case "0": setScale(1); setOffset({ x: 0, y: 0 }); break;
        case "-": setScale((s) => Math.max(0.3, s - 0.1)); break;
        case "=":
        case "+": setScale((s) => Math.min(3, s + 0.1)); break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [logModalNode, searchQuery, showHelp, selectedNodeId, selectedNodeIds]);

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

  function buildContextMenuItems(node: TopologyNode): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      { label: "Copy name", icon: "\u2398", onClick: () => void handleCopy("name", node.name) },
      { label: "Copy JSON", icon: "\u007B\u007D", onClick: () => void handleCopy("JSON", stringifyObject(node.object)) },
      { label: "Copy YAML", icon: "\u2B1A", onClick: () => void handleCopy("YAML", YAML.stringify(objectForCopy(node.object))) },
    ];

    if (node.pods?.length) {
      items.push({
        label: node.pods.length > 1 ? `Open ${node.pods.length} pod logs` : "Open pod logs",
        icon: "\u25B6",
        onClick: () => setLogModalNode(node),
        separator: true,
      });
    }

    if (node.kind === "Pod" || (node.kind === "Pods" && node.pods?.length)) {
      items.push({
        label: node.kind === "Pods" ? `Restart Pod (${node.pods!.length})…` : "Restart Pod",
        icon: "\u21BB",
        onClick: () => setConfirmRestart(node),
        separator: true,
      });
    }

    const nodeEvents = eventsForNode(filteredResources.events, node);
    const hints = causeHintsForEvents(nodeEvents);

    items.push({
      label: "Copy AI prompt",
      icon: "\u2728",
      onClick: () => void handleCopy("AI analysis prompt", buildAiAnalysisPrompt(node, nodeEvents, hints)),
      separator: true,
    });

    return items;
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

  function nodeRelation(nodeId: string): "normal" | "connected" | "dimmed" {
    const filterIds = searchMatchIds ?? labelMatchIds;

    if (filterIds) return filterIds.has(nodeId) ? "connected" : "dimmed";
    if (selectedNodeId) return connectedIds.has(nodeId) ? "connected" : "dimmed";
    return "normal";
  }

  const edgeRelation = React.useCallback((fromId: string, toId: string): string | undefined => {
    const filterIds = searchMatchIds ?? labelMatchIds;

    if (filterIds) return filterIds.has(fromId) && filterIds.has(toId) ? "relation-connected" : "relation-dimmed";
    if (selectedNodeId) {
      const isConnected = connectedIds.has(fromId) && connectedIds.has(toId);
      if (!isConnected) return "relation-dimmed";
      return blastRadius ? `relation-blast is-${blastRadius.status}` : "relation-connected";
    }
    return undefined;
  }, [searchMatchIds, labelMatchIds, selectedNodeId, connectedIds, blastRadius]);

  function focusNode(node: TopologyNode) {
    setSelectedNodeId(node.id);
    setSelectedNodeIds(new Set([node.id]));
    const pos = resolvedPos.get(node.id);
    const nx = pos ? pos.x : node.x;
    const ny = pos ? pos.y : node.y;
    navigateToCanvasPoint(nx + cardWidth / 2, ny + cardHeight / 2);
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

  const handleNodeSelect = React.useCallback((nodeId: string) => {
    const wasAlreadySelected = nodeDragStart.current?.wasAlreadySelected;
    const didDrag = nodeDragStart.current?.didDrag;

    if (wasAlreadySelected && !didDrag) {
      setSelectedNodeId(null);
      setSelectedNodeIds(new Set());
    } else if (!wasAlreadySelected) {
      setSelectedNodeId(nodeId);
      setSelectedNodeIds(new Set([nodeId]));
    }
  }, []);

  const handleNodeContextMenu = React.useCallback((event: React.MouseEvent, node: TopologyNode) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const stateRef = useRef({ selectedNodeId, selectedNodeIds, resolvedPos });
  stateRef.current = { selectedNodeId, selectedNodeIds, resolvedPos };

  const handleNodeDragStart = React.useCallback((event: React.MouseEvent, node: TopologyNode) => {
    event.stopPropagation();
    const { selectedNodeId: selId, selectedNodeIds: selIds, resolvedPos: rPos } = stateRef.current;

    const isMultiSelected = selIds.has(node.id) && selIds.size > 1;
    const dragIds = isMultiSelected ? [...selIds] : [node.id];
    const origins: Record<string, { x: number; y: number }> = {};

    for (const id of dragIds) {
      const pos = rPos.get(id);

      if (pos) {
        origins[id] = { x: pos.x, y: pos.y };
      }
    }

    nodeDragStart.current = {
      ids: dragIds,
      x: event.clientX,
      y: event.clientY,
      origins,
      wasAlreadySelected: selId === node.id || selIds.has(node.id),
      didDrag: false
    };

    if (!isMultiSelected) {
      setSelectedNodeId(node.id);
      setSelectedNodeIds(new Set([node.id]));
    }
  }, []);

  return (
    <div className="WorkloadTopology">
      <div className="WorkloadTopology__toolbar">
        <div>
          <h2>Workload Topology</h2>
          <div className="WorkloadTopology__summary">
            {[
              { label: "Ingress", count: resources.ingresses.length },
              { label: "Service", count: resources.services.length },
              { label: "Deployment", count: resources.deployments.length },
              { label: "CronJob", count: resources.cronJobs.length },
              { label: "Job", count: resources.jobs.length },
              { label: "Pod", count: resources.pods.length },
              { label: "ConfigMap", count: resources.configMaps.length },
              { label: "Secret", count: resources.secrets.length },
            ].map(({ label, count }) => (
              <span key={label} className="WorkloadTopology__summaryItem">
                <strong>{count}</strong> {label}
              </span>
            ))}
            {issueNodes.length > 0 ? (
              <>
                <span className="WorkloadTopology__summaryDivider" />
                {dangerCount > 0 && (
                  <span className="WorkloadTopology__statusBadge is-danger">
                    {dangerCount} danger
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="WorkloadTopology__statusBadge is-warning">
                    {warningCount} warning
                  </span>
                )}
              </>
            ) : null}
          </div>
        </div>
        <div className="WorkloadTopology__actions">
          <label className="WorkloadTopology__filter">
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
          {availableLabels.length > 0 && (
            <label className="WorkloadTopology__filter">
              <span>Label</span>
              <select
                value={labelFilter}
                onChange={(event) => setLabelFilter(event.target.value)}
              >
                <option value="">All</option>
                {availableLabels.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            </label>
          )}
          <div className="WorkloadTopology__search">
            <input
              ref={searchInputRef}
              type="text"
              className={searchQuery ? "has-value" : ""}
              placeholder="Search resources… (⌘K)"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchQuery("");
                  (event.target as HTMLInputElement).blur();
                } else if (event.key === "Enter" && searchMatchList.length > 0) {
                  const delta = event.shiftKey ? -1 : 1;
                  const nextIndex = (searchMatchIndex + delta + searchMatchList.length) % searchMatchList.length;
                  setSearchMatchIndex(nextIndex);
                  const target = searchMatchList[nextIndex];
                  const pos = resolvedPos.get(target.id);
                  const nx = pos ? pos.x : target.x;
                  const ny = pos ? pos.y : target.y;
                  setSelectedNodeId(target.id);
                  setSelectedNodeIds(new Set([target.id]));
                  navigateToCanvasPoint(nx + cardWidth / 2, ny + cardHeight / 2);
                }
              }}
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }} aria-label="Clear search">&times;</button>
            )}
          </div>
          {searchMatchIds !== null && (
            <span className="WorkloadTopology__searchCount">
              {searchMatchList.length > 0 ? `${searchMatchIndex + 1}/${searchMatchList.length}` : "0 found"}
            </span>
          )}
          <label className="WorkloadTopology__filter">
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
          
          <button
            type="button"
            onClick={() => void loadResources()}
            title="Refresh (.)"
            style={{ fontWeight: 600, fontSize: "16px", padding: "0 8px" }}
          >
            ↻
          </button>
          {Object.keys(manualPositions).length > 0 && (
            <button type="button" onClick={() => setManualPositions({})}>Reset layout</button>
          )}
        </div>
      </div>

      {error ? <div className="WorkloadTopology__error">{error}</div> : null}
      {metricsHint ? (
        <div className="WorkloadTopology__metricsHint">
          <button type="button" className="WorkloadTopology__metricsHintClose" onClick={() => setMetricsHint(null)} aria-label="Dismiss">&times;</button>
          {metricsHint === "not-installed" ? (
            <>
              <span>⚠ Metrics server not installed. Install and configure with:</span>
              <code className="WorkloadTopology__metricsCmd" title="Click to copy install command" onClick={() => void copyText(METRICS_INSTALL_CMD)}>
                {METRICS_INSTALL_CMD}
              </code>
              <span className="WorkloadTopology__metricsSubHint">For self-signed cert clusters, also run:</span>
              <code className="WorkloadTopology__metricsCmd" title="Click to copy patch command" onClick={() => void copyText(METRICS_PATCH_CMD)}>
                {METRICS_PATCH_CMD}
              </code>
            </>
          ) : metricsHint === "forbidden" ? (
            <span>⚠ Metrics API access denied. Check your cluster RBAC permissions for <code>metrics.k8s.io</code> resources.</span>
          ) : (
            <>
              <span>⚠ Metrics unavailable ({metricsHint})</span>
              <span className="WorkloadTopology__metricsSubHint">If using self-signed certs, add <code>--kubelet-insecure-tls</code> to metrics-server:</span>
              <code className="WorkloadTopology__metricsCmd" title="Click to copy" onClick={() => void copyText(METRICS_PATCH_CMD)}>
                {METRICS_PATCH_CMD}
              </code>
            </>
          )}
        </div>
      ) : null}
      {loading ? <div className="WorkloadTopology__state">Loading topology...</div> : null}
      {!loading && resourceCount === 0 ? <div className="WorkloadTopology__state">No supported Kubernetes resources found.</div> : null}
      {!loading && issueNodes.length > 0 ? <IssuePanel nodes={issueNodes} onSelect={focusNode} /> : null}

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
                const pos = resolvedPos.get(node.id);
                const nx = pos ? pos.x : node.x;
                const ny = pos ? pos.y : node.y;
                const nodeRight = nx + cardWidth;
                const nodeBottom = ny + cardHeight;

                if (nx < marquee.x2 && nodeRight > marquee.x1 && ny < marquee.y2 && nodeBottom > marquee.y1) {
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
            <TopologyEdges
              edgePaths={edgePaths}
              showIssuesOnly={showIssuesOnly}
              issueNodeIds={issueNodeIds}
              edgeRelationFn={edgeRelation}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
            />

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
                posX={resolvedPos.get(node.id)?.x ?? node.x}
                posY={resolvedPos.get(node.id)?.y ?? node.y}
                selected={selectedNodeId === node.id || selectedNodeIds.has(node.id)}
                onDragStart={handleNodeDragStart}
                relation={nodeRelation(node.id)}
                blastStatus={blastRadius && connectedIds.has(node.id) && node.id !== selectedNodeId ? blastRadius.status : null}
                onSelect={handleNodeSelect}
                onContextMenu={handleNodeContextMenu}
                metrics={podMetrics}
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
            positions={resolvedPos}
            offset={offset}
            scale={scale}
            onNavigate={navigateToCanvasPoint}
          />
        </div>
        {selectedNode ? (
          <TopologyDetails
            node={selectedNode}
            copied={copied}
            events={selectedNodeEvents}
            onApply={handleApplyYaml}
            onCopy={handleCopy}
            onOpenLogs={setLogModalNode}
            onClose={() => setSelectedNodeId(null)}
          />
        ) : null}
      </div>
      {logModalNode ? <PodLogsModal node={logModalNode} onClose={() => setLogModalNode(null)} /> : null}
      {showHelp ? (
        <div className="HelpOverlay__backdrop" onMouseDown={() => setShowHelp(false)}>
          <div className="HelpOverlay" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Keyboard Shortcuts</h3>
            <div className="HelpOverlay__grid">
              <kbd>?</kbd><span>Toggle this help</span>
              <kbd>⌘K</kbd><span>Search resources</span>
              <kbd>⌘P</kbd><span>Toggle Problems Only filter</span>
              <kbd>⌘L</kbd><span>Toggle Live mode (auto-refresh)</span>
              <kbd>⌘.</kbd><span>Refresh resources</span>
              <kbd>⌘G</kbd><span>Toggle grid background</span>
              <kbd>−</kbd><span>Zoom out</span>
              <kbd>+</kbd><span>Zoom in</span>
              <kbd>0</kbd><span>Reset zoom &amp; position</span>
              <kbd>Delete</kbd><span>Reset selected node position</span>
              <kbd>Esc</kbd><span>Close / Deselect</span>
              <kbd>Shift+Drag</kbd><span>Multi-select (marquee)</span>
              <kbd>Right-click</kbd><span>Context menu</span>
            </div>
            <button type="button" className="HelpOverlay__close" onClick={() => setShowHelp(false)}>Close</button>
          </div>
        </div>
      ) : null}
      {contextMenu ? (
        <TopologyContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      {confirmRestart ? (() => {
        const isGroup = confirmRestart.kind === "Pods" && confirmRestart.pods?.length;
        const pods = isGroup ? confirmRestart.pods! : [];
        const targetName = isGroup ? restartTarget : confirmRestart.name;
        const targetNamespace = isGroup
          ? (pods.find((p) => getName(p) === restartTarget)
              ? getNamespace(pods.find((p) => getName(p) === restartTarget)!)
              : confirmRestart.namespace)
          : confirmRestart.namespace;

        return (
          <div className="ConfirmDialog__backdrop" onMouseDown={() => { setConfirmRestart(null); setRestartTarget(""); }}>
            <div className="ConfirmDialog" onMouseDown={(e) => e.stopPropagation()}>
              <h3>Restart Pod</h3>
              {isGroup ? (
                <>
                  <p>Select a pod to restart:</p>
                  <select
                    className="ConfirmDialog__select"
                    value={restartTarget}
                    onChange={(e) => setRestartTarget(e.target.value)}
                  >
                    <option value="">-- Select pod --</option>
                    {pods.map((pod) => (
                      <option key={getName(pod)} value={getName(pod)}>{getName(pod)}</option>
                    ))}
                  </select>
                </>
              ) : (
                <p>Are you sure you want to restart <strong>{confirmRestart.name}</strong>?</p>
              )}
              <p className="ConfirmDialog__hint">The pod will be deleted. If managed by a Deployment, it will be recreated automatically.</p>
              <div className="ConfirmDialog__actions">
                <button type="button" onClick={() => { setConfirmRestart(null); setRestartTarget(""); }}>Cancel</button>
                <button type="button" className="is-danger" disabled={!targetName} onClick={() => {
                  setConfirmRestart(null);
                  setRestartTarget("");
                  void (async () => {
                    try {
                      await K8sApi.podsApi.delete({ name: targetName, namespace: targetNamespace });
                      setCopied(`Restarted ${targetName}`);
                      setTimeout(() => setCopied(null), 2000);
                      void loadResources({ silent: true });
                    } catch (err) {
                      setCopied(null);
                      setError(err instanceof Error ? err.message : "Failed to restart pod");
                    }
                  })();
                }}>Restart</button>
              </div>
            </div>
          </div>
        );
      })() : null}
      {statusToasts.length > 0 ? (
        <div className="StatusToasts">
          {statusToasts.map((toast) => (
            <div key={toast.id} className={`StatusToast is-${toast.to}`}>
              <span className={`StatusToast__dot is-${toast.to}`} />
              <strong>{toast.kind}/{toast.name}</strong>
              <span className="StatusToast__change">{toast.from} → {toast.to}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
