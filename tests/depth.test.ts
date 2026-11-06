import { describe, expect, test } from "bun:test";
import { type ParsedArgs, parseArgs, UsageError } from "../src/args";
import type { Io } from "../src/cli";
import { run } from "../src/cli";
import { parseOutline } from "../src/parse";
import { outlineText } from "../src/render";
import { sortItems } from "../src/sort";

const PLAN = "Fruit\n  Banana\n  Apple\n    Gala\n    Fuji\nVegetables\n  Carrot\n";
const DEEP = "b\n  z\n  y\n    q\n      t\n      s\n    p\na\n  m\n  l\n";

function sortedText(text: string, reverse: boolean, depth?: number): string {
  return outlineText(sortItems(parseOutline("<test>", text), reverse, depth));
}

function memoryIo(files: Record<string, string>): Io & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    readStdin() {
      return new TextEncoder().encode("");
    },
    readFile(path) {
      const content = files[path];
      if (content === undefined) {
        throw new Error("missing in-memory file");
      }
      return new TextEncoder().encode(content);
    },
    out(text) {
      stdout.push(text);
    },
    err(text) {
      stderr.push(text);
    },
  };
}

describe("sort --depth parsing", () => {
  test("keeps the default of every level", () => {
    expect(parseArgs(["sort", "plan.txt"])).toEqual({
      command: "sort",
      file: "plan.txt",
      reverse: false,
    });
  });

  test("reads the depth with a space or an equals sign, in any place", () => {
    const expected: ParsedArgs = { command: "sort", file: "plan.txt", reverse: true, depth: 2 };
    expect(parseArgs(["sort", "--depth", "2", "--reverse", "plan.txt"])).toEqual(expected);
    expect(parseArgs(["sort", "plan.txt", "--reverse", "--depth=2"])).toEqual(expected);
  });

  test("the last depth wins", () => {
    expect(parseArgs(["sort", "--depth", "3", "--depth", "1", "plan.txt"])).toMatchObject({
      depth: 1,
    });
  });

  test.each(["0", "10", "-1", "x", "", "01", "1.5"])("rejects the depth %p", (value) => {
    expect(() => parseArgs(["sort", "--depth", value, "plan.txt"])).toThrow(
      new UsageError(`invalid depth "${value}"`),
    );
  });

  test("a missing value is an error", () => {
    expect(() => parseArgs(["sort", "--depth"])).toThrow(new UsageError("--depth needs a value"));
  });

  test("only sort knows the option", () => {
    expect(() => parseArgs(["convert", "--depth", "1", "plan.txt"])).toThrow(
      new UsageError('unknown option "--depth"'),
    );
    expect(() => parseArgs(["check", "--depth=1", "plan.txt"])).toThrow(
      new UsageError('unknown option "--depth=1"'),
    );
  });
});

describe("sort --depth output", () => {
  test("depth 1 sorts only the top level", () => {
    expect(sortedText(PLAN, false, 1)).toBe(
      "Fruit\n  Banana\n  Apple\n    Gala\n    Fuji\nVegetables\n  Carrot\n",
    );
  });

  test("depth 2 sorts the children but not the grandchildren", () => {
    expect(sortedText(PLAN, false, 2)).toBe(
      "Fruit\n  Apple\n    Gala\n    Fuji\n  Banana\nVegetables\n  Carrot\n",
    );
  });

  test("a depth at or beyond the outline equals the default", () => {
    expect(sortedText(PLAN, false, 3)).toBe(sortedText(PLAN, false));
    expect(sortedText(PLAN, false, 9)).toBe(sortedText(PLAN, false));
  });

  test("reverse applies to the sorted levels only", () => {
    expect(sortedText(DEEP, true, 2)).toBe(
      "b\n  z\n  y\n    q\n      t\n      s\n    p\na\n  m\n  l\n",
    );
    expect(sortedText(DEEP, true, 1)).toBe(
      "b\n  z\n  y\n    q\n      t\n      s\n    p\na\n  m\n  l\n",
    );
    expect(sortedText(DEEP, false, 2)).toBe(
      "a\n  l\n  m\nb\n  y\n    q\n      t\n      s\n    p\n  z\n",
    );
    expect(sortedText(DEEP, false, 3)).toBe(
      "a\n  l\n  m\nb\n  y\n    p\n    q\n      t\n      s\n  z\n",
    );
  });

  test("an empty outline stays empty", () => {
    expect(sortedText("", false, 1)).toBe("");
  });
});

describe("run with --depth", () => {
  test("prints the README example for depth 1", () => {
    const io = memoryIo({ "plan.txt": PLAN });
    expect(run(["sort", "--depth", "1", "plan.txt"], io)).toBe(0);
    expect(io.stdout).toEqual([PLAN]);
    expect(io.stderr).toEqual([]);
  });

  test("reports a bad depth with exit code 2 and no output", () => {
    const io = memoryIo({ "plan.txt": PLAN });
    expect(run(["sort", "--depth", "0", "plan.txt"], io)).toBe(2);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual(['indentree: invalid depth "0"\n']);
  });

  test("prints the help text with the new option", () => {
    const io = memoryIo({});
    expect(run(["--help"], io)).toBe(0);
    expect(io.stdout).toEqual([
      "usage: indentree convert [--to json|markdown|numbered|paths|html] [--indent N] FILE\n" +
        "       indentree check [--max-depth N] FILE...\n" +
        "       indentree sort [--reverse] [--depth N] FILE\n",
    ]);
  });
});
