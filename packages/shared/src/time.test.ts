import test from "node:test";
import assert from "node:assert/strict";

import { formatRelativeTime, formatDuration } from "./time.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const ago = (ms: number) => Date.now() - ms;

test("formatRelativeTime: sub-minute", () => {
  assert.equal(formatRelativeTime(ago(0)), "Just now");
  assert.equal(formatRelativeTime(ago(30 * 1000)), "Just now");
});

test("formatRelativeTime: minutes, singular and plural", () => {
  assert.equal(formatRelativeTime(ago(1 * MIN)), "1 minute ago");
  assert.equal(formatRelativeTime(ago(59 * MIN)), "59 minutes ago");
});

test("formatRelativeTime: hours", () => {
  assert.equal(formatRelativeTime(ago(1 * HOUR)), "1 hour ago");
  assert.equal(formatRelativeTime(ago(23 * HOUR)), "23 hours ago");
});

test("formatRelativeTime: rolls over into days at 24h, not 60h", () => {
  // The regression: `hours < 60` meant everything below two and a half days
  // reported in hours.
  assert.equal(formatRelativeTime(ago(24 * HOUR)), "1 day ago");
  assert.equal(formatRelativeTime(ago(50 * HOUR)), "2 days ago");
  assert.equal(formatRelativeTime(ago(72 * HOUR)), "3 days ago");
});

test("formatDuration: minutes", () => {
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(59), "59m");
});

test("formatDuration: hours and minutes", () => {
  assert.equal(formatDuration(60), "1h 0m");
  assert.equal(formatDuration(80), "1h 20m");
  assert.equal(formatDuration(1439), "23h 59m");
});

test("formatDuration: days and hours", () => {
  assert.equal(formatDuration(1440), "1d 0h");
  assert.equal(formatDuration(1500), "1d 1h");
});

test("formatDuration: negative input is clamped, not rejected", () => {
  assert.equal(formatDuration(-5), "0m");
});

test("formatDuration: truncates fractional minutes", () => {
  assert.equal(formatDuration(45.9), "45m");
});
