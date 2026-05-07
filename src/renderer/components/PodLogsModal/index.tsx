import React, { useEffect, useMemo, useRef, useState } from "react";
import { Renderer } from "@freelensapp/extensions";
import type { KubeObjectLike, PodLogEntry, PodLogOptions, TopologyNode } from "../../types";
import { getName, getNamespace } from "../../utils/kube";
import { VirtualLogList } from "./VirtualLogList";
import { logLines, logMessageKey, podLogTargets } from "./logParser";

const { K8sApi } = Renderer;

async function fetchPodLogEntry(pod: KubeObjectLike, containerName: string, options: PodLogOptions & { sinceTime?: string }): Promise<PodLogEntry> {
  const podName = getName(pod);
  const namespace = getNamespace(pod);

  try {
    const queryOptions: any = {
      container: containerName === "default" ? undefined : containerName,
      timestamps: true,
      previous: options.previous
    };

    if (options.sinceTime) {
      queryOptions.sinceTime = options.sinceTime;
    } else {
      queryOptions.tailLines = options.tailLines;
    }

    const text = await (K8sApi.podsApi as any).getLogs(
      { name: podName, namespace },
      queryOptions
    );

    return {
      podName,
      namespace,
      containerName,
      text: text || (options.sinceTime ? "" : "No recent logs.")
    };
  } catch (error) {
    return {
      podName,
      namespace,
      containerName,
      text: "",
      error: error instanceof Error ? error.message : "Failed to load pod logs."
    };
  }
}

