import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyChangelogSection,
  countChangelogItems,
  parseChangelog,
  parseChangelogItem,
} from "./changelog.ts";

const SAMPLE = `# Changelog

## [0.2.6] - 2026-07-12

### 安全
- 打包版托盘窗口忽略 \`VITE_DEV_SERVER_URL\`
- 覆盖升级 DOMPurify 3.3.2

### 修复
- Telnet 自动登录集成测试改为等待命令提示符

## [0.2.5] - 2026-07-12

### 修复
- 设置页社区隐藏「GitHub 源代码」入口
`;

test("parseChangelog splits entries per version with date", () => {
  const entries = parseChangelog(SAMPLE);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].version, "0.2.6");
  assert.equal(entries[0].date, "2026-07-12");
  assert.equal(entries[1].version, "0.2.5");
});

test("parseChangelog groups items under section titles", () => {
  const [first] = parseChangelog(SAMPLE);

  assert.deepEqual(
    first.sections.map((section) => section.title),
    ["安全", "修复"],
  );
  assert.deepEqual(first.sections[0].items, [
    "打包版托盘窗口忽略 `VITE_DEV_SERVER_URL`",
    "覆盖升级 DOMPurify 3.3.2",
  ]);
  assert.deepEqual(first.sections[1].items, [
    "Telnet 自动登录集成测试改为等待命令提示符",
  ]);
});

test("parseChangelog ignores preamble and returns empty for no versions", () => {
  assert.deepEqual(parseChangelog("# Changelog\n\nnothing here\n"), []);
});

test("parseChangelogItem splits bold title and body", () => {
  assert.deepEqual(
    parseChangelogItem("**RDP host support**: launch system client"),
    {
      title: "RDP host support",
      body: "launch system client",
      raw: "**RDP host support**: launch system client",
    },
  );
  assert.deepEqual(parseChangelogItem("plain bullet without bold"), {
    body: "plain bullet without bold",
    raw: "plain bullet without bold",
  });
  assert.equal(parseChangelogItem("**Only title**").title, "Only title");
  assert.equal(parseChangelogItem("**Only title**").body, "");
});

test("classifyChangelogSection maps localized titles", () => {
  assert.equal(classifyChangelogSection("Features"), "features");
  assert.equal(classifyChangelogSection("功能"), "features");
  assert.equal(classifyChangelogSection("修复"), "fixes");
  assert.equal(classifyChangelogSection("安全"), "security");
  assert.equal(classifyChangelogSection("Windows ARM64"), "platform");
  assert.equal(classifyChangelogSection("优化"), "improvements");
});

test("countChangelogItems sums section bullets", () => {
  const [first] = parseChangelog(SAMPLE);
  assert.equal(countChangelogItems(first), 3);
});
