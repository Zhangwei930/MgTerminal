// Multi-host health snapshot — renderer-side types and request building.
// Reuses the connection diagnostics request builder for per-host credentials.

import { buildConnectionDiagnosticsRequest } from "./connectionDiagnostics";
import { hasOnlyEncryptedCredentials } from "./hostHealthCredentials";
import type { Host, Identity, KnownHost, SSHKey } from "./models";

export type HostHealthStatus =
  | "healthy"
  | "degraded"
  | "auth-failed"
  | "unreachable"
  | "credentials-locked"
  | "host-key-untrusted"
  | "error";

export interface HostHealthResult {
  hostId: string;
  status: HostHealthStatus;
  latencyMs?: number;
  authMethod?: string;
  loadAvg1?: number;
  memPercent?: number;
  memTotalKb?: number;
  memUsedKb?: number;
  diskPercent?: number;
  diskTotalKb?: number;
  diskUsedKb?: number;
  needsInteractive?: boolean;
  hostKeyStatus?: string;
  error?: string;
  checkedAt?: number;
}

export const isUnhealthyStatus = (status: HostHealthStatus): boolean =>
  status !== "healthy";

// Health checks open real SSH connections; only SSH-protocol hosts qualify.
export const isHealthCheckableHost = (host: Host): boolean =>
  (!host.protocol || host.protocol === "ssh") && Boolean(host.hostname?.trim());

export interface HostHealthRequest {
  hostId: string;
  options: MagiesTerminalSSHOptions;
}

/**
 * Hosts whose credentials are all still ciphertext. Probing them would strip
 * every credential and report a plain auth failure, blaming the host for a
 * local decryption problem — so they are answered without opening a
 * connection.
 */
export const partitionHostsByCredentialAvailability = ({
  hosts,
  keys,
  identities,
}: {
  hosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
}): { checkable: Host[]; credentialsLocked: Host[] } => {
  const checkable: Host[] = [];
  const credentialsLocked: Host[] = [];
  for (const host of hosts) {
    if (hasOnlyEncryptedCredentials(host, keys, identities)) credentialsLocked.push(host);
    else checkable.push(host);
  }
  return { checkable, credentialsLocked };
};

export const buildHostHealthRequests = ({
  hosts,
  keys,
  identities,
  knownHosts = [],
  allHosts,
}: {
  hosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
  knownHosts?: KnownHost[];
  /** Full host list, used to resolve jump chains. */
  allHosts: Host[];
}): HostHealthRequest[] =>
  hosts.filter(isHealthCheckableHost).map((host) => {
    const chainHosts = (host.hostChain?.hostIds || [])
      .map((hostId) => allHosts.find((candidate) => candidate.id === hostId))
      .filter((candidate): candidate is Host => Boolean(candidate));
    return {
      hostId: host.id,
      options: buildConnectionDiagnosticsRequest({
        host,
        keys,
        identities,
        knownHosts,
        chainHosts,
      }),
    };
  });
