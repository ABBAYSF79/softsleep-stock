/**
 * Computed available stock for an inventory balance row.
 * Never persisted — physical - presentation - reserved.
 */
export function computeAvailable(physical: number, presentation: number, reserved: number): number {
  return physical - presentation - reserved;
}
