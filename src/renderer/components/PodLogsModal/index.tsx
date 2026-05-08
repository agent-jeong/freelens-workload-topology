import React, { useEffect, useMemo, useRef, useState } from "react";
import { Renderer } from "@freelensapp/extensions";
import type { KubeObjectLike, PodLogEntry, PodLogLine, PodLogOptions, TopologyNode } from "../../types";
import { getName, getNamespace } from "../../utils/kube";
import { VirtualLogList } from "./VirtualLogList";
import { logLines, logMessageKey, podLogTargets } from "./logParser";

const { K8sApi } = Renderer;

const LOG_BUFFER_LINES = 20000;
const RANGE_LINE_LIMIT_OPTIONS = [100000, 200000, 500000, 0] as const;
type RangeLineLimit = (typeof RANGE_LINE_LIMIT_OPTIONS)[number];
const LOAD_OLDER_STEPS = [100, 300, 1000, 3000, 10000, 30000, 100000, 200000, 500000] as const;
const LOG_FETCH_CONCURRENCY = 6;
const RANGE_FETCH_CONCURRENCY = 3;
const RANGE_LIMIT_BYTES_PER_STREAM = 25 * 1024 * 1024;
const LOG_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)\s/;

type PodLogFetchOptions = PodLogOptions & {
  limitBytes?: number;
  signal?: AbortSignal;
  sinceTime?: string;
};

type RangeLineResult = {
  count: number;
  lines: PodLogLine[];
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

function lineLimitLabel(value: RangeLineLimit): string {
  return value === 0 ? "No limit" : value.toLocaleString();
}

function nextOlderTail(current: number, maxLines: RangeLineLimit): number | null {
  const steps = maxLines === 0
    ? LOAD_OLDER_STEPS
    : LOAD_OLDER_STEPS.filter((value) => value <= maxLines);

  return steps.find((value) => value > current) ?? null;
}

function tailLinesPerStream(totalTailLines: number, streamCount: number): number {
  return Math.max(1, Math.ceil(totalTailLines / Math.max(streamCount, 1)));
}

function latestTimestampFromText(text: string, initial = ""): string {
  let latest = initial;
  let start = 0;

  while (start < text.length) {
    const end = text.indexOf("\n", start);
    const line = end === -1 ? text.slice(start) : text.slice(start, end);
    const ts = LOG_TIMESTAMP_RE.exec(line)?.[1];

    if (ts && ts > latest) {
      latest = ts;
    }

    if (end === -1) {
      break;
    }

    start = end + 1;
  }

  return latest;
}

function lastLogLine(text: string): string {
  const trimmed = text.trimEnd();
  const index = trimmed.lastIndexOf("\n");

  return index === -1 ? trimmed : trimmed.slice(index + 1);
}

function countNonEmptyLines(text: string): number {
  let count = 0;
  let lineEnd = 0;

  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && text.charCodeAt(index) !== 10) {
      continue;
    }

    if (text.slice(lineEnd, index).trim().length > 0) {
      count += 1;
    }

    lineEnd = index + 1;
  }

  return count;
}

function countEntryLines(entries: PodLogEntry[]): number {
  return entries.reduce((total, entry) => total + (entry.error ? 0 : countNonEmptyLines(entry.text)), 0);
}

function hasPotentialOlderLogs(entries: PodLogEntry[], requestedTailLines?: number): boolean {
  if (typeof requestedTailLines !== "number") {
    return false;
  }

  return entries.some((entry) => !entry.error && countNonEmptyLines(entry.text) >= requestedTailLines);
}

function trimTextToLastNonEmptyLines(text: string, maxLines: number): string {
  let count = 0;
  let lineEnd = text.length;

  for (let index = text.length - 1; index >= -1; index -= 1) {
    if (index !== -1 && text.charCodeAt(index) !== 10) {
      continue;
    }

    const lineStart = index + 1;
    const line = text.slice(lineStart, lineEnd);

    if (line.trim().length > 0) {
      count += 1;

      if (count > maxLines) {
        return text.slice(lineStart);
      }
    }

    lineEnd = index;
  }

  return text;
}

