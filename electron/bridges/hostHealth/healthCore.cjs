// Pure logic for the multi-host health snapshot: the remote snapshot script,
// its parser, and the health-status classifier. No I/O here.

// POSIX-safe one-liner emitting marker lines. Linux gets /proc + free; macOS
// falls back to sysctl loadavg. Disk always via `df -kP /`. Missing tools
// simply omit their marker line.
const HEALTH_SNAPSHOT_SCRIPT =
  'echo "LOAD $(cat /proc/loadavg 2>/dev/null || sysctl -n vm.loadavg 2>/dev/null)"; ' +
  'free -k 2>/dev/null | awk \'NR==2{print "MEM",$2,$3}\'; ' +
  'df -kP / 2>/dev/null | awk \'NR==2{print "DISK",$2,$3}\'';

const toPercent = (used, total) => {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return undefined;
  return Math.round((used / total) * 100);
};

function parseHealthSnapshot(stdout) {
  const snapshot = {};
  for (const rawLine of String(stdout || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("LOAD ")) {
      // Linux: "0.42 0.36 0.30 1/234 5678"; macOS sysctl: "{ 2.05 1.90 1.80 }"
      const match = line.slice(5).match(/(\d+(?:[.,]\d+)?)/);
      if (match) snapshot.loadAvg1 = Number.parseFloat(match[1].replace(",", "."));
    } else if (line.startsWith("MEM ")) {
      const [total, used] = line.slice(4).trim().split(/\s+/).map(Number);
      if (Number.isFinite(total)) snapshot.memTotalKb = total;
      if (Number.isFinite(used)) snapshot.memUsedKb = used;
      const percent = toPercent(used, total);
      if (percent !== undefined) snapshot.memPercent = percent;
    } else if (line.startsWith("DISK ")) {
      const [total, used] = line.slice(5).trim().split(/\s+/).map(Number);
      if (Number.isFinite(total)) snapshot.diskTotalKb = total;
      if (Number.isFinite(used)) snapshot.diskUsedKb = used;
      const percent = toPercent(used, total);
      if (percent !== undefined) snapshot.diskPercent = percent;
    }
  }
  return snapshot;
}

const MEM_PRESSURE_PERCENT = 95;
const DISK_PRESSURE_PERCENT = 90;

function summarizeHealthStatus({ tcpOk, authOk, snapshot }) {
  if (!tcpOk) return "unreachable";
  if (!authOk) return "auth-failed";
  if (snapshot) {
    if ((snapshot.memPercent ?? 0) >= MEM_PRESSURE_PERCENT) return "degraded";
    if ((snapshot.diskPercent ?? 0) >= DISK_PRESSURE_PERCENT) return "degraded";
  }
  return "healthy";
}

/**
 * Turn a failed auth probe into a status plus a reason the user can act on.
 *
 * The probe withholds every authentication method while the host key is not
 * trusted, so ssh2 answers with its generic "all methods failed". Relaying
 * that blames the credentials for what is really an unverified host — the
 * probe already reports `hostKeyRejected`, it was simply never read.
 */
function describeFailedProbe(probe = {}) {
  const methodsTried = probe.methodsTried || [];

  // The server actually answered and asked for interaction: more actionable
  // than anything the host key can tell us.
  if (probe.needsInteractive) {
    return {
      status: "auth-failed",
      error: "Server requires interactive authentication (e.g. MFA)",
    };
  }

  if (probe.hostKeyRejected) {
    return {
      status: "host-key-untrusted",
      hostKeyStatus: probe.hostKeyStatus,
      error: `Host key ${probe.hostKeyStatus || "unknown"}; authentication was not attempted`,
    };
  }

  if (probe.encryptedKeySkipped && methodsTried.length === 0) {
    return {
      status: "auth-failed",
      error: "Configured private key is encrypted and no passphrase is saved",
    };
  }

  if (methodsTried.length === 0) {
    return {
      status: "auth-failed",
      error: probe.error || "No usable authentication credentials available",
    };
  }

  // Methods were offered and refused — the server's own wording is the truth.
  return { status: "auth-failed", error: probe.error };
}

module.exports = {
  HEALTH_SNAPSHOT_SCRIPT,
  parseHealthSnapshot,
  summarizeHealthStatus,
  describeFailedProbe,
};
