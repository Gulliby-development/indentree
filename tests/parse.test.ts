import { describe, expect, test } from "bun:test";
import { type Item, OutlineError } from "../src/model";
import { parseOutline } from "../src/parse";

function item(text: string, line: number, children: Item[] = []): Item {
  return { text, line, children };
}

describe("parseOutline", () => {
  const validCases: Array<{ name: string; input: string; expected: Item[] }> = [
    {
      name: "root siblings and physical line numbers",
      input: "Alpha\nBeta\nGamma",
      expected: [item("Alpha", 1), item("Beta", 2), item("Gamma", 3)],
    },
    {
      name: "children attach to the closest earlier item one level above",
      input: "Fruit\n  Banana\n  Apple\n    Gala\n    Fuji\nVegetables\n  Carrot",
      expected: [
        item("Fruit", 1, [item("Banana", 2), item("Apple", 3, [item("Gala", 4), item("Fuji", 5)])]),
        item("Vegetables", 6, [item("Carrot", 7)]),
      ],
    },
    {
      name: "a single leading BOM is skipped",
      input: "\uFEFFRoot\n  Child",
      expected: [item("Root", 1, [item("Child", 2)])],
    },
    {
      name: "only the leading BOM is skipped",
      input: "Root\n\uFEFFSecond",
      expected: [item("Root", 1), item("\uFEFFSecond", 2)],
    },
    {
      name: "CRLF lines lose one CR and retain physical line numbers",
      input: "Root\r\n\r\n  Child\r\nEnd",
      expected: [item("Root", 1, [item("Child", 3)]), item("End", 4)],
    },
    {
      name: "a terminal newline does not add an item",
      input: "Root\n",
      expected: [item("Root", 1)],
    },
    {
      name: "a final CR without LF remains part of the text",
      input: "Root\r",
      expected: [item("Root\r", 1)],
    },
    {
      name: "one CR is removed before LF while an additional CR remains",
      input: "Root\r\r\n",
      expected: [item("Root\r", 1)],
    },
    {
      name: "empty input is an empty outline",
      input: "",
      expected: [],
    },
    {
      name: "spaces and tabs on blank lines are skipped",
      input: " \t \nRoot\n\t \t\n  Child",
      expected: [item("Root", 2, [item("Child", 4)])],
    },
    {
      name: "an outline of only whitespace lines is empty",
      input: " \n\t\n \t ",
      expected: [],
    },
    {
      name: "trailing spaces and tabs are removed from item text",
      input: "Root \t \n  Child\t ",
      expected: [item("Root", 1, [item("Child", 2)])],
    },
    {
      name: "hashes, hyphens, and non-ASCII text are ordinary item text",
      input: "# Heading\n- List item\n  Привет 世界",
      expected: [item("# Heading", 1), item("- List item", 2, [item("Привет 世界", 3)])],
    },
    {
      name: "two spaces form the unit at all hierarchy levels",
      input: "Root\n  Child\n    Grandchild\n  Sibling",
      expected: [item("Root", 1, [item("Child", 2, [item("Grandchild", 3)]), item("Sibling", 4)])],
    },
    {
      name: "three spaces form a valid unit",
      input: "Root\n   Child\n      Grandchild",
      expected: [item("Root", 1, [item("Child", 2, [item("Grandchild", 3)])])],
    },
    {
      name: "tabs form a valid unit",
      input: "Root\n\tChild\n\t\tGrandchild\n\tSibling",
      expected: [item("Root", 1, [item("Child", 2, [item("Grandchild", 3)]), item("Sibling", 4)])],
    },
    {
      name: "the first complete multi-tab indentation establishes the unit",
      input: "Root\n\t\tChild\n\t\t\t\tGrandchild",
      expected: [item("Root", 1, [item("Child", 2, [item("Grandchild", 3)])])],
    },
    {
      name: "indentation units are local to each parsed outline",
      input: "Root\n\tChild",
      expected: [item("Root", 1, [item("Child", 2)])],
    },
    {
      name: "a root after a nested branch starts another top-level item",
      input: "Root\n  Child\nOther\n  Next",
      expected: [item("Root", 1, [item("Child", 2)]), item("Other", 3, [item("Next", 4)])],
    },
    {
      name: "text preserves internal spaces and punctuation",
      input: "Root\n  A  middle  -  end  ",
      expected: [item("Root", 1, [item("A  middle  -  end", 2)])],
    },
  ];

  for (const example of validCases) {
    test(`parses ${example.name}`, () => {
      expect(parseOutline("outline.txt", example.input)).toEqual(example.expected);
    });
  }

  const errorCases: Array<{
    name: string;
    display: string;
    input: string;
    line: number;
    message: string;
  }> = [
    {
      name: "mixed characters in the first indentation precede the first-item error",
      display: "outline.txt",
      input: " \tRoot",
      line: 1,
      message: "mixed tabs and spaces in the indentation",
    },
    {
      name: "an indented first item is rejected after blank lines",
      display: "outline.txt",
      input: "\n \n  Root",
      line: 3,
      message: "first item must not be indented",
    },
    {
      name: "one leading space on the first item is rejected",
      display: "outline.txt",
      input: " Root",
      line: 1,
      message: "first item must not be indented",
    },
    {
      name: "mixed spaces and tabs on one later line are rejected",
      display: "outline.txt",
      input: "Root\n \tChild",
      line: 2,
      message: "mixed tabs and spaces in the indentation",
    },
    {
      name: "a tab is rejected after a spaces unit",
      display: "outline.txt",
      input: "Root\n  Child\n\tOther",
      line: 3,
      message: "mixed tabs and spaces in the indentation",
    },
    {
      name: "spaces are rejected after a tabs unit",
      display: "outline.txt",
      input: "Root\n\tChild\n  Other",
      line: 3,
      message: "mixed tabs and spaces in the indentation",
    },
    {
      name: "a different indentation character takes precedence over non-multiple length",
      display: "outline.txt",
      input: "Root\n  Child\n\tX",
      line: 3,
      message: "mixed tabs and spaces in the indentation",
    },
    {
      name: "three spaces are not a multiple of a two-space unit",
      display: "outline.txt",
      input: "Root\n  Child\n   Other",
      line: 3,
      message: "indentation is not a multiple of the unit (2 spaces)",
    },
    {
      name: "two spaces are not a multiple of a three-space unit",
      display: "outline.txt",
      input: "Root\n   Child\n  Other",
      line: 3,
      message: "indentation is not a multiple of the unit (3 spaces)",
    },
    {
      name: "three tabs are not a multiple of a two-tab unit",
      display: "outline.txt",
      input: "Root\n\t\tChild\n\t\t\tOther",
      line: 3,
      message: "indentation is not a multiple of the unit (2 tabs)",
    },
    {
      name: "two tabs are not a multiple of a three-tab unit",
      display: "outline.txt",
      input: "Root\n\t\t\tChild\n\t\tOther",
      line: 3,
      message: "indentation is not a multiple of the unit (3 tabs)",
    },
    {
      name: "indentation is checked against the first complete unit",
      display: "outline.txt",
      input: "Root\n    Child\n      Other",
      line: 3,
      message: "indentation is not a multiple of the unit (4 spaces)",
    },
    {
      name: "a line cannot jump more than one level deeper",
      display: "outline.txt",
      input: "Root\n  Child\n      Grandchild",
      line: 3,
      message: "item is more than one level deeper than the previous item",
    },
    {
      name: "the depth-jump error uses the physical line after blank lines",
      display: "outline.txt",
      input: "Root\n  Child\n\n\n      Grandchild",
      line: 5,
      message: "item is more than one level deeper than the previous item",
    },
    {
      name: "a depth jump is checked after indentation divisibility",
      display: "outline.txt",
      input: "Root\n  Child\n     Grandchild",
      line: 3,
      message: "indentation is not a multiple of the unit (2 spaces)",
    },
    {
      name: "the supplied display name is retained in the complete error message",
      display: "notes\\draft.txt",
      input: "Root\n  Child\n   Bad",
      line: 3,
      message: "indentation is not a multiple of the unit (2 spaces)",
    },
  ];

  for (const example of errorCases) {
    test(`rejects ${example.name}`, () => {
      let caught: unknown;
      try {
        parseOutline(example.display, example.input);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(OutlineError);
      expect(caught instanceof Error ? caught.message : "").toBe(
        `${example.display}:${example.line}: ${example.message}`,
      );
    });
  }

  test("one space can be the indentation unit", () => {
    expect(parseOutline("outline.txt", "Root\n Child")).toEqual([
      item("Root", 1, [item("Child", 2)]),
    ]);
  });

  test("one tab can be the indentation unit", () => {
    expect(parseOutline("outline.txt", "Root\n\tChild")).toEqual([
      item("Root", 1, [item("Child", 2)]),
    ]);
  });
});
