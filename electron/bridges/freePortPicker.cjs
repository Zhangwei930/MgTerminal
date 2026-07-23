"use strict";

const net = require("net");

/** Opens a throwaway listener on port 0 to let the OS assign a free port, then closes it. */
function getFreeLocalPort({ bindAddress = "127.0.0.1" } = {}) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, bindAddress, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

module.exports = { getFreeLocalPort };
