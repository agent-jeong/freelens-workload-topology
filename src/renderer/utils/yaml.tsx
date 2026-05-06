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
