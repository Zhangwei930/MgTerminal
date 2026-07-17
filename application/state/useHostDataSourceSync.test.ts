import test from "node:test";
import assert from "node:assert/strict";

import {
  hashInventoryContent,
  isHttpInventoryUrl,
  parseHostInventoryDocument,
  syncHostsFromInventory,
  createJsonManagedSource,
} from "../../domain/hostDataSource.ts";

/**
 * Application-layer load helpers are browser/Electron-bound; cover the pure
 * contract used by useHostDataSourceSync (hash skip + merge path).
 */
test("unchanged hash short-circuit contract", () => {
  const raw = JSON.stringify({
    version: 1,
    hosts: [{ id: "a", hostname: "1.2.3.4", username: "u" }],
  });
  const hash = hashInventoryContent(raw);
  assert.equal(hash, hashInventoryContent(raw));
  assert.notEqual(hash, hashInventoryContent(raw + " "));
});

test("http url validation used by addJsonSource", () => {
  assert.equal(isHttpInventoryUrl("https://cmdb.example/hosts.json"), true);
  assert.equal(isHttpInventoryUrl("ftp://x"), false);
});

test("sync path used after successful load", () => {
  const source = createJsonManagedSource({
    type: "json_file",
    filePath: "/tmp/inv.json",
    groupName: "cmdb",
    id: "s1",
  });
  const inventory = parseHostInventoryDocument(JSON.stringify({
    version: 1,
    hosts: [{ id: "h1", hostname: "10.0.0.1", username: "root", group: "prod" }],
  }));
  const result = syncHostsFromInventory({
    existingHosts: [],
    customGroups: [],
    inventory,
    source,
  });
  assert.equal(result.stats.added, 1);
  assert.equal(result.hosts[0]?.group, "cmdb/prod");
  assert.equal(result.hosts[0]?.managedExternalId, "h1");
});

import { readCappedResponseText, MAX_INVENTORY_BYTES } from "./useHostDataSourceSync.ts";

function fakeResponse({ contentLength, chunks, text }: {
  contentLength?: string;
  chunks?: Uint8Array[];
  text?: string;
}): Pick<Response, "headers" | "body" | "text"> {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "content-length" ? contentLength ?? null : null) } as Headers,
    body: chunks
      ? ({
          getReader() {
            let i = 0;
            return {
              read: async () =>
                i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined },
              cancel: async () => {},
            };
          },
        } as unknown as ReadableStream<Uint8Array>)
      : null,
    text: async () => text ?? "",
  } as Pick<Response, "headers" | "body" | "text">;
}

test("rejects up front when Content-Length exceeds the cap", async () => {
  const response = fakeResponse({ contentLength: String(MAX_INVENTORY_BYTES + 1), text: "" });
  await assert.rejects(
    () => readCappedResponseText(response, MAX_INVENTORY_BYTES),
    /exceeds 5MB/,
  );
});

test("aborts streaming once accumulated bytes exceed the cap", async () => {
  const big = new Uint8Array(700);
  const chunks = [big, big]; // 1400 bytes > cap of 1000, no Content-Length
  const response = fakeResponse({ chunks });
  await assert.rejects(
    () => readCappedResponseText(response, 1000),
    /exceeds 5MB/,
  );
});

test("returns text for a within-limit streamed body", async () => {
  const chunks = [new TextEncoder().encode("{\"version\":1}")];
  const response = fakeResponse({ chunks });
  const text = await readCappedResponseText(response, MAX_INVENTORY_BYTES);
  assert.equal(text, "{\"version\":1}");
});
