"use strict";

/**
 * Lightweight TCP NDJSON room relay for WAN follow.
 * Host and viewers dial out to the relay (NAT-friendly). No WebSocket dependency.
 *
 * First line after connect:
 *   { type: "relayJoin", role: "host"|"viewer", roomId, token, displayName? }
 * Then the same session-follow frame types as LAN (data/state/input/...).
 */

const net = require("node:net");
const crypto = require("node:crypto");

const DEFAULT_LIMITS = {
  maxLineBytes: 64 * 1024,
  maxPeersPerRoom: 12,
  maxRooms: 64,
  idleRoomTtlMs: 60 * 60 * 1000,
};

/**
 * @param {{ port?: number, host?: string, limits?: Partial<typeof DEFAULT_LIMITS> }} [options]
 */
function createFollowRelayServer(options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  /** @type {Map<string, { token: string, hostSocket: import("net").Socket|null, viewers: Map<string, import("net").Socket>, createdAt: number }>} */
  const rooms = new Map();
  let server = null;
  let listenPort = 0;

  const sendJson = (socket, obj) => {
    if (!socket || socket.destroyed) return;
    try {
      socket.write(`${JSON.stringify(obj)}\n`);
    } catch {
      // ignore
    }
  };

  const getOrCreateRoom = (roomId, token) => {
    let room = rooms.get(roomId);
    if (!room) {
      if (rooms.size >= limits.maxRooms) return null;
      room = {
        token,
        hostSocket: null,
        viewers: new Map(),
        createdAt: Date.now(),
      };
      rooms.set(roomId, room);
    }
    return room;
  };

  const detachSocket = (socket) => {
    const meta = socket.__magiesRelay;
    if (!meta) return;
    const room = rooms.get(meta.roomId);
    if (!room) return;
    if (meta.role === "host" && room.hostSocket === socket) {
      room.hostSocket = null;
      for (const viewer of room.viewers.values()) {
        sendJson(viewer, { type: "closed", reason: "host_left" });
        try { viewer.destroy(); } catch { /* ignore */ }
      }
      room.viewers.clear();
      rooms.delete(meta.roomId);
      return;
    }
    if (meta.role === "viewer") {
      room.viewers.delete(meta.peerId);
      if (room.hostSocket) {
        sendJson(room.hostSocket, {
          type: "viewerLeft",
          peerId: meta.peerId,
        });
      }
    }
  };

  const attach = (socket) => {
    let buffer = "";
    let joined = false;

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > limits.maxLineBytes && buffer.indexOf("\n") < 0) {
        sendJson(socket, { type: "error", error: "frame_too_large" });
        socket.destroy();
        return;
      }
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          sendJson(socket, { type: "error", error: "bad_json" });
          continue;
        }

        if (!joined) {
          if (msg.type !== "relayJoin") {
            sendJson(socket, { type: "error", error: "expected_relayJoin" });
            socket.destroy();
            return;
          }
          const roomId = String(msg.roomId || "").trim();
          const token = String(msg.token || "");
          const role = msg.role === "host" ? "host" : msg.role === "viewer" ? "viewer" : null;
          if (!roomId || token.length < 8 || !role) {
            sendJson(socket, { type: "error", error: "invalid_join" });
            socket.destroy();
            return;
          }
          const room = getOrCreateRoom(roomId, token);
          if (!room) {
            sendJson(socket, { type: "error", error: "too_many_rooms" });
            socket.destroy();
            return;
          }
          if (room.token !== token) {
            sendJson(socket, { type: "error", error: "unauthorized" });
            socket.destroy();
            return;
          }

          if (role === "host") {
            if (room.hostSocket && !room.hostSocket.destroyed) {
              sendJson(socket, { type: "error", error: "host_exists" });
              socket.destroy();
              return;
            }
            room.hostSocket = socket;
            socket.__magiesRelay = { role: "host", roomId, peerId: "host" };
            joined = true;
            sendJson(socket, { type: "relayWelcome", role: "host", roomId });
            continue;
          }

          // viewer
          if (room.viewers.size + (room.hostSocket ? 1 : 0) >= limits.maxPeersPerRoom) {
            sendJson(socket, { type: "error", error: "too_many_peers" });
            socket.destroy();
            return;
          }
          const peerId = `wan-${crypto.randomBytes(6).toString("hex")}`;
          room.viewers.set(peerId, socket);
          socket.__magiesRelay = { role: "viewer", roomId, peerId };
          joined = true;
          sendJson(socket, {
            type: "relayWelcome",
            role: "viewer",
            roomId,
            peerId,
          });
          if (room.hostSocket) {
            sendJson(room.hostSocket, {
              type: "viewerJoined",
              peerId,
              displayName: typeof msg.displayName === "string" ? msg.displayName : "WAN viewer",
            });
          }
          continue;
        }

        const meta = socket.__magiesRelay;
        const room = rooms.get(meta.roomId);
        if (!room) {
          sendJson(socket, { type: "error", error: "no_room" });
          continue;
        }

        if (meta.role === "host") {
          // Fan-out to all viewers (data/state/welcome/inputDenied/error/closed)
          const out = `${JSON.stringify(msg)}\n`;
          for (const viewer of room.viewers.values()) {
            if (!viewer || viewer.destroyed) continue;
            try { viewer.write(out); } catch { /* ignore */ }
          }
          continue;
        }

        // viewer → host only
        if (room.hostSocket && !room.hostSocket.destroyed) {
          sendJson(room.hostSocket, {
            ...msg,
            peerId: meta.peerId,
          });
        } else {
          sendJson(socket, { type: "error", error: "host_offline" });
        }
      }
    });

    socket.on("close", () => detachSocket(socket));
    socket.on("error", () => detachSocket(socket));
  };

  const start = () =>
    new Promise((resolve, reject) => {
      if (server) {
        resolve({ port: listenPort, host: options.host || "0.0.0.0" });
        return;
      }
      server = net.createServer(attach);
      server.once("error", reject);
      server.listen(options.port || 0, options.host || "0.0.0.0", () => {
        const addr = server.address();
        listenPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve({ port: listenPort, host: options.host || "0.0.0.0" });
      });
    });

  const stop = () =>
    new Promise((resolve) => {
      for (const room of rooms.values()) {
        try { room.hostSocket?.destroy(); } catch { /* ignore */ }
        for (const v of room.viewers.values()) {
          try { v.destroy(); } catch { /* ignore */ }
        }
      }
      rooms.clear();
      if (!server) {
        resolve();
        return;
      }
      const s = server;
      server = null;
      s.close(() => resolve());
    });

  return {
    start,
    stop,
    getPort: () => listenPort,
    roomCount: () => rooms.size,
  };
}

module.exports = {
  createFollowRelayServer,
};
