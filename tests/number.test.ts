import { describe, expect, test } from "bun:test";
import { checkOutline } from "../src/check";
import { run } from "../src/cli";
import type { Item } from "../src/model";

function item(text: string, line: number, children: Item[] = []): Item {
  return { text, line, children };
}

describe("IT005 outline numbers", () => {
  test("flags a number with a dot", () => {
    expect(checkOutline([item("1. Intro", 1)], null)).toEqual([
      { line: 1, code: "IT005", message: '"1. Intro" starts with the outline number "1."' },
    ]);
  });

  test("flags a number with a closing parenthesis", () => {
    expect(checkOutline([item("2) Notes", 4)], null)).toEqual([
      { line: 4, code: "IT005", message: '"2) Notes" starts with the outline number "2)"' },
    ]);
  });

  test("flags dotted numbers with and without a final mark", () => {
    const problems = checkOutline(
      [item("2.3 Scope", 1), item("2.3. Goals", 2), item("10.1.2) Deep", 3)],
      null,
    );
    expect(problems.map((problem) => problem.message)).toEqual([
      '"2.3 Scope" starts with the outline number "2.3"',
      '"2.3. Goals" starts with the outline number "2.3."',
      '"10.1.2) Deep" starts with the outline number "10.1.2)"',
    ]);
  });

  test("flags a child and keeps the number as written", () => {
    const outline = [item("Plan", 1, [item("1.1  Two spaces", 2)])];
    expect(checkOutline(outline, null)).toEqual([
      {
        line: 2,
        code: "IT005",
        message: '"1.1  Two spaces" starts with the outline number "1.1"',
      },
    ]);
  });

  test("leaves texts that are not outline numbers", () => {
    const outline = [
      item("2024 plan", 1),
      item("1.5x faster", 2),
      item("version 1.2 notes", 3),
      item("1.", 4),
      item("3.14", 5),
      item("A. Intro", 6),
      item("1 .5 x", 7),
    ];
    expect(checkOutline(outline, null)).toEqual([]);
  });

  test("orders IT005 after the other codes of the same line", () => {
    const outline = [item("1. Todo:", 1), item("Todo:", 2, [item("2.1 Sub", 3)])];
    expect(checkOutline(outline, 1).map((problem) => `${problem.line} ${problem.code}`)).toEqual([
      "1 IT003",
      "1 IT005",
      "3 IT002",
      "3 IT005",
    ]);
  });

  test("check prints the problems of a numbered outline", () => {
    const out: string[] = [];
    const code = run(["check", "numbered.txt"], {
      readStdin: () => new Uint8Array(),
      readFile: () => new TextEncoder().encode("1. Intro\n  1.1 Scope\n  Background\n2024 plan\n"),
      out: (text) => out.push(text),
      err: () => undefined,
    });
    expect(code).toBe(1);
    expect(out.join("")).toBe(
      [
        'numbered.txt:1: IT005 "1. Intro" starts with the outline number "1."',
        'numbered.txt:2: IT005 "1.1 Scope" starts with the outline number "1.1"',
        "2 problems",
        "",
      ].join("\n"),
    );
  });
});
