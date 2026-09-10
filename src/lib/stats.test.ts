import { describe, expect, it } from "vitest";
import { dayKey } from "./dates";
import {
  activeFeedings,
  buildInsights,
  feedingsForDay,
  totalAmount,
} from "./stats";
import type { Feeding } from "./types";
import { createId } from "./uuid";

const feeding = (
  amount: number,
  date: Date,
  overrides: Partial<Feeding> = {},
): Feeding => ({
  id: createId(),
  household_id: "household",
  baby_id: "baby",
  amount_ml: amount,
  fed_at: date.toISOString(),
  created_by: "parent",
  created_at: date.toISOString(),
  updated_at: date.toISOString(),
  deleted_at: null,
  sync_state: "synced",
  ...overrides,
});

describe("feeding statistics", () => {
  it("filters deleted records and orders the newest feeding first", () => {
    const morning = feeding(90, new Date(2026, 8, 8, 8));
    const noon = feeding(120, new Date(2026, 8, 8, 12));
    const deleted = feeding(60, new Date(2026, 8, 8, 16), {
      deleted_at: new Date(2026, 8, 8, 17).toISOString(),
    });

    expect(activeFeedings([morning, deleted, noon]).map((item) => item.id)).toEqual([
      noon.id,
      morning.id,
    ]);
  });

  it("uses local calendar dates when selecting a day", () => {
    const selected = new Date(2026, 8, 8, 12);
    const sameDay = feeding(90, new Date(2026, 8, 8, 23, 55));
    const nextDay = feeding(100, new Date(2026, 8, 9, 0, 5));

    expect(feedingsForDay([sameDay, nextDay], selected)).toEqual([sameDay]);
    expect(dayKey(sameDay.fed_at)).not.toBe(dayKey(nextDay.fed_at));
  });

  it("totals active milk amounts", () => {
    const records = [
      feeding(90, new Date(2026, 8, 8, 8)),
      feeding(120, new Date(2026, 8, 8, 12)),
    ];
    expect(totalAmount(records)).toBe(210);
  });

  it("builds a seven-day summary ending today", () => {
    const now = new Date(2026, 8, 9, 18);
    const records = [
      feeding(100, new Date(2026, 8, 3, 8)),
      feeding(120, new Date(2026, 8, 9, 9)),
      feeding(80, new Date(2026, 8, 9, 13)),
      feeding(999, new Date(2026, 8, 2, 13)),
    ];
    const summary = buildInsights(records, "week", now);

    expect(summary.buckets).toHaveLength(7);
    expect(summary.buckets[0].amount).toBe(100);
    expect(summary.buckets[summary.buckets.length - 1]?.amount).toBe(200);
    expect(summary.total).toBe(300);
    expect(summary.count).toBe(3);
    expect(summary.average).toBe(43);
  });

  it("handles leap-year month and year boundaries", () => {
    const leapDay = feeding(110, new Date(2028, 1, 29, 10));
    const march = feeding(120, new Date(2028, 2, 1, 10));

    const month = buildInsights([leapDay, march], "month", new Date(2028, 1, 29, 18));
    expect(month.buckets).toHaveLength(29);
    expect(month.total).toBe(110);

    const year = buildInsights([leapDay, march], "year", new Date(2028, 2, 1, 18));
    expect(year.buckets).toHaveLength(3);
    expect(year.total).toBe(230);
  });
});