export function PodLogsModal({ node, onClose }: { node: TopologyNode; onClose: () => void }) {
  const [entries, setEntries] = useState<PodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [tailLines, setTailLines] = useState(300);
  const [live, setLive] = useState(true);
  const [previous, setPrevious] = useState(false);
  const [query, setQuery] = useState("");
  const [excludedMessages, setExcludedMessages] = useState<Set<string>>(new Set());
  const [selectedPods, setSelectedPods] = useState<string[]>([]);
  const [podFilterOpen, setPodFilterOpen] = useState(false);
  const [hiddenFilterOpen, setHiddenFilterOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState("all");
  const [selectedSeverities, setSelectedSeverities] = useState<Set<string>>(new Set());
  const [severityFilterOpen, setSeverityFilterOpen] = useState(false);
  const [wrapLogs, setWrapLogs] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const logBodyRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastTimestampRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const targets = podLogTargets(node);
    const visibleTargets = targets.slice(0, 24);

    setLimitMessage(targets.length > visibleTargets.length ? `Showing first ${visibleTargets.length} of ${targets.length} log streams.` : null);
    lastTimestampRef.current = null;

    async function loadLogs(showLoading: boolean) {
      if (showLoading) {
        setLoading(true);
        setEntries([]);
      }

      const loadedEntries = await Promise.all(visibleTargets.map(({ pod, containerName }) => fetchPodLogEntry(pod, containerName, { tailLines, previous })));

      if (!cancelled) {
        setEntries(loadedEntries);
        setLoading(false);

        let latest = "";
        for (const entry of loadedEntries) {
          for (const line of entry.text.split("\n")) {
            const ts = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)\s/)?.[1];
            if (ts && ts > latest) latest = ts;
          }
        }
        if (latest) lastTimestampRef.current = latest;
      }
    }

    async function loadIncremental() {
      const sinceTime = lastTimestampRef.current;
      if (!sinceTime) {
        await loadLogs(false);
        return;
      }

      const newEntries = await Promise.all(visibleTargets.map(({ pod, containerName }) => fetchPodLogEntry(pod, containerName, { tailLines, previous, sinceTime })));

      if (cancelled) return;

      let latest = sinceTime;
      for (const entry of newEntries) {
        for (const line of entry.text.split("\n")) {
          const ts = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)\s/)?.[1];
          if (ts && ts > latest) latest = ts;
        }
      }
      if (latest > sinceTime) lastTimestampRef.current = latest;

      const hasNewData = newEntries.some((entry) => entry.text.trim().length > 0);
      if (!hasNewData) return;

      setEntries((prev) => prev.map((existing, i) => {
        const newEntry = newEntries[i];
        if (!newEntry || !newEntry.text.trim()) return existing;

        const existingLines = existing.text.split("\n");
        const lastExistingLine = existingLines[existingLines.length - 1] || existingLines[existingLines.length - 2] || "";
        const newLines = newEntry.text.split("\n").filter((line) => line.trim() && line > lastExistingLine);

        if (newLines.length === 0) return existing;

        return {
          ...existing,
          text: existing.text + "\n" + newLines.join("\n")
        };
      }));
    }

    void loadLogs(true);

    if (live && !previous) {
      const interval = window.setInterval(() => void loadIncremental(), 3000);

      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [node.id, tailLines, live, previous]);

  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      return;
    }

    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const allLines = useMemo(() => logLines(entries), [entries]);
  const podOptions = useMemo(() => [...new Set(allLines.map((line) => line.podName))].sort(), [allLines]);
  const containerOptions = useMemo(() => [...new Set(allLines.map((line) => line.containerName))].sort(), [allLines]);
  const searchableLines = useMemo(() => allLines.map((line) => ({
    line,
    lower: `${line.message}\t${line.podName}\t${line.containerName}\t${line.timestamp ?? ""}`.toLowerCase(),
  })), [allLines]);

  const filteredLines = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();

    let lines = searchableLines;

    if (excludedMessages.size > 0) {
      lines = lines.filter(({ line }) => !excludedMessages.has(logMessageKey(line)));
    }

    if (selectedPods.length > 0) {
      lines = lines.filter(({ line }) => selectedPods.includes(line.podName));
    }

    if (selectedContainer !== "all") {
      lines = lines.filter(({ line }) => line.containerName === selectedContainer);
    }

    if (selectedSeverities.size > 0) {
      lines = lines.filter(({ line }) => selectedSeverities.has(line.severity));
    }

    if (normalizedQuery) {
      lines = lines.filter(({ lower }) => lower.includes(normalizedQuery));
    }

    return lines.map(({ line }) => line);
  }, [searchableLines, debouncedQuery, selectedPods, selectedContainer, selectedSeverities, excludedMessages]);

  const matchCount = debouncedQuery.trim() ? filteredLines.length : 0;
  const selectedMatchText = matchCount > 0 ? `${selectedMatchIndex + 1} / ${matchCount}` : debouncedQuery.trim() ? "0 / 0" : `${filteredLines.length} lines`;
  const podFilterLabel = selectedPods.length === 0 ? "All pods" : selectedPods.length === 1 ? selectedPods[0] : `${selectedPods.length} pods`;
  const hiddenMessages = useMemo(() => [...excludedMessages].sort(), [excludedMessages]);

  useEffect(() => {
    setSelectedMatchIndex(0);
  }, [query, selectedPods, selectedContainer, selectedSeverities]);

  useEffect(() => {
    if (selectedMatchIndex >= filteredLines.length) {
      setSelectedMatchIndex(Math.max(0, filteredLines.length - 1));
    }
  }, [filteredLines.length, selectedMatchIndex]);

  useEffect(() => {
    if (!live || previous || query.trim() || !autoScroll || !logBodyRef.current) {
      return;
    }

    logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
  }, [filteredLines, live, previous, query, autoScroll]);

  function downloadLogs() {
    const lines = filteredLines.map((line) => line.message);
    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${node.name}_${stamp}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function moveMatch(delta: number) {
    if (matchCount === 0) {
      return;
    }

    setSelectedMatchIndex((current) => (current + delta + matchCount) % matchCount);
  }

  function toggleSelectedPod(podName: string) {
    setSelectedPods((current) => (
      current.includes(podName)
        ? current.filter((selected) => selected !== podName)
        : [...current, podName]
    ));
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && fullscreen) {
        event.preventDefault();
        event.stopPropagation();
        setFullscreen(false);
        return;
      }

      if (!query.trim() || matchCount === 0) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveMatch(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveMatch(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [query, matchCount, fullscreen]);

  return (
    <div className="PodLogsModal__backdrop" onMouseDown={onClose}>
      <section className={`PodLogsModal${fullscreen ? " is-fullscreen" : ""}`} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pod logs">
        <header className="PodLogsModal__header">
          <div>
            <span>Pod logs</span>
            <h3>{node.name}</h3>
          </div>
          <div className="PodLogsModal__headerActions">
            <button type="button" onClick={() => setFullscreen((v) => !v)} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {fullscreen ? "\u29C9" : "\u26F6"}
            </button>
            <button type="button" onClick={onClose} aria-label="Close">&times;</button>
          </div>
        </header>
        <div className="PodLogsModal__toolbar">
          <label>
            <span>Tail</span>
            <select value={tailLines} onChange={(event) => setTailLines(Number(event.target.value))}>
              <option value={100}>100</option>
              <option value={300}>300</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
            </select>
          </label>
          <button type="button" className={live && !previous ? "is-active" : ""} disabled={previous} onClick={() => setLive((value) => !value)}>
            Live
          </button>
          <button
            type="button"
            className={autoScroll ? "is-active" : ""}
            disabled={!live || previous}
            onClick={() => setAutoScroll((value) => !value)}
            title="Auto-scroll to latest logs"
          >
            Auto-scroll
          </button>
          <button
            type="button"
            className={previous ? "is-active" : ""}
            onClick={() => {
              setPrevious((value) => !value);
              setLive(false);
            }}
          >
            Previous
          </button>
          {hiddenMessages.length > 0 ? (
            <div className="PodLogsModal__hiddenFilter">
              <span>Hidden</span>
              <button type="button" className="is-danger" onClick={() => setHiddenFilterOpen((value) => !value)}>
                {hiddenMessages.length} messages
              </button>
              {hiddenFilterOpen ? (
                <div className="PodLogsModal__hiddenMenu">
                  <div className="PodLogsModal__hiddenActions">
                    <button type="button" onClick={() => setExcludedMessages(new Set())}>Clear all</button>
                  </div>
                  {hiddenMessages.map((message) => (
                    <div key={message} className="PodLogsModal__hiddenItem">
                      <span title={message}>{message}</span>
                      <button
                        type="button"
                        aria-label="Remove hidden message"
                        onClick={() => setExcludedMessages((current) => {
                          const next = new Set(current);
                          next.delete(message);
                          return next;
                        })}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="PodLogsModal__podFilter">
            <span>Pod</span>
            <button type="button" onClick={() => setPodFilterOpen((value) => !value)}>{podFilterLabel}</button>
            {podFilterOpen ? (
              <div className="PodLogsModal__podMenu">
                <label>
                  <input type="checkbox" checked={selectedPods.length === 0} onChange={() => setSelectedPods([])} />
                  <span>All pods</span>
                </label>
                {podOptions.map((podName) => (
                  <label key={podName}>
                    <input type="checkbox" checked={selectedPods.includes(podName)} onChange={() => toggleSelectedPod(podName)} />
                    <span title={podName}>{podName}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <label>
            <span>Container</span>
            <select value={selectedContainer} onChange={(event) => setSelectedContainer(event.target.value)}>
              <option value="all">All containers</option>
              {containerOptions.map((containerName) => <option key={containerName} value={containerName}>{containerName}</option>)}
            </select>
          </label>
          <div className="PodLogsModal__severityFilter">
            <span>Log Level</span>
            <button type="button" className={selectedSeverities.size > 0 ? "is-active" : ""} onClick={() => setSeverityFilterOpen((v) => !v)}>
              {selectedSeverities.size === 0 ? "All" : [...selectedSeverities].join(", ")}
            </button>
            {severityFilterOpen ? (
              <div className="PodLogsModal__severityMenu">
                <label>
                  <input type="checkbox" checked={selectedSeverities.size === 0} onChange={() => setSelectedSeverities(new Set())} />
                  <span>All levels</span>
                </label>
                {(["error", "warning", "info", "debug", "unknown"] as const).map((sev) => (
                  <label key={sev}>
                    <input
                      type="checkbox"
                      checked={selectedSeverities.has(sev)}
                      onChange={() => setSelectedSeverities((prev) => {
                        const next = new Set(prev);
                        if (next.has(sev)) next.delete(sev); else next.add(sev);
                        return next;
                      })}
                    />
                    <span>{sev}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={wrapLogs ? "is-active" : ""}
            onClick={() => setWrapLogs((value) => !value)}
          >
            Wrap
          </button>
          <button
            type="button"
            onClick={downloadLogs}
            disabled={filteredLines.length === 0}
            title="Download filtered logs"
          >
            Download
          </button>
          <input
            type="text"
            placeholder="Filter logs..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="PodLogsModal__count">{selectedMatchText}</span>
        </div>
        {limitMessage ? <div className="PodLogsModal__notice">{limitMessage}</div> : null}
        {loading ? (
          <div className="PodLogsModal__state">Loading pod logs...</div>
        ) : allLines.length === 0 ? (
          <div className="PodLogsModal__state">No pod logs available.</div>
        ) : (
          <VirtualLogList
            lines={filteredLines}
            query={query}
            selectedMatchIndex={selectedMatchIndex}
            wrapLogs={wrapLogs}
            logBodyRef={logBodyRef}
            lineRefs={lineRefs}
            onExclude={(line) => setExcludedMessages((prev) => {
              const next = new Set(prev);
              next.add(logMessageKey(line));
              return next;
            })}
          />
        )}
      </section>
    </div>
  );
}
