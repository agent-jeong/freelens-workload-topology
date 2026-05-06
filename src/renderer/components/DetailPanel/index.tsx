import React, { useEffect, useMemo, useRef, useState } from "react";
import type { KubeEventLike, TopologyNode } from "../../types";
import { objectForCopy, stringifyObject } from "../../utils/kube";
import { stringifyYaml, yamlDiff, yamlWarnings } from "../../utils/yaml";
import { jsonMeaningRows } from "../../utils/json";
import { scheduleWithDescription } from "../../utils/cron";
import { buildAiAnalysisPrompt } from "../../utils/ai";
import { causeHintsForEvents } from "../../topology/problems";
import { DetailRow, ActionRow } from "./DetailRow";
import { EventList } from "./EventList";
import { JsonTree } from "./JsonTree";
import { JsonMeaningModal } from "./JsonMeaningModal";
import { CodeEditorWithLines, DiffWithLines } from "./CodeEditor";

export function TopologyDetails({
  node,
  copied,
  events,
  onApply,
  onCopy,
  onOpenLogs,
  onClose
}: {
  node: TopologyNode | undefined;
  copied: string | null;
  events: KubeEventLike[];
  onApply: (node: TopologyNode, yamlText: string) => Promise<void>;
  onCopy: (label: string, value: string) => void | Promise<void>;
  onOpenLogs: (node: TopologyNode) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"inspect" | "json" | "yaml" | "events">("inspect");
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
  const json = useMemo(() => stringifyObject(activeNode.object), [activeNode.id]);
  const jsonObject = useMemo(() => objectForCopy(activeNode.object), [activeNode.id]);
  const yaml = useMemo(() => stringifyYaml(activeNode.object), [activeNode.id]);
  const diff = useMemo(() => yamlDiff(yaml, yamlText), [yaml, yamlText]);
  const warnings = useMemo(() => yamlWarnings(activeNode, yamlText), [activeNode.id, yamlText]);
  const yamlChanged = yamlText !== yaml;
  const apiVersion = (jsonObject as any)?.apiVersion;
  const jsonMeanings = useMemo(() => jsonMeaningRows(activeNode.kind, jsonObject), [activeNode.id]);
  const causeHints = useMemo(() => causeHintsForEvents(events), [events]);
  const detailRows: React.ReactNode[] = [
    <DetailRow key="name" label="Name" value={node.name} onCopy={() => onCopy("name", node.name)} />,
    <DetailRow key="namespace" label="Namespace" value={node.namespace} onCopy={() => onCopy("namespace", node.namespace)} />
  ];

  if (apiVersion) {
    detailRows.push(<DetailRow key="apiVersion" label="apiVersion" value={String(apiVersion)} onCopy={() => onCopy("apiVersion", String(apiVersion))} />);
  }

  if (node.pods?.length) {
    detailRows.push(
      <ActionRow
        key="logs"
        label="Logs"
        value={node.pods.length > 1 ? `Open ${node.pods.length} pod logs` : "Open pod logs"}
        onClick={() => onOpenLogs(node)}
      />
    );
  }

  {
    const spec = activeNode.object?.spec as any;
    const status = activeNode.object?.status as any;
    const metadata = activeNode.object?.metadata as any;

    if (metadata?.creationTimestamp) {
      const ageInfo = Math.floor((Date.now() - new Date(metadata.creationTimestamp).getTime()) / (1000 * 60 * 60 * 24));
      detailRows.push(<DetailRow key="age" label="Age" value={`${ageInfo} days`} />);
    }

    if (metadata?.labels) {
      const labelsCount = Object.keys(metadata.labels).length;
      const topLabels = Object.entries(metadata.labels).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(", ");
      const labelsStr = labelsCount > 3 ? `${topLabels} (+${labelsCount - 3})` : topLabels;
      detailRows.push(<DetailRow key="labels" label="Labels" value={labelsStr} onCopy={() => onCopy("labels", Object.entries(metadata.labels).map(([k, v]) => `${k}=${v}`).join("\n"))} />);
    }

    if (activeNode.kind === "Pod") {
      const nodeName = spec?.nodeName;
      const podIP = status?.podIP;
      const images = spec?.containers?.map((container: any) => container.image).join(", ");
      const restarts = status?.containerStatuses?.reduce((acc: number, containerStatus: any) => acc + (containerStatus.restartCount || 0), 0);

      if (nodeName) detailRows.push(<DetailRow key="node" label="Node" value={nodeName} onCopy={() => onCopy("node", nodeName)} />);
      if (podIP) detailRows.push(<DetailRow key="ip" label="Pod IP" value={podIP} onCopy={() => onCopy("ip", podIP)} />);
      if (images) detailRows.push(<DetailRow key="image" label="Image" value={images} onCopy={() => onCopy("image", images)} />);
      if (restarts > 0) detailRows.push(<DetailRow key="restarts" label="Restarts" value={String(restarts)} />);
    } else if (activeNode.kind === "Deployment") {
      const images = spec?.template?.spec?.containers?.map((container: any) => container.image).join(", ");
      const ready = status?.readyReplicas || 0;
      const replicas = spec?.replicas || 0;

      if (images) detailRows.push(<DetailRow key="image" label="Image" value={images} onCopy={() => onCopy("image", images)} />);
      detailRows.push(<DetailRow key="replicas" label="Replicas" value={`${ready} / ${replicas}`} />);
    } else if (activeNode.kind === "Service") {
      const type = spec?.type;
      const clusterIP = spec?.clusterIP;
      const ports = spec?.ports?.map((port: any) => `${port.port}${port.nodePort ? `:${port.nodePort}` : ""}/${port.protocol || "TCP"}`).join(", ");
      const externalIP = type === "LoadBalancer"
        ? status?.loadBalancer?.ingress?.map((e: any) => e.ip || e.hostname).filter(Boolean).join(", ")
        : undefined;

      if (type) detailRows.push(<DetailRow key="type" label="Type" value={type} />);
      if (externalIP) detailRows.push(<DetailRow key="externalIP" label="External IP" value={externalIP} onCopy={() => onCopy("external ip", externalIP)} />);
      if (clusterIP) detailRows.push(<DetailRow key="clusterIP" label="Cluster IP" value={clusterIP} onCopy={() => onCopy("cluster ip", clusterIP)} />);
      if (ports) detailRows.push(<DetailRow key="ports" label="Ports" value={ports} onCopy={() => onCopy("ports", ports)} />);
    } else if (activeNode.kind === "Ingress") {
      const hosts = spec?.rules?.map((rule: any) => rule.host).filter(Boolean).join(", ");
      const endpoints = status?.loadBalancer?.ingress?.map((ingress: any) => ingress.ip || ingress.hostname).filter(Boolean).join(", ");

      if (hosts) detailRows.push(<DetailRow key="hosts" label="Hosts" value={hosts} onCopy={() => onCopy("hosts", hosts)} />);
      if (endpoints) detailRows.push(<DetailRow key="endpoints" label="Endpoint IP" value={endpoints} onCopy={() => onCopy("endpoints", endpoints)} />);
    } else if (activeNode.kind === "CronJob") {
      if (spec?.schedule) detailRows.push(<DetailRow key="schedule" label="Schedule" value={scheduleWithDescription(spec.schedule, spec.timeZone)} />);
      if (spec?.suspend !== undefined) detailRows.push(<DetailRow key="suspend" label="Suspend" value={String(spec.suspend)} />);
    }
  }


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

  async function copyAiAnalysisPrompt() {
    setApplyMessage(null);
    setApplyError(null);

    try {
      await onCopy("AI analysis prompt", buildAiAnalysisPrompt(activeNode, events, causeHints));
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Failed to copy AI analysis prompt.");
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

      <div className="TopologyDetails__tabs">
        <button type="button" className={mode === "inspect" ? "is-active" : ""} onClick={() => setMode("inspect")}>Inspect</button>
        <button type="button" className={mode === "json" ? "is-active" : ""} onClick={() => setMode("json")}>JSON</button>
        <button type="button" className={mode === "yaml" ? "is-active" : ""} onClick={() => setMode("yaml")}>YAML</button>
        <button type="button" className={mode === "events" ? "is-active" : ""} onClick={() => setMode("events")}>Events</button>
      </div>

      {mode === "inspect" ? (
        <div className="TopologyDetails__inspect">
          {node.problems?.length ? (
            <section className="TopologyDetails__problems">
              <div className="TopologyDetails__sectionTitle">Problem Summary</div>
              {node.problems.map((problem) => (
                <div key={`${problem.severity}:${problem.message}`} className={`TopologyDetails__problem is-${problem.severity}`}>
                  {problem.message}
                </div>
              ))}
            </section>
          ) : null}

          {causeHints.length > 0 ? (
            <section className="TopologyDetails__causeHints">
              <div className="TopologyDetails__sectionTitle">Likely Cause</div>
              {causeHints.map((hint) => (
                <div key={hint.reason} className="TopologyDetails__causeHint">
                  <strong>{hint.reason}</strong>
                  <span>{hint.message}</span>
                </div>
              ))}
            </section>
          ) : null}

          <div className="TopologyDetails__info">
            {detailRows}
          </div>

          <section className="TopologyDetails__events TopologyDetails__events--preview">
            <div className="TopologyDetails__sectionTitle">
              Recent Events
              <span>{events.length}</span>
            </div>
            <EventList events={events} limit={3} />
          </section>
        </div>
      ) : mode === "json" ? (
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
      ) : mode === "yaml" ? (
        <div className="TopologyDetails__yamlView">
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
        </div>
      ) : (
        <section className="TopologyDetails__events TopologyDetails__events--full">
          <div className="TopologyDetails__sectionTitle">
            Events
            <span>{events.length}</span>
          </div>
          <EventList events={events} />
        </section>
      )}
    </aside>
  );
}
