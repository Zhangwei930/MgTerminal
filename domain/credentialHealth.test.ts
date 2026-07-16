import test from "node:test";
import assert from "node:assert/strict";
import {
  collectSecuredFields,
  findUndecryptableCredentialFields,
} from "./credentialHealth.ts";
import type { Host, SSHKey } from "./models";

// enc:v1 with a valid safeStorage header ("v10" → djEw…) — a real leftover
// ciphertext as produced when decryptField fails soft and keeps the stored value.
const STUCK_CIPHERTEXT = "enc:v1:djEwAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const host = (over: Partial<Host>): Host => ({
  id: "h1",
  label: "prod-server",
  hostname: "example.com",
  port: 22,
  username: "root",
  group: "",
  tags: [],
  os: "linux",
  protocol: "ssh",
  authMethod: "password",
  createdAt: 1,
  ...over,
});

const key = (over: Partial<SSHKey>): SSHKey => ({
  id: "k1",
  label: "id_ed25519",
  type: "ED25519",
  privateKey: "",
  publicKey: "",
  source: "imported",
  category: "key",
  created: 1,
  ...over,
});

test("collectSecuredFields: gathers host/key/identity/group/proxy secret fields", () => {
  const refs = collectSecuredFields({
    hosts: [
      host({
        password: "p",
        telnetPassword: "tp",
        proxyConfig: { type: "http", host: "proxy", port: 8080, password: "pp" },
      }),
    ],
    keys: [key({ passphrase: "pw", privateKey: "PRIVATE" })],
    identities: [
      {
        id: "i1",
        label: "ops",
        username: "ops",
        authMethod: "password",
        password: "ip",
        created: 1,
      },
    ],
    groupConfigs: [{ path: "prod", password: "gp", telnetPassword: "gtp" }],
    proxyProfiles: [
      {
        id: "pp1",
        label: "corp-proxy",
        config: { type: "socks5", host: "p", port: 1080, password: "spp" },
        createdAt: 1,
      },
    ],
  });

  const fields = refs.map((r) => `${r.itemType}:${r.label}:${r.field}`).sort();
  assert.deepEqual(fields, [
    "group:prod:password",
    "group:prod:telnetPassword",
    "host:prod-server:password",
    "host:prod-server:proxyConfig.password",
    "host:prod-server:telnetPassword",
    "identity:ops:password",
    "key:id_ed25519:passphrase",
    "key:id_ed25519:privateKey",
    "proxyProfile:corp-proxy:config.password",
  ].sort());
});

test("collectSecuredFields: skips empty/undefined secrets", () => {
  const refs = collectSecuredFields({
    hosts: [host({ password: undefined, telnetPassword: "" })],
    keys: [key({ privateKey: "" })],
  });
  assert.deepEqual(refs, []);
});

test("findUndecryptableCredentialFields: flags values still looking like ciphertext", () => {
  const refs = collectSecuredFields({
    hosts: [host({ password: STUCK_CIPHERTEXT })],
    keys: [key({ passphrase: "plain-after-decrypt" })],
  });
  const issues = findUndecryptableCredentialFields(refs);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].itemType, "host");
  assert.equal(issues[0].label, "prod-server");
  assert.equal(issues[0].field, "password");
});
