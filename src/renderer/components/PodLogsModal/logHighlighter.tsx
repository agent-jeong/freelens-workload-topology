import React from "react";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightLogText(value: string, query: string): React.ReactNode {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return value;
  }

  const parts = value.split(new RegExp(`(${escapeRegExp(normalizedQuery)})`, "ig"));

  return parts.map((part, index) => (
    part.toLowerCase() === normalizedQuery.toLowerCase()
      ? <mark key={index}>{part}</mark>
      : <React.Fragment key={index}>{part}</React.Fragment>
  ));
}
