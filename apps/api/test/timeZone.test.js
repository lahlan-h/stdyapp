import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  localParts,
  shiftDateKey,
  startOfLocalDay,
} from "../src/utils/timeZone.js";

/**
 * startOfLocalDay is where a calendar window (the leaderboard's week) turns a
 * label into the instant a query filters on. Off by an hour, and a session
 * lands in the wrong week - so the zones below are the awkward ones: half- and
 * quarter-hour offsets, both sides of the date line, and daylight saving
 * changing on the day itself.
 */

const iso = (date) => date.toISOString();

describe("startOfLocalDay", () => {
  it("is midnight UTC in UTC", () => {
    assert.equal(iso(startOfLocalDay("2026-10-12", "UTC")), "2026-10-12T00:00:00.000Z");
  });

  it("is the evening before, in UTC, east of Greenwich", () => {
    // Sydney is on daylight time (+11) by October.
    assert.equal(
      iso(startOfLocalDay("2026-10-12", "Australia/Sydney")),
      "2026-10-11T13:00:00.000Z",
    );
  });

  it("is the morning of, in UTC, west of Greenwich", () => {
    assert.equal(
      iso(startOfLocalDay("2026-10-12", "America/New_York")),
      "2026-10-12T04:00:00.000Z",
    );
  });

  it("keeps half- and quarter-hour offsets", () => {
    assert.equal(
      iso(startOfLocalDay("2026-10-12", "Asia/Kolkata")),
      "2026-10-11T18:30:00.000Z",
    );
    assert.equal(
      iso(startOfLocalDay("2026-10-12", "Asia/Kathmandu")),
      "2026-10-11T18:15:00.000Z",
    );
  });

  it("reaches both ends of the offsets in use", () => {
    assert.equal(
      iso(startOfLocalDay("2026-10-12", "Pacific/Kiritimati")),
      "2026-10-11T10:00:00.000Z",
    );
    assert.equal(
      iso(startOfLocalDay("2026-10-12", "Pacific/Pago_Pago")),
      "2026-10-12T11:00:00.000Z",
    );
  });

  it("uses the offset at midnight on the day the clocks change later", () => {
    // Sydney moves to +11 at 2am on 4 Oct 2026, so that day starts at +10.
    assert.equal(
      iso(startOfLocalDay("2026-10-04", "Australia/Sydney")),
      "2026-10-03T14:00:00.000Z",
    );
    // New York leaves daylight time on 1 Nov 2026, so that day starts at -4
    // and the next one at -5.
    assert.equal(
      iso(startOfLocalDay("2026-11-01", "America/New_York")),
      "2026-11-01T04:00:00.000Z",
    );
    assert.equal(
      iso(startOfLocalDay("2026-11-02", "America/New_York")),
      "2026-11-02T05:00:00.000Z",
    );
  });

  it("finds the first instant of a day whose midnight is skipped", () => {
    // Chile springs forward AT midnight: on 6 Sep 2026 the clock goes from
    // 23:59 on the 5th straight to 01:00, so the 6th begins at 01:00 (-3).
    const start = startOfLocalDay("2026-09-06", "America/Santiago");
    assert.equal(iso(start), "2026-09-06T04:00:00.000Z");
    assert.deepEqual(localParts(start, "America/Santiago"), { dateKey: "2026-09-06", hour: 1 });
  });

  it("finds the start of a day whose midnight happens twice", () => {
    // Chile falls back at midnight on 5 Apr 2026: 00:00 at -3 becomes 23:00
    // on the 4th again, and the 5th only begins at the second midnight (-4).
    assert.equal(
      iso(startOfLocalDay("2026-04-05", "America/Santiago")),
      "2026-04-05T04:00:00.000Z",
    );
  });

  it("lands on the day, a millisecond after the day before, all year in every zone", () => {
    const zones = [
      "UTC",
      "Australia/Sydney",
      "Australia/Lord_Howe", // a half-hour daylight-saving shift
      "America/New_York",
      "America/Santiago",
      "Europe/London",
      "Asia/Kathmandu",
      "Pacific/Chatham", // +12:45, +13:45 in summer
    ];
    for (const zone of zones) {
      for (let day = 0; day < 366; day += 1) {
        const key = shiftDateKey("2026-01-01", day);
        const start = startOfLocalDay(key, zone);
        assert.equal(localParts(start, zone).dateKey, key, `${key} in ${zone}`);
        assert.equal(
          localParts(new Date(start.getTime() - 1), zone).dateKey,
          shiftDateKey(key, -1),
          `the instant before ${key} in ${zone} should be the day before`,
        );
      }
    }
  });
});
