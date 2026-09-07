import { describe, expect, it } from 'vitest';

/** Mirrors backend/src/utils/inventory-balance.ts — keep in sync */
function computeAvailable(physical: number, presentation: number, reserved: number): number {
  return physical - presentation - reserved;
}

describe('computeAvailable (TASK 3)', () => {
  it('returns physical - presentation - reserved', () => {
    expect(computeAvailable(10, 2, 3)).toBe(5);
  });

  it('returns 0 when all zero', () => {
    expect(computeAvailable(0, 0, 0)).toBe(0);
  });
});
