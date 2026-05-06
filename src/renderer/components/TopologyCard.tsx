import React, { useState, useRef, useMemo } from "react";
import type { TopologyNode, TopologyStatus, PodMetrics } from "../types";
import { getName } from "../utils/kube";
import { formatAge, parseCpu, formatCpu, parseMem, formatMem } from "../utils/format";
import { ResourceIcon } from "./ResourceIcon";

export function buildTooltipRows(node: TopologyNode, metricsMap: Map<string, PodMetrics>): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const spec = node.object?.spec as any;
  const status = node.object?.status as any;
  const metadata = node.object?.metadata as any;

  if (metadata?.creationTimestamp) {
    const days = Math.floor((Date.now() - new Date(metadata.creationTimestamp).getTime()) / 86400000);
    rows.push({ label: "Age", value: `${days}d` });
  }

  if (node.kind === "Pods" && node.pods?.length) {
    const pods = node.pods;
    const running = pods.filter((p) => (p as any).status?.phase === "Running").length;
    const totalRestarts = pods.reduce((sum, p) => {
      const cs = (p as any).status?.containerStatuses;
      return sum + (cs ? cs.reduce((s: number, c: any) => s + (c.restartCount || 0), 0) : 0);
    }, 0);

    rows.push({ label: "Pods", value: `${running}/${pods.length} running` });

    let totalCpuUsage = 0; let totalMemUsage = 0; let hasMetrics = false;

    for (const pod of pods) {
      const m = metricsMap.get(getName(pod));
      if (m) { totalCpuUsage += m.cpu; totalMemUsage += m.memory; hasMetrics = true; }
    }

    if (hasMetrics) {
      rows.push({ label: "CPU Usage", value: formatCpu(totalCpuUsage) });
      rows.push({ label: "Mem Usage", value: formatMem(totalMemUsage) });
    } else {
      let totalCpuReq = 0; let totalMemReq = 0; let hasCpu = false; let hasMem = false;
      for (const pod of pods) {
        for (const c of ((pod as any).spec?.containers ?? [])) {
          const req = c.resources?.requests;
          if (req?.cpu) { totalCpuReq += parseCpu(req.cpu); hasCpu = true; }
          if (req?.memory) { totalMemReq += parseMem(req.memory); hasMem = true; }
        }
      }
      if (hasCpu) rows.push({ label: "CPU Req", value: formatCpu(totalCpuReq) });
      if (hasMem) rows.push({ label: "Mem Req", value: formatMem(totalMemReq) });
    }

    if (totalRestarts > 0) rows.push({ label: "Restarts", value: String(totalRestarts) });
  } else if (node.kind === "Pod") {
    const podIP = status?.podIP;
    const nodeName = spec?.nodeName;
    const image = spec?.containers?.[0]?.image;
    const restarts = status?.containerStatuses?.reduce((s: number, c: any) => s + (c.restartCount || 0), 0) ?? 0;

    if (podIP) rows.push({ label: "IP", value: podIP });
    if (nodeName) rows.push({ label: "Node", value: nodeName });
    if (image) rows.push({ label: "Image", value: image.split("/").pop() ?? image });
    if (restarts > 0) rows.push({ label: "Restarts", value: String(restarts) });

    const m = metricsMap.get(node.name);
    if (m) {
      rows.push({ label: "CPU Usage", value: formatCpu(m.cpu) });
      rows.push({ label: "Mem Usage", value: formatMem(m.memory) });
    } else {
      const containers = spec?.containers ?? [];
      let cpuReq = 0; let memReq = 0; let hasCpu = false; let hasMem = false;
      for (const c of containers) {
        const req = c.resources?.requests;
        if (req?.cpu) { cpuReq += parseCpu(req.cpu); hasCpu = true; }
        if (req?.memory) { memReq += parseMem(req.memory); hasMem = true; }
      }
      if (hasCpu) rows.push({ label: "CPU Req", value: formatCpu(cpuReq) });
      if (hasMem) rows.push({ label: "Mem Req", value: formatMem(memReq) });
    }
  } else if (node.kind === "Deployment") {
    const ready = status?.readyReplicas ?? 0;
    const desired = spec?.replicas ?? 0;
    const image = spec?.template?.spec?.containers?.[0]?.image;

    rows.push({ label: "Replicas", value: `${ready}/${desired}` });
    if (image) rows.push({ label: "Image", value: image.split("/").pop() ?? image });
  } else if (node.kind === "Service") {
    if (spec?.type) rows.push({ label: "Type", value: spec.type });
    if (spec?.clusterIP) rows.push({ label: "ClusterIP", value: spec.clusterIP });
    if (spec?.ports?.length) {
      rows.push({ label: "Ports", value: spec.ports.map((p: any) => `${p.port}/${p.protocol || "TCP"}`).join(", ") });
    }
  } else if (node.kind === "Ingress") {
    const hosts = spec?.rules?.map((r: any) => r.host).filter(Boolean);
    if (hosts?.length) rows.push({ label: "Hosts", value: hosts.join(", ") });
  } else if (node.kind === "CronJob") {
    if (spec?.schedule) rows.push({ label: "Schedule", value: spec.schedule });
    if (spec?.suspend) rows.push({ label: "Suspend", value: "true" });
  }

  return rows;
}