function trimEntriesToLineLimit(entries: PodLogEntry[], maxLines: number): PodLogEntry[] {
  if (entries.length === 0) {
    return entries;
  }

  const baseLimit = Math.floor(maxLines / entries.length);
  const remainder = maxLines % entries.length;

  return entries.map((entry, index) => {
    if (entry.error) {
      return entry;
    }

    const entryLimit = baseLimit + (index < remainder ? 1 : 0);

    if (entryLimit <= 0) {
      return { ...entry, text: "" };
    }

    const trimmed = trimTextToLastNonEmptyLines(entry.text, entryLimit);

    return trimmed === entry.text ? entry : { ...entry, text: trimmed };
  });
}

function collectRangeLines(
  lines: PodLogLine[],
  bounds: { fromMs: number; toMs: number },
  edge: "earliest" | "latest",
  limit: RangeLineLimit
): RangeLineResult {
  let count = 0;

  if (limit === 0) {
    const matched: PodLogLine[] = [];

    for (const line of lines) {
      const value = line.timestampMs;

      if (value !== undefined && value >= bounds.fromMs && value <= bounds.toMs) {
        count += 1;
        matched.push(line);
      }
    }

    return { count, lines: matched };
  }

  if (edge === "earliest") {
    const matched: PodLogLine[] = [];

    for (const line of lines) {
      const value = line.timestampMs;

      if (value !== undefined && value >= bounds.fromMs && value <= bounds.toMs) {
        count += 1;

        if (matched.length < limit) {
          matched.push(line);
        }
      }
    }

    return { count, lines: matched };
  }

  const buffer = new Array<PodLogLine>(limit);
  let cursor = 0;
  let size = 0;

  for (const line of lines) {
    const value = line.timestampMs;

    if (value !== undefined && value >= bounds.fromMs && value <= bounds.toMs) {
      count += 1;
      buffer[cursor] = line;
      cursor = (cursor + 1) % limit;
      size = Math.min(size + 1, limit);
    }
  }

  if (size < limit) {
    return { count, lines: buffer.slice(0, size) };
  }

  return { count, lines: [...buffer.slice(cursor), ...buffer.slice(0, cursor)] };
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
    } else if (typeof options.tailLines === "number") {
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
  const [loadedTailLines, setLoadedTailLines] = useState(300);
  const [tailNoLimit, setTailNoLimit] = useState(false);
  const [olderMessage, setOlderMessage] = useState<string | null>(null);
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [live, setLive] = useState(true);
  const [previous, setPrevious] = useState(false);
  const [query, setQuery] = useState("");
  const [excludedMessages, setExcludedMessages] = useState<Set<string>>(new Set());
  const [selectedPods, setSelectedPods] = useState<string[]>([]);
  const [podFilterOpen, setPodFilterOpen] = useState(false);
  const [hiddenFilterOpen, setHiddenFilterOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState("all");
  const [containerFilterOpen, setContainerFilterOpen] = useState(false);
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
  const [appliedRangeLineLimit, setAppliedRangeLineLimit] = useState<RangeLineLimit>(100000);
  const [rangeResultEdge, setRangeResultEdge] = useState<"earliest" | "latest">("earliest");
  const [rangeLineLimit, setRangeLineLimit] = useState<RangeLineLimit>(100000);
  const [rangeMessage, setRangeMessage] = useState<string | null>(null);
  const logBodyRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastTimestampRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const olderBaselineLineCountRef = useRef<number | null>(null);
  const olderLoadRequestedRef = useRef(false);
  const rangeLineLimitRef = useRef<RangeLineLimit>(rangeLineLimit);
  const [rangeScrollRequest, setRangeScrollRequest] = useState<{ edge: "top" | "bottom"; tick: number } | null>(null);

  useEffect(() => {
    rangeLineLimitRef.current = rangeLineLimit;
  }, [rangeLineLimit]);

  useEffect(() => {
    if (rangeActive) {
      return;
    }

    let cancelled = false;
    const targets = podLogTargets(node);
    const visibleTargets = targets.slice(0, 24);

    setLimitMessage(targets.length > visibleTargets.length ? `Showing first ${visibleTargets.length} of ${targets.length} log streams.` : null);
    lastTimestampRef.current = null;
    const requestedTailLines = tailNoLimit ? undefined : tailLinesPerStream(loadedTailLines, visibleTargets.length);

    async function loadLogs(showLoading: boolean) {
      if (showLoading) {
        setLoading(true);
        setEntries([]);
      }

      const loadedEntries = await mapWithConcurrency(
        visibleTargets,
        LOG_FETCH_CONCURRENCY,
        ({ pod, containerName }) => fetchPodLogEntry(pod, containerName, { tailLines: requestedTailLines, previous })
      );

      if (!cancelled) {
        const currentLineLimit = rangeLineLimitRef.current;
        const maxLoadedLines = currentLineLimit === 0 ? null : Math.min(currentLineLimit, Math.max(LOG_BUFFER_LINES, loadedTailLines));
        const nextEntries = maxLoadedLines ? trimEntriesToLineLimit(loadedEntries, maxLoadedLines) : loadedEntries;
        const isOlderLoad = olderLoadRequestedRef.current;
        const nextLineCount = isOlderLoad ? countEntryLines(nextEntries) : 0;
        const baselineLineCount = olderBaselineLineCountRef.current;
        const canLoadMoreOlder = isOlderLoad ? hasPotentialOlderLogs(loadedEntries, requestedTailLines) : true;

        setEntries(nextEntries);
        setLoading(false);

        if (tailNoLimit) {
          setOlderExhausted(true);
          setOlderMessage("Loaded all available logs.");
        } else if (isOlderLoad && baselineLineCount !== null && nextLineCount <= baselineLineCount) {
          setOlderExhausted(true);
          setOlderMessage("All available logs are already loaded.");
        } else if (isOlderLoad && !canLoadMoreOlder) {
          setOlderExhausted(true);
          setOlderMessage("Loaded all available logs.");
        } else {
          setOlderExhausted(false);
          if (!isOlderLoad) {
            setOlderMessage(null);
          }
        }

        olderBaselineLineCountRef.current = null;
        olderLoadRequestedRef.current = false;

        let latest = "";
        for (const entry of loadedEntries) {
          latest = latestTimestampFromText(entry.text, latest);
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

      const newEntries = await mapWithConcurrency(
        visibleTargets,
        LOG_FETCH_CONCURRENCY,
        ({ pod, containerName }) => fetchPodLogEntry(pod, containerName, { tailLines: requestedTailLines, previous, sinceTime })
      );

      if (cancelled) return;

      let latest = sinceTime;
      for (const entry of newEntries) {
        latest = latestTimestampFromText(entry.text, latest);
      }
      if (latest > sinceTime) lastTimestampRef.current = latest;

      const hasNewData = newEntries.some((entry) => entry.text.trim().length > 0);
      if (!hasNewData) return;

      setEntries((prev) => prev.map((existing, i) => {
        const newEntry = newEntries[i];
        if (!newEntry || !newEntry.text.trim()) return existing;

        const lastExistingLine = lastLogLine(existing.text);
        const newLines = newEntry.text.split("\n").filter((line) => line.trim() && line > lastExistingLine);

        if (newLines.length === 0) return existing;

        return {
          ...existing,
          text: existing.text + "\n" + newLines.join("\n")
        };
      }));
      setEntries((current) => {
        const currentLineLimit = rangeLineLimitRef.current;
        const maxLoadedLines = currentLineLimit === 0 ? null : Math.min(currentLineLimit, Math.max(LOG_BUFFER_LINES, loadedTailLines));
        return maxLoadedLines ? trimEntriesToLineLimit(current, maxLoadedLines) : current;
      });
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
  }, [node.id, loadedTailLines, tailNoLimit, live, previous, rangeActive]);

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
  const rangeResult = useMemo<RangeLineResult | null>(() => {
    if (!rangeBounds) {
      return null;
    }

    return collectRangeLines(parsedLines, rangeBounds, appliedRangeResultEdge, appliedRangeLineLimit);
  }, [parsedLines, rangeBounds, appliedRangeResultEdge, appliedRangeLineLimit]);
  const allLines = useMemo(() => {
    if (!rangeResult) {
      return parsedLines;
    }

    return rangeResult.lines;
  }, [parsedLines, rangeResult]);
  const rangeLineCount = rangeResult?.count ?? null;
  const rangeOverflow = Boolean(appliedRangeLineLimit > 0 && rangeLineCount !== null && rangeLineCount > appliedRangeLineLimit);
  const rangeMaxHasPendingChanges = Boolean(rangeBounds && rangeLineLimit !== appliedRangeLineLimit);
  const rangeHasPendingChanges = Boolean(rangeBounds && (
    rangeResultEdge !== appliedRangeResultEdge ||
    rangeLineLimit !== appliedRangeLineLimit ||
    rangeFrom.replace("T", " ") !== rangeBounds.label.split(" ~ ")[0] ||
    rangeTo.replace("T", " ") !== rangeBounds.label.split(" ~ ")[1]
  ));
  const podOptions = useMemo(() => [...new Set(allLines.map((line) => line.podName))].sort(), [allLines]);
  const containerOptions = useMemo(() => [...new Set(allLines.map((line) => line.containerName))].sort(), [allLines]);

  const filteredLines = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();

    let lines = allLines;

    if (excludedMessages.size > 0) {
      lines = lines.filter((line) => !excludedMessages.has(logMessageKey(line)));
    }

    if (selectedPods.length > 0) {
      lines = lines.filter((line) => selectedPods.includes(line.podName));
    }

    if (selectedContainer !== "all") {
      lines = lines.filter((line) => line.containerName === selectedContainer);
    }

    if (selectedSeverities.size > 0) {
      lines = lines.filter((line) => selectedSeverities.has(line.severity));
    }

    if (normalizedQuery) {
      lines = lines.filter((line) => `${line.message}\t${line.podName}\t${line.containerName}\t${line.timestamp ?? ""}`.toLowerCase().includes(normalizedQuery));
    }

    return lines;
  }, [allLines, debouncedQuery, selectedPods, selectedContainer, selectedSeverities, excludedMessages]);

  const matchCount = debouncedQuery.trim() ? filteredLines.length : 0;
  const selectedMatchText = matchCount > 0 ? `${selectedMatchIndex + 1} / ${matchCount}` : debouncedQuery.trim() ? "0 / 0" : `${filteredLines.length} lines`;
  const podFilterLabel = selectedPods.length === 0 ? "All pods" : selectedPods.length === 1 ? selectedPods[0] : `${selectedPods.length} pods`;
  const containerFilterLabel = selectedContainer === "all" ? "All containers" : selectedContainer;
  const hiddenMessages = useMemo(() => [...excludedMessages].sort(), [excludedMessages]);
  const nextOlderTailLines = nextOlderTail(loadedTailLines, rangeLineLimit);
  const canLoadOlder = !loading && !olderExhausted && !tailNoLimit && Boolean(nextOlderTailLines || rangeLineLimit === 0);

  useEffect(() => {
    setSelectedMatchIndex(0);
  }, [query, selectedPods, selectedContainer, selectedSeverities, rangeBounds, appliedRangeResultEdge, appliedRangeLineLimit]);

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

  function loadOlderLogs() {
    if (rangeActive || loading || olderExhausted) {
      return;
    }

    setLive(false);
    setAutoScroll(false);

    if (nextOlderTailLines) {
      olderBaselineLineCountRef.current = countEntryLines(entries);
      olderLoadRequestedRef.current = true;
      setOlderExhausted(false);
      setTailNoLimit(false);
      setLoadedTailLines(nextOlderTailLines);
      setOlderMessage(`Loading older logs with tail ${nextOlderTailLines.toLocaleString()} / max ${lineLimitLabel(rangeLineLimit)}.`);
      return;
    }

    if (rangeLineLimit === 0 && !tailNoLimit) {
      const confirmed = window.confirm("This may load all available logs from the selected streams and use significant memory. Continue?");

      if (!confirmed) {
        return;
      }

      olderBaselineLineCountRef.current = countEntryLines(entries);
      olderLoadRequestedRef.current = true;
      setOlderExhausted(false);
      setTailNoLimit(true);
      setOlderMessage("Loading all available logs.");
      return;
    }

    setOlderMessage(`Reached max ${lineLimitLabel(rangeLineLimit)}.`);
  }

  function applyMaxLineLimit(nextLimit: RangeLineLimit) {
    setOlderExhausted(false);
    setRangeLineLimit(nextLimit);

    if (rangeActive || nextLimit === 0) {
      return;
    }

    setEntries((current) => {
      const maxLoadedLines = Math.min(nextLimit, Math.max(LOG_BUFFER_LINES, loadedTailLines));

      return trimEntriesToLineLimit(current, maxLoadedLines);
    });

    if (loadedTailLines > nextLimit) {
      setLoadedTailLines(nextLimit);
    }
  }

  function rangeEdgeButtonClass(edge: "earliest" | "latest") {
    if (rangeResultEdge !== edge) {
      return "";
    }

    return rangeBounds && rangeResultEdge !== appliedRangeResultEdge ? "is-pending" : "is-active";
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
      setRangeScrollRequest({ edge: rangeResultEdge === "latest" ? "bottom" : "top", tick: Date.now() });
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
      setRangeScrollRequest({ edge: rangeResultEdge === "latest" ? "bottom" : "top", tick: Date.now() });
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
            <select value={tailLines} disabled={rangeActive} onChange={(event) => {
              const nextTail = Number(event.target.value);
              setTailNoLimit(false);
              setOlderExhausted(false);
              setTailLines(nextTail);
              setLoadedTailLines(nextTail);
              setOlderMessage(null);
            }}>
              <option value={100}>100</option>
              <option value={300}>300</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
            </select>
          </label>
          <label className={`PodLogsModal__maxControl${rangeMaxHasPendingChanges ? " is-pending" : ""}`} title="Maximum lines kept for range results and older log loading">
            <span>Max</span>
            <select value={rangeLineLimit} disabled={rangeLoading} onChange={(event) => {
              applyMaxLineLimit(Number(event.target.value) as RangeLineLimit);
            }}>
              {RANGE_LINE_LIMIT_OPTIONS.map((value) => (
                <option key={value} value={value}>{lineLimitLabel(value)}</option>
              ))}
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
                    <button type="button" className={rangeEdgeButtonClass("earliest")} onClick={() => setRangeResultEdge("earliest")}>Earliest</button>
                    <button type="button" className={rangeEdgeButtonClass("latest")} onClick={() => setRangeResultEdge("latest")}>Latest</button>
                  </div>
                </div>
                <div className="PodLogsModal__rangeHint">
                  Kubernetes supports start time only. End time is filtered locally. Max is set in the log toolbar.
                  {rangeLineLimit === 0 ? " No limit may use significant memory and slow search/filtering." : rangeLineLimit >= 500000 ? " 500,000 lines may use more memory and slow search/filtering." : ""}
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
          <div className="PodLogsModal__containerFilter">
            <span>Container</span>
            <button type="button" title={containerFilterLabel} onClick={() => setContainerFilterOpen((value) => !value)}>{containerFilterLabel}</button>
            {containerFilterOpen ? (
              <div className="PodLogsModal__containerMenu">
                <button
                  type="button"
                  className={selectedContainer === "all" ? "is-selected" : ""}
                  onClick={() => {
                    setSelectedContainer("all");
                    setContainerFilterOpen(false);
                  }}
                >
                  All containers
                </button>
                {containerOptions.map((containerName) => (
                  <button
                    key={containerName}
                    type="button"
                    className={selectedContainer === containerName ? "is-selected" : ""}
                    title={containerName}
                    onClick={() => {
                      setSelectedContainer(containerName);
                      setContainerFilterOpen(false);
                    }}
                  >
                    {containerName}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
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
        {!rangeActive ? (
          <div className="PodLogsModal__olderBar">
            <button type="button" disabled={!canLoadOlder} onClick={loadOlderLogs}>
              {olderExhausted || tailNoLimit ? "All available logs loaded" : nextOlderTailLines ? "Load older logs" : rangeLineLimit === 0 ? "Load all available logs" : "Reached max lines"}
            </button>
            <span>Loaded {tailNoLimit ? "All available" : loadedTailLines.toLocaleString()} / Max {lineLimitLabel(rangeLineLimit)}</span>
          </div>
        ) : null}
        {olderMessage && !rangeActive ? <div className="PodLogsModal__notice">{olderMessage}</div> : null}
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
            scrollRequest={rangeScrollRequest}
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
