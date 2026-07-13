import assert from "node:assert/strict";
import test from "node:test";

import { parseChangelog } from "./changelog.ts";

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
