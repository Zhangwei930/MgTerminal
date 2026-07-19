const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  collectLocalTreeEntries,
  parseAttribOutput,
  listWindowsHiddenBasenames,
} = require("./localFsBridge.cjs");

test("parseAttribOutput returns an empty set for empty input", () => {
  assert.equal(parseAttribOutput("").size, 0);
  assert.equal(parseAttribOutput("\r\n\r\n").size, 0);
});

test("parseAttribOutput captures basenames of files with the H flag", () => {
  const stdout = [
    "A            C:\\Users\\foo\\public.txt",
    "     H       C:\\Users\\foo\\.secret",
    "A    H  R   C:\\Users\\foo\\hidden-readonly.exe",
    "A            C:\\Users\\foo\\another.log",
  ].join("\r\n");

  const hidden = parseAttribOutput(stdout);
  assert.deepEqual(
    [...hidden].sort(),
    [".secret", "hidden-readonly.exe"].sort(),
  );
});

test("parseAttribOutput ignores the trailing [DIR] marker on some Windows versions", () => {
  const stdout = [
    "     H       C:\\data\\node_modules                       [DIR]",
    "     H       C:\\data\\.git                               [DIR]",
    "A            C:\\data\\README.md",
  ].join("\r\n");

  const hidden = parseAttribOutput(stdout);
  assert.deepEqual([...hidden].sort(), [".git", "node_modules"].sort());
});

test("parseAttribOutput preserves filenames that legitimately end with bracketed suffixes", () => {
  // Regression: a prior version stripped ANY trailing bracketed suffix
  // via /\s+\[[^\]]+\]\s*$/, truncating "Notes [old]" to "Notes".
  // Only the literal [DIR] marker that attrib emits with /d is a parser
  // artifact; user-facing filenames with brackets must survive intact so
  // hiddenSet.has(entry.name) still matches the actual readdir entry.
  const stdout = [
    "     H       C:\\data\\Notes [old]",
    "     H       C:\\data\\Draft [v2].md",
    "     H       C:\\data\\archived [2024]",
    "     H       C:\\data\\node_modules                        [DIR]",
  ].join("\r\n");

  const hidden = parseAttribOutput(stdout);
  assert.deepEqual(
    [...hidden].sort(),
    ["Draft [v2].md", "Notes [old]", "archived [2024]", "node_modules"].sort(),
  );
});

test("parseAttribOutput handles UNC paths", () => {
  const stdout = [
    "     H       \\\\fileserver\\share\\secret.cfg",
    "A            \\\\fileserver\\share\\public.cfg",
  ].join("\r\n");

  const hidden = parseAttribOutput(stdout);
  assert.deepEqual([...hidden], ["secret.cfg"]);
});

test("parseAttribOutput skips malformed lines", () => {
  const stdout = [
    "Parameter format not correct",
    "",
    "     H       C:\\good\\hidden.txt",
    "File not found",
    "     H       not-a-windows-path.txt",
  ].join("\r\n");

  const hidden = parseAttribOutput(stdout);
  assert.deepEqual([...hidden], ["hidden.txt"]);
});

test("listWindowsHiddenBasenames returns an empty set on non-Windows without spawning anything", async () => {
  // Running this test file is only meaningful on a non-Windows host for this
  // assertion. On Windows CI we skip the subprocess-free guarantee.
  if (process.platform === "win32") return;
  const result = await listWindowsHiddenBasenames("/tmp");
  assert.ok(result instanceof Set);
  assert.equal(result.size, 0);
});

