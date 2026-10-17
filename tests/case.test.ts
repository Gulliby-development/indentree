import { describe, expect, test } from "bun:test";
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

describe("IT004 case-only sibling checks", () => {
  test("reports a single case-only sibling with its first line", () => {
    const io = memoryIo({ "case.txt": "Apple\napple" });

    expect(run(["check", "case.txt"], io)).toBe(1);
    expect(io.stdout).toEqual([
      'case.txt:2: IT004 sibling "apple" differs only in case from "Apple" (line 1)\n1 problem\n',
    ]);
    expect(io.stderr).toEqual([]);
  });

  test("uses the first folded match, while exact repeats remain IT001 only", () => {
    const io = memoryIo({
      "casing.txt": "Fruit\n  Apple\n  apple\n  Apple\n  APPLE\nfruit\n  apple\nTodo:",
    });

    expect(run(["check", "casing.txt"], io)).toBe(1);
    expect(io.stdout).toEqual([
      'casing.txt:3: IT004 sibling "apple" differs only in case from "Apple" (line 2)\n' +
        'casing.txt:4: IT001 duplicate sibling "Apple" (first on line 2)\n' +
        'casing.txt:5: IT004 sibling "APPLE" differs only in case from "Apple" (line 2)\n' +
        'casing.txt:6: IT004 sibling "fruit" differs only in case from "Fruit" (line 1)\n' +
        'casing.txt:8: IT003 "Todo:" ends with a colon but has no sub-items\n' +
        "5 problems\n",
    ]);
    expect(io.stderr).toEqual([]);

    const repeatedVariant = memoryIo({ "repeat.txt": "Apple\napple\napple" });
    expect(run(["check", "repeat.txt"], repeatedVariant)).toBe(1);
    expect(repeatedVariant.stdout).toEqual([
      'repeat.txt:2: IT004 sibling "apple" differs only in case from "Apple" (line 1)\n' +
        'repeat.txt:3: IT001 duplicate sibling "apple" (first on line 2)\n' +
        "2 problems\n",
    ]);
  });

  test("does not compare siblings under different parents", () => {
    const io = memoryIo({ "parents.txt": "Fruit\n  Apple\nVegetables\n  apple" });

    expect(run(["check", "parents.txt"], io)).toBe(0);
    expect(io.stdout).toEqual(["ok, 4 items in 1 file\n"]);
    expect(io.stderr).toEqual([]);
  });

  test("does not fold accented letters but folds ASCII letters in accented text", () => {
    const accentedDifference = memoryIo({ "accent.txt": "Éclair\néclair" });

    expect(run(["check", "accent.txt"], accentedDifference)).toBe(0);
    expect(accentedDifference.stdout).toEqual(["ok, 2 items in 1 file\n"]);
    expect(accentedDifference.stderr).toEqual([]);

    const asciiDifference = memoryIo({ "accent.txt": "Éclair\nÉCLAIR" });
    expect(run(["check", "accent.txt"], asciiDifference)).toBe(1);
    expect(asciiDifference.stdout).toEqual([
      'accent.txt:2: IT004 sibling "ÉCLAIR" differs only in case from "Éclair" (line 1)\n1 problem\n',
    ]);
    expect(asciiDifference.stderr).toEqual([]);
  });

  test("keeps spaces and punctuation significant and folds the A and Z boundaries", () => {
    const io = memoryIo({ "characters.txt": "A\na\nZ\nz\nApple pie\napplepie\nA!\na?" });

    expect(run(["check", "characters.txt"], io)).toBe(1);
    expect(io.stdout).toEqual([
      'characters.txt:2: IT004 sibling "a" differs only in case from "A" (line 1)\n' +
        'characters.txt:4: IT004 sibling "z" differs only in case from "Z" (line 3)\n' +
        "2 problems\n",
    ]);
    expect(io.stderr).toEqual([]);
  });

  test("sorts IT003 before IT004 on the same line", () => {
    const io = memoryIo({ "pear.txt": "Pear:\npear:" });

    expect(run(["check", "pear.txt"], io)).toBe(1);
    expect(io.stdout).toEqual([
      'pear.txt:1: IT003 "Pear:" ends with a colon but has no sub-items\n' +
        'pear.txt:2: IT003 "pear:" ends with a colon but has no sub-items\n' +
        'pear.txt:2: IT004 sibling "pear:" differs only in case from "Pear:" (line 1)\n' +
        "3 problems\n",
    ]);
    expect(io.stderr).toEqual([]);
  });

  test("compares files independently and aggregates findings", () => {
    const io = memoryIo({
      "one.txt": "A\na",
      "two.txt": "a\nb\nB",
    });

    expect(run(["check", "one.txt", "two.txt"], io)).toBe(1);
    expect(io.stdout).toEqual([
      'one.txt:2: IT004 sibling "a" differs only in case from "A" (line 1)\n' +
        'two.txt:3: IT004 sibling "B" differs only in case from "b" (line 2)\n' +
        "2 problems\n",
    ]);
    expect(io.stderr).toEqual([]);
    expect(io.reads).toEqual(["one.txt", "two.txt"]);
  });

  test("accepts CRLF input and writes LF-only output", () => {
    const io = memoryIo({ "windows.txt": "Apple\r\napple\r\n" });

    expect(run(["check", "windows.txt"], io)).toBe(1);
    expect(io.stdout).toEqual([
      'windows.txt:2: IT004 sibling "apple" differs only in case from "Apple" (line 1)\n1 problem\n',
    ]);
    expect(io.stdout.join("").includes("\r")).toBe(false);
    expect(io.stderr).toEqual([]);
  });

  test("checks standard input and prints the singular summary", () => {
    const io = memoryIo({}, "Go\ngo\n");

    expect(run(["check", "-"], io)).toBe(1);
    expect(io.stdout).toEqual([
      '<stdin>:2: IT004 sibling "go" differs only in case from "Go" (line 1)\n1 problem\n',
    ]);
    expect(io.stderr).toEqual([]);
    expect(io.stdinReads).toBe(1);
  });

  test("reports IT004 at the depth limit and beyond it with depth problems", () => {
    const io = memoryIo({
      "depth.txt": "Root\n  Apple\n  apple\n    Plum\n    plum",
    });

    expect(run(["check", "--max-depth=2", "depth.txt"], io)).toBe(1);
    expect(io.stdout).toEqual([
      'depth.txt:3: IT004 sibling "apple" differs only in case from "Apple" (line 2)\n' +
        "depth.txt:4: IT002 depth 3 exceeds the maximum of 2\n" +
        "depth.txt:5: IT002 depth 3 exceeds the maximum of 2\n" +
        'depth.txt:5: IT004 sibling "plum" differs only in case from "Plum" (line 4)\n' +
        "4 problems\n",
    ]);
    expect(io.stderr).toEqual([]);
  });
});
