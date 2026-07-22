const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HEALTH_SNAPSHOT_SCRIPT,
  parseHealthSnapshot,
  summarizeHealthStatus,
  describeFailedProbe,
} = require("./healthCore.cjs");

test("snapshot script emits LOAD/MEM/DISK markers", () => {
  assert.match(HEALTH_SNAPSHOT_SCRIPT, /LOAD/);
  assert.match(HEALTH_SNAPSHOT_SCRIPT, /MEM/);
  assert.match(HEALTH_SNAPSHOT_SCRIPT, /DISK/);
});

test("parseHealthSnapshot reads linux-style output", () => {
  const stdout = [
    "LOAD 0.42 0.36 0.30 1/234 5678",
    "MEM 16384000 8192000",
    "DISK 102400000 51200000",
  ].join("\n");
  const snapshot = parseHealthSnapshot(stdout);
  assert.equal(snapshot.loadAvg1, 0.42);
  assert.equal(snapshot.memTotalKb, 16384000);
  assert.equal(snapshot.memUsedKb, 8192000);
  assert.equal(snapshot.memPercent, 50);
  assert.equal(snapshot.diskTotalKb, 102400000);
  assert.equal(snapshot.diskPercent, 50);
});

test("parseHealthSnapshot tolerates missing sections", () => {
  const snapshot = parseHealthSnapshot("LOAD 1.5 1.2 1.0\n");
  assert.equal(snapshot.loadAvg1, 1.5);
  assert.equal(snapshot.memPercent, undefined);
  assert.equal(snapshot.diskPercent, undefined);
});

test("parseHealthSnapshot handles macOS sysctl loadavg format", () => {
  const snapshot = parseHealthSnapshot("LOAD { 2.05 1.90 1.80 }\n");
  assert.equal(snapshot.loadAvg1, 2.05);
});

test("summarizeHealthStatus: unreachable when tcp failed", () => {
  assert.equal(
    summarizeHealthStatus({ tcpOk: false, authOk: false }),
    "unreachable",
  );
});

test("summarizeHealthStatus: auth-failed when tcp ok but auth failed", () => {
  assert.equal(
    summarizeHealthStatus({ tcpOk: true, authOk: false }),
    "auth-failed",
  );
});

test("summarizeHealthStatus: degraded on high memory/disk pressure", () => {
  assert.equal(
    summarizeHealthStatus({
      tcpOk: true,
      authOk: true,
      snapshot: { memPercent: 96 },
    }),
    "degraded",
  );
  assert.equal(
    summarizeHealthStatus({
      tcpOk: true,
      authOk: true,
      snapshot: { diskPercent: 92 },
    }),
    "degraded",
  );
});

test("summarizeHealthStatus: healthy otherwise", () => {
  assert.equal(
    summarizeHealthStatus({
      tcpOk: true,
      authOk: true,
      snapshot: { memPercent: 40, diskPercent: 50 },
    }),
    "healthy",
  );
  assert.equal(
    summarizeHealthStatus({ tcpOk: true, authOk: true }),
    "healthy",
  );
});

test("describeFailedProbe distinguishes an untrusted host key from a rejected login", () => {
  // The probe withholds every auth method when the host key is not trusted, so
  // ssh2 reports a generic auth failure. Passing that through blames the
  // credentials for what is really an unverified host.
  const rejected = describeFailedProbe({
    hostKeyRejected: true,
    hostKeyStatus: "unknown",
    methodsTried: [],
    error: "All configured authentication methods failed",
  });
  assert.equal(rejected.status, "host-key-untrusted");
  assert.match(rejected.error, /host key/i);
  assert.equal(rejected.hostKeyStatus, "unknown");

  const changed = describeFailedProbe({
    hostKeyRejected: true,
    hostKeyStatus: "changed",
    methodsTried: [],
    error: "whatever ssh2 said",
  });
  assert.equal(changed.status, "host-key-untrusted");
  assert.equal(changed.hostKeyStatus, "changed");
});

test("describeFailedProbe keeps the existing reasons for real auth failures", () => {
  assert.equal(
    describeFailedProbe({ needsInteractive: true, methodsTried: ["password"] }).error,
    "Server requires interactive authentication (e.g. MFA)",
  );
  assert.equal(
    describeFailedProbe({ encryptedKeySkipped: true, methodsTried: [] }).error,
    "Configured private key is encrypted and no passphrase is saved",
  );
  assert.equal(
    describeFailedProbe({ methodsTried: [] }).error,
    "No usable authentication credentials available",
  );

  // Methods were genuinely tried and refused: keep the server's own wording.
  const real = describeFailedProbe({
    methodsTried: ["agent"],
    error: "All configured authentication methods failed",
  });
  assert.equal(real.status, "auth-failed");
  assert.equal(real.error, "All configured authentication methods failed");
});

test("describeFailedProbe prefers interactive over an untrusted key", () => {
  // needsInteractive means the server answered; that is more actionable.
  const result = describeFailedProbe({
    needsInteractive: true,
    hostKeyRejected: true,
    hostKeyStatus: "unknown",
    methodsTried: [],
  });
  assert.equal(result.status, "auth-failed");
});

test("a skipped passphrase-protected key is reported even when fallbacks were tried", () => {
  // loadProbeKey skips an encrypted key when no passphrase is saved, then the
  // probe falls back to the ssh-agent. That fallback fills methodsTried, so
  // gating the message on an empty methodsTried hid the real cause: the
  // configured key was never offered. Interactive connections do not hit this
  // because they can prompt for the passphrase.
  const result = describeFailedProbe({
    encryptedKeySkipped: true,
    methodsTried: ["agent"],
    error: "All configured authentication methods failed",
  });
  assert.equal(result.status, "auth-failed");
  assert.match(result.error, /passphrase/i);
  assert.doesNotMatch(result.error, /authentication methods failed/);
});

test("an untrusted host key still outranks a skipped key", () => {
  // Nothing was offered at all in that case, so the key is not the story.
  const result = describeFailedProbe({
    hostKeyRejected: true,
    hostKeyStatus: "unknown",
    encryptedKeySkipped: true,
    methodsTried: [],
  });
  assert.equal(result.status, "host-key-untrusted");
});

test("nothing-was-tried never parrots ssh2's 'all methods failed'", () => {
  // ssh2 emits that exact sentence when the auth handler runs out of methods —
  // including when it had zero to begin with. Forwarding it then claims the
  // credentials were tried and refused, when in truth nothing was offered.
  const result = describeFailedProbe({
    methodsTried: [],
    error: "All configured authentication methods failed",
  });
  assert.equal(result.status, "auth-failed");
  assert.doesNotMatch(result.error, /authentication methods failed/);
  assert.match(result.error, /No usable authentication credentials/);
});

test("a distinct error still survives when nothing was tried", () => {
  const result = describeFailedProbe({ methodsTried: [], error: "connect ETIMEDOUT" });
  assert.equal(result.error, "connect ETIMEDOUT");
});
