import React, { useRef } from "react";
import type { TopologyNode, ViewportSize } from "../types";
import { cardWidth, cardHeight, canvasWidth, minimapWidth, minimapHeight } from "../constants";

export function TopologyMinimap({
  canvasHeight,
  canvasSize,
  nodes,
  positions,
  offset,
  scale,
  onNavigate
}: {
  canvasHeight: number;
  canvasSize: ViewportSize;
  nodes: TopologyNode[];
  positions: Map<string, { x: number; y: number }>;
  offset: { x: number; y: number };
  scale: number;
  onNavigate: (x: number, y: number) => void;
}) {
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const viewportDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const mapScale = Math.min((minimapWidth - 16) / canvasWidth, (minimapHeight - 16) / canvasHeight);
  const mapOffsetX = (minimapWidth - canvasWidth * mapScale) / 2;
  const mapOffsetY = (minimapHeight - canvasHeight * mapScale) / 2;
  const viewportWidth = Math.min(canvasWidth, canvasSize.width / scale);
  const viewportHeight = Math.min(canvasHeight, canvasSize.height / scale);
  const viewportX = Math.min(Math.max(-offset.x / scale, 0), Math.max(canvasWidth - viewportWidth, 0));
  const viewportY = Math.min(Math.max(-offset.y / scale, 0), Math.max(canvasHeight - viewportHeight, 0));

  function pointFromEvent(event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) {
    const rect = minimapRef.current?.getBoundingClientRect();

    if (!rect) {
      return undefined;
    }

    const x = Math.min(Math.max((event.clientX - rect.left - mapOffsetX) / mapScale, 0), canvasWidth);
    const y = Math.min(Math.max((event.clientY - rect.top - mapOffsetY) / mapScale, 0), canvasHeight);

    return { x, y };
  }

  function navigateFromEvent(event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) {
    const point = pointFromEvent(event);

    if (!point) {
      return;
    }

    const nextViewportX = point.x - viewportWidth / 2;
    const nextViewportY = point.y - viewportHeight / 2;

    const clampedX = Math.min(Math.max(nextViewportX, 0), Math.max(canvasWidth - viewportWidth, 0));
    const clampedY = Math.min(Math.max(nextViewportY, 0), Math.max(canvasHeight - viewportHeight, 0));

    onNavigate(clampedX + viewportWidth / 2, clampedY + viewportHeight / 2);
  }

  return (
    <div
      ref={minimapRef}
      className="TopologyMinimap"
      style={{ width: minimapWidth, height: minimapHeight }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        navigateFromEvent(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons !== 1) {
          return;
        }

        event.stopPropagation();
        navigateFromEvent(event);
      }}
      onPointerUp={(event) => {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {}
      }}
    >
      <svg width={minimapWidth} height={minimapHeight}>
        <g transform={`translate(${mapOffsetX}, ${mapOffsetY})`}>
          {nodes.map((node) => {
            const pos = positions.get(node.id);
            const nx = pos ? pos.x : node.x;
            const ny = pos ? pos.y : node.y;
            return (
              <rect
                key={node.id}
                className={`status-${node.status}`}
                x={nx * mapScale}
                y={ny * mapScale}
                width={cardWidth * mapScale}
                height={cardHeight * mapScale}
                rx="2"
              />
            );
          })}
        </g>
      </svg>
      <div
        className="TopologyMinimap__viewport"
        style={{
          left: viewportX * mapScale + mapOffsetX,
          top: viewportY * mapScale + mapOffsetY,
          width: viewportWidth * mapScale,
          height: viewportHeight * mapScale
        }}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          event.stopPropagation();
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
          const point = pointFromEvent(event);
          if (point) {
            // @ts-ignore
            viewportDragRef.current = {
              offsetX: point.x - viewportX,
              offsetY: point.y - viewportY
            };
          }
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          event.stopPropagation();
          const point = pointFromEvent(event);
          if (point && viewportDragRef.current) {
            // @ts-ignore
            const drag: { offsetX: number; offsetY: number } = viewportDragRef.current;
            const nextViewportX = point.x - drag.offsetX;
            const nextViewportY = point.y - drag.offsetY;

            const clampedX = Math.min(Math.max(nextViewportX, 0), Math.max(canvasWidth - viewportWidth, 0));
            const clampedY = Math.min(Math.max(nextViewportY, 0), Math.max(canvasHeight - viewportHeight, 0));

            onNavigate(clampedX + viewportWidth / 2, clampedY + viewportHeight / 2);
          }
        }}
        onPointerUp={(event) => {
          viewportDragRef.current = null;
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {}
        }}
        onPointerCancel={() => {
          viewportDragRef.current = null;
        }}
      />
    </div>
  );
}