test("listWindowsHiddenBasenames invokes attrib.exe with /d so hidden directories aren't omitted", async () => {
  // Regression: without `/d`, `attrib <dir>\*` treats the wildcard as
  // file-centric and hidden directories (node_modules, .git, …) never
  // reach parseAttribOutput — the SFTP browser then shows them as
  // not-hidden, a behavior regression from the per-file implementation.
  const Module = require("node:module");
  const realChildProcess = require("node:child_process");
  const originalLoad = Module._load;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

  let capturedArgs = null;
  let capturedExecutable = null;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "node:child_process") {
      return {
        ...realChildProcess,
        execFile: (executable, args, _options, cb) => {
          capturedExecutable = executable;
          capturedArgs = args;
          cb(null, { stdout: "", stderr: "" });
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  Object.defineProperty(process, "platform", {
    value: "win32",
    writable: true,
    configurable: true,
  });

  const bridgePath = require.resolve("./localFsBridge.cjs");
  delete require.cache[bridgePath];

  try {
    const { listWindowsHiddenBasenames: fn } = require("./localFsBridge.cjs");
    await fn("C:\\fixture");
  } finally {
    Module._load = originalLoad;
    Object.defineProperty(process, "platform", originalPlatform);
    delete require.cache[bridgePath];
  }

  assert.equal(capturedExecutable, "attrib.exe");
  assert.ok(
    Array.isArray(capturedArgs) && capturedArgs.includes("/d"),
    `expected /d in attrib args so hidden directories are included, got ${JSON.stringify(capturedArgs)}`,
  );
});

test("collectLocalTreeEntries preserves empty directories in selected folders", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "magiesTerminal-upload-tree-"));
  const selected = path.join(root, "project");
  await fs.promises.mkdir(path.join(selected, "empty"), { recursive: true });
  await fs.promises.mkdir(path.join(selected, "src"), { recursive: true });
  await fs.promises.writeFile(path.join(selected, "src", "main.txt"), "hello");

  try {
    const entries = await collectLocalTreeEntries(selected);
    const summary = entries.map((entry) => ({
      relativePath: entry.relativePath,
      type: entry.type,
    }));

    assert.deepEqual(summary, [
      { relativePath: "project", type: "directory" },
      { relativePath: "project/empty", type: "directory" },
      { relativePath: "project/src", type: "directory" },
      { relativePath: "project/src/main.txt", type: "file" },
    ]);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("readLocalFile returns only the trailing maxBytes when requested", async () => {
  const { readLocalFile } = require("./localFsBridge.cjs");
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "magiesTerminal-local-read-"));
  const filePath = path.join(root, "hist.txt");
  const body = "AAAA\nBBBB\nCCCC\nDDDD\n";
  await fs.promises.writeFile(filePath, body);

  try {
    const full = await readLocalFile(null, { path: filePath });
    assert.equal(Buffer.from(full).toString("utf8"), body);

    const tailed = await readLocalFile(null, { path: filePath, maxBytes: 10 });
    assert.equal(Buffer.from(tailed).toString("utf8"), body.slice(-10));
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

function collectRegisteredHandlers() {
  const { registerHandlers } = require("./localFsBridge.cjs");
  const handlers = new Map();
  registerHandlers({ handle: (channel, fn) => handlers.set(channel, fn) });
  return handlers;
}

test("registered local filesystem handlers reject untrusted IPC senders", async () => {
  const handlers = collectRegisteredHandlers();
  const untrustedEvent = {
    sender: { isDestroyed: () => false, getType: () => "webview", getURL: () => "file://x" },
  };

  // Every channel that reads, writes, or enumerates the local filesystem must
  // refuse a webview/guest sender before touching disk. The bogus path proves
  // the guard fires ahead of any fs access (a leaked call would reject with
  // ENOENT, not the guard error).
  const guardedChannels = [
    "magiesTerminal:local:list",
    "magiesTerminal:local:read",
    "magiesTerminal:local:write",
    "magiesTerminal:local:delete",
    "magiesTerminal:local:rename",
    "magiesTerminal:local:mkdir",
    "magiesTerminal:local:stat",
    "magiesTerminal:local:tree",
    "magiesTerminal:local:homedir",
    "magiesTerminal:local:drives",
    "magiesTerminal:system:info",
    "magiesTerminal:known-hosts:read",
  ];

  for (const channel of guardedChannels) {
    const handler = handlers.get(channel);
    assert.equal(typeof handler, "function", `${channel} handler missing`);
    await assert.rejects(
      async () => handler(untrustedEvent, { path: "/definitely-not-a-real-path-xyz", newPath: "/nope" }),
      /untrusted_sender_type/,
      `${channel} must reject untrusted senders`,
    );
  }
});

test("registered read handler passes trusted senders through to the filesystem", async () => {
  const handlers = collectRegisteredHandlers();
  const trustedEvent = {
    sender: { isDestroyed: () => false, getType: () => "window", getURL: () => "file:///app/index.html" },
  };
  // A trusted sender must reach fs and fail with ENOENT (not a guard rejection),
  // proving the wrapper does not block legitimate renderer callers.
  await assert.rejects(
    async () => handlers.get("magiesTerminal:local:read")(trustedEvent, { path: "/nonexistent-abc-123" }),
    (err) => !/untrusted/.test(String(err?.message)),
  );
});
