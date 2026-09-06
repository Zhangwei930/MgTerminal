"use strict";

/**
 * TLS settings for a direct database connection.
 *
 * When the connection tunnels through SSH the transport is already encrypted
 * and TLS on top of it buys nothing, which is why `disable` is the default and
 * why the adapters had no option at all. But `hostId` is optional — a profile
 * with none dials the database straight from this machine, over the LAN or the
 * internet — and on that path the password and every row were in clear text.
 *
 * Three modes, because two would force a bad choice:
 *
 * - `disable`  no TLS. Correct inside an SSH tunnel.
 * - `require`  encrypted, certificate not checked. Stops passive capture but
 *              not an active man in the middle. This is the mode that makes a
 *              self-signed certificate on an internal server usable, and
 *              without it people go back to `disable`.
 * - `verify`   encrypted and the certificate checked. The one to prefer.
 */

const MODES = new Set(["disable", "require", "verify"]);

/**
 * @param {"mysql"|"postgres"|"mssql"|"oracle"} engine
 * @param {{ mode?: string, ca?: string } | undefined} ssl
 * @returns {object} connection options to merge into the driver's config
 */
function resolveSslOptions(engine, ssl) {
  const mode = ssl?.mode ?? "disable";
  if (!MODES.has(mode)) {
    throw new Error(`Unknown TLS mode: ${mode}`);
  }
  if (mode === "disable") return {};

  if (engine === "oracle") {
    // oracledb negotiates TLS through the connect string (TCPS) or sqlnet.ora,
    // not through a client option. Accepting a mode here would report a
    // protection that was never applied.
    throw new Error(
      "Oracle TLS is configured in the connect string (TCPS) or sqlnet.ora, not here.",
    );
  }

  const verify = mode === "verify";

  if (engine === "mssql") {
    return { options: { encrypt: true, trustServerCertificate: !verify } };
  }

  // mysql2 and pg both take a Node TLS options object under `ssl`.
  const tls = { rejectUnauthorized: verify };
  if (ssl?.ca) tls.ca = ssl.ca;
  return { ssl: tls };
}

module.exports = { resolveSslOptions, TLS_MODES: [...MODES] };
