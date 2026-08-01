"use strict";

const { CAPABILITY_STATUS, CAPABILITY_SURFACES, AGENT_KINDS } = require("./constants.cjs");

/** First-party domains that may register capabilities (no third-party plugins). */
const FIRST_PARTY_DOMAINS = Object.freeze([
  "meta",
  "session",
  "terminal",
  "sftp",
  "vault",
  "portforward",
  "harness",
  "attachment",
  "kubernetes",
  "system",
  "db",
]);

/**
 * Capability ids that may set write=true AND bypassesApproval=true.
 * Keep tiny — security review surface.
 */
const WRITE_BYPASSES_APPROVAL_ALLOWLIST = Object.freeze(new Set([
  "terminal.stop",
]));

/** Description / schema text must not claim secret fields are returned. */
const SECRET_CLAIM_PATTERN = /\b(password|private[_\s-]?key|passphrase|secret[_\s-]?key|api[_\s-]?key)\b/i;

const REQUIRED_POLICY_KEYS = Object.freeze([
  "write",
  "sensitiveRead",
  "longRunning",
  "requiresChatSession",
  "bypassesObserverBlock",
  "bypassesApproval",
  "bypassesChatCancel",
]);

const VALID_STATUSES = new Set(Object.values(CAPABILITY_STATUS));
const VALID_SURFACES = new Set(Object.values(CAPABILITY_SURFACES));
const VALID_AGENT_KINDS = new Set(Object.values(AGENT_KINDS));

/**
 * @param {unknown} value
 * @returns {value is import('./types.cjs').CapabilityDefinition}
 */
function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate a capability definition. Returns { ok: true, capability } or { ok: false, errors }.
 * Does not mutate input.
 *
 * @param {unknown} raw
 * @param {{ allowlistWriteBypass?: Set<string>, allowDomains?: readonly string[] }} [options]
 */
