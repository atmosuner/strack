import { describe, expect, it } from "vitest";
import {
  expandOccurrencesInRange,
  parseRecurrenceRule,
  stringifyRecurrenceRule,
  type RecurrenceRule,
} from "./recurrence.js";

describe("parseRecurrenceRule", () => {
  it("parses a valid weekly rule", () => {
    const r = parseRecurrenceRule('{"freq":"weekly","interval":1}');
    expect(r).toEqual({ freq: "weekly", interval: 1 });
  });

  it("parses with until and count", () => {
    const r = parseRecurrenceRule(
      '{"freq":"weekly","interval":2,"until":"2026-12-31","count":10}'
    );
    expect(r).toEqual({ freq: "weekly", interval: 2, until: "2026-12-31", count: 10 });
  });

  it("returns null for non-weekly freq", () => {
    expect(parseRecurrenceRule('{"freq":"daily","interval":1}')).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseRecurrenceRule("not json")).toBeNull();
  });

  it("defaults interval to 1", () => {
    const r = parseRecurrenceRule('{"freq":"weekly"}');
    expect(r?.interval).toBe(1);
  });
});

describe("stringifyRecurrenceRule", () => {
  it("round-trips", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: 1 };
    expect(parseRecurrenceRule(stringifyRecurrenceRule(rule))).toEqual(rule);
  });
});

describe("expandOccurrencesInRange", () => {
  const rule: RecurrenceRule = { freq: "weekly", interval: 1 };

  it("expands weekly occurrences within a 4-week range", () => {
    const occ = expandOccurrencesInRange(
      "2026-05-04T10:00:00.000Z",
      "2026-05-04T11:00:00.000Z",
      rule,
      "2026-05-01T00:00:00.000Z",
      "2026-05-31T23:59:59.999Z"
    );
    expect(occ).toHaveLength(4);
    expect(occ[0].date).toBe("2026-05-04");
    expect(occ[1].date).toBe("2026-05-11");
    expect(occ[2].date).toBe("2026-05-18");
    expect(occ[3].date).toBe("2026-05-25");
  });

  it("respects the until boundary", () => {
    const occ = expandOccurrencesInRange(
      "2026-05-04T10:00:00.000Z",
      "2026-05-04T11:00:00.000Z",
      { freq: "weekly", interval: 1, until: "2026-05-15" },
      "2026-05-01T00:00:00.000Z",
      "2026-06-30T23:59:59.999Z"
    );
    expect(occ).toHaveLength(2);
    expect(occ[0].date).toBe("2026-05-04");
    expect(occ[1].date).toBe("2026-05-11");
  });

  it("respects count", () => {
    const occ = expandOccurrencesInRange(
      "2026-05-04T10:00:00.000Z",
      "2026-05-04T11:00:00.000Z",
      { freq: "weekly", interval: 1, count: 3 },
      "2026-05-01T00:00:00.000Z",
      "2026-12-31T23:59:59.999Z"
    );
    expect(occ).toHaveLength(3);
  });

  it("excludes exception dates", () => {
    const occ = expandOccurrencesInRange(
      "2026-05-04T10:00:00.000Z",
      "2026-05-04T11:00:00.000Z",
      rule,
      "2026-05-01T00:00:00.000Z",
      "2026-05-31T23:59:59.999Z",
      new Set(["2026-05-11"])
    );
    expect(occ).toHaveLength(3);
    expect(occ.map((o) => o.date)).toEqual([
      "2026-05-04",
      "2026-05-18",
      "2026-05-25",
    ]);
  });

  it("handles bi-weekly interval", () => {
    const occ = expandOccurrencesInRange(
      "2026-05-04T10:00:00.000Z",
      "2026-05-04T11:00:00.000Z",
      { freq: "weekly", interval: 2 },
      "2026-05-01T00:00:00.000Z",
      "2026-05-31T23:59:59.999Z"
    );
    expect(occ).toHaveLength(2);
    expect(occ[0].date).toBe("2026-05-04");
    expect(occ[1].date).toBe("2026-05-18");
  });

  it("preserves duration in each occurrence", () => {
    const occ = expandOccurrencesInRange(
      "2026-05-04T14:00:00.000Z",
      "2026-05-04T15:30:00.000Z",
      rule,
      "2026-05-04T00:00:00.000Z",
      "2026-05-04T23:59:59.999Z"
    );
    expect(occ).toHaveLength(1);
    expect(occ[0].startAt).toBe("2026-05-04T14:00:00.000Z");
    expect(occ[0].endAt).toBe("2026-05-04T15:30:00.000Z");
  });

  it("returns empty array when range is before series start", () => {
    const occ = expandOccurrencesInRange(
      "2026-06-01T10:00:00.000Z",
      "2026-06-01T11:00:00.000Z",
      rule,
      "2026-05-01T00:00:00.000Z",
      "2026-05-31T23:59:59.999Z"
    );
    expect(occ).toHaveLength(0);
  });

  it("documents UTC-only behavior (no DST shifting)", () => {
    // A lesson at 10:00 UTC every week stays at 10:00 UTC regardless of DST.
    // This is the documented limitation.
    const occ = expandOccurrencesInRange(
      "2026-03-23T10:00:00.000Z",
      "2026-03-23T11:00:00.000Z",
      rule,
      "2026-03-23T00:00:00.000Z",
      "2026-04-06T23:59:59.999Z"
    );
    expect(occ).toHaveLength(3);
    expect(occ.every((o) => o.startAt.includes("T10:00:00"))).toBe(true);
  });
});
