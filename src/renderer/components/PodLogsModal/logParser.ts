import type { KubeObjectLike, PodLogEntry, PodLogLine, TopologyNode } from "../../types";

export function podContainers(pod: KubeObjectLike): string[] {
  const containers = [
    ...(pod.spec?.initContainers ?? []),
    ...(pod.spec?.containers ?? []),
    ...(pod.spec?.ephemeralContainers ?? [])
  ];
  const names = containers.map((container: any) => container?.name).filter((name: unknown): name is string => typeof name === "string" && name.length > 0);

  return names.length > 0 ? names : ["default"];
}

export function podLogTargets(node: TopologyNode): Array<{ pod: KubeObjectLike; containerName: string }> {
  const pods = node.pods ?? (node.kind === "Pod" ? [node.object] : []);

  return pods.flatMap((pod) => podContainers(pod).map((containerName) => ({ pod, containerName })));
}

export function splitLogLine(line: string): { timestamp?: string; message: string } {
  // eslint-disable-next-line no-control-regex
  const plainLine = line.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
  const leadingTimestampMatch = plainLine.match(/^(\d{4}[-/]\d{2}[-/]\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)\s+(.*)$/);

  if (leadingTimestampMatch) {
    return { timestamp: leadingTimestampMatch[1], message: leadingTimestampMatch[2].trim() };
  }

  const match = plainLine.match(/^(.*?)(\d{4}[-/]\d{2}[-/]\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)(.*)$/);

  if (match && match[1].length < 120 && match[2].length > 8) {
    return { timestamp: match[2], message: (match[1] + match[3]).trim() };
  }

  return { message: plainLine };
}

export function detectLogSeverity(value: string): PodLogLine["severity"] {
  const normalized = value.toLowerCase();

  if (/\b(fatal|panic|error|exception|failed|failure|timeout|oomkilled|crashloop|stacktrace|err)\b/.test(normalized) || /\b(e|err)\b\s*[:\]]/.test(normalized)) {
    return "error";
  }

  if (/\b(warn|warning|retry|throttle|degraded|unhealthy)\b/.test(normalized) || /\b(w|warn)\b\s*[:\]]/.test(normalized)) {
    return "warning";
  }

  if (/\b(trace)\b/.test(normalized) || /\b(trce)\b\s*[:\]]/.test(normalized)) {
    return "trace";
  }

  if (/\b(debug|verbose)\b/.test(normalized) || /\b(d|dbug)\b\s*[:\]]/.test(normalized)) {
    return "debug";
  }

  if (/\b(info|notice|started|listening|ready|success|completed)\b/.test(normalized) || /\b(i|info)\b\s*[:\]]/.test(normalized)) {
    return "info";
  }

  return "unknown";
}

export function severityFromLevel(level: unknown): PodLogLine["severity"] {
  if (typeof level !== "string") {
    return "unknown";
  }

  const normalized = level.toLowerCase();

  if (normalized === "error" || normalized === "err" || normalized === "fatal") {
    return "error";
  }

  if (normalized === "warn" || normalized === "warning") {
    return "warning";
  }

  if (normalized === "trace") {
    return "trace";
  }

  if (normalized === "debug") {
    return "debug";
  }

  if (normalized === "info" || normalized === "notice") {
    return "info";
  }

  return "unknown";
}

export function shortLoggerName(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) {
    return undefined;
  }

  return value.split(".").filter(Boolean).pop() ?? value;
}

export function timestampFromJsonLog(value: any): string | undefined {
  const timestamp = value["@timestamp"] ?? value.timestamp ?? value.time ?? value.datetime ?? value.date ?? value.ts ?? value.timeMillis ?? value.t ?? value.log?.time ?? value.log?.timestamp ?? value.log?.date ?? value.metadata?.timestamp ?? value.metadata?.time ?? value.Time ?? value.Date ?? value.TIMESTAMP;

  if (typeof timestamp === "string" && timestamp) {
    return timestamp;
  }

  if (typeof timestamp === "number") {
    if (timestamp > 1e11) {
      return new Date(timestamp).toISOString();
    }

    return new Date(timestamp * 1000).toISOString();
  }

  const instant = value.instant;
  const epochSecond = instant?.epochSecond;
  const nanoOfSecond = instant?.nanoOfSecond;

  if (Number.isFinite(epochSecond)) {
    const datePrefix = new Date(Number(epochSecond) * 1000).toISOString().split(".")[0];
    const nano = Number.isFinite(nanoOfSecond) ? String(Number(nanoOfSecond)).padStart(9, "0") : "000000000";

    return `${datePrefix}.${nano}Z`;
  }

  return undefined;
}

