import { describe, expect, it } from "vitest";
import { bucketRequests, lastMonths, topN } from "@/lib/analytics";

describe("analytics helpers", () => {
  const now = new Date("2026-10-14T00:00:00Z");
  it("builds contiguous months across a year boundary", () => {
    expect(lastMonths(new Date("2026-02-10T00:00:00Z"), 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("buckets requests and ignores rows outside the window", () => {
    const t = bucketRequests([
      { createdAt: new Date("2026-10-01T00:00:00Z"), status: "APPROVED" },
      { createdAt: new Date("2026-10-02T00:00:00Z"), status: "REJECTED" },
      { createdAt: new Date("2026-09-02T00:00:00Z"), status: "PENDING" },
      { createdAt: new Date("2020-01-01T00:00:00Z"), status: "APPROVED" },
    ], now, 3);
    expect(t.map((x) => x.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(t[2]).toMatchObject({ submitted: 2, approved: 1, rejected: 1 });
    expect(t[1]).toMatchObject({ submitted: 1 });
  });
  it("topN folds the tail into Other and drops zeros", () => {
    const r = topN([{ name: "a", value: 5 }, { name: "b", value: 3 }, { name: "c", value: 2 }, { name: "d", value: 1 }, { name: "z", value: 0 }], 3);
    expect(r).toEqual([{ name: "a", value: 5 }, { name: "b", value: 3 }, { name: "Other", value: 3 }]);
  });
});
