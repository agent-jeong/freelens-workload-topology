import React from "react";
import YAML from "yaml";
import type { KubeObjectLike, TopologyNode } from "../types";
import { objectForCopy } from "./kube";

export function editableObject(object: KubeObjectLike): any {
  const copy = objectForCopy(object) as any;

  delete copy.status;

  if (copy.metadata) {
    delete copy.metadata.managedFields;
  }

  return copy;
}

export function stringifyYaml(object: KubeObjectLike): string {
  return YAML.stringify(editableObject(object));
}

export function yamlDiff(original: string, edited: string) {
  const originalLines = original.split("\n");
  const editedLines = edited.split("\n");
  const max = Math.max(originalLines.length, editedLines.length);
  const changes: Array<{ kind: "same" | "removed" | "added"; text: string }> = [];

  for (let index = 0; index < max; index += 1) {
    const originalLine = originalLines[index];
    const editedLine = editedLines[index];

    if (originalLine === editedLine) {
      if (originalLine !== undefined) {
        changes.push({ kind: "same", text: `  ${originalLine}` });
      }
      continue;
    }

    if (originalLine !== undefined) {
      changes.push({ kind: "removed", text: `- ${originalLine}` });
    }

    if (editedLine !== undefined) {
      changes.push({ kind: "added", text: `+ ${editedLine}` });
    }
  }

  return changes.filter((change) => change.kind !== "same").slice(0, 80);
}

export function yamlWarnings(node: TopologyNode, yamlText: string) {
  const warnings: string[] = [];

  try {
    const parsed = YAML.parse(yamlText);
    const metadata = parsed?.metadata;

    if (parsed?.kind && parsed.kind !== node.kind) {
      warnings.push("Changing kind is not supported by Apply YAML.");
    }

    if (metadata?.name && metadata.name !== node.name) {
      warnings.push("Changing metadata.name may be rejected by Kubernetes.");
    }

    if (metadata?.namespace && metadata.namespace !== node.namespace) {
      warnings.push("Changing metadata.namespace may be rejected by Kubernetes.");
    }

    if (parsed?.status) {
      warnings.push("status is usually managed by Kubernetes and may be rejected.");
    }
  } catch {
    warnings.push("YAML has parse errors.");
  }

  if (node.kind === "Pod") {
    warnings.push("Many Pod fields are immutable; Deployment changes are usually safer.");
  }

  return warnings;
}

export function highlightYaml(text: string): React.ReactNode[] {
  return text.split("\n").map((line, lineIndex) => {
    const nodes: React.ReactNode[] = [];

    if (/^\s*#/.test(line)) {
      nodes.push(<span key="c" className="yaml-comment">{line}</span>);
    } else {
      const keyMatch = line.match(/^(\s*)([\w.\-/]+)(\s*:\s*)(.*)/);

      if (keyMatch) {
        const [, indent, key, colon, rest] = keyMatch;

        nodes.push(indent);
        nodes.push(<span key="k" className="yaml-key">{key}</span>);
        nodes.push(<span key="co" className="yaml-colon">{colon}</span>);

        if (rest) {
          nodes.push(highlightYamlValue(rest));
        }
      } else {
        const listMatch = line.match(/^(\s*-\s*)(.*)/);

        if (listMatch) {
          const [, dash, rest] = listMatch;

          nodes.push(<span key="d" className="yaml-dash">{dash}</span>);

          const inlineKey = rest.match(/^([\w.\-/]+)(\s*:\s*)(.*)/);

          if (inlineKey) {
            const [, k, c, v] = inlineKey;

            nodes.push(<span key="lk" className="yaml-key">{k}</span>);
            nodes.push(<span key="lc" className="yaml-colon">{c}</span>);

            if (v) {
              nodes.push(highlightYamlValue(v));
            }
          } else {
            nodes.push(highlightYamlValue(rest));
          }
        } else {
          nodes.push(line);
        }
      }
    }

    return <React.Fragment key={lineIndex}>{nodes}{"\n"}</React.Fragment>;
  });
}

