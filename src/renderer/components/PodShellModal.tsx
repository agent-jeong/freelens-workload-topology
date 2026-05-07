import React, { useState, useRef, useEffect } from "react";
import { Renderer } from "@freelensapp/extensions";
import type { TopologyNode, KubeObjectLike } from "../types";
import { getName, getNamespace } from "../utils/kube";
import { podContainers } from "./PodLogsModal/logParser";

const { K8sApi } = Renderer;

async function execCommand(podName: string, namespace: string, container: string, command: string): Promise<string> {
  const api = K8sApi.podsApi as any;
  const apiBase = api.request?.config?.apiBase ?? "/api-kube";
  const params = new URLSearchParams({
    stdout: "true",
    stderr: "true",
    container,
  });

  const parts = command.trim().split(/\s+/);
  for (const part of parts) {
    params.append("command", part);
  }

  const url = `${apiBase}/api/v1/namespaces/${namespace}/pods/${podName}/exec?${params.toString()}`;

  const response = await fetch(url, { method: "POST" });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`exec failed (${response.status}): ${text}`);
  }

  const text = await response.text();
  return text;
}

export function PodShellModal({ node, onClose }: { node: TopologyNode; onClose: () => void }) {
  const isGroup = node.kind === "Pods" && (node.pods?.length ?? 0) > 0;
  const pods: KubeObjectLike[] = isGroup ? node.pods! : node.object ? [node.object] : [];
  const [selectedPod, setSelectedPod] = useState<string>(isGroup ? "" : getName(pods[0]));
  const [container, setContainer] = useState<string>("");
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<Array<{ cmd: string; output: string; error?: boolean }>>([]);
  const [running, setRunning] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedPodObject = pods.find((p) => getName(p) === selectedPod);
  const containers = selectedPodObject ? podContainers(selectedPodObject) : [];
  const namespace = selectedPodObject ? getNamespace(selectedPodObject) : node.namespace;

  useEffect(() => {
    if (selectedPod && containers.length > 0 && !container) {
      setContainer(containers[0]);
    }
  }, [selectedPod, containers, container]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleExec() {
    if (!command.trim() || !selectedPod || !container) return;

    const cmd = command.trim();
    setCommand("");
    setRunning(true);
    setCmdHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);

    try {
      const output = await execCommand(selectedPod, namespace, container, cmd);
      setHistory((prev) => [...prev, { cmd, output: output || "(no output)" }]);
    } catch (err) {
      setHistory((prev) => [...prev, { cmd, output: err instanceof Error ? err.message : "Command failed", error: true }]);
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      void handleExec();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (cmdHistory.length > 0) {
        const newIndex = historyIndex < cmdHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setCommand(cmdHistory[cmdHistory.length - 1 - newIndex]);
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(cmdHistory[cmdHistory.length - 1 - newIndex]);
      } else {
        setHistoryIndex(-1);
        setCommand("");
      }
    }
  }

  return (
    <div className="PodShellModal__backdrop" onMouseDown={onClose}>
      <div className="PodShellModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="PodShellModal__header">
          <h3>Shell — {node.name}</h3>
          <div className="PodShellModal__controls">
            {isGroup ? (
              <select value={selectedPod} onChange={(e) => { setSelectedPod(e.target.value); setContainer(""); }}>
                <option value="">-- Select pod --</option>
                {pods.map((pod) => (
                  <option key={getName(pod)} value={getName(pod)}>{getName(pod)}</option>
                ))}
              </select>
            ) : null}
            {containers.length > 1 ? (
              <select value={container} onChange={(e) => setContainer(e.target.value)}>
                {containers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : null}
          </div>
          <button type="button" className="PodShellModal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="PodShellModal__output" ref={outputRef}>
          {history.length === 0 ? (
            <div className="PodShellModal__hint">
              Type a command and press Enter to execute.<br />
              Commands run via <code>kubectl exec</code> on the selected pod.
            </div>
          ) : null}
          {history.map((entry, i) => (
            <div key={i} className="PodShellModal__entry">
              <div className="PodShellModal__cmd">$ {entry.cmd}</div>
              <pre className={`PodShellModal__result${entry.error ? " is-error" : ""}`}>{entry.output}</pre>
            </div>
          ))}
          {running ? <div className="PodShellModal__running">Running...</div> : null}
        </div>
        <div className="PodShellModal__input">
          <span className="PodShellModal__prompt">$</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedPod ? "Enter command..." : "Select a pod first"}
            disabled={!selectedPod || !container || running}
          />
        </div>
      </div>
    </div>
  );
}
