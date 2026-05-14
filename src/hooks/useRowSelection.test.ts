import { describe, expect, it } from "vitest";
import { addManyToSet, removeManyFromSet, toggleInSet } from "./useRowSelection";

describe("useRowSelection helpers", () => {
  it("toggleInSet toggles membership", () => {
    const a = new Set<number>();
    const b = toggleInSet(a, 1);
    expect(a.has(1)).toBe(false);
    expect(b.has(1)).toBe(true);

    const c = toggleInSet(b, 1);
    expect(c.has(1)).toBe(false);
  });

  it("addManyToSet adds all values", () => {
    const a = new Set<number>([1]);
    const b = addManyToSet(a, [1, 2, 3]);
    expect(Array.from(b.values()).sort()).toEqual([1, 2, 3]);
    expect(a.size).toBe(1);
  });

  it("removeManyFromSet removes all values", () => {
    const a = new Set<number>([1, 2, 3]);
    const b = removeManyFromSet(a, [2, 3]);
    expect(Array.from(b.values()).sort()).toEqual([1]);
    expect(a.size).toBe(3);
  });
});

