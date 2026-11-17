// Lightweight in-memory timing accumulator.
// Module-level state — no SDK dependency, no persistence, no atom.
// Timing data is lost on Mod reload; that is intentional.

export type PerfStats = {
  count: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

const MAX_SAMPLES = 100;

// Map from event key (e.g. 'turn.complete') to sorted sample list.
const timings = new Map<string, number[]>();

/** Record a handler duration. Thread-safe by virtue of single-threaded JS. */
export function recordTiming(key: string, ms: number): void {
  if (!timings.has(key)) timings.set(key, []);
  const arr = timings.get(key)!;
  arr.push(ms);
  if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES);
}

/** Compute p50/p95/max for a given key. Returns null if no samples. */
export function getStats(key: string): PerfStats | null {
  const arr = timings.get(key);
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const p50 = sorted[Math.floor(n * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(n * 0.95)] ?? 0;
  const max = sorted[n - 1] ?? 0;
  return { count: n, p50Ms: p50, p95Ms: p95, maxMs: max };
}

/** All keys with their stats. Empty object when no data recorded yet. */
export function getAllStats(): Record<string, PerfStats> {
  const result: Record<string, PerfStats> = {};
  for (const key of timings.keys()) {
    const s = getStats(key);
    if (s !== null) result[key] = s;
  }
  return result;
}

/** Reset all timing data. Used in tests. */
export function clearTimings(): void {
  timings.clear();
}
