import type { Item } from "./model";

export type Format = "json" | "markdown" | "numbered" | "paths" | "html";

interface RenderEntry {
  item: Item;
  depth: number;
  position: number;
  parentNumber: string;
  parentPath: string;
}

function listLines(items: Item[], format: Exclude<Format, "json">): string[] {
  const lines: string[] = [];
  const pending: RenderEntry[] = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    pending.push({
      item,
      depth: 0,
      position: index + 1,
      parentNumber: "",
      parentPath: "",
    });
  }

  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined) {
      continue;
    }
    const { item, depth, position, parentNumber, parentPath } = entry;
    const number = parentNumber === "" ? String(position) : `${parentNumber}.${position}`;
    const path = parentPath === "" ? item.text : `${parentPath} / ${item.text}`;

    if (format === "markdown") {
      lines.push(`${"  ".repeat(depth)}- ${item.text}`);
    } else if (format === "numbered") {
      lines.push(`${number} ${item.text}`);
    } else {
      lines.push(path);
    }

    for (let index = item.children.length - 1; index >= 0; index -= 1) {
      const child = item.children[index];
      if (child === undefined) {
        continue;
      }
      pending.push({
        item: child,
        depth: depth + 1,
        position: index + 1,
        parentNumber: number,
        parentPath: path,
      });
    }
  }

  return lines;
}

type HtmlRenderEntry =
  | { type: "item"; item: Item; depth: number }
  | { type: "close-list"; depth: number }
  | { type: "close-item"; depth: number };

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function htmlLines(items: Item[]): string[] {
  if (items.length === 0) {
    return [];
  }

  const lines = ["<ul>"];
  const pending: HtmlRenderEntry[] = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined) {
      pending.push({ type: "item", item, depth: 0 });
    }
  }

  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined) {
      continue;
    }

    if (entry.type === "close-list") {
      lines.push(`${" ".repeat(4 + entry.depth * 4)}</ul>`);
      continue;
    }
    if (entry.type === "close-item") {
      lines.push(`${" ".repeat(2 + entry.depth * 4)}</li>`);
      continue;
    }

    const { item, depth } = entry;
    const indentation = " ".repeat(2 + depth * 4);
    const text = escapeHtml(item.text);
    if (item.children.length === 0) {
      lines.push(`${indentation}<li>${text}</li>`);
      continue;
    }

    lines.push(`${indentation}<li>${text}`);
    lines.push(`${" ".repeat(4 + depth * 4)}<ul>`);
    pending.push({ type: "close-item", depth });
    pending.push({ type: "close-list", depth });

    for (let index = item.children.length - 1; index >= 0; index -= 1) {
      const child = item.children[index];
      if (child !== undefined) {
        pending.push({ type: "item", item: child, depth: depth + 1 });
      }
    }
  }

  lines.push("</ul>");
  return lines;
}

function withFinalLf(lines: string[]): string {
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

export function render(items: Item[], format: Format, indent: number): string {
  if (format === "json") {
    return `${JSON.stringify(items, (key, value: unknown) => (key === "line" ? undefined : value), indent)}\n`;
  }

  if (format === "html") {
    return withFinalLf(htmlLines(items));
  }

  return withFinalLf(listLines(items, format));
}

export function outlineText(items: Item[]): string {
  const lines: string[] = [];
  const pending: Array<{ item: Item; depth: number }> = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    pending.push({ item, depth: 0 });
  }

  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined) {
      continue;
    }
    const { item, depth } = entry;
    lines.push(`${"  ".repeat(depth)}${item.text}`);

    for (let index = item.children.length - 1; index >= 0; index -= 1) {
      const child = item.children[index];
      if (child === undefined) {
        continue;
      }
      pending.push({ item: child, depth: depth + 1 });
    }
  }

  return withFinalLf(lines);
}
