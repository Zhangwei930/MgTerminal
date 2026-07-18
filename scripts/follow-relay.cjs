#!/usr/bin/env node
/**
 * Standalone WAN follow relay for MagiesTerminal.
 * Usage: node scripts/follow-relay.cjs [--port 7788] [--host 0.0.0.0]
 */
"use strict";

const path = require("node:path");
const { createFollowRelayServer } = require(path.join(
  __dirname,
  "..",
  "electron/bridges/sessionFollowRelay.cjs",
));

function parseArgs(argv) {
  let port = 7788;
  let host = "0.0.0.0";
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--port" && argv[i + 1]) {
      port = Number(argv[++i]);
    } else if (argv[i] === "--host" && argv[i + 1]) {
      host = argv[++i];
    }
  }
  return { port, host };
}

async function main() {
  const { port, host } = parseArgs(process.argv);
  const relay = createFollowRelayServer({ port, host });
  const addr = await relay.start();
  console.log(`[follow-relay] listening on ${addr.host}:${addr.port}`);
  console.log("[follow-relay] point MagiesTerminal WAN invites at this host:port");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
