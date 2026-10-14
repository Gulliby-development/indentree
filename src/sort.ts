import type { Item } from "./model";

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? -1);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? -1);
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftPoint = leftPoints[index];
    const rightPoint = rightPoints[index];
    if (leftPoint === undefined || rightPoint === undefined) {
      continue;
    }
    const difference = leftPoint - rightPoint;
    if (difference !== 0) {
      return difference;
    }
  }

  return leftPoints.length - rightPoints.length;
}

export function sortItems(items: Item[], reverse: boolean): Item[] {
  const direction = reverse ? -1 : 1;
  const result: Item[] = [];
  const pending: Array<{ source: Item[]; target: Item[]; index: number }> = [
    { source: items, target: result, index: 0 },
  ];

  while (pending.length > 0) {
    const frame = pending[pending.length - 1];
    if (frame === undefined) {
      continue;
    }

    if (frame.index === frame.source.length) {
      frame.target.sort((left, right) => direction * compareCodePoints(left.text, right.text));
      pending.pop();
      continue;
    }

    const item = frame.source[frame.index];
    if (item === undefined) {
      continue;
    }
    frame.index += 1;
    const clone: Item = { ...item, children: [] };
    frame.target.push(clone);
    pending.push({ source: item.children, target: clone.children, index: 0 });
  }

  return result;
}
