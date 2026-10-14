import { describe, expect, test } from "bun:test";
import { type ParsedArgs, parseArgs, UsageError } from "../src/args";
import type { Io } from "../src/cli";
import { run } from "../src/cli";

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

function expectUsage(args: string[], message: string): void {
  let caught: unknown;
  try {
    parseArgs(args);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(UsageError);
  expect(caught instanceof Error ? caught.message : "").toBe(message);
}

describe("parseArgs", () => {
  const validCases: Array<{ args: string[]; expected: ParsedArgs }> = [
    { args: ["--help"], expected: { command: "help" } },
    {
      args: ["convert", "outline.txt"],
      expected: { command: "convert", file: "outline.txt", format: "json", indent: 2 },
    },
    {
      args: ["convert", "--to", "markdown", "--indent", "0", "outline.txt"],
      expected: { command: "convert", file: "outline.txt", format: "markdown", indent: 0 },
    },
    {
      args: ["convert", "--to=numbered", "--indent=8", "outline.txt"],
      expected: { command: "convert", file: "outline.txt", format: "numbered", indent: 8 },
    },
    {
      args: ["convert", "--to", "markdown", "--to=paths", "outline.txt"],
      expected: { command: "convert", file: "outline.txt", format: "paths", indent: 2 },
    },
    {
      args: ["convert", "--indent", "1", "--indent=7", "outline.txt"],
      expected: { command: "convert", file: "outline.txt", format: "json", indent: 7 },
    },
    {
      args: ["convert", "outline.txt", "--to=paths"],
      expected: { command: "convert", file: "outline.txt", format: "paths", indent: 2 },
    },
    {
      args: ["convert", "--indent", "8", "outline.txt"],
      expected: { command: "convert", file: "outline.txt", format: "json", indent: 8 },
    },
    {
      args: ["convert", "-", "--to", "json"],
      expected: { command: "convert", file: "-", format: "json", indent: 2 },
    },
    {
      args: ["check", "one.txt"],
      expected: { command: "check", files: ["one.txt"], maxDepth: null },
    },
    {
      args: ["check", "--max-depth", "1", "one.txt", "two.txt"],
      expected: { command: "check", files: ["one.txt", "two.txt"], maxDepth: 1 },
    },
    {
      args: ["check", "--max-depth=99", "one.txt"],
      expected: { command: "check", files: ["one.txt"], maxDepth: 99 },
    },
    {
      args: ["check", "--max-depth", "2", "--max-depth=12", "one.txt"],
      expected: { command: "check", files: ["one.txt"], maxDepth: 12 },
    },
    {
      args: ["check", "one.txt", "--max-depth=5"],
      expected: { command: "check", files: ["one.txt"], maxDepth: 5 },
    },
    {
      args: ["check", "-", "one.txt"],
      expected: { command: "check", files: ["-", "one.txt"], maxDepth: null },
    },
    {
      args: ["sort", "outline.txt"],
      expected: { command: "sort", file: "outline.txt", reverse: false },
    },
    {
      args: ["sort", "--reverse", "outline.txt"],
      expected: { command: "sort", file: "outline.txt", reverse: true },
    },
    {
      args: ["sort", "outline.txt", "--reverse", "--reverse"],
      expected: { command: "sort", file: "outline.txt", reverse: true },
    },
    { args: ["sort", "-"], expected: { command: "sort", file: "-", reverse: false } },
  ];

  for (const example of validCases) {
    test(`parses ${example.args.join(" ")}`, () => {
      expect(parseArgs(example.args)).toEqual(example.expected);
    });
  }

  const errorCases: Array<{ args: string[]; message: string }> = [
    { args: [], message: "missing command (convert, check or sort)" },
    { args: ["remove"], message: 'unknown command "remove"' },
    { args: ["--help", "convert"], message: 'unknown option "--help"' },
    { args: ["convert", "--help", "outline.txt"], message: 'unknown option "--help"' },
    { args: ["convert", "--to"], message: "--to needs a value" },
    { args: ["convert", "--to="], message: 'invalid format ""' },
    { args: ["convert", "--to", "xml", "outline.txt"], message: 'invalid format "xml"' },
    { args: ["convert", "--to", "--indent", "outline.txt"], message: 'invalid format "--indent"' },
    { args: ["convert", "--to", "--help", "-"], message: 'unknown option "--help"' },
    { args: ["convert", "--indent"], message: "--indent needs a value" },
    { args: ["convert", "--indent", "--help", "-"], message: 'unknown option "--help"' },
    { args: ["convert", "--indent="], message: 'invalid indent ""' },
    { args: ["convert", "--indent", "9", "outline.txt"], message: 'invalid indent "9"' },
    { args: ["convert", "--indent", "00", "outline.txt"], message: 'invalid indent "00"' },
    { args: ["convert", "--indent", "-1", "outline.txt"], message: 'invalid indent "-1"' },
    { args: ["convert", "--unknown", "outline.txt"], message: 'unknown option "--unknown"' },
    { args: ["convert", "one.txt", "two.txt"], message: "too many arguments" },
    { args: ["convert", "--to", "markdown"], message: "missing FILE" },
    { args: ["convert"], message: "missing FILE" },
    { args: ["check", "--max-depth"], message: "--max-depth needs a value" },
    { args: ["check", "--max-depth", "--help", "-"], message: 'unknown option "--help"' },
    { args: ["check", "--max-depth="], message: 'invalid max depth ""' },
    { args: ["check", "--max-depth", "0", "one.txt"], message: 'invalid max depth "0"' },
    { args: ["check", "--max-depth", "00", "one.txt"], message: 'invalid max depth "00"' },
    { args: ["check", "--max-depth", "100", "one.txt"], message: 'invalid max depth "100"' },
    { args: ["check", "--max-depth", "-1", "one.txt"], message: 'invalid max depth "-1"' },
    { args: ["check", "--other", "one.txt"], message: 'unknown option "--other"' },
    { args: ["check"], message: "missing FILE" },
    { args: ["check", "-", "-"], message: "standard input given twice" },
    { args: ["check", "--max-depth", "1", "-", "-"], message: "standard input given twice" },
    { args: ["sort", "--reverse"], message: "missing FILE" },
    { args: ["sort", "--reverse", "one.txt", "two.txt"], message: "too many arguments" },
    { args: ["sort", "--unknown", "one.txt"], message: 'unknown option "--unknown"' },
    {
      args: ["sort", "--reverse", "--reverse=anything", "one.txt"],
      message: 'unknown option "--reverse=anything"',
    },
    { args: ["convert", "--unknown"], message: 'unknown option "--unknown"' },
  ];

  for (const example of errorCases) {
    test(`rejects ${example.args.join(" ") || "an empty argument list"}`, () => {
      expectUsage(example.args, example.message);
    });
  }
});

describe("run", () => {
  test("prints the exact help text and exits successfully", () => {
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

  const usageFailures = [
    { args: [], message: "missing command (convert, check or sort)" },
    { args: ["bad"], message: 'unknown command "bad"' },
    { args: ["convert"], message: "missing FILE" },
    { args: ["convert", "--to"], message: "--to needs a value" },
    { args: ["convert", "--to", "bad", "file.txt"], message: 'invalid format "bad"' },
    { args: ["convert", "--to", "--help", "-"], message: 'unknown option "--help"' },
    { args: ["convert", "--indent", "--help", "-"], message: 'unknown option "--help"' },
    { args: ["check", "--max-depth", "--help", "-"], message: 'unknown option "--help"' },
    { args: ["convert", "--indent", "9", "file.txt"], message: 'invalid indent "9"' },
    { args: ["convert", "--unknown", "file.txt"], message: 'unknown option "--unknown"' },
    { args: ["convert", "one.txt", "two.txt"], message: "too many arguments" },
    { args: ["check"], message: "missing FILE" },
    { args: ["check", "--max-depth", "00", "file.txt"], message: 'invalid max depth "00"' },
    { args: ["check", "-", "-"], message: "standard input given twice" },
    { args: ["sort"], message: "missing FILE" },
    { args: ["sort", "--unknown", "file.txt"], message: 'unknown option "--unknown"' },
    { args: ["sort", "one.txt", "two.txt"], message: "too many arguments" },
  ];

  for (const example of usageFailures) {
    test(`reports usage error: ${example.message}`, () => {
      const io = memoryIo();
      expect(run(example.args, io)).toBe(2);
      expect(io.stdout).toEqual([]);
      expect(io.stderr).toEqual([`indentree: ${example.message}\n`]);
      expect(io.reads).toEqual([]);
      expect(io.stdinReads).toBe(0);
    });
  }

  test("converts a file to JSON with the default format", () => {
    const io = memoryIo({ "plan.txt": "Fruit\n  Apple" });
    expect(run(["convert", "plan.txt"], io)).toBe(0);
    expect(io.stdout).toEqual([
      '[\n  {\n    "text": "Fruit",\n    "children": [\n      {\n        "text": "Apple",\n        "children": []\n      }\n    ]\n  }\n]\n',
    ]);
    expect(io.stderr).toEqual([]);
    expect(io.reads).toEqual(["plan.txt"]);
  });

  const conversionCases = [
    { format: "markdown", args: ["--to=markdown"], expected: "- A\n  - B\n" },
    { format: "numbered", args: ["--to", "numbered"], expected: "1 A\n1.1 B\n" },
    { format: "paths", args: ["--to=paths"], expected: "A\nA / B\n" },
    {
      format: "json compact",
      args: ["--indent=0"],
      expected: '[{"text":"A","children":[{"text":"B","children":[]}]}]\n',
    },
  ];

  for (const example of conversionCases) {
    test(`converts to ${example.format}`, () => {
      const io = memoryIo({ "outline.txt": "A\n  B" });
      expect(run(["convert", ...example.args, "outline.txt"], io)).toBe(0);
      expect(io.stdout).toEqual([example.expected]);
      expect(io.stderr).toEqual([]);
    });
  }

  test("accepts standard input and uses its display name in parser errors", () => {
    const io = memoryIo({}, "Root\n  Child\n   Bad");
    expect(run(["convert", "-"], io)).toBe(2);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([
      "indentree: <stdin>:3: indentation is not a multiple of the unit (2 spaces)\n",
    ]);
    expect(io.stdinReads).toBe(1);
    expect(io.reads).toEqual([]);
  });

  test("normalizes backslashes in input display names", () => {
    const io = memoryIo({ "notes\\draft.txt": "Root\n  Child\n   Bad" });
    expect(run(["convert", "notes\\draft.txt"], io)).toBe(2);
    expect(io.stderr).toEqual([
      "indentree: notes/draft.txt:3: indentation is not a multiple of the unit (2 spaces)\n",
    ]);
    expect(io.stdout).toEqual([]);
  });

  test("reports unreadable files with one stderr line and no stdout", () => {
    const io = memoryIo();
    expect(run(["convert", "missing.txt"], io)).toBe(2);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual(["indentree: missing.txt: cannot read the file\n"]);
    expect(io.reads).toEqual(["missing.txt"]);
  });

  test("reports invalid UTF-8 bytes without attempting to parse them", () => {
    const io = memoryIo({ "broken.txt": new Uint8Array([0xc3, 0x28]) });
    expect(run(["convert", "broken.txt"], io)).toBe(2);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual(["indentree: broken.txt: input is not valid UTF-8\n"]);
    expect(io.reads).toEqual(["broken.txt"]);
  });

  test("preserves a second leading BOM in the first item text", () => {
    const io = memoryIo({}, "\uFEFF\uFEFFRoot");

    expect(run(["convert", "--indent=0", "-"], io)).toBe(0);
    expect(io.stdout).toEqual(['[{"text":"\uFEFFRoot","children":[]}]\n']);
    expect(io.stderr).toEqual([]);
    expect(io.stdinReads).toBe(1);
  });

  test("check reads files in order and sums item counts when clean", () => {
    const io = memoryIo({ "one.txt": "A\n  B", "two.txt": "C" });
    expect(run(["check", "one.txt", "two.txt"], io)).toBe(0);
    expect(io.stdout).toEqual(["ok, 3 items in 2 files\n"]);
    expect(io.stderr).toEqual([]);
    expect(io.reads).toEqual(["one.txt", "two.txt"]);
  });

  test("check uses singular summary labels", () => {
    const io = memoryIo({ "only.txt": "A" });
    expect(run(["check", "only.txt"], io)).toBe(0);
    expect(io.stdout).toEqual(["ok, 1 item in 1 file\n"]);
  });

  test("check emits problems in file order, then the summary, and exits 1", () => {
    const io = memoryIo({
      "first.txt": "Fruit\n  Apple\n  Apple",
      "second.txt": "Todo:",
    });
    expect(run(["check", "first.txt", "second.txt"], io)).toBe(1);
    expect(io.stdout).toEqual([
      'first.txt:3: IT001 duplicate sibling "Apple" (first on line 2)\n' +
        'second.txt:1: IT003 "Todo:" ends with a colon but has no sub-items\n' +
        "2 problems\n",
    ]);
    expect(io.stderr).toEqual([]);
    expect(io.reads).toEqual(["first.txt", "second.txt"]);
  });

  test("check applies max depth and sorts same-line problems by code", () => {
    const io = memoryIo({ "depth.txt": "Parent\n  Repeat:\n  Repeat:" });
    expect(run(["check", "--max-depth=1", "depth.txt"], io)).toBe(1);
    expect(io.stdout).toEqual([
      "depth.txt:2: IT002 depth 2 exceeds the maximum of 1\n" +
        'depth.txt:2: IT003 "Repeat:" ends with a colon but has no sub-items\n' +
        'depth.txt:3: IT001 duplicate sibling "Repeat:" (first on line 2)\n' +
        "depth.txt:3: IT002 depth 2 exceeds the maximum of 1\n" +
        'depth.txt:3: IT003 "Repeat:" ends with a colon but has no sub-items\n' +
        "5 problems\n",
    ]);
  });

  test("does not write partial check output when a later file cannot be read", () => {
    const io = memoryIo({ "first.txt": "Repeat:\nRepeat:" });
    expect(run(["check", "first.txt", "missing.txt"], io)).toBe(2);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual(["indentree: missing.txt: cannot read the file\n"]);
    expect(io.reads).toEqual(["first.txt", "missing.txt"]);
  });

  test("reads standard input once among multiple checked files", () => {
    const io = memoryIo({ "other.txt": "A" }, "B");
    expect(run(["check", "-", "other.txt"], io)).toBe(0);
    expect(io.stdout).toEqual(["ok, 2 items in 2 files\n"]);
    expect(io.stdinReads).toBe(1);
    expect(io.reads).toEqual(["other.txt"]);
  });

  test("sort renders the alphabetized outline", () => {
    const io = memoryIo({ "sort.txt": "B\n  Z\n  A\nA" });
    expect(run(["sort", "sort.txt"], io)).toBe(0);
    expect(io.stdout).toEqual(["A\nB\n  A\n  Z\n"]);
    expect(io.stderr).toEqual([]);
  });

  test("sort supports reverse ordering and standard input", () => {
    const io = memoryIo({}, "A\nB");
    expect(run(["sort", "--reverse", "-"], io)).toBe(0);
    expect(io.stdout).toEqual(["B\nA\n"]);
    expect(io.stderr).toEqual([]);
    expect(io.stdinReads).toBe(1);
  });

  test("empty non-JSON conversion and sorting produce no output call", () => {
    const conversionIo = memoryIo({ "empty.txt": "" });
    expect(run(["convert", "--to=paths", "empty.txt"], conversionIo)).toBe(0);
    expect(conversionIo.stdout).toEqual([]);

    const sortingIo = memoryIo({ "empty.txt": "" });
    expect(run(["sort", "empty.txt"], sortingIo)).toBe(0);
    expect(sortingIo.stdout).toEqual([]);
  });

  test("all required work succeeds before convert output is written", () => {
    const io = memoryIo({ "first.txt": "A" });
    expect(run(["check", "first.txt", "missing.txt"], io)).toBe(2);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual(["indentree: missing.txt: cannot read the file\n"]);
  });
});
