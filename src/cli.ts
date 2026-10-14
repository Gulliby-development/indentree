import { type ParsedArgs, parseArgs, UsageError } from "./args";
import { checkOutline, countItems } from "./check";
import { type Item, OutlineError, type Problem } from "./model";
import { parseOutline } from "./parse";
import { type Format, outlineText, render } from "./render";
import { sortItems } from "./sort";

export interface Io {
  readStdin(): Uint8Array;
  readFile(path: string): Uint8Array;
  out(text: string): void;
  err(text: string): void;
}

const HELP_TEXT =
  "usage: indentree convert [--to json|markdown|numbered|paths|html] [--indent N] FILE\n" +
  "       indentree check [--max-depth N] FILE...\n" +
  "       indentree sort [--reverse] FILE\n";

class RunError extends Error {}

export function run(args: string[], io: Io): number {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`indentree: ${error.message}\n`);
      return 2;
    }
    throw error;
  }

  if (parsed.command === "help") {
    io.out(HELP_TEXT);
    return 0;
  }

  try {
    if (parsed.command === "convert") {
      const items = readOutline(parsed.file, io);
      writeIfNotEmpty(io, render(items, parsed.format as Format, parsed.indent));
      return 0;
    }

    if (parsed.command === "sort") {
      const items = readOutline(parsed.file, io);
      const sorted = sortItems(items, parsed.reverse);
      writeIfNotEmpty(io, outlineText(sorted));
      return 0;
    }

    const problemLines: string[] = [];
    let totalItems = 0;

    for (const file of parsed.files) {
      const items = readOutline(file, io);
      totalItems += countItems(items);
      problemLines.push(...formatProblems(file, checkOutline(items, parsed.maxDepth)));
    }

    if (problemLines.length > 0) {
      const plural = problemLines.length === 1 ? "problem" : "problems";
      io.out(`${problemLines.join("\n")}\n${problemLines.length} ${plural}\n`);
      return 1;
    }

    const itemLabel = totalItems === 1 ? "item" : "items";
    const fileLabel = parsed.files.length === 1 ? "file" : "files";
    io.out(`ok, ${totalItems} ${itemLabel} in ${parsed.files.length} ${fileLabel}\n`);
    return 0;
  } catch (error) {
    if (error instanceof OutlineError || error instanceof RunError) {
      io.err(`indentree: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

function readOutline(file: string, io: Io): Item[] {
  const display = displayName(file);
  let bytes: Uint8Array;
  try {
    bytes = file === "-" ? io.readStdin() : io.readFile(file);
  } catch {
    throw new RunError(`${display}: cannot read the file`);
  }

  let input: string;
  try {
    input = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new RunError(`${display}: input is not valid UTF-8`);
  }

  return parseOutline(display, input);
}

function displayName(file: string): string {
  return file === "-" ? "<stdin>" : file.replaceAll("\\", "/");
}

function formatProblems(file: string, problems: Problem[]): string[] {
  const display = displayName(file);
  return problems.map(
    (problem) => `${display}:${problem.line}: ${problem.code} ${problem.message}`,
  );
}

function writeIfNotEmpty(io: Io, text: string): void {
  if (text !== "") {
    io.out(text);
  }
}
