import React, { useCallback, useEffect, useRef, useState } from "react";
import { cardHeight, cardWidth, canvasWidth, topPadding } from "../constants";
import type { TopologyNode, ViewportSize } from "../types";
import { readStoredLayout, writeStoredLayout } from "../utils/layout";

const viewportContentPadding = 160;

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function useCanvasInteraction(
  topologyNodes: TopologyNode[],
  nodeById: Map<string, TopologyNode>,
  selectedNamespace: string,
  resolvedPos: Map<string, { x: number; y: number }>,
  canvasHeight: number,
  viewportContentBounds: { minX: number; minY: number; maxX: number; maxY: number },
) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState<ViewportSize>({ width: 1, height: 1 });
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const marqueeStart = useRef<{ clientX: number; clientY: number; canvasX: number; canvasY: number } | null>(null);
  const nodeDragStart = useRef<{ ids: string[]; x: number; y: number; origins: Record<string, { x: number; y: number }>; wasAlreadySelected: boolean; didDrag: boolean } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const suppressLayoutSave = useRef(false);

  function clampOffsetForScale(nextOffset: { x: number; y: number }, nextScale: number) {
    const viewportWidth = Math.min(canvasWidth, canvasSize.width / nextScale);
    const viewportHeight = Math.min(canvasHeight, canvasSize.height / nextScale);
    const canvasMaxX = Math.max(canvasWidth - viewportWidth, 0);
    const canvasMaxY = Math.max(canvasHeight - viewportHeight, 0);
    const hasContentBounds = Number.isFinite(viewportContentBounds.minX);
    const viewportX = -nextOffset.x / nextScale;
    const viewportY = -nextOffset.y / nextScale;

    if (!hasContentBounds) {
      return {
        x: -clamp(viewportX, 0, canvasMaxX) * nextScale,
        y: -clamp(viewportY, 0, canvasMaxY) * nextScale,
      };
    }

    const minX = clamp(viewportContentBounds.minX - viewportContentPadding, 0, canvasMaxX);
    const minY = clamp(viewportContentBounds.minY - viewportContentPadding, 0, canvasMaxY);
    const maxX = clamp(viewportContentBounds.maxX + viewportContentPadding - viewportWidth, 0, canvasMaxX);
    const maxY = clamp(viewportContentBounds.maxY + viewportContentPadding - viewportHeight, 0, canvasMaxY);
    const centerX = (viewportContentBounds.minX + viewportContentBounds.maxX - viewportWidth) / 2;
    const centerY = (viewportContentBounds.minY + viewportContentBounds.maxY - viewportHeight) / 2;
    const clampedX = minX > maxX ? clamp(centerX, 0, canvasMaxX) : clamp(viewportX, minX, maxX);
    const clampedY = minY > maxY ? clamp(centerY, 0, canvasMaxY) : clamp(viewportY, minY, maxY);

    return {
      x: -clampedX * nextScale,
      y: -clampedY * nextScale,
    };
  }

  function navigateToCanvasPoint(x: number, y: number) {
    setOffset(clampOffsetForScale({
      x: canvasSize.width / 2 - x * scale,
      y: canvasSize.height / 2 - y * scale
    }, scale));
  }

  // Clamp offset when scale or viewport changes
  useEffect(() => {
    setOffset((current) => {
      const next = clampOffsetForScale(current, scale);
      return Math.abs(next.x - current.x) < 0.5 && Math.abs(next.y - current.y) < 0.5 ? current : next;
    });
  }, [scale, canvasSize.width, canvasSize.height, viewportContentBounds]);

  // Clean up stale manual positions
  useEffect(() => {
    setManualPositions((current) => {
      const entries = Object.entries(current).filter(([nodeId]) => nodeById.has(nodeId));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [nodeById]);

  // Load layout from storage on namespace change
  useEffect(() => {
    suppressLayoutSave.current = true;
    setManualPositions(readStoredLayout(selectedNamespace));
  }, [selectedNamespace]);

  // Persist layout to storage
  useEffect(() => {
    if (suppressLayoutSave.current) {
      suppressLayoutSave.current = false;
      return;
    }
    writeStoredLayout(selectedNamespace, manualPositions);
  }, [manualPositions, selectedNamespace]);

  // Track canvas size via ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateCanvasSize = () => {
      setCanvasSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    };
    updateCanvasSize();

    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

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
      setOffset(clampOffsetForScale({
        x: pointerX - canvasX * nextScale,
        y: pointerY - canvasY * nextScale
      }, nextScale));
      return;
    }

    setOffset((current) => clampOffsetForScale({
      x: current.x - event.deltaX,
      y: current.y - event.deltaY
    }, scale));
  }

  const stateRef = useRef({ selectedNodeId: null as string | null, selectedNodeIds: new Set<string>(), resolvedPos });
  // Updated externally via updateSelectionRef
  function updateSelectionRef(selectedNodeId: string | null, selectedNodeIds: Set<string>) {
    stateRef.current = { selectedNodeId, selectedNodeIds, resolvedPos };
  }

  const handleNodeDragStart = useCallback((event: React.MouseEvent, node: TopologyNode) => {
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
  }, []);

  function handleCanvasMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.shiftKey) {
      const rect = event.currentTarget.getBoundingClientRect();
      const canvasX = (event.clientX - rect.left - offset.x) / scale;
      const canvasY = (event.clientY - rect.top - offset.y) / scale;
      marqueeStart.current = { clientX: event.clientX, clientY: event.clientY, canvasX, canvasY };
      return;
    }
    dragStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  }

  function handleCanvasMouseMove(event: React.MouseEvent<HTMLDivElement>) {
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

    if (!dragStart.current) return;

    setOffset(clampOffsetForScale({
      x: dragStart.current.offsetX + event.clientX - dragStart.current.x,
      y: dragStart.current.offsetY + event.clientY - dragStart.current.y
    }, scale));
  }

  function handleCanvasMouseLeave() {
    dragStart.current = null;
    nodeDragStart.current = null;
    marqueeStart.current = null;
    setMarquee(null);
  }

  function handleCanvasMouseUp(
    event: React.MouseEvent<HTMLDivElement>,
    setSelectedNodeId: (id: string | null) => void,
    setSelectedNodeIds: (ids: Set<string>) => void,
  ) {
    if (marqueeStart.current && marquee) {
      const hits = new Set<string>();
      for (const node of topologyNodes) {
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
  }

  return {
    scale,
    setScale,
    offset,
    setOffset,
    manualPositions,
    setManualPositions,
    marquee,
    canvasSize,
    canvasRef,
    nodeDragStart,
    clampOffsetForScale,
    navigateToCanvasPoint,
    handleCanvasWheel,
    handleNodeDragStart,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseLeave,
    handleCanvasMouseUp,
    updateSelectionRef,
  };
}