function validateCapabilityDefinition(raw, options = {}) {
  const errors = [];
  const writeBypassAllowlist = options.allowlistWriteBypass || WRITE_BYPASSES_APPROVAL_ALLOWLIST;
  const allowDomains = options.allowDomains || FIRST_PARTY_DOMAINS;

  if (!isObject(raw)) {
    return { ok: false, errors: ["capability must be an object"] };
  }

  const id = raw.id;
  if (typeof id !== "string" || !id.trim()) {
    errors.push("id is required");
  } else if (!/^[a-z][a-z0-9]*(\.[a-z0-9][a-z0-9_-]*)+$/i.test(id) && !/^[a-z][a-z0-9._-]+$/i.test(id)) {
    // allow existing ids like vault.host.notes.get
    if (!/^[a-z][a-z0-9._-]*$/i.test(id)) {
      errors.push(`id has invalid characters: ${id}`);
    }
  }

  const domain = raw.domain;
  if (typeof domain !== "string" || !domain.trim()) {
    errors.push("domain is required");
  } else if (!allowDomains.includes(domain)) {
    errors.push(`domain "${domain}" is not a first-party domain (allowed: ${allowDomains.join(", ")})`);
  }

  if (!VALID_STATUSES.has(raw.status)) {
    errors.push(`status must be one of: ${[...VALID_STATUSES].join(", ")}`);
  }

  if (typeof raw.description !== "string" || !raw.description.trim()) {
    errors.push("description is required");
  } else if (domain === "vault" && SECRET_CLAIM_PATTERN.test(raw.description) && !/no passwords|metadata only|never|not returned|without secrets/i.test(raw.description)) {
    // Soft guard: vault descriptions that mention secrets must also say they are not returned.
    // Allow "password" in "no passwords" phrasing via the second regex.
    if (!/\bno passwords\b|\bmetadata only\b|\bnever\b|\bnot (returned|include)/i.test(raw.description)) {
      errors.push(`vault capability "${id}" description mentions secrets without stating they are excluded`);
    }
  }

  if (!isObject(raw.policy)) {
    errors.push("policy is required");
  } else {
    for (const key of REQUIRED_POLICY_KEYS) {
      if (typeof raw.policy[key] !== "boolean") {
        errors.push(`policy.${key} must be a boolean`);
      }
    }
    if (raw.policy.write === true && raw.policy.bypassesApproval === true) {
      if (!writeBypassAllowlist.has(id)) {
        errors.push(`write capability "${id}" cannot set bypassesApproval=true (not on allowlist)`);
      }
    }
    if (raw.policy.write === true && raw.policy.bypassesObserverBlock === true && !writeBypassAllowlist.has(id)) {
      // terminal.stop is allowlisted; other writes must stay blocked in observer mode
      if (id !== "terminal.stop") {
        errors.push(`write capability "${id}" cannot set bypassesObserverBlock=true`);
      }
    }
  }

  if (!isObject(raw.surfaces)) {
    errors.push("surfaces is required");
  } else {
    const surfaceKeys = Object.keys(raw.surfaces);
    if (raw.status === CAPABILITY_STATUS.IMPLEMENTED && surfaceKeys.length === 0) {
      errors.push(`implemented capability "${id}" must expose at least one surface`);
    }
    for (const [surfaceName, binding] of Object.entries(raw.surfaces)) {
      if (!VALID_SURFACES.has(surfaceName)) {
        errors.push(`unknown surface "${surfaceName}"`);
        continue;
      }
      if (!isObject(binding)) {
        errors.push(`surfaces.${surfaceName} must be an object`);
        continue;
      }
      if (raw.policy?.write === true && binding.confirmInConfirmMode === false) {
        errors.push(`write capability "${id}" surface ${surfaceName} must not set confirmInConfirmMode=false`);
      }
      if (
        raw.status === CAPABILITY_STATUS.IMPLEMENTED
        && !binding.rpcMethod
        && !binding.mcpTool
        && !binding.toolName
        && !(Array.isArray(binding.command) && binding.command.length > 0)
      ) {
        errors.push(`implemented surface ${surfaceName} on "${id}" needs rpcMethod, mcpTool, toolName, or command`);
      }
    }
  }

  if (raw.agentKinds != null) {
    if (!Array.isArray(raw.agentKinds)) {
      errors.push("agentKinds must be an array when provided");
    } else {
      for (const kind of raw.agentKinds) {
        if (!VALID_AGENT_KINDS.has(kind)) {
          errors.push(`unknown agentKind "${kind}"`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    capability: /** @type {import('./types.cjs').CapabilityDefinition} */ (raw),
  };
}

/**
 * Normalize partial policy with safe defaults, then validate.
 * Writes default to require approval and observer block.
 *
 * @param {object} input
 * @returns {{ ok: true, capability: object } | { ok: false, errors: string[] }}
 */
function defineCapability(input) {
  if (!isObject(input)) {
    return { ok: false, errors: ["capability must be an object"] };
  }

  const write = Boolean(input.policy?.write);
  const policy = {
    write,
    sensitiveRead: false,
    longRunning: false,
    requiresChatSession: write,
    bypassesObserverBlock: false,
    bypassesApproval: !write,
    bypassesChatCancel: !write,
    ...(isObject(input.policy) ? input.policy : {}),
  };

  // Re-apply hard safety if caller tried to open write bypasses without allowlist.
  // Final decision still goes through validateCapabilityDefinition.
  const candidate = {
    ...input,
    policy,
    surfaces: isObject(input.surfaces) ? input.surfaces : {},
  };

  return validateCapabilityDefinition(candidate);
}

module.exports = {
  FIRST_PARTY_DOMAINS,
  WRITE_BYPASSES_APPROVAL_ALLOWLIST,
  SECRET_CLAIM_PATTERN,
  validateCapabilityDefinition,
  defineCapability,
};
