const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  describeAgentIdentities,
  fingerprintOfAgentKey,
  createIdentityFilteredAgent,
} = require("./sshAgentIdentities.cjs");

const fakeKey = (blobText, type, comment) => ({
  type,
  comment,
  getPublicSSH: () => Buffer.from(blobText),
});

const expectedFingerprint = (blobText) =>
  crypto.createHash("sha256").update(Buffer.from(blobText)).digest("base64").replace(/=+$/g, "");

test("describeAgentIdentities maps keys to type/fingerprint/comment", () => {
  const identities = describeAgentIdentities([
    fakeKey("blob-a", "ssh-ed25519", "work laptop"),
    fakeKey("blob-b", "ssh-rsa", undefined),
  ]);
  assert.equal(identities.length, 2);
  assert.deepEqual(identities[0], {
    keyType: "ssh-ed25519",
    fingerprint: expectedFingerprint("blob-a"),
    comment: "work laptop",
  });
  assert.equal(identities[1].keyType, "ssh-rsa");
  assert.equal(identities[1].comment, "");
});

test("fingerprintOfAgentKey strips base64 padding", () => {
  const fp = fingerprintOfAgentKey(fakeKey("blob-a", "ssh-ed25519"));
  assert.ok(!fp.endsWith("="));
  assert.equal(fp, expectedFingerprint("blob-a"));
});

test("filtered agent offers only the preferred identity", async () => {
  const keys = [fakeKey("blob-a", "ssh-ed25519", "a"), fakeKey("blob-b", "ssh-rsa", "b")];
  const inner = {
    getIdentities: (cb) => cb(null, keys),
    sign: (...args) => args[args.length - 1](null, Buffer.from("sig")),
  };
  const agent = createIdentityFilteredAgent(inner, `SHA256:${expectedFingerprint("blob-b")}`);
  const offered = await new Promise((resolve, reject) =>
    agent.getIdentities((err, list) => (err ? reject(err) : resolve(list))));
  assert.equal(offered.length, 1);
  assert.equal(offered[0].comment, "b");
});

test("filtered agent falls back to all identities when preferred key is absent", async () => {
  const keys = [fakeKey("blob-a", "ssh-ed25519", "a")];
  const inner = {
    getIdentities: (cb) => cb(null, keys),
    sign: () => {},
  };
  const agent = createIdentityFilteredAgent(inner, expectedFingerprint("missing"));
  const offered = await new Promise((resolve, reject) =>
    agent.getIdentities((err, list) => (err ? reject(err) : resolve(list))));
  assert.equal(offered.length, 1);
});

test("filtered agent delegates sign to the inner agent", () => {
  let signCalled = false;
  const inner = {
    getIdentities: (cb) => cb(null, []),
    sign: () => {
      signCalled = true;
    },
  };
  const agent = createIdentityFilteredAgent(inner, "abc");
  agent.sign({}, Buffer.from("data"), {}, () => {});
  assert.equal(signCalled, true);
});
