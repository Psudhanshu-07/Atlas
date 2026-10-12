export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function daysBetween(from: number, to: number): number {
  return Math.round((to - from) / 86_400_000);
}
