import test from "node:test";
import assert from "node:assert/strict";

import type { AISession } from "./types";
import { exportAsMarkdown, exportAsPlainText } from "./conversationExport.ts";

const sessionWith = (message: Record<string, unknown>): AISession => ({
  id: "s1",
  title: "Debug nginx",
  agentId: "default",
  scope: { type: "global" },
  createdAt: 0,
  updatedAt: 0,
  messages: [message],
} as unknown as AISession);

const thinkingMessage = {
  role: "assistant",
  content: "Restart nginx.",
  thinking: "The config test failed, so the unit never reloaded.",
  thinkingDurationMs: 4200,
  timestamp: 0,
};

test("markdown export includes the thinking block, collapsed, before the answer", () => {
  const md = exportAsMarkdown(sessionWith(thinkingMessage));

  assert.match(md, /<details>/);
  assert.match(md, /The config test failed, so the unit never reloaded\./);
  assert.ok(
    md.indexOf("The config test failed") < md.indexOf("Restart nginx."),
    "thinking should be emitted before the assistant answer",
  );
});

test("markdown export reports thinking duration when present", () => {
  const md = exportAsMarkdown(sessionWith(thinkingMessage));
  assert.match(md, /4\.2s/);
});

test("plain text export includes the thinking block", () => {
  const txt = exportAsPlainText(sessionWith(thinkingMessage));
  assert.match(txt, /The config test failed, so the unit never reloaded\./);
  assert.ok(txt.indexOf("The config test failed") < txt.indexOf("Restart nginx."));
});

test("messages without thinking are unchanged", () => {
  const plain = { role: "assistant", content: "Restart nginx.", timestamp: 0 };
  const md = exportAsMarkdown(sessionWith(plain));
  const txt = exportAsPlainText(sessionWith(plain));

  assert.doesNotMatch(md, /<details>/);
  assert.doesNotMatch(txt, /Thinking/);
});
