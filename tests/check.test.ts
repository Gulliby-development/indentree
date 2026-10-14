import { describe, expect, test } from "bun:test";
import { checkOutline, countItems } from "../src/check";
import type { Item, Problem } from "../src/model";

function item(text: string, line: number, children: Item[] = []): Item {
  return { text, line, children };
}

function chain(depth: number): Item[] {
  const root: Item[] = [];
  let children = root;

  for (let level = 1; level <= depth; level += 1) {
    const current = item(`Level ${level}`, level);
    children.push(current);
    children = current.children;
  }

  return root;
}

describe("checkOutline", () => {
  const duplicateCases: Array<{ name: string; items: Item[]; expected: Problem[] }> = [
    {
      name: "reports a duplicate top-level sibling with the first line",
      items: [item("Fruit", 1), item("Vegetables", 2), item("Fruit", 3)],
      expected: [
        {
          line: 3,
          code: "IT001",
          message: 'duplicate sibling "Fruit" (first on line 1)',
        },
      ],
    },
    {
      name: "reports each later duplicate against the first matching sibling",
      items: [item("Same", 1), item("Same", 2), item("Same", 3)],
      expected: [
        {
          line: 2,
          code: "IT001",
          message: 'duplicate sibling "Same" (first on line 1)',
        },
        {
          line: 3,
          code: "IT001",
          message: 'duplicate sibling "Same" (first on line 1)',
        },
      ],
    },
    {
      name: "checks child sibling groups independently",
      items: [
        item("Fruit", 1, [item("Apple", 2), item("Pear", 3)]),
        item("Vegetables", 4, [item("Apple", 5), item("Apple", 6)]),
      ],
      expected: [
        {
          line: 6,
          code: "IT001",
          message: 'duplicate sibling "Apple" (first on line 5)',
        },
      ],
    },
  ];

  for (const example of duplicateCases) {
    test(example.name, () => {
      expect(checkOutline(example.items, null)).toEqual(example.expected);
    });
  }

  test("does not report equal text under different parents as duplicate siblings", () => {
    const items = [item("Fruit", 1, [item("Apple", 2)]), item("Vegetables", 3, [item("Apple", 4)])];

    expect(checkOutline(items, null)).toEqual([]);
  });

  test("reports no depth problems when no maximum is configured", () => {
    expect(checkOutline(chain(4), null)).toEqual([]);
  });

  test("reports every item deeper than the configured maximum", () => {
    expect(checkOutline(chain(4), 2)).toEqual([
      { line: 3, code: "IT002", message: "depth 3 exceeds the maximum of 2" },
      { line: 4, code: "IT002", message: "depth 4 exceeds the maximum of 2" },
    ]);
  });

  test("accepts an item exactly at the maximum depth of 1", () => {
    expect(checkOutline(chain(1), 1)).toEqual([]);
  });

  test("accepts depth 99 and reports depth 100 when the maximum is 99", () => {
    expect(checkOutline(chain(99), 99)).toEqual([]);
    expect(checkOutline(chain(100), 99)).toEqual([
      { line: 100, code: "IT002", message: "depth 100 exceeds the maximum of 99" },
    ]);
  });

  test("reports colon-terminated leaves but not sections with children", () => {
    const items = [
      item("Agenda:", 1, [item("Topic", 2)]),
      item("Notes:", 3),
      item("Ending.", 4),
      item("Colon::", 5),
    ];

    expect(checkOutline(items, null)).toEqual([
      { line: 3, code: "IT003", message: '"Notes:" ends with a colon but has no sub-items' },
      { line: 5, code: "IT003", message: '"Colon::" ends with a colon but has no sub-items' },
    ]);
  });

  test("returns combined problems sorted by line and then code", () => {
    const items = [item("Parent", 1, [item("Repeat:", 2), item("Repeat:", 3)])];

    expect(checkOutline(items, 1)).toEqual([
      { line: 2, code: "IT002", message: "depth 2 exceeds the maximum of 1" },
      {
        line: 2,
        code: "IT003",
        message: '"Repeat:" ends with a colon but has no sub-items',
      },
      {
        line: 3,
        code: "IT001",
        message: 'duplicate sibling "Repeat:" (first on line 2)',
      },
      { line: 3, code: "IT002", message: "depth 2 exceeds the maximum of 1" },
      {
        line: 3,
        code: "IT003",
        message: '"Repeat:" ends with a colon but has no sub-items',
      },
    ]);
  });
});

describe("countItems", () => {
  test("returns zero for an empty outline", () => {
    expect(countItems([])).toBe(0);
  });

  test("counts roots and every nested item", () => {
    const items = [
      item("Fruit", 1, [item("Apple", 2, [item("Gala", 3), item("Fuji", 4)]), item("Banana", 5)]),
      item("Vegetables", 6, [item("Carrot", 7)]),
    ];

    expect(countItems(items)).toBe(7);
  });
});
