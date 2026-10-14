import type { Item, Problem } from "./model";

interface PendingItem {
  item: Item;
  depth: number;
}

export function checkOutline(items: Item[], maxDepth: number | null): Problem[] {
  const problems: Problem[] = [];
  const pending: PendingItem[] = [];

  const addSiblingChecks = (siblings: Item[], depth: number): void => {
    const firstLines = new Map<string, number>();

    for (const item of siblings) {
      const firstLine = firstLines.get(item.text);
      if (firstLine === undefined) {
        firstLines.set(item.text, item.line);
      } else {
        problems.push({
          line: item.line,
          code: "IT001",
          message: `duplicate sibling "${item.text}" (first on line ${firstLine})`,
        });
      }
      pending.push({ item, depth });
    }
  };

  addSiblingChecks(items, 1);

  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined) {
      continue;
    }
    const { item, depth } = entry;

    if (maxDepth !== null && depth > maxDepth) {
      problems.push({
        line: item.line,
        code: "IT002",
        message: `depth ${depth} exceeds the maximum of ${maxDepth}`,
      });
    }

    if (item.text.endsWith(":") && item.children.length === 0) {
      problems.push({
        line: item.line,
        code: "IT003",
        message: `"${item.text}" ends with a colon but has no sub-items`,
      });
    }

    addSiblingChecks(item.children, depth + 1);
  }

  return problems.sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
  });
}

export function countItems(items: Item[]): number {
  let count = 0;
  const pending = [...items];

  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) {
      continue;
    }
    count += 1;
    for (const child of item.children) {
      pending.push(child);
    }
  }

  return count;
}
