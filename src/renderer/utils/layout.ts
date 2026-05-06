import { layoutStoragePrefix } from "../constants";

export function layoutStorageKey(namespace: string): string {
  return `${layoutStoragePrefix}:${namespace}`;
}

export function readStoredLayout(namespace: string): Record<string, { x: number; y: number }> {
  try {
    const raw = window.localStorage.getItem(layoutStorageKey(namespace));

    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function writeStoredLayout(namespace: string, positions: Record<string, { x: number; y: number }>) {
  window.localStorage.setItem(layoutStorageKey(namespace), JSON.stringify(positions));
}
