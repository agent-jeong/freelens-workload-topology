import { useCallback, useEffect, useRef } from "react";

type KeyboardState = {
  logModalNode: any;
  searchQuery: string;
  showHelp: boolean;
  selectedNodeId: string | null;
  selectedNodeIds: Set<string>;
};

type KeyboardActions = {
  setShowHelp: (fn: (v: boolean) => boolean) => void;
  setSearchQuery: (v: string) => void;
  setLogModalNode: (v: null) => void;
  setSelectedNodeId: (v: string | null) => void;
  setSelectedNodeIds: (v: Set<string>) => void;
  setShowGrid: (fn: (v: boolean) => boolean) => void;
  setIsLive: (fn: (v: boolean) => boolean) => void;
  setShowIssuesOnly: (fn: (v: boolean) => boolean) => void;
  setManualPositions: (fn: (prev: Record<string, { x: number; y: number }>) => Record<string, { x: number; y: number }>) => void;
  setScale: (fn: (s: number) => number) => void;
  setOffset: (fn: (o: { x: number; y: number }) => { x: number; y: number }) => void;
  clampOffsetForScale: (offset: { x: number; y: number }, scale: number) => { x: number; y: number };
  loadResources: () => void;
  focusSearchInput: () => void;
  blurSearchInput: () => void;
};

export function useTopologyKeyboard(
  state: KeyboardState,
  actions: KeyboardActions,
) {
  const stateRef = useRef(state);
  stateRef.current = state;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const { logModalNode, searchQuery, showHelp, selectedNodeId, selectedNodeIds } = stateRef.current;
    const inInput = !!(event.target as HTMLElement)?.closest("input, textarea, select");

    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      actions.focusSearchInput();
      return;
    }

    if (event.key === "Escape") {
      if (showHelp) { actions.setShowHelp(() => false); return; }
      if (searchQuery) { actions.setSearchQuery(""); actions.blurSearchInput(); return; }
      if (logModalNode) { actions.setLogModalNode(null); return; }
      actions.setSelectedNodeId(null);
      actions.setSelectedNodeIds(new Set());
      return;
    }

    if (inInput) return;

    switch (event.key) {
      case "?": actions.setShowHelp((v) => !v); break;
      case "g": actions.setShowGrid((v) => !v); break;
      case "l": actions.setIsLive((v) => !v); break;
      case ".": actions.loadResources(); break;
      case "p": actions.setShowIssuesOnly((v) => !v); break;
      case "Backspace":
      case "Delete":
        if (selectedNodeId || selectedNodeIds.size > 0) {
          actions.setManualPositions((prev) => {
            const next = { ...prev };
            if (selectedNodeId) delete next[selectedNodeId];
            selectedNodeIds.forEach((id) => delete next[id]);
            return next;
          });
        }
        break;
      case "0":
        actions.setScale(() => 1);
        actions.setOffset(() => actions.clampOffsetForScale({ x: 0, y: 0 }, 1));
        break;
      case "-":
        actions.setScale((s) => {
          const nextScale = Math.max(0.3, s - 0.1);
          actions.setOffset((current) => actions.clampOffsetForScale(current, nextScale));
          return nextScale;
        });
        break;
      case "=":
      case "+":
        actions.setScale((s) => {
          const nextScale = Math.min(3, s + 0.1);
          actions.setOffset((current) => actions.clampOffsetForScale(current, nextScale));
          return nextScale;
        });
        break;
    }
  }, [actions]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
