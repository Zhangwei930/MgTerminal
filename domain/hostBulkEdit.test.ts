import assert from "node:assert/strict";
import test from "node:test";
import type { Host } from "./models";
import { applyHostBulkEdit, planHostBulkEdit } from "./hostBulkEdit";

const host = (over: Partial<Host>): Host => ({
  id: "h1",
  label: "App",
  hostname: "app.example.com",
  port: 22,
  username: "deploy",
  protocol: "ssh",
  ...over,
} as Host);

const hosts: Host[] = [
  host({ id: "a", group: "Prod", tags: ["web"] }),
  host({ id: "b", group: "Prod", tags: ["db"] }),
  host({ id: "c", group: "Staging", managedSourceId: "src-1" }),
];

test("planHostBulkEdit separates editable hosts from managed ones", () => {
  const plan = planHostBulkEdit(hosts, new Set(["a", "b", "c"]));
  assert.deepEqual(plan.editable.map((h) => h.id), ["a", "b"]);
  // A host owned by a data source would have any edit overwritten on the next
  // sync, so it is reported rather than silently changed.
  assert.deepEqual(plan.skippedManaged.map((h) => h.id), ["c"]);
});

test("planHostBulkEdit ignores ids that are not in the vault", () => {
  const plan = planHostBulkEdit(hosts, new Set(["a", "ghost"]));
  assert.deepEqual(plan.editable.map((h) => h.id), ["a"]);
  assert.deepEqual(plan.skippedManaged, []);
});

test("applyHostBulkEdit changes only the fields that were supplied", () => {
  const result = applyHostBulkEdit(hosts, new Set(["a", "b"]), { username: "root" });
  const byId = new Map(result.hosts.map((h) => [h.id, h]));
  assert.equal(byId.get("a")?.username, "root");
  assert.equal(byId.get("b")?.username, "root");
  // Untouched fields survive.
  assert.equal(byId.get("a")?.group, "Prod");
  assert.equal(byId.get("a")?.hostname, "app.example.com");
  assert.equal(result.updated, 2);
});

test("applyHostBulkEdit never touches an unselected host", () => {
  const result = applyHostBulkEdit(hosts, new Set(["a"]), { group: "Moved" });
  const byId = new Map(result.hosts.map((h) => [h.id, h]));
  assert.equal(byId.get("a")?.group, "Moved");
  assert.equal(byId.get("b")?.group, "Prod");
  assert.equal(result.hosts.length, hosts.length, "no host may be dropped");
});

test("applyHostBulkEdit leaves managed hosts exactly as they were", () => {
  const result = applyHostBulkEdit(hosts, new Set(["b", "c"]), { group: "Moved", port: 2222 });
  const byId = new Map(result.hosts.map((h) => [h.id, h]));
  assert.equal(byId.get("c")?.group, "Staging");
  assert.equal(byId.get("c")?.port, 22);
  assert.equal(result.updated, 1);
  assert.equal(result.skippedManaged, 1);
});

test("applyHostBulkEdit with no fields is a no-op", () => {
  const result = applyHostBulkEdit(hosts, new Set(["a", "b"]), {});
  assert.equal(result.updated, 0);
  assert.deepEqual(result.hosts, hosts, "the same array contents come back");
});

test("applyHostBulkEdit appends tags instead of replacing them", () => {
  const result = applyHostBulkEdit(hosts, new Set(["a", "b"]), { addTags: ["prod"] });
  const byId = new Map(result.hosts.map((h) => [h.id, h]));
  // Replacing would silently destroy per-host tags across the whole selection.
  assert.deepEqual(byId.get("a")?.tags, ["web", "prod"]);
  assert.deepEqual(byId.get("b")?.tags, ["db", "prod"]);
});

test("applyHostBulkEdit does not duplicate a tag a host already carries", () => {
  const result = applyHostBulkEdit(hosts, new Set(["a"]), { addTags: ["web", "web", "new"] });
  const byId = new Map(result.hosts.map((h) => [h.id, h]));
  assert.deepEqual(byId.get("a")?.tags, ["web", "new"]);
});

test("applyHostBulkEdit can remove a tag across the selection", () => {
  const result = applyHostBulkEdit(hosts, new Set(["a", "b"]), { removeTags: ["web"] });
  const byId = new Map(result.hosts.map((h) => [h.id, h]));
  assert.deepEqual(byId.get("a")?.tags, []);
  assert.deepEqual(byId.get("b")?.tags, ["db"]);
});

test("applyHostBulkEdit rejects a port outside the valid range", () => {
  for (const port of [0, -1, 65536, Number.NaN]) {
    const result = applyHostBulkEdit(hosts, new Set(["a"]), { port });
    assert.equal(result.updated, 0, String(port));
    assert.equal(result.hosts.find((h) => h.id === "a")?.port, 22, String(port));
  }
});

test("applyHostBulkEdit trims text fields and ignores blank ones", () => {
  const result = applyHostBulkEdit(hosts, new Set(["a"]), { username: "  root  ", group: "   " });
  const updated = result.hosts.find((h) => h.id === "a");
  assert.equal(updated?.username, "root");
  assert.equal(updated?.group, "Prod", "a blank value means 'leave alone', not 'clear'");
});
