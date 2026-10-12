// Pure formatting helpers — no I/O, no state.

export interface Duration {
  ms: number;
}

/** 93_600_000 → "1d 2h" */
export function formatUptime(duration: Duration): string {
  const totalSeconds = Math.floor(duration.ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** 0.9731 → "97.3%" */
export function formatRatio(ratio: number): string {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return `${pct.toFixed(1)}%`;
}

export function isHealthy(successes: number, total: number): boolean {
  if (total === 0) return false;
  return successes / total >= 0.9;
}

/** ISO timestamp, second precision. */
export function timestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
