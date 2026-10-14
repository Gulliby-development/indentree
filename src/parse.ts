import { type Item, OutlineError } from "./model";

export function parseOutline(display: string, input: string): Item[] {
  const source = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const lines = source.split("\n");
  const roots: Item[] = [];
  const ancestors: Item[] = [];
  let unit: string | null = null;
  let previousDepth = -1;
  let hasItems = false;

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index] ?? "";
    if (index < lines.length - 1 && line.endsWith("\r")) {
      line = line.slice(0, -1);
    }

    if (/^[ \t]*$/.test(line)) {
      continue;
    }

    const indentation = line.match(/^[ \t]*/)?.[0] ?? "";
    const text = line.slice(indentation.length).replace(/[ \t]+$/, "");
    const hasSpaces = indentation.includes(" ");
    const hasTabs = indentation.includes("\t");
    const lineNumber = index + 1;

    if (hasSpaces && hasTabs) {
      throw new OutlineError(display, lineNumber, "mixed tabs and spaces in the indentation");
    }

    if (indentation.length > 0 && unit !== null && indentation[0] !== unit[0]) {
      throw new OutlineError(display, lineNumber, "mixed tabs and spaces in the indentation");
    }

    if (!hasItems && indentation.length > 0) {
      throw new OutlineError(display, lineNumber, "first item must not be indented");
    }

    if (indentation.length > 0 && unit === null) {
      unit = indentation;
    }

    let depth = 0;
    if (indentation.length > 0 && unit !== null) {
      if (indentation.length % unit.length !== 0) {
        throw new OutlineError(
          display,
          lineNumber,
          `indentation is not a multiple of the unit (${describeUnit(unit)})`,
        );
      }
      depth = indentation.length / unit.length;
    }

    if (previousDepth >= 0 && depth > previousDepth + 1) {
      throw new OutlineError(
        display,
        lineNumber,
        "item is more than one level deeper than the previous item",
      );
    }

    const item: Item = { text, line: lineNumber, children: [] };
    if (depth === 0) {
      roots.push(item);
    } else {
      const parent = ancestors[depth - 1];
      if (parent === undefined) {
        throw new Error("Outline parser hierarchy invariant violated");
      }
      parent.children.push(item);
    }

    ancestors.length = depth;
    ancestors.push(item);
    previousDepth = depth;
    hasItems = true;
  }

  return roots;
}

function describeUnit(unit: string): string {
  const character = unit[0] === "\t" ? "tab" : "space";
  return `${unit.length} ${character}${unit.length === 1 ? "" : "s"}`;
}
