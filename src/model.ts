export interface Item {
  text: string;
  line: number;
  children: Item[];
}

export interface Problem {
  line: number;
  code: string;
  message: string;
}

export class OutlineError extends Error {
  constructor(display: string, line: number, message: string) {
    super(`${display}:${line}: ${message}`);
    this.name = "OutlineError";
  }
}
