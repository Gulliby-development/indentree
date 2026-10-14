import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, UsageError } from "../src/args";
import type { Io } from "../src/cli";
import { run } from "../src/cli";
import type { Item } from "../src/model";
import { type Format, render } from "../src/render";

const planHtml =
  "<ul>\n" +
  "  <li>Fruit\n" +
  "    <ul>\n" +
  "      <li>Banana</li>\n" +
  "      <li>Apple\n" +
  "        <ul>\n" +
  "          <li>Gala</li>\n" +
  "          <li>Fuji</li>\n" +
  "        </ul>\n" +
  "      </li>\n" +
  "    </ul>\n" +
  "  </li>\n" +
  "  <li>Vegetables\n" +
  "    <ul>\n" +
  "      <li>Carrot</li>\n" +
  "    </ul>\n" +
  "  </li>\n" +
  "</ul>\n";

function item(text: string, children: Item[] = []): Item {
  return { text, line: 1, children };
}

function plan(): Item[] {
  return [
    item("Fruit", [item("Banana"), item("Apple", [item("Gala"), item("Fuji")])]),
    item("Vegetables", [item("Carrot")]),
  ];
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function memoryIo(
  files: Record<string, Uint8Array | string> = {},
  stdin: Uint8Array | string = "",
): Io & { stdout: string[]; stderr: string[]; reads: string[]; stdinReads: number } {
  const contents = new Map<string, Uint8Array>();
  for (const [path, content] of Object.entries(files)) {
    contents.set(path, typeof content === "string" ? bytes(content) : content);
  }

  const stdout: string[] = [];
  const stderr: string[] = [];
  const reads: string[] = [];
  let stdinReads = 0;
  const stdinBytes = typeof stdin === "string" ? bytes(stdin) : stdin;

  return {
    stdout,
    stderr,
    reads,
    get stdinReads() {
      return stdinReads;
    },
    readStdin() {
      stdinReads += 1;
      return stdinBytes;
    },
    readFile(path) {
      reads.push(path);
      const content = contents.get(path);
      if (content === undefined) {
        throw new Error("missing in-memory file");
      }
      return content;
    },
    out(text) {
      stdout.push(text);
    },
    err(text) {
      stderr.push(text);
    },
  };
}

describe("HTML rendering", () => {
  test("renders the plan example exactly", () => {
    expect(render(plan(), "html", 2)).toBe(planHtml);
  });

  test("renders a single item", () => {
    expect(render([item("Root")], "html", 2)).toBe("<ul>\n  <li>Root</li>\n</ul>\n");
  });

  test("renders flat siblings in document order", () => {
    expect(render([item("A"), item("B")], "html", 2)).toBe(
      "<ul>\n  <li>A</li>\n  <li>B</li>\n</ul>\n",
    );
  });

  test("renders one parent with one child", () => {
    expect(render([item("Parent", [item("Child")])], "html", 2)).toBe(
      "<ul>\n  <li>Parent\n    <ul>\n      <li>Child</li>\n    </ul>\n  </li>\n</ul>\n",
    );
  });

  test("closes nested lists and list items in order", () => {
    const items = [item("A", [item("B", [item("C")])]), item("D")];
    expect(render(items, "html", 2)).toBe(
      "<ul>\n" +
        "  <li>A\n" +
        "    <ul>\n" +
        "      <li>B\n" +
        "        <ul>\n" +
        "          <li>C</li>\n" +
        "        </ul>\n" +
        "      </li>\n" +
        "    </ul>\n" +
        "  </li>\n" +
        "  <li>D</li>\n" +
        "</ul>\n",
    );
  });

  test("renders an empty outline as an empty string", () => {
    expect(render([], "html", 2)).toBe("");
  });

  test("escapes only ampersands and angle brackets while preserving quotes", () => {
    expect(render([item('R&D <b>"x"</b> & more')], "html", 2)).toBe(
      '<ul>\n  <li>R&amp;D &lt;b&gt;"x"&lt;/b&gt; &amp; more</li>\n</ul>\n',
    );
  });

  test("escapes text that already looks like an HTML entity", () => {
    expect(render([item("&amp; &lt;")], "html", 2)).toBe(
      "<ul>\n  <li>&amp;amp; &amp;lt;</li>\n</ul>\n",
    );
  });

  test("preserves non-ASCII text", () => {
    expect(render([item("café", [item("☃")])], "html", 2)).toBe(
      "<ul>\n  <li>café\n    <ul>\n      <li>☃</li>\n    </ul>\n  </li>\n</ul>\n",
    );
  });

  test("ignores JSON indentation values 0 and 8", () => {
    const items = plan();
    expect(render(items, "html", 0)).toBe(planHtml);
    expect(render(items, "html", 8)).toBe(planHtml);
  });

  test("renders 2,000 nested levels without overflowing the call stack", () => {
    const depthCount = 2000;
    const root = item("Level 0");
    const roots = [root];
    let current = root;
    for (let depth = 1; depth < depthCount; depth += 1) {
      const child = item(`Level ${depth}`);
      current.children.push(child);
      current = child;
    }

    const expectedLines = ["<ul>"];
    for (let depth = 0; depth < depthCount; depth += 1) {
      const itemIndent = " ".repeat(2 + 4 * depth);
      if (depth === depthCount - 1) {
        expectedLines.push(`${itemIndent}<li>Level ${depth}</li>`);
      } else {
        expectedLines.push(`${itemIndent}<li>Level ${depth}`);
        expectedLines.push(`${" ".repeat(4 + 4 * depth)}<ul>`);
      }
    }
    for (let depth = depthCount - 2; depth >= 0; depth -= 1) {
      expectedLines.push(`${" ".repeat(4 + 4 * depth)}</ul>`);
      expectedLines.push(`${" ".repeat(2 + 4 * depth)}</li>`);
    }
    expectedLines.push("</ul>");

    const output = render(roots, "html", 2);
    expect(expectedLines).toHaveLength(7999);
    expect(output).toBe(`${expectedLines.join("\n")}\n`);
    expect(output.split("\n")).toHaveLength(8000);
  });

  test("accepts both HTML format argument spellings", () => {
    const spellings = [
      ["convert", "--to", "html", "outline.txt"],
      ["convert", "--to=html", "outline.txt"],
    ];
    for (const args of spellings) {
      expect(parseArgs(args)).toEqual({
        command: "convert",
        file: "outline.txt",
        format: "html" satisfies Format,
        indent: 2,
      });
    }
  });

  test("rejects uppercase and unsupported HTML format values", () => {
    for (const format of ["HTML", "htm", "xml"]) {
      expect(() => parseArgs(["convert", "--to", format, "outline.txt"])).toThrow(
        new UsageError(`invalid format "${format}"`),
      );
    }
  });

  test("converts a file with an in-memory Io and ignores --indent", () => {
    const io = memoryIo({
      "plan.txt": "Fruit\n  Banana\n  Apple\n    Gala\n    Fuji\nVegetables\n  Carrot",
    });
    expect(run(["convert", "--to=html", "--indent=8", "plan.txt"], io)).toBe(0);
    expect(io.stdout).toEqual([planHtml]);
    expect(io.stderr).toEqual([]);
    expect(io.reads).toEqual(["plan.txt"]);
  });

  test("converts standard input with a BOM and CRLF line endings", () => {
    const io = memoryIo({}, "\uFEFFA\r\n  B\r\n");
    expect(run(["convert", "--to", "html", "-"], io)).toBe(0);
    expect(io.stdout).toEqual([
      "<ul>\n  <li>A\n    <ul>\n      <li>B</li>\n    </ul>\n  </li>\n</ul>\n",
    ]);
    expect(io.stderr).toEqual([]);
    expect(io.reads).toEqual([]);
    expect(io.stdinReads).toBe(1);
  });

  test("converts an empty file without writing output", () => {
    const io = memoryIo({ "empty.txt": "" });
    expect(run(["convert", "--to", "html", "empty.txt"], io)).toBe(0);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([]);
    expect(io.reads).toEqual(["empty.txt"]);
  });

  test("reports the existing indentation error for an invalid file", () => {
    const io = memoryIo({ "bad.txt": "A\n  B\n   C" });
    expect(run(["convert", "--to", "html", "bad.txt"], io)).toBe(2);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([
      "indentree: bad.txt:3: indentation is not a multiple of the unit (2 spaces)\n",
    ]);
  });

  test("prints the exact updated help text", () => {
    const io = memoryIo();
    expect(run(["--help"], io)).toBe(0);
    expect(io.stdout).toEqual([
      "usage: indentree convert [--to json|markdown|numbered|paths|html] [--indent N] FILE\n" +
        "       indentree check [--max-depth N] FILE...\n" +
        "       indentree sort [--reverse] FILE\n",
    ]);
    expect(io.stderr).toEqual([]);
    expect(io.reads).toEqual([]);
  });

  test("documents the requested formats and JSON-only --indent behavior", () => {
    const readme = readFileSync(join(import.meta.dir, "../README.md"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(readme).toContain(
      "Convert an outline to JSON, Markdown, outline numbers, paths, or an HTML list;",
    );
    expect(readme).toContain(
      [
        "usage: indentree convert [--to json|markdown|numbered|paths|html] [--indent N] FILE",
        "       indentree check [--max-depth N] FILE...",
        "       indentree sort [--reverse] FILE",
      ].join("\n"),
    );
    expect(readme).toContain("its `--indent` option accepts 0 through 8 and only affects JSON.");
  });

  test("documents the HTML example and explanation exactly", () => {
    const readme = readFileSync(join(import.meta.dir, "../README.md"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(readme).toContain(
      [
        "`indentree convert --to html plan.txt`:",
        "",
        "```text",
        "<ul>",
        "  <li>Fruit",
        "    <ul>",
        "      <li>Banana</li>",
        "      <li>Apple",
        "        <ul>",
        "          <li>Gala</li>",
        "          <li>Fuji</li>",
        "        </ul>",
        "      </li>",
        "    </ul>",
        "  </li>",
        "  <li>Vegetables",
        "    <ul>",
        "      <li>Carrot</li>",
        "    </ul>",
        "  </li>",
        "</ul>",
        "```",
        "",
        "The `html` format writes nested `<ul>` and `<li>` elements, two spaces per element level, and escapes `&`, `<` and `>` in item text as `&amp;`, `&lt;` and `&gt;`. It adds no `<html>` or `<body>` wrapper, so the output can be pasted into a page. An empty outline prints nothing.",
      ].join("\n"),
    );
  });
});
