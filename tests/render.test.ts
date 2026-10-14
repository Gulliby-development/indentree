import { describe, expect, test } from "bun:test";
import type { Item } from "../src/model";
import { type Format, outlineText, render } from "../src/render";
import { sortItems } from "../src/sort";

function item(text: string, line: number, children: Item[] = []): Item {
  return { text, line, children };
}

function plan(): Item[] {
  return [
    item("Fruit", 1, [item("Banana", 2), item("Apple", 3, [item("Gala", 4), item("Fuji", 5)])]),
    item("Vegetables", 6, [item("Carrot", 7)]),
  ];
}

describe("render", () => {
  const formatCases: Array<{ format: Format; expected: string }> = [
    {
      format: "markdown",
      expected:
        "- Fruit\n  - Banana\n  - Apple\n    - Gala\n    - Fuji\n- Vegetables\n  - Carrot\n",
    },
    {
      format: "numbered",
      expected:
        "1 Fruit\n1.1 Banana\n1.2 Apple\n1.2.1 Gala\n1.2.2 Fuji\n2 Vegetables\n2.1 Carrot\n",
    },
    {
      format: "paths",
      expected:
        "Fruit\nFruit / Banana\nFruit / Apple\nFruit / Apple / Gala\nFruit / Apple / Fuji\nVegetables\nVegetables / Carrot\n",
    },
  ];

  for (const example of formatCases) {
    test(`renders the ${example.format} format in document order`, () => {
      expect(render(plan(), example.format, 2)).toBe(example.expected);
    });
  }

  test("renders JSON with text and children but without source line numbers", () => {
    expect(render(plan(), "json", 2)).toBe(
      '[\n  {\n    "text": "Fruit",\n    "children": [\n      {\n        "text": "Banana",\n        "children": []\n      },\n      {\n        "text": "Apple",\n        "children": [\n          {\n            "text": "Gala",\n            "children": []\n          },\n          {\n            "text": "Fuji",\n            "children": []\n          }\n        ]\n      }\n    ]\n  },\n  {\n    "text": "Vegetables",\n    "children": [\n      {\n        "text": "Carrot",\n        "children": []\n      }\n    ]\n  }\n]\n',
    );
  });

  for (const indent of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`uses ${indent} spaces for JSON indentation`, () => {
      const expectedItems = [{ text: "Root", children: [{ text: "Child", children: [] }] }];
      expect(render([item("Root", 1, [item("Child", 2)])], "json", indent)).toBe(
        `${JSON.stringify(expectedItems, null, indent)}\n`,
      );
    });
  }

  test("JSON escapes quotes and preserves non-ASCII text", () => {
    expect(render([item('Quote " — café 世界 😀', 1)], "json", 0)).toBe(
      '[{"text":"Quote \\" — café 世界 😀","children":[]}]\n',
    );
  });

  test("ignores the indentation argument for non-JSON formats", () => {
    for (const format of ["markdown", "numbered", "paths"] as const) {
      expect(render(plan(), format, 0)).toBe(render(plan(), format, 8));
    }
  });

  test("renders empty outlines in each format", () => {
    expect(render([], "json", 2)).toBe("[]\n");
    expect(render([], "markdown", 2)).toBe("");
    expect(render([], "numbered", 2)).toBe("");
    expect(render([], "paths", 2)).toBe("");
  });

  test("outlineText writes plain indented text in document order", () => {
    expect(outlineText(plan())).toBe(
      "Fruit\n  Banana\n  Apple\n    Gala\n    Fuji\nVegetables\n  Carrot\n",
    );
  });

  test("outlineText returns an empty string for an empty outline", () => {
    expect(outlineText([])).toBe("");
  });
});

describe("sortItems", () => {
  test("sorts the top level and every child level without changing item data", () => {
    const input = [
      item("Beta", 10, [
        item("Zoo", 11, [item("delta", 12), item("Alpha", 13)]),
        item("Apple", 14),
      ]),
      item("Alpha", 20, [item("pear", 21)]),
    ];

    expect(sortItems(input, false)).toEqual([
      item("Alpha", 20, [item("pear", 21)]),
      item("Beta", 10, [
        item("Apple", 14),
        item("Zoo", 11, [item("Alpha", 13), item("delta", 12)]),
      ]),
    ]);
  });

  const codePointCases: Array<{
    reverse: boolean;
    expected: string[];
    direction: string;
  }> = [
    { reverse: false, expected: ["a", "ａ", "😀"], direction: "ascending" },
    { reverse: true, expected: ["😀", "ａ", "a"], direction: "descending" },
  ];

  for (const example of codePointCases) {
    test(`sorts Unicode code points ${example.direction}`, () => {
      const input = [item("😀", 1), item("ａ", 2), item("a", 3)];
      expect(sortItems(input, example.reverse).map(({ text }) => text)).toEqual(example.expected);
    });
  }

  test("keeps equal texts stable in both directions at every sibling level", () => {
    const input = [
      item("same", 1, [item("same", 11), item("z", 12), item("same", 13)]),
      item("z", 2, [item("same", 21)]),
      item("same", 3, [item("same", 31), item("same", 32)]),
    ];

    const ascending = sortItems(input, false);
    expect(ascending.map(({ line }) => line)).toEqual([1, 3, 2]);
    expect(ascending.map(({ children }) => children.map(({ line }) => line))).toEqual([
      [11, 13, 12],
      [31, 32],
      [21],
    ]);

    const descending = sortItems(input, true);
    expect(descending.map(({ line }) => line)).toEqual([2, 1, 3]);
    expect(descending.map(({ children }) => children.map(({ line }) => line))).toEqual([
      [21],
      [12, 11, 13],
      [31, 32],
    ]);
  });

  test("returns deep copies and leaves its input unchanged", () => {
    const input = [item("Zulu", 1, [item("Beta", 2)]), item("Alpha", 3)];
    const sorted = sortItems(input, false);

    expect(input).toEqual([item("Zulu", 1, [item("Beta", 2)]), item("Alpha", 3)]);
    expect(sorted).not.toBe(input);

    const sortedZulu = sorted[1];
    const originalZulu = input[0];
    if (sortedZulu === undefined || originalZulu === undefined) {
      throw new Error("Expected both Zulu items to exist");
    }
    expect(sortedZulu).not.toBe(originalZulu);
    expect(sortedZulu.children).not.toBe(originalZulu.children);
    expect(sortedZulu.children[0]).not.toBe(originalZulu.children[0]);

    sortedZulu.text = "Changed";
    const sortedChild = sortedZulu.children[0];
    if (sortedChild === undefined) {
      throw new Error("Expected the copied child to exist");
    }
    sortedChild.text = "Changed child";

    expect(input).toEqual([item("Zulu", 1, [item("Beta", 2)]), item("Alpha", 3)]);
  });

  test("sorts an empty outline to a new empty array", () => {
    const input: Item[] = [];
    const sorted = sortItems(input, false);
    expect(sorted).toEqual([]);
    expect(sorted).not.toBe(input);
  });
});
