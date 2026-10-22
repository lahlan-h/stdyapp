import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { studiedMinutes, studiedSeconds } from "./sessionTime.ts";

/**
 * The client's copy of the server's activeMs: a session's duration is its
 * studied time, breaks left out, everywhere the app works one out itself.
 */
describe("studiedSeconds", () => {
  const start = "2026-10-16T09:00:00.000Z";

  it("is the wall clock with no breaks", () => {
    assert.equal(studiedSeconds({ startedAt: start, endedAt: "2026-10-16T09:45:00.000Z" }), 2700);
  });

  it("leaves breaks out", () => {
    assert.equal(
      studiedSeconds({ startedAt: start, endedAt: "2026-10-16T10:05:00.000Z", pausedSeconds: 300 }),
      3600,
    );
  });

  it("is 0 for a running session and never negative", () => {
    assert.equal(studiedSeconds({ startedAt: start, endedAt: null }), 0);
    assert.equal(
      studiedSeconds({ startedAt: start, endedAt: "2026-10-16T08:59:00.000Z" }),
      0,
    );
  });

  it("rounds to minutes as the server does", () => {
    assert.equal(
      studiedMinutes({ startedAt: start, endedAt: "2026-10-16T09:30:40.000Z", pausedSeconds: 60 }),
      30,
    );
  });
});
