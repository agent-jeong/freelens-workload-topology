import React, { useEffect, useMemo, useRef, useState } from "react";
import { Renderer } from "@freelensapp/extensions";
import type { KubeObjectLike, PodLogEntry, PodLogOptions, TopologyNode } from "../../types";
import { getName, getNamespace } from "../../utils/kube";
import { VirtualLogList } from "./VirtualLogList";
import { logLines, logMessageKey, podLogTargets } from "./logParser";

const { K8sApi } = Renderer;

const LOG_BUFFER_LINES = 20000;
const RANGE_LINE_LIMIT_OPTIONS = [100000, 200000, 500000] as const;
const RANGE_FETCH_CONCURRENCY = 3;
const RANGE_LIMIT_BYTES_PER_STREAM = 25 * 1024 * 1024;

type PodLogFetchOptions = PodLogOptions & {
  limitBytes?: number;
  signal?: AbortSignal;
  sinceTime?: string;
};

function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTimeLocal(value: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function trimEntriesToLineLimit(entries: PodLogEntry[], maxLines: number): PodLogEntry[] {
  if (entries.length === 0) {
    return entries;
  }

  const maxPerEntry = Math.max(1, Math.ceil(maxLines / entries.length));

  return entries.map((entry) => {
    const lines = entry.text.split("\n").filter((line) => line.trim().length > 0);

    if (entry.error || lines.length <= maxPerEntry) {
      return entry;
    }

    return { ...entry, text: lines.slice(-maxPerEntry).join("\n") };
  });
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;

      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));

  return results;
}

