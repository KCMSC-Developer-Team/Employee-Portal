/** Pure helpers for dashboard bucketing (unit-tested). */

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last `n` calendar months ending at `now` (UTC), oldest first, as YYYY-MM keys. */
export function lastMonths(now: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  return out;
}

export function startOfWindow(now: Date, n: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1));
}

export interface TrendRow { month: string; submitted: number; approved: number; rejected: number }

export function bucketRequests(
  rows: Array<{ createdAt: Date; status: string }>, now: Date, n: number,
): TrendRow[] {
  const map = new Map(lastMonths(now, n).map((m) => [m, { month: m, submitted: 0, approved: 0, rejected: 0 }]));
  for (const r of rows) {
    const b = map.get(monthKey(r.createdAt));
    if (!b) continue;
    b.submitted++;
    if (r.status === "APPROVED") b.approved++;
    if (r.status === "REJECTED") b.rejected++;
  }
  return [...map.values()];
}

export interface Slice { name: string; value: number }

/** Sort descending, keep the top `max`, fold the remainder into "Other". Zero-count slices are dropped. */
export function topN(items: Slice[], max: number): Slice[] {
  const s = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  return [...head, { name: "Other", value: s.slice(max - 1).reduce((t, i) => t + i.value, 0) }];
}
