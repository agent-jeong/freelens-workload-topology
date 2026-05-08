import React, { useEffect, useMemo, useRef, useState } from "react";
import { LOG_LINE_HEIGHT, LOG_OVERSCAN } from "../../constants";
import type { PodLogLine } from "../../types";
import { highlightLogText } from "./logHighlighter";

export function VirtualLogList({
  lines,
  query,
  selectedMatchIndex,
  wrapLogs,
  logBodyRef,
  lineRefs,
  scrollRequest,
  onExclude,
}: {
  lines: PodLogLine[];
  query: string;
  selectedMatchIndex: number;
  wrapLogs: boolean;
  logBodyRef: React.MutableRefObject<HTMLDivElement | null>;
  lineRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  scrollRequest?: { edge: "top" | "bottom"; tick: number } | null;
  onExclude: (line: PodLogLine) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [containerWidth, setContainerWidth] = useState(0);
  const [heightVersion, setHeightVersion] = useState(0);
  const measuredHeightsRef = useRef<number[]>([]);
  const lastWrapWidthRef = useRef<number | null>(null);
  const handledScrollTickRef = useRef<number | null>(null);

  useEffect(() => {
    const el = logBodyRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver(() => {
      setContainerHeight(el.clientHeight);
      setContainerWidth(el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  useEffect(() => {
    measuredHeightsRef.current.length = lines.length;
    lineRefs.current.length = lines.length;
  }, [lines, lineRefs]);

  useEffect(() => {
    if (!wrapLogs) {
      lastWrapWidthRef.current = null;
      return;
    }

    if (containerWidth <= 0 || lastWrapWidthRef.current === containerWidth) {
      return;
    }

    lastWrapWidthRef.current = containerWidth;
    measuredHeightsRef.current = new Array(lines.length);
    lineRefs.current.length = lines.length;
    setHeightVersion((value) => value + 1);
  }, [wrapLogs, containerWidth, lines.length, lineRefs]);

  const estimateWrappedHeight = (line: PodLogLine) => {
    const explicitLineCount = Math.max(line.wrappedDisplayMessage.split("\n").length, 1);
    return Math.max(LOG_LINE_HEIGHT, explicitLineCount * LOG_LINE_HEIGHT);
  };

  const itemOffsets = useMemo(() => {
    const offsets = new Array<number>(lines.length + 1);
    offsets[0] = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const size = wrapLogs
        ? measuredHeightsRef.current[index] ?? estimateWrappedHeight(lines[index])
        : LOG_LINE_HEIGHT;

      offsets[index + 1] = offsets[index] + size;
    }

    return offsets;
  }, [lines, wrapLogs, heightVersion]);

  const totalHeight = itemOffsets[lines.length] ?? 0;

  useEffect(() => {
    const el = logBodyRef.current;

    if (!el || !scrollRequest || lines.length === 0 || handledScrollTickRef.current === scrollRequest.tick) {
      return;
    }

    handledScrollTickRef.current = scrollRequest.tick;

    requestAnimationFrame(() => {
      const nextTop = scrollRequest.edge === "bottom"
        ? Math.max(totalHeight - containerHeight, 0)
        : 0;

      el.scrollTop = nextTop;
      setScrollTop(nextTop);
    });
  }, [scrollRequest?.tick, scrollRequest?.edge, totalHeight, containerHeight, lines.length, logBodyRef]);

  const findIndexForOffset = (offset: number) => {
    let low = 0;
    let high = lines.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);

      if ((itemOffsets[mid + 1] ?? 0) <= offset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return Math.min(low, Math.max(lines.length - 1, 0));
  };

  const overscanHeight = LOG_OVERSCAN * LOG_LINE_HEIGHT;
  const startIndex = lines.length === 0 ? 0 : Math.max(0, findIndexForOffset(Math.max(scrollTop - overscanHeight, 0)) - 1);
  const endIndex = lines.length === 0 ? 0 : Math.min(lines.length, findIndexForOffset(scrollTop + containerHeight + overscanHeight) + 2);
  const visibleLines = lines.slice(startIndex, endIndex);

  useEffect(() => {
    const el = logBodyRef.current;
    if (!el || !query.trim() || lines.length === 0) {
      return;
    }

    const itemTop = itemOffsets[selectedMatchIndex] ?? 0;
    const itemBottom = itemOffsets[selectedMatchIndex + 1] ?? itemTop + LOG_LINE_HEIGHT;
    const currentTop = el.scrollTop;
    const currentBottom = currentTop + containerHeight;

    if (itemTop < currentTop || itemBottom > currentBottom) {
      const nextTop = Math.max(itemTop - containerHeight / 2 + (itemBottom - itemTop) / 2, 0);
      el.scrollTop = nextTop;
      setScrollTop(nextTop);
      return;
    }

    if (wrapLogs) {
      lineRefs.current[selectedMatchIndex]?.scrollIntoView({ block: "center" });
    }
  }, [selectedMatchIndex, query, wrapLogs, itemOffsets, containerHeight, lines.length, logBodyRef, lineRefs]);

  const renderLine = (line: PodLogLine, index: number, top: number) => {
    const displayTimestamp = line.timestamp ? line.timestamp.replace("T", " ").replace("Z", "") : "";
    const displaySource = `${line.podName}/${line.containerName}`;

    return (
      <div
        key={line.id}
        ref={(element) => {
          lineRefs.current[index] = element;

          if (wrapLogs && element) {
            const nextHeight = Math.ceil(element.getBoundingClientRect().height);

            if (nextHeight > 0 && measuredHeightsRef.current[index] !== nextHeight) {
              measuredHeightsRef.current[index] = nextHeight;
              setHeightVersion((value) => value + 1);
            }
          }
        }}
        className={`PodLogsModal__line source-${line.sourceIndex % 8} severity-${line.severity}${line.error ? " is-error" : ""}${query.trim() && index === selectedMatchIndex ? " is-current-match" : ""}`}
        style={{ position: "absolute", top, left: 0, right: 0, ...(wrapLogs ? {} : { height: LOG_LINE_HEIGHT }) }}
      >
        <span className="PodLogsModal__time">{highlightLogText(displayTimestamp, query)}</span>
        <span className="PodLogsModal__severity">{line.severity === "unknown" ? "" : line.severity.toUpperCase()}</span>
        <span className="PodLogsModal__source" title={`${line.podName} / ${line.containerName}`}>{highlightLogText(displaySource, query)}</span>
        <span className="PodLogsModal__message" title={line.message}>{highlightLogText(wrapLogs ? line.wrappedDisplayMessage : line.displayMessage, query)}</span>
        <button
          type="button"
          className="PodLogsModal__excludeButton"
          title="Hide similar logs"
          onClick={() => onExclude(line)}
        >
          &minus;
        </button>
      </div>
    );
  };

  return (
    <div
      className={`PodLogsModal__terminal${wrapLogs ? " is-wrapped" : ""}`}
      ref={logBodyRef}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleLines.map((line, i) => {
          const index = startIndex + i;
          return renderLine(line, index, itemOffsets[index] ?? index * LOG_LINE_HEIGHT);
        })}
      </div>
    </div>
  );
}
