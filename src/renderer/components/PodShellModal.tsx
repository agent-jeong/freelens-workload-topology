import React, { useState, useEffect } from "react";
import type { TopologyNode, KubeObjectLike } from "../types";
import { getName, getNamespace } from "../utils/kube";
import { podContainers } from "./PodLogsModal/logParser";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function shellCommand(namespace: string, podName: string, container: string): string {
  return [
    "kubectl",
    "exec",
    "-i",
    "-t",
    "-n",
    shellQuote(namespace),
    shellQuote(podName),
    "-c",
    shellQuote(container),
    "--",
    "sh",
    "-c",
    shellQuote("clear; (bash || ash || sh)"),
  ].join(" ");
}

async function copyText(value: string): Promise<void> {
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

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export function PodShellModal({ node, onClose }: { node: TopologyNode; onClose: () => void }) {
  const isGroup = node.kind === "Pods" && (node.pods?.length ?? 0) > 0;
  const pods: KubeObjectLike[] = isGroup ? node.pods! : node.object ? [node.object] : [];
  const [selectedPod, setSelectedPod] = useState<string>(isGroup ? "" : getName(pods[0]));
  const [container, setContainer] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const selectedPodObject = pods.find((p) => getName(p) === selectedPod);
  const containers = selectedPodObject ? podContainers(selectedPodObject) : [];
  const namespace = selectedPodObject ? getNamespace(selectedPodObject) : node.namespace;
  const canCopy = Boolean(selectedPod && container);
  const command = canCopy ? shellCommand(namespace, selectedPod, container) : "";

  useEffect(() => {
    if (selectedPod && containers.length > 0 && !container) {
      setContainer(containers[0]);
    }
  }, [selectedPod, containers, container]);

  useEffect(() => {
    setCopied(false);
    setCopyError("");
  }, [selectedPod, container]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  async function copyCommand() {
    if (!canCopy) return;

    try {
      await copyText(command);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopied(false);
      setCopyError("Copy failed. Select the command text manually.");
    }
  }

  function handlePodChange(value: string) {
    setSelectedPod(value);
    setContainer("");
  }

  return (
    <div className="PodShellModal__backdrop" onMouseDown={onClose}>
      <div className="PodShellModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="PodShellModal__header">
          <h3>Shell command — {node.name}</h3>
          <div className="PodShellModal__controls">
            {isGroup ? (
              <select value={selectedPod} onChange={(e) => handlePodChange(e.target.value)}>
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
        <div className="PodShellModal__body">
          <div className="PodShellModal__summary">
            <div>
              <span>Namespace</span>
              <strong>{namespace || "-"}</strong>
            </div>
            <div>
              <span>Pod</span>
              <strong>{selectedPod || "Select a pod"}</strong>
            </div>
            <div>
              <span>Container</span>
              <strong>{container || "Select a container"}</strong>
            </div>
          </div>

          <div className="PodShellModal__hint">
            Copy a command and run it in your local terminal where <code>kubectl</code> is configured for this cluster.
          </div>
          {copyError ? <div className="PodShellModal__copyError">{copyError}</div> : null}

          <div className="PodShellModal__commandBlock">
            <div className="PodShellModal__commandHeader">
              <span>Terminal command</span>
              <button type="button" disabled={!canCopy} onClick={() => void copyCommand()}>
                {copied ? "Copied" : "Copy command"}
              </button>
            </div>
            <pre>{command || "Select a pod and container first."}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