/** Apply search highlighting by walking React nodes and wrapping matched ranges with <mark> */
export function applySearchMarks(
  nodes: React.ReactNode[],
  query: string,
  currentMatchIndex: number
): { nodes: React.ReactNode[]; matchCount: number } {
  if (!query) return { nodes, matchCount: 0 };

  // First pass: find all match positions in the full text
  const fullText = extractText(nodes);
  const lowerText = fullText.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchPositions: number[] = [];
  let searchPos = 0;
  while (true) {
    const found = lowerText.indexOf(lowerQuery, searchPos);
    if (found === -1) break;
    matchPositions.push(found);
    searchPos = found + 1;
  }

  if (matchPositions.length === 0) return { nodes, matchCount: 0 };

  // Build a set of ranges to highlight
  const ranges = matchPositions.map((pos, idx) => ({
    start: pos,
    end: pos + query.length,
    isCurrent: idx === currentMatchIndex,
  }));

  // Second pass: walk nodes and split text at range boundaries
  let charOffset = 0;
  const result = wrapNodes(nodes, ranges, { offset: charOffset });

  return { nodes: result.output, matchCount: matchPositions.length };
}

function extractText(nodes: React.ReactNode[]): string {
  let text = "";
  for (const node of nodes) {
    if (typeof node === "string") {
      text += node;
    } else if (Array.isArray(node)) {
      text += extractText(node);
    } else if (React.isValidElement(node)) {
      const children = (node.props as any).children;
      if (typeof children === "string") {
        text += children;
      } else if (Array.isArray(children)) {
        text += extractText(children);
      } else if (children != null) {
        text += extractText([children]);
      }
    }
  }
  return text;
}

function wrapNodes(
  nodes: React.ReactNode[],
  ranges: Array<{ start: number; end: number; isCurrent: boolean }>,
  state: { offset: number }
): { output: React.ReactNode[] } {
  const output: React.ReactNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (typeof node === "string") {
      const parts = splitTextWithMarks(node, ranges, state.offset);
      output.push(...parts);
      state.offset += node.length;
    } else if (Array.isArray(node)) {
      const inner = wrapNodes(node, ranges, state);
      output.push(inner.output);
    } else if (React.isValidElement(node)) {
      const children = (node.props as any).children;

      if (typeof children === "string") {
        const parts = splitTextWithMarks(children, ranges, state.offset);
        state.offset += children.length;
        output.push(React.cloneElement(node, { key: node.key ?? `w${i}` } as any, ...parts));
      } else if (Array.isArray(children)) {
        const inner = wrapNodes(children, ranges, state);
        output.push(React.cloneElement(node, { key: node.key ?? `w${i}` } as any, ...inner.output));
      } else if (children != null) {
        const inner = wrapNodes([children], ranges, state);
        output.push(React.cloneElement(node, { key: node.key ?? `w${i}` } as any, ...inner.output));
      } else {
        output.push(node);
      }
    } else {
      output.push(node);
    }
  }

  return { output };
}

function splitTextWithMarks(
  text: string,
  ranges: Array<{ start: number; end: number; isCurrent: boolean }>,
  offset: number
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const range of ranges) {
    const localStart = range.start - offset;
    const localEnd = range.end - offset;

    // Skip ranges outside this text
    if (localEnd <= 0 || localStart >= text.length) continue;

    const clampStart = Math.max(0, localStart);
    const clampEnd = Math.min(text.length, localEnd);

    if (clampStart > cursor) {
      parts.push(text.slice(cursor, clampStart));
    }

    parts.push(
      <mark key={`m${offset + clampStart}`} className={range.isCurrent ? "CodeEditor__matchCurrent" : "CodeEditor__match"}>
        {text.slice(clampStart, clampEnd)}
      </mark>
    );

    cursor = clampEnd;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length > 0 ? parts : [text];
}

export function highlightYamlValue(value: string): React.ReactNode {
  if (/^\s*#/.test(value)) {
    return <span className="yaml-comment">{value}</span>;
  }

  if (/^(true|false|yes|no|null|~)$/i.test(value.trim())) {
    return <span className="yaml-boolean">{value}</span>;
  }

  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value.trim())) {
    return <span className="yaml-number">{value}</span>;
  }

  if (/^["']/.test(value.trim())) {
    return <span className="yaml-string">{value}</span>;
  }

  return <span className="yaml-string">{value}</span>;
}
