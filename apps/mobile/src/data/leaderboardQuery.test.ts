import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { leaderboardQuery } from "./leaderboardQuery.ts";

const params = (query: string) => Object.fromEntries(new URLSearchParams(query));

describe("leaderboardQuery", () => {
  it("asks for the calendar week in the device's zone, not a rolling seven days", () => {
    assert.deepEqual(
      params(
        leaderboardQuery({
          metric: "weightedMinutes",
          range: "week",
          timeZone: "Australia/Sydney",
        }),
      ),
      {
        scope: "following",
        metric: "weightedMinutes",
        days: "week",
        tz: "Australia/Sydney",
      },
    );
  });

  it("sends no zone with all time, which the API would refuse", () => {
    assert.deepEqual(
      params(
        leaderboardQuery({ metric: "focusScore", range: "all", timeZone: "Australia/Sydney" }),
      ),
      { scope: "following", metric: "focusScore", days: "all" },
    );
  });

  it("names the group on a group's own board", () => {
    const groupId = "6f1c1c1e-6f6e-4f8a-9d55-0c2b8e7f3a21";
    assert.deepEqual(
      params(
        leaderboardQuery({ metric: "tasksCompleted", range: "week", groupId, timeZone: "UTC" }),
      ),
      { scope: "group", groupId, metric: "tasksCompleted", days: "week", tz: "UTC" },
    );
  });

  it("escapes the zone, so a slash or a plus survives the query string", () => {
    const query = leaderboardQuery({
      metric: "weightedMinutes",
      range: "week",
      timeZone: "Etc/GMT+10",
    });
    assert.ok(query.includes("tz=Etc%2FGMT%2B10"), query);
    assert.equal(params(query).tz, "Etc/GMT+10");
  });
});