export function compactJsonLogValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  if (typeof value === "string") {
    return value.replace(/\s*\n\s*/g, " / ");
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);

    return keys.length === 0 ? "{}" : `{${keys.join(", ")}}`;
  }

  return String(value);
}

export function wrappedJsonLogField(label: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "string" && value.includes("\n")) {
    return `  ${label}:\n${value.split("\n").map((line) => `    ${line}`).join("\n")}`;
  }

  return `  ${label}: ${compactJsonLogValue(value)}`;
}

export function parseJsonLogMessage(value: string): { displayMessage: string; wrappedDisplayMessage: string; severity: PodLogLine["severity"]; timestamp?: string } | undefined {
  const trimmed = value.trim();

  let parsed: any = null;
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {}
  }

  if (parsed) {
    const level = parsed.level ?? parsed.severity ?? parsed.log?.level;
    const severity = severityFromLevel(level);
    const logger = shortLoggerName(parsed.loggerName ?? parsed.logger ?? parsed.log?.logger);
    const message = String(parsed.message ?? parsed.msg ?? parsed.log ?? trimmed);
    const name = logger ? `[${logger}] ` : "";
    const traceId = parsed.traceId ?? parsed.trace_id ?? parsed.contextMap?.traceId ?? parsed.contextMap?.trace_id ?? parsed.mdc?.traceId ?? parsed.mdc?.trace_id;
    const tracePrefix = traceId ? `[Trace: ${traceId}] ` : "";

    return {
      displayMessage: `${name}${tracePrefix}${compactJsonLogValue(message)}`,
      wrappedDisplayMessage: `${name}${tracePrefix}${message}`,
      severity,
      timestamp: timestampFromJsonLog(parsed)
    };
  }

  const isJsonLike = trimmed.startsWith("{") || trimmed.includes('":"');
  if (isJsonLike) {
    const stackTraceMatch = trimmed.match(/(?:(?:\{"class":\s*")|^)([^"]+)",\s*"method":\s*"([^"]+)",\s*"file":\s*"([^"]+)",\s*"line":\s*(\d+)/);
    if (stackTraceMatch) {
      const className = stackTraceMatch[1].startsWith("{") ? stackTraceMatch[1].replace(/\{"class":"/, "") : stackTraceMatch[1];
      const trace = `  at ${className}.${stackTraceMatch[2]}(${stackTraceMatch[3]}:${stackTraceMatch[4]})`;

      return {
        displayMessage: trace,
        wrappedDisplayMessage: trace,
        severity: "unknown",
        timestamp: undefined
      };
    }

    const levelMatch = trimmed.match(/"(?:level|severity)"\s*:\s*"([^"]+)"/i);
    const nameMatch = trimmed.match(/"(?:loggerName|logger|name)"\s*:\s*"([^"]+)"/i);
    const msgMatch = trimmed.match(/"(?:message|msg|log)"\s*:\s*"((?:\\"|[^"])*)"/i);
    const timeMatch = trimmed.match(/"(?:@timestamp|timestamp|time|datetime|date|ts)"\s*:\s*(?:"([^"]+)"|(\d+))/i);

    if (levelMatch || nameMatch || msgMatch) {
      const severity = severityFromLevel(levelMatch ? levelMatch[1] : undefined);
      const logger = shortLoggerName(nameMatch ? nameMatch[1] : undefined);
      const rawMessage = msgMatch ? msgMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, "\"") : trimmed;
      const name = logger ? `[${logger}] ` : "";

      let timestamp = timeMatch ? (timeMatch[1] ?? timeMatch[2]) : undefined;
      if (timestamp && /^\d+$/.test(timestamp)) {
        const num = Number(timestamp);
        timestamp = new Date(num > 1e11 ? num : num * 1000).toISOString();
      }

      return {
        displayMessage: `${name}${compactJsonLogValue(rawMessage)}`,
        wrappedDisplayMessage: `${name}${rawMessage}`,
        severity,
        timestamp
      };
    }
  }

  return undefined;
}

export function stripPlainLogPrefix(value: string): string {
  const withoutTimestamp = value.replace(/^\d{4}[-/]\d{2}[-/]\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\s+/, "");
  const springBootMatch = withoutTimestamp.match(/^(?:ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\s+\d+\s+---\s+(.*)$/i);

  if (springBootMatch) {
    return springBootMatch[1];
  }

  const springTraceMatch = withoutTimestamp.match(/^(?:ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\s+(.*)$/i);

  if (springTraceMatch) {
    return springTraceMatch[1];
  }

  return withoutTimestamp;
}

export function compactLogMessage(value: string): string {
  const normalized = stripPlainLogPrefix(value);

  if (normalized !== value) {
    return normalized;
  }

  const match = normalized.match(/^\[[^\]]+\]\s+\[\s*(?:ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\s*\]\s+([^\s(]+)(?:\([^)]*\))?\s+-\s*(.*)$/i);

  if (!match) {
    return normalized;
  }

  return `${match[1]} - ${match[2]}`;
}

export function wrappedLogMessage(value: string): string {
  const normalized = stripPlainLogPrefix(value);

  if (normalized !== value) {
    return normalized;
  }

  const match = normalized.match(/^\[[^\]]+\]\s+\[\s*(?:ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\s*\]\s+(.+?\([^)]*\))\s+-\s*(.*)$/i);

  if (!match) {
    return compactLogMessage(normalized);
  }

  return `${match[1]} - ${match[2]}`;
}

export function parsedLogDisplay(value: string): Pick<PodLogLine, "displayMessage" | "wrappedDisplayMessage" | "severity" | "timestamp"> {
  const jsonLog = parseJsonLogMessage(value);

  if (jsonLog) {
    return jsonLog;
  }

  return {
    displayMessage: compactLogMessage(value),
    wrappedDisplayMessage: wrappedLogMessage(value),
    severity: detectLogSeverity(value)
  };
}

function timestampMsFromValue(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.includes(" ") && !value.includes("T")
    ? value.replace(" ", "T")
    : value;
  const ms = Date.parse(normalized);

  return Number.isFinite(ms) ? ms : undefined;
}

export function logLines(entries: PodLogEntry[]): PodLogLine[] {
  let order = 0;
  const lines: Array<PodLogLine & { order: number }> = entries.flatMap((entry, sourceIndex): Array<PodLogLine & { order: number }> => {
    if (entry.error) {
      return [{
        id: `${entry.namespace}:${entry.podName}:${entry.containerName}:error`,
        podName: entry.podName,
        containerName: entry.containerName,
        sourceIndex,
        timestamp: undefined,
        timestampMs: undefined,
        message: entry.error,
        displayMessage: entry.error,
        wrappedDisplayMessage: entry.error,
        severity: "error",
        error: true,
        order: order++
      }];
    }

    return entry.text.split("\n").filter((line) => line.trim().length > 0).map((line, lineIndex) => {
      const parsed = splitLogLine(line);
      const display = parsedLogDisplay(parsed.message);

      let timestamp = parsed.timestamp ?? display.timestamp;

      if (!timestamp) {
        const fallbackMatch = parsed.message.match(/^(\d{4}[-/]\d{2}[-/]\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)/);
        if (fallbackMatch) {
          timestamp = fallbackMatch[1];
        }
      }

      return {
        id: `${entry.namespace}:${entry.podName}:${entry.containerName}:${lineIndex}`,
        podName: entry.podName,
        containerName: entry.containerName,
        sourceIndex,
        timestamp,
        timestampMs: timestampMsFromValue(timestamp),
        message: parsed.message,
        displayMessage: display.displayMessage,
        wrappedDisplayMessage: display.wrappedDisplayMessage,
        severity: display.severity === "unknown" ? detectLogSeverity(parsed.message) : display.severity,
        order: order++
      };
    });
  });

  return lines.sort((a, b) => {
    if (a.timestampMs !== undefined && b.timestampMs !== undefined && a.timestampMs !== b.timestampMs) {
      return a.timestampMs - b.timestampMs;
    }

    if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) {
      return a.timestamp.localeCompare(b.timestamp);
    }

    return a.order - b.order;
  }).map(({ order: _order, ...line }) => line);
}

export function cleanLogMessage(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1F\x7F-\x9F]/g, "").replace(/\s+/g, " ").trim();
}

export function logMessageKey(line: Pick<PodLogLine, "displayMessage" | "message">): string {
  return cleanLogMessage(line.displayMessage || line.message);
}
