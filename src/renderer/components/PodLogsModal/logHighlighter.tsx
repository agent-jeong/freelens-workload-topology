import React from "react";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightLogText(value: string, terms: string[]): React.ReactNode {
  const validTerms = terms.map((t) => t.trim()).filter(Boolean);

  if (validTerms.length === 0) {
    return value;
  }

  const pattern = validTerms.map(escapeRegExp).join("|");
  const parts = value.split(new RegExp(`(${pattern})`, "ig"));

  return parts.map((part, index) =>
    validTerms.some((t) => part.toLowerCase() === t.toLowerCase())
      ? <mark key={index}>{part}</mark>
      : <React.Fragment key={index}>{part}</React.Fragment>
  );
}