<p align="center"><img src="docs/logo.svg" width="96" alt="" /></p>

# indentree

indentree is an offline command-line tool for people who keep notes, plans, and tables of contents as indented plain text. Convert an outline to JSON, Markdown, outline numbers, paths, or an HTML list; sort every level; and check for duplicate siblings, over-deep nesting, and section labels without content. The tool reads input only and never changes your files.

[![CI](https://github.com/Gulliby-development/indentree/actions/workflows/ci.yml/badge.svg)](https://github.com/Gulliby-development/indentree/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Why

If your plans and tables of contents live in plain indented text, indentree gives you the same outline as JSON, a Markdown list, outline numbers or paths, and tells you about duplicates and empty sections before they spread.

## Install

Install dependencies with Bun, then run the CLI directly:

```sh
bun install
bun run src/main.ts --help
```

## Usage

The command forms are:

```
usage: indentree convert [--to json|markdown|numbered|paths|html] [--indent N] FILE
       indentree check [--max-depth N] FILE...
       indentree sort [--reverse] FILE
```

Use a file path as `FILE`, or `-` to read standard input. Convert defaults to JSON; its `--indent` option accepts 0 through 8 and only affects JSON. Check accepts one or more files and an optional maximum depth. Sort orders each sibling group alphabetically; `--reverse` sorts in descending order.

For example, save this outline as `plan.txt`:

```text
Fruit
  Banana
  Apple
    Gala
    Fuji
Vegetables
  Carrot
```

`indentree convert --to markdown plan.txt`:

```text
- Fruit
  - Banana
  - Apple
    - Gala
    - Fuji
- Vegetables
  - Carrot
```

`indentree convert --to numbered plan.txt`:

```text
1 Fruit
1.1 Banana
1.2 Apple
1.2.1 Gala
1.2.2 Fuji
2 Vegetables
2.1 Carrot
```

`indentree convert --to paths plan.txt`:

```text
Fruit
Fruit / Banana
Fruit / Apple
Fruit / Apple / Gala
Fruit / Apple / Fuji
Vegetables
Vegetables / Carrot
```

`indentree convert --to html plan.txt`:

```text
<ul>
  <li>Fruit
    <ul>
      <li>Banana</li>
      <li>Apple
        <ul>
          <li>Gala</li>
          <li>Fuji</li>
        </ul>
      </li>
    </ul>
  </li>
  <li>Vegetables
    <ul>
      <li>Carrot</li>
    </ul>
  </li>
</ul>
```

The `html` format writes nested `<ul>` and `<li>` elements, two spaces per element level, and escapes `&`, `<` and `>` in item text as `&amp;`, `&lt;` and `&gt;`. It adds no `<html>` or `<body>` wrapper, so the output can be pasted into a page. An empty outline prints nothing.

`indentree sort plan.txt`:

```text
Fruit
  Apple
    Fuji
    Gala
  Banana
Vegetables
  Carrot
```

`indentree check plan.txt`:

```text
ok, 7 items in 1 file
```

## Input format

Input is UTF-8 text. A leading BOM is ignored; lines may use LF or CRLF. Blank lines are skipped, trailing spaces and tabs are removed from item text, and physical line numbers are preserved. The first indented item sets the indentation unit (for example, two spaces or one tab); each indented line must use whole units of the same character. The first item must not be indented, and an item cannot be more than one level deeper than the preceding item. Empty input is a valid outline.

## Check codes

- `IT001`: a later sibling repeats the text of an earlier sibling under the same parent.
- `IT002`: with `--max-depth M`, an item is deeper than the maximum (the top level is depth 1).
- `IT003`: an item ends in a colon but has no sub-items.
- `IT004`: a later sibling differs from an earlier sibling only in the case of the letters A to Z, for example `apple` after `Apple`. An exact repeat is `IT001` only; other letters and spaces are compared as they are.
- `IT005`: an item starts with an outline number such as `1.`, `2)` or `2.3` followed by a space; `convert --to numbered` would number it a second time. Texts such as `2024 plan` and `1.5x faster` are not flagged.

For example, save this outline as `messy.txt`:

```text
Fruit
  Apple
  Apple
    Gala:
Fruit
  Plum
    Stone
      Pit
Todo:
```

`indentree check --max-depth 3 messy.txt`:

```text
messy.txt:3: IT001 duplicate sibling "Apple" (first on line 2)
messy.txt:4: IT003 "Gala:" ends with a colon but has no sub-items
messy.txt:5: IT001 duplicate sibling "Fruit" (first on line 1)
messy.txt:8: IT002 depth 4 exceeds the maximum of 3
messy.txt:9: IT003 "Todo:" ends with a colon but has no sub-items
5 problems
```

For example, save this outline as `numbered.txt`:

```text
1. Intro
  1.1 Scope
  Background
2024 plan
```

`indentree check numbered.txt`:

```text
numbered.txt:1: IT005 "1. Intro" starts with the outline number "1."
numbered.txt:2: IT005 "1.1 Scope" starts with the outline number "1.1"
2 problems
```

## Exit codes

- `convert` and `sort`: 0 on success.
- `check`: 0 when there are no problems, 1 when problems are found.
- Usage or input errors: 2.

## Development

Run the test suite, strict typecheck, and linter with:

```sh
bun test
bun run typecheck
bun run lint
```

## License

MIT, see [LICENSE](LICENSE).

---

Built with BAKED, an open-source coding agent (bench loop round 21).