export const TopologyCard = React.memo(function TopologyCard({
  node,
  posX,
  posY,
  selected,
  onDragStart,
  relation,
  onSelect,
  onContextMenu,
  blastStatus,
  metrics
}: {
  node: TopologyNode;
  posX: number;
  posY: number;
  selected: boolean;
  onDragStart: (event: React.MouseEvent, node: TopologyNode) => void;
  relation: "normal" | "connected" | "dimmed";
  onSelect: (nodeId: string) => void;
  onContextMenu: (event: React.MouseEvent, node: TopologyNode) => void;
  blastStatus: TopologyStatus | null;
  metrics: Map<string, PodMetrics>;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const primaryProblem = node.problems?.[0];
  const problemTitle = node.problems?.map((problem) => problem.message).join("\n");
  const tooltipRows = useMemo(() => buildTooltipRows(node, metrics), [node, metrics]);
  const tooltipPods = useMemo(() => {
    if (node.kind !== "Pods" || !node.pods?.length) return null;

    return node.pods.slice(0, 10).map((pod) => {
      const s = (pod as any).status;
      const sp = (pod as any).spec;
      const phase = s?.phase ?? "Unknown";
      const restarts = s?.containerStatuses?.reduce((sum: number, c: any) => sum + (c.restartCount || 0), 0) ?? 0;
      const podName = getName(pod);
      const m = metrics.get(podName);

      let cpu: string; let mem: string;
      if (m) {
        cpu = formatCpu(m.cpu);
        mem = formatMem(m.memory);
      } else {
        let reqCpu = 0; let reqMem = 0; let hasCpu = false; let hasMem = false;
        for (const c of sp?.containers ?? []) {
          const req = c.resources?.requests;
          if (req?.cpu) { reqCpu += parseCpu(req.cpu); hasCpu = true; }
          if (req?.memory) { reqMem += parseMem(req.memory); hasMem = true; }
        }
        cpu = hasCpu ? formatCpu(reqCpu) + " (req)" : "-";
        mem = hasMem ? formatMem(reqMem) + " (req)" : "-";
      }

      return { name: podName, phase, cpu, mem, restarts };
    });
  }, [node, metrics]);

  function handleMouseEnter() {
    hoverTimer.current = setTimeout(() => setHovered(true), 400);
  }

  function handleMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(false);
  }

  return (
    <button
      type="button"
      className={`TopologyCard kind-${node.kind} status-${node.status} relation-${relation}${selected ? " is-selected" : ""}${blastStatus ? ` blast-${blastStatus}` : ""}`}
      style={{ left: posX, top: posY }}
      onClick={() => onSelect(node.id)}
      onMouseDown={(event) => { handleMouseLeave(); onDragStart(event, node); }}
      onContextMenu={(event) => onContextMenu(event, node)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="TopologyCard__header">
        <span className="TopologyCard__icon">
          <ResourceIcon kind={node.kind} />
        </span>
        <span className="TopologyCard__kind">{node.kind}</span>
        {node.object?.metadata?.creationTimestamp ? (
          <span className="TopologyCard__age">{formatAge(node.object.metadata.creationTimestamp)}</span>
        ) : null}
      </div>
      <div className="TopologyCard__name" title={node.name}>{node.name}</div>
      <div className="TopologyCard__meta" title={extraInfoTitle}>
        {node.namespace}
        {extraInfoNode}
      </div>
      <div className="TopologyCard__status">{node.statusText}</div>
      {primaryProblem ? (
        <div className={`TopologyCard__problem is-${primaryProblem.severity}`} title={problemTitle}>
          {primaryProblem.message}
        </div>
      ) : null}
      {hovered && (tooltipRows.length > 0 || tooltipPods) && !selected ? (
        <div className={`TopologyCard__tooltip${tooltipPods ? " is-wide" : ""}`}>
          {tooltipRows.map((row) => (
            <div key={row.label} className="TopologyCard__tooltipRow">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
          {tooltipPods ? (
            <>
              <div className="TopologyCard__tooltipSep" />
              <table className="TopologyCard__tooltipTable">
                <thead>
                  <tr><th>Pod</th><th>Status</th><th>CPU</th><th>Mem</th><th>R</th></tr>
                </thead>
                <tbody>
                  {tooltipPods.map((p) => (
                    <tr key={p.name} className={p.phase !== "Running" ? "is-warn" : ""}>
                      <td title={p.name}>{p.name.length > 28 ? `…${p.name.slice(-27)}` : p.name}</td>
                      <td>{p.phase}</td>
                      <td>{p.cpu}</td>
                      <td>{p.mem}</td>
                      <td>{p.restarts || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {node.pods && node.pods.length > 10 ? (
                <div className="TopologyCard__tooltipMore">+{node.pods.length - 10} more</div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </button>
  );
});
