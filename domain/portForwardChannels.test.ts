import test from "node:test";
import assert from "node:assert/strict";

import {
  filterChannelsByRuleId,
  formatByteCount,
  formatChannelDuration,
  sortChannelsByOpenedAt,
} from "./portForwardChannels.ts";

test("formatByteCount", () => {
  assert.equal(formatByteCount(0), "0 B");
  assert.equal(formatByteCount(512), "512 B");
  assert.equal(formatByteCount(2048), "2.0 KB");
  assert.equal(formatByteCount(2 * 1024 * 1024), "2.0 MB");
});

test("formatChannelDuration", () => {
  assert.equal(formatChannelDuration(0, 5000), "5s");
  assert.equal(formatChannelDuration(0, 65_000), "1m 5s");
  assert.equal(formatChannelDuration(0, 3_661_000), "1h 1m");
});

test("filter and sort channels", () => {
  const channels = [
    {
      id: "1",
      tunnelId: "t",
      ruleId: "a",
      type: "local",
      source: "1:1",
      destination: "2:2",
      bytesIn: 0,
      bytesOut: 0,
      openedAt: 100,
    },
    {
      id: "2",
      tunnelId: "t",
      ruleId: "b",
      type: "local",
      source: "3:3",
      destination: "4:4",
      bytesIn: 0,
      bytesOut: 0,
      openedAt: 200,
    },
  ];
  assert.equal(filterChannelsByRuleId(channels, "a").length, 1);
  assert.equal(sortChannelsByOpenedAt(channels)[0]?.id, "2");
});
