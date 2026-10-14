import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readme = readFileSync(join(import.meta.dir, "../README.md"), "utf8").replace(/\r\n/g, "\n");

const planInput = [
  "Fruit",
  "  Banana",
  "  Apple",
  "    Gala",
  "    Fuji",
  "Vegetables",
  "  Carrot",
].join("\n");
const messyInput = [
  "Fruit",
  "  Apple",
  "  Apple",
  "    Gala:",
  "Fruit",
  "  Plum",
  "    Stone",
  "      Pit",
  "Todo:",
].join("\n");

function textBlock(text: string): string {
  return `\`\`\`text\n${text}\n\`\`\``;
}

function commandOutput(command: string, output: string): string {
  return `\`${command}\`:\n\n${textBlock(output)}`;
}

describe("README documentation", () => {
  test("documents the three usage forms verbatim", () => {
    expect(readme).toContain(
      [
        "usage: indentree convert [--to json|markdown|numbered|paths|html] [--indent N] FILE",
        "       indentree check [--max-depth N] FILE...",
        "       indentree sort [--reverse] FILE",
      ].join("\n"),
    );
  });

  test("includes the plan.txt input verbatim", () => {
    expect(readme).toContain(
      `For example, save this outline as \`plan.txt\`:\n\n${textBlock(planInput)}`,
    );
  });

  test("includes the markdown output for plan.txt verbatim", () => {
    expect(readme).toContain(
      commandOutput(
        "indentree convert --to markdown plan.txt",
        [
          "- Fruit",
          "  - Banana",
          "  - Apple",
          "    - Gala",
          "    - Fuji",
          "- Vegetables",
          "  - Carrot",
        ].join("\n"),
      ),
    );
  });

  test("includes the numbered output for plan.txt verbatim", () => {
    expect(readme).toContain(
      commandOutput(
        "indentree convert --to numbered plan.txt",
        [
          "1 Fruit",
          "1.1 Banana",
          "1.2 Apple",
          "1.2.1 Gala",
          "1.2.2 Fuji",
          "2 Vegetables",
          "2.1 Carrot",
        ].join("\n"),
      ),
    );
  });

  test("includes the paths output for plan.txt verbatim", () => {
    expect(readme).toContain(
      commandOutput(
        "indentree convert --to paths plan.txt",
        [
          "Fruit",
          "Fruit / Banana",
          "Fruit / Apple",
          "Fruit / Apple / Gala",
          "Fruit / Apple / Fuji",
          "Vegetables",
          "Vegetables / Carrot",
        ].join("\n"),
      ),
    );
  });

  test("includes the sort output for plan.txt verbatim", () => {
    expect(readme).toContain(
      commandOutput(
        "indentree sort plan.txt",
        ["Fruit", "  Apple", "    Fuji", "    Gala", "  Banana", "Vegetables", "  Carrot"].join(
          "\n",
        ),
      ),
    );
  });

  test("includes the clean check output for plan.txt verbatim", () => {
    expect(readme).toContain(commandOutput("indentree check plan.txt", "ok, 7 items in 1 file"));
  });

  test("includes the messy.txt input verbatim", () => {
    expect(readme).toContain(
      `For example, save this outline as \`messy.txt\`:\n\n${textBlock(messyInput)}`,
    );
  });

  test("includes the messy.txt check output verbatim", () => {
    expect(readme).toContain(
      commandOutput(
        "indentree check --max-depth 3 messy.txt",
        [
          'messy.txt:3: IT001 duplicate sibling "Apple" (first on line 2)',
          'messy.txt:4: IT003 "Gala:" ends with a colon but has no sub-items',
          'messy.txt:5: IT001 duplicate sibling "Fruit" (first on line 1)',
          "messy.txt:8: IT002 depth 4 exceeds the maximum of 3",
          'messy.txt:9: IT003 "Todo:" ends with a colon but has no sub-items',
          "5 problems",
        ].join("\n"),
      ),
    );
  });

  test("documents every required section", () => {
    for (const heading of [
      "## Install",
      "## Usage",
      "## Input format",
      "## Check codes",
      "## Exit codes",
      "## Development",
    ]) {
      expect(readme).toContain(heading);
    }
  });
});