async function fetchPodLogEntry(pod: KubeObjectLike, containerName: string, options: PodLogFetchOptions): Promise<PodLogEntry> {
  const podName = getName(pod);
  const namespace = getNamespace(pod);

  try {
    const api = K8sApi.podsApi as any;
    const apiBase = api.request?.config?.apiBase ?? "/api-kube";
    const params = new URLSearchParams({
      timestamps: "true",
      previous: String(Boolean(options.previous))
    });

    if (containerName !== "default") {
      params.set("container", containerName);
    }

    if (options.sinceTime) {
      params.set("sinceTime", options.sinceTime);
    } else {
      params.set("tailLines", String(options.tailLines));
    }

    if (options.limitBytes) {
      params.set("limitBytes", String(options.limitBytes));
    }

    const response = await fetch(`${apiBase}/api/v1/namespaces/${namespace}/pods/${podName}/log?${params.toString()}`, {
      signal: options.signal
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(`logs failed (${response.status}): ${text || response.statusText}`);
    }

    const text = await response.text();

    return {
      podName,
      namespace,
      containerName,
      text: text || (options.sinceTime ? "" : "No recent logs.")
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

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
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(() => toDateTimeLocalValue(new Date(Date.now() - 60 * 60 * 1000)));
  const [rangeTo, setRangeTo] = useState(() => toDateTimeLocalValue(new Date()));
  const [rangeActive, setRangeActive] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeBounds, setRangeBounds] = useState<{ fromMs: number; toMs: number; label: string } | null>(null);
  const [appliedRangeResultEdge, setAppliedRangeResultEdge] = useState<"earliest" | "latest">("earliest");
  const [appliedRangeLineLimit, setAppliedRangeLineLimit] = useState<(typeof RANGE_LINE_LIMIT_OPTIONS)[number]>(100000);
  const [rangeResultEdge, setRangeResultEdge] = useState<"earliest" | "latest">("earliest");
  const [rangeLineLimit, setRangeLineLimit] = useState<(typeof RANGE_LINE_LIMIT_OPTIONS)[number]>(100000);
  const [rangeMessage, setRangeMessage] = useState<string | null>(null);
  const logBodyRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastTimestampRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (rangeActive) {
      return;
    }

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
        setEntries(trimEntriesToLineLimit(loadedEntries, LOG_BUFFER_LINES));
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
      setEntries((current) => trimEntriesToLineLimit(current, LOG_BUFFER_LINES));
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
  }, [node.id, tailLines, live, previous, rangeActive]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      return;
    }

    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const parsedLines = useMemo(() => logLines(entries), [entries]);
  const rangeLines = useMemo(() => {
    if (!rangeBounds) {
      return null;
    }

    return parsedLines.filter((line) => {
      if (!line.timestamp) {
        return false;
      }

      const value = new Date(line.timestamp).getTime();

      return Number.isFinite(value) && value >= rangeBounds.fromMs && value <= rangeBounds.toMs;
    });
  }, [parsedLines, rangeBounds]);
  const allLines = useMemo(() => {
    if (!rangeLines) {
      return parsedLines;
    }

    return appliedRangeResultEdge === "latest"
      ? rangeLines.slice(-appliedRangeLineLimit)
      : rangeLines.slice(0, appliedRangeLineLimit);
  }, [parsedLines, rangeLines, appliedRangeResultEdge, appliedRangeLineLimit]);
  const rangeLineCount = rangeLines?.length ?? null;
  const rangeOverflow = Boolean(rangeLineCount !== null && rangeLineCount > appliedRangeLineLimit);
  const rangeHasPendingChanges = Boolean(rangeBounds && (
    rangeResultEdge !== appliedRangeResultEdge ||
    rangeLineLimit !== appliedRangeLineLimit ||
    rangeFrom.replace("T", " ") !== rangeBounds.label.split(" ~ ")[0] ||
    rangeTo.replace("T", " ") !== rangeBounds.label.split(" ~ ")[1]
  ));
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
  }, [query, selectedPods, selectedContainer, selectedSeverities, rangeBounds]);

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

  function cancelRangeLoad() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRangeLoading(false);
    setLoading(false);
    if (!rangeBounds) {
      setRangeActive(false);
    }
    setRangeMessage("Range log request cancelled.");
  }

  function clearRange() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRangeActive(false);
    setRangeLoading(false);
    setRangeBounds(null);
    setRangeMessage(null);
    setLoading(true);
  }

  async function applyRange() {
    const fromDate = parseDateTimeLocal(rangeFrom);
    const toDate = parseDateTimeLocal(rangeTo);

    if (!fromDate || !toDate) {
      setRangeMessage("Enter both From and To date/time values.");
      return;
    }

    if (fromDate.getTime() > toDate.getTime()) {
      setRangeMessage("From must be earlier than To.");
      return;
    }

    if (rangeBounds && fromDate.getTime() === rangeBounds.fromMs && toDate.getTime() === rangeBounds.toMs) {
      setAppliedRangeResultEdge(rangeResultEdge);
      setAppliedRangeLineLimit(rangeLineLimit);
      setRangeMessage(null);
      return;
    }

    const targets = podLogTargets(node);
    const visibleTargets = targets.slice(0, 24);
    const hours = (toDate.getTime() - fromDate.getTime()) / 3600000;

    if (hours > 24) {
      const confirmed = window.confirm(`This range is ${Math.round(hours)} hours across ${visibleTargets.length} stream(s). Kubernetes will return everything after From and the extension will filter To locally. Continue?`);

      if (!confirmed) {
        return;
      }
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRangeActive(true);
    setRangeLoading(true);
    setLoading(true);
    setLive(false);
    setPrevious(false);
    setRangeMessage(`Loading range logs from ${rangeFrom.replace("T", " ")} to ${rangeTo.replace("T", " ")} · ${visibleTargets.length} stream(s).`);
    setLimitMessage(targets.length > visibleTargets.length ? `Showing first ${visibleTargets.length} of ${targets.length} log streams.` : null);
    lastTimestampRef.current = null;

    try {
      const loadedEntries = await mapWithConcurrency(
        visibleTargets,
        RANGE_FETCH_CONCURRENCY,
        ({ pod, containerName }) => fetchPodLogEntry(pod, containerName, {
          tailLines,
          previous: false,
          sinceTime: fromDate.toISOString(),
          limitBytes: RANGE_LIMIT_BYTES_PER_STREAM,
          signal: controller.signal
        })
      );

      if (controller.signal.aborted) {
        return;
      }

      setEntries(loadedEntries);
      setRangeBounds({
        fromMs: fromDate.getTime(),
        toMs: toDate.getTime(),
        label: `${rangeFrom.replace("T", " ")} ~ ${rangeTo.replace("T", " ")}`
      });
      setAppliedRangeResultEdge(rangeResultEdge);
      setAppliedRangeLineLimit(rangeLineLimit);
      setRangeMessage(null);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      setRangeMessage(error instanceof Error ? error.message : "Failed to load range logs.");
    } finally {
      if (!controller.signal.aborted) {
        setRangeLoading(false);
        setLoading(false);
        abortRef.current = null;
      }
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && rangeOpen) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setRangeOpen(false);
        return;
      }

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
  }, [query, matchCount, fullscreen, rangeOpen]);

  useEffect(() => {
    function stopEscForParent(event: KeyboardEvent) {
      if (event.key !== "Escape" || !rangeOpen) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setRangeOpen(false);
    }

    document.addEventListener("keydown", stopEscForParent, true);

    return () => document.removeEventListener("keydown", stopEscForParent, true);
  }, [rangeOpen]);

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
            <select value={tailLines} disabled={rangeActive} onChange={(event) => setTailLines(Number(event.target.value))}>
              <option value={100}>100</option>
              <option value={300}>300</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
            </select>
          </label>
          <button type="button" className={live && !previous && !rangeActive ? "is-active" : ""} disabled={previous || rangeActive} onClick={() => setLive((value) => !value)}>
            Live
          </button>
          <button
            type="button"
            className={autoScroll ? "is-active" : ""}
            disabled={!live || previous || rangeActive}
            onClick={() => setAutoScroll((value) => !value)}
            title="Auto-scroll to latest logs"
          >
            Auto-scroll
          </button>
          <button
            type="button"
            className={previous ? "is-active" : ""}
            disabled={rangeActive}
            onClick={() => {
              setPrevious((value) => !value);
              setLive(false);
            }}
          >
            Previous
          </button>
          <div className="PodLogsModal__rangeFilter">
            <button type="button" className={rangeActive ? "is-active" : ""} onClick={() => setRangeOpen((value) => !value)}>
              Range
            </button>
            {rangeOpen ? (
              <div className="PodLogsModal__rangeMenu">
                <div className="PodLogsModal__rangeHeader">
                  <strong>Date range</strong>
                  <span>{rangeHasPendingChanges ? "Pending changes" : rangeActive ? "Active" : "Inactive"}</span>
                </div>
                <label className="PodLogsModal__rangeField">
                  <span>From</span>
                  <input type="datetime-local" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} />
                </label>
                <label className="PodLogsModal__rangeField">
                  <span>To</span>
                  <input type="datetime-local" value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} />
                </label>
                <div className="PodLogsModal__rangeMode">
                  <span>When capped</span>
                  <div>
                    <button type="button" className={rangeResultEdge === "earliest" ? "is-active" : ""} onClick={() => setRangeResultEdge("earliest")}>Earliest</button>
                    <button type="button" className={rangeResultEdge === "latest" ? "is-active" : ""} onClick={() => setRangeResultEdge("latest")}>Latest</button>
                  </div>
                </div>
                <label className="PodLogsModal__rangeField">
                  <span>Max</span>
                  <select value={rangeLineLimit} disabled={rangeLoading} onChange={(event) => setRangeLineLimit(Number(event.target.value) as (typeof RANGE_LINE_LIMIT_OPTIONS)[number])}>
                    {RANGE_LINE_LIMIT_OPTIONS.map((value) => (
                      <option key={value} value={value}>{value.toLocaleString()}</option>
                    ))}
                  </select>
                </label>
                <div className="PodLogsModal__rangeHint">
                  Kubernetes supports start time only. End time is filtered locally.
                  {rangeLineLimit >= 500000 ? " 500,000 lines may use more memory and slow search/filtering." : ""}
                </div>
                <div className="PodLogsModal__rangeActions">
                  {rangeLoading ? (
                    <button type="button" className="is-danger" onClick={cancelRangeLoad}>Cancel</button>
                  ) : null}
                  {rangeActive ? (
                    <button type="button" onClick={clearRange}>Clear</button>
                  ) : null}
                  <button type="button" disabled={rangeLoading} onClick={() => void applyRange()}>Apply</button>
                </div>
              </div>
            ) : null}
          </div>
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
                {(["error", "warning", "info", "debug", "trace", "unknown"] as const).map((sev) => (
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
        {rangeBounds ? <div className="PodLogsModal__notice">Range {rangeBounds.label} · {(rangeLineCount ?? allLines.length).toLocaleString()} lines in range</div> : null}
        {rangeOverflow ? <div className="PodLogsModal__notice">More than {appliedRangeLineLimit.toLocaleString()} lines matched. Showing {appliedRangeResultEdge} lines.</div> : null}
        {rangeMessage ? <div className="PodLogsModal__notice">{rangeMessage}</div> : null}
        {loading ? (
          <div className="PodLogsModal__state">{rangeLoading ? "Loading range logs..." : "Loading pod logs..."}</div>
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
