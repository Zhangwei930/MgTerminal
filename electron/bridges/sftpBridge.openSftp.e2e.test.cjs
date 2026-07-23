/**
 * Real integration test: sftpBridge's core CRUD ops against a real throwaway
 * local sshd (with the sftp-server subsystem enabled), not a hand-rolled
 * ssh2-sftp-client fake. Self-skips when the environment can't provide a
 * working sshd/sftp-server (see the harness for exact conditions).
 */

"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const { withTestSshServer } = require("./testHarness/localSshServer.cjs");

function makeSender() {
  return { id: 1, isDestroyed: () => false, send: () => {} };
}

test("sftpBridge CRUD round-trips real files over a real SFTP connection", async (t) => {
  await withTestSshServer(t, { enableSftp: true }, async (server) => {
    const sftpBridge = require("./sftpBridge.cjs");
    sftpBridge.init({ sftpClients: new Map(), sessions: new Map(), electronModule: {} });

    const event = { sender: makeSender() };
    const { sftpId } = await sftpBridge.openSftp(event, {
      hostname: server.hostname,
      port: server.port,
      username: server.username,
      privateKey: server.privateKey.toString("utf8"),
      verifyHostKeys: false,
    });
    assert.ok(sftpId);
    t.after(() => sftpBridge.closeSftp(event, { sftpId }));

    const remoteDir = path.posix.join(server.tmpDir.replace(/\\/g, "/"), "sftp-e2e-dir");
    await sftpBridge.mkdirSftp(event, { sftpId, path: remoteDir });

    const filePath = path.posix.join(remoteDir, "hello.txt");
    await sftpBridge.writeSftp(event, { sftpId, path: filePath, content: "hello-from-sftp" });

    const listing = await sftpBridge.listSftp(event, { sftpId, path: remoteDir });
    assert.ok(listing.some((entry) => entry.name === "hello.txt" && entry.type === "file"));

    const content = await sftpBridge.readSftp(event, { sftpId, path: filePath });
    assert.equal(content, "hello-from-sftp");

    const renamedPath = path.posix.join(remoteDir, "hello-renamed.txt");
    await sftpBridge.renameSftp(event, { sftpId, oldPath: filePath, newPath: renamedPath });
    const afterRename = await sftpBridge.listSftp(event, { sftpId, path: remoteDir });
    assert.ok(!afterRename.some((entry) => entry.name === "hello.txt"));
    assert.ok(afterRename.some((entry) => entry.name === "hello-renamed.txt"));

    await sftpBridge.deleteSftp(event, { sftpId, path: renamedPath });
    const afterDelete = await sftpBridge.listSftp(event, { sftpId, path: remoteDir });
    assert.equal(afterDelete.length, 0);
  });
});
