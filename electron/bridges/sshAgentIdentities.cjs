// SSH agent identity helpers: list keys held by the user's agent (type,
// SHA256 fingerprint, comment) and optionally restrict authentication to a
// preferred identity chosen per host.

const crypto = require("node:crypto");
const { BaseAgent, createAgent } = require("ssh2");
const { getAvailableAgentSocket } = require("./sshAuthHelper.cjs");

const normalizeFingerprint = (value) =>
  String(value || "").trim().replace(/^SHA256:/i, "").replace(/=+$/g, "");

const fingerprintOfAgentKey = (key) => {
  try {
    const blob = key.getPublicSSH();
    return crypto.createHash("sha256")
      .update(blob)
      .digest("base64")
      .replace(/=+$/g, "");
  } catch {
    return "";
  }
};

const describeAgentIdentities = (keys) =>
  (keys || []).map((key) => ({
    keyType: key.type || "unknown",
    fingerprint: fingerprintOfAgentKey(key),
    comment: typeof key.comment === "string" ? key.comment : "",
  }));

// Wraps an agent (or agent socket path) so only the preferred identity is
// offered during auth. Falls back to all identities when the preferred key is
// not currently loaded (e.g. hardware token unplugged) so login still works.
class IdentityFilteredAgent extends BaseAgent {
  constructor(inner, fingerprint) {
    super();
    this._inner = typeof inner === "string" ? createAgent(inner) : inner;
    this._fingerprint = normalizeFingerprint(fingerprint);
  }

  getIdentities(cb) {
    this._inner.getIdentities((err, keys) => {
      if (err) return cb(err);
      const all = keys || [];
      const filtered = all.filter(
        (key) => fingerprintOfAgentKey(key) === this._fingerprint,
      );
      cb(null, filtered.length > 0 ? filtered : all);
    });
  }

  sign(...args) {
    return this._inner.sign(...args);
  }
}

const createIdentityFilteredAgent = (inner, fingerprint) =>
  new IdentityFilteredAgent(inner, fingerprint);

// Lists the identities currently held by the available SSH agent.
async function listAgentIdentities() {
  const socket = await getAvailableAgentSocket();
  if (!socket) return { available: false, identities: [] };
  return await new Promise((resolve) => {
    let agent;
    try {
      agent = createAgent(socket);
    } catch (err) {
      resolve({ available: false, error: err?.message, identities: [] });
      return;
    }
    try {
      agent.getIdentities((err, keys) => {
        if (err) {
          resolve({ available: true, error: err.message, identities: [] });
          return;
        }
        resolve({ available: true, identities: describeAgentIdentities(keys || []) });
      });
    } catch (err) {
      resolve({ available: true, error: err?.message, identities: [] });
    }
  });
}

module.exports = {
  describeAgentIdentities,
  fingerprintOfAgentKey,
  createIdentityFilteredAgent,
  listAgentIdentities,
};
