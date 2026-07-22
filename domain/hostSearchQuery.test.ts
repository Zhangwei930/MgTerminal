import assert from "node:assert/strict";
import test from "node:test";
import { matchesStructuredHostSearch, parseHostSearchQuery } from "./hostSearchQuery";

const host = {
  label: "Prod Web 01",
  hostname: "10.0.0.5",
  group: "Production",
  username: "deploy",
  tags: ["web", "customer facing"],
};

test("parseHostSearchQuery splits known filters from free text", () => {
  assert.deepEqual(parseHostSearchQuery("tag:web user:deploy nginx"), {
    filters: [
      { field: "tag", value: "web" },
      { field: "user", value: "deploy" },
    ],
    freeText: "nginx",
  });
});

test("parseHostSearchQuery leaves an IPv6 address completely alone", () => {
  // The whole reason a filter must be introduced by a *known* field name:
  // "2001" is not a field, so this stays one free-text term.
  const parsed = parseHostSearchQuery("2001:db8::1");
  assert.deepEqual(parsed.filters, []);
  assert.equal(parsed.freeText, "2001:db8::1");

  const withFilter = parseHostSearchQuery("tag:web 2001:db8::1");
  assert.deepEqual(withFilter.filters, [{ field: "tag", value: "web" }]);
  assert.equal(withFilter.freeText, "2001:db8::1");
});

test("parseHostSearchQuery does not treat CJK punctuation as a filter", () => {
  // A full-width colon comes from a Chinese IME and shows up inside ordinary
  // labels. Nothing before it is a field name, so nothing is consumed.
  for (const query of ["生产：数据库", "标签:生产", "备注：web"]) {
    const parsed = parseHostSearchQuery(query);
    assert.deepEqual(parsed.filters, [], query);
    assert.equal(parsed.freeText, query, query);
  }
});

test("parseHostSearchQuery ignores an unknown or empty field", () => {
  assert.deepEqual(parseHostSearchQuery("colour:red").filters, []);
  assert.equal(parseHostSearchQuery("colour:red").freeText, "colour:red");
  // A bare "tag:" is someone mid-typing; matching everything would be worse.
  assert.deepEqual(parseHostSearchQuery("tag:").filters, []);
  assert.equal(parseHostSearchQuery("tag:").freeText, "tag:");
});

test("parseHostSearchQuery accepts field names in any case", () => {
  assert.deepEqual(parseHostSearchQuery("TAG:Web").filters, [{ field: "tag", value: "Web" }]);
});

test("parseHostSearchQuery handles an empty query", () => {
  assert.deepEqual(parseHostSearchQuery("   "), { filters: [], freeText: "" });
});

test("matchesStructuredHostSearch requires every filter to hold", () => {
  assert.equal(matchesStructuredHostSearch("tag:web", host), true);
  assert.equal(matchesStructuredHostSearch("tag:web user:deploy", host), true);
  assert.equal(matchesStructuredHostSearch("tag:web user:root", host), false);
  assert.equal(matchesStructuredHostSearch("group:production", host), true);
  assert.equal(matchesStructuredHostSearch("host:10.0.0", host), true);
});

test("matchesStructuredHostSearch matches tags by substring and case", () => {
  assert.equal(matchesStructuredHostSearch("tag:WEB", host), true);
  assert.equal(matchesStructuredHostSearch("tag:customer", host), true, "substring of a multi-word tag");
  assert.equal(matchesStructuredHostSearch("tag:database", host), false);
});

test("matchesStructuredHostSearch filters on username, which free text never searched", () => {
  assert.equal(matchesStructuredHostSearch("user:deploy", host), true);
  assert.equal(matchesStructuredHostSearch("deploy", host), false, "username is not free-text searchable");
});

test("matchesStructuredHostSearch still applies the existing matcher to free text", () => {
  assert.equal(matchesStructuredHostSearch("prod", host), true);
  assert.equal(matchesStructuredHostSearch("tag:web prod", host), true);
  assert.equal(matchesStructuredHostSearch("tag:web nothinghere", host), false);
  // Pinyin and IP behaviour must survive being routed through the new layer.
  assert.equal(matchesStructuredHostSearch("10.0.0.5", host), true);
});

test("matchesStructuredHostSearch with only filters ignores free-text scoring", () => {
  assert.equal(matchesStructuredHostSearch("tag:web", { ...host, label: "zzz", hostname: "" }), true);
});

test("matchesStructuredHostSearch tolerates missing fields", () => {
  assert.equal(matchesStructuredHostSearch("tag:web", { label: "x" }), false);
  assert.equal(matchesStructuredHostSearch("user:root", { label: "x" }), false);
  assert.equal(matchesStructuredHostSearch("", { label: "x" }), true);
});

test("matchesStructuredHostSearch searches caller-supplied extra fields", () => {
  // The vault and tree views also search username and notes as free text;
  // routing through this helper must not drop that.
  const extras = { extraFreeTextFields: [host.username, "runs the billing job"] };
  assert.equal(matchesStructuredHostSearch("deploy", host, extras), true);
  assert.equal(matchesStructuredHostSearch("billing", host, extras), true);
  assert.equal(matchesStructuredHostSearch("absent", host, extras), false);
  // A filter still has to hold even when the free text hits an extra field.
  assert.equal(matchesStructuredHostSearch("tag:database billing", host, extras), false);
});
