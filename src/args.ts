import type { Format } from "./render";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type ParsedArgs =
  | { command: "help" }
  | { command: "convert"; file: string; format: Format; indent: number }
  | { command: "sort"; file: string; reverse: boolean }
  | { command: "check"; files: string[]; maxDepth: number | null };

const FORMATS: Format[] = ["json", "markdown", "numbered", "paths", "html"];

export function parseArgs(args: string[]): ParsedArgs {
  if (args.length === 1 && args[0] === "--help") {
    return { command: "help" };
  }
  if (args.length === 0) {
    throw new UsageError("missing command (convert, check or sort)");
  }

  const command = args[0];
  if (command === "--help") {
    throw unknownOption(command);
  }
  if (command !== "convert" && command !== "check" && command !== "sort") {
    throw new UsageError(`unknown command "${command ?? ""}"`);
  }

  let format: Format = "json";
  let indent = 2;
  let maxDepth: number | null = null;
  let reverse = false;
  const files: string[] = [];

  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      continue;
    }

    if (command === "convert") {
      const toValue = optionValue(args, index, "--to");
      if (toValue !== null) {
        const { value, nextIndex } = toValue;
        if (!FORMATS.includes(value as Format)) {
          throw new UsageError(`invalid format "${value}"`);
        }
        format = value as Format;
        index = nextIndex;
        continue;
      }

      const indentValue = optionValue(args, index, "--indent");
      if (indentValue !== null) {
        const { value, nextIndex } = indentValue;
        if (!/^[0-8]$/.test(value)) {
          throw new UsageError(`invalid indent "${value}"`);
        }
        indent = Number(value);
        index = nextIndex;
        continue;
      }
    } else if (command === "check") {
      const depthValue = optionValue(args, index, "--max-depth");
      if (depthValue !== null) {
        const { value, nextIndex } = depthValue;
        if (!/^[1-9][0-9]?$/.test(value)) {
          throw new UsageError(`invalid max depth "${value}"`);
        }
        maxDepth = Number(value);
        index = nextIndex;
        continue;
      }
    } else if (argument === "--reverse") {
      reverse = true;
      continue;
    }

    if (argument.startsWith("-") && argument !== "-") {
      throw unknownOption(argument);
    }

    files.push(argument);
    if (command !== "check" && files.length > 1) {
      throw new UsageError("too many arguments");
    }
  }

  if (files.length === 0) {
    throw new UsageError("missing FILE");
  }
  if (command === "check" && files.filter((file) => file === "-").length > 1) {
    throw new UsageError("standard input given twice");
  }

  if (command === "convert") {
    return { command, file: files[0] ?? "", format, indent };
  }
  if (command === "sort") {
    return { command, file: files[0] ?? "", reverse };
  }
  return { command, files, maxDepth };
}

function optionValue(
  args: string[],
  index: number,
  option: string,
): { value: string; nextIndex: number } | null {
  const argument = args[index];
  if (argument === undefined) {
    return null;
  }

  if (argument === option) {
    const value = args[index + 1];
    if (value === undefined) {
      throw new UsageError(`${option} needs a value`);
    }
    if (value === "--help") {
      throw unknownOption(value);
    }
    return { value, nextIndex: index + 1 };
  }

  const prefix = `${option}=`;
  if (argument.startsWith(prefix)) {
    return { value: argument.slice(prefix.length), nextIndex: index };
  }

  return null;
}

function unknownOption(argument: string): UsageError {
  return new UsageError(`unknown option "${argument}"`);
}
