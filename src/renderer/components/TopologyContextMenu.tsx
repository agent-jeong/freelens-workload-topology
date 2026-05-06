import React, { useEffect, useRef } from "react";
import type { ContextMenuItem } from "../types";

export function TopologyContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = menuRef.current;

    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) el.style.left = `${x - rect.width}px`;
    if (rect.bottom > vh) el.style.top = `${y - rect.height}px`;
  }, [x, y]);

  useEffect(() => {
    const handleClose = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", handleClose);
    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("mousedown", handleClose);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div ref={menuRef} className="TopologyContextMenu" style={{ left: x, top: y }}>
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          {item.separator && i > 0 ? <div className="TopologyContextMenu__separator" /> : null}
          <button
            type="button"
            className="TopologyContextMenu__item"
            onClick={() => { item.onClick(); onClose(); }}
          >
            <span className="TopologyContextMenu__icon">{item.icon}</span>
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
