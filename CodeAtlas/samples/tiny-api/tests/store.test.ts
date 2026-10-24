import { test } from "node:test";
import assert from "node:assert/strict";
import { record, register, reset, summary } from "../src/lib/store";
import { formatRatio, formatUptime, isHealthy } from "../src/lib/format";

test("records checks and computes a summary", () => {
  reset();
  register("api");
  record("api", true, 42);
  record("api", true, 38);
  record("api", false, 900);

  const s = summary("api");
  assert.ok(s);
  assert.equal(s.total, 3);
  assert.equal(s.successes, 2);
  assert.equal(s.ratio, formatRatio(2 / 3));
});

test("unknown service summarizes to null", () => {
  reset();
  assert.equal(summary("nope"), null);
});

test("health threshold is 90%", () => {
  assert.equal(isHealthy(9, 10), true);
  assert.equal(isHealthy(8, 10), false);
  assert.equal(isHealthy(0, 0), false);
});

test("uptime formatting picks the right unit", () => {
  assert.equal(formatUptime({ ms: 90_000 }), "1m");
  assert.equal(formatUptime({ ms: 3_600_000 * 2 }), "2h 0m");
  assert.equal(formatUptime({ ms: 86_400_000 + 3_600_000 * 3 }), "1d 3h");
});
