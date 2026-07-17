/**
 * Tracks live TCP channels on port-forward tunnels (source, destination, bytes).
 * Pure registry + attach helpers used by portForwardingBridge.
 */

const { randomUUID } = require("node:crypto");

/** @typedef {{
 *   id: string,
 *   tunnelId: string,
 *   ruleId?: string,
 *   type: string,
 *   source: string,
 *   destination: string,
 *   bytesIn: number,
 *   bytesOut: number,
 *   openedAt: number,
 * }} PortForwardChannel */

function formatSocketAddress(socket) {
  if (!socket) return "unknown";
  const host = socket.remoteAddress || socket.localAddress || "?";
  const port = socket.remotePort || socket.localPort;
  if (port == null) return String(host);
  // Normalize IPv6-mapped IPv4
  const normalized = typeof host === "string" && host.startsWith("::ffff:")
    ? host.slice(7)
    : host;
  return `${normalized}:${port}`;
}

/**
 * @param {object} opts
 * @param {(channels: PortForwardChannel[]) => void} [opts.onChange]
 */
function createPortForwardChannelTracker(opts = {}) {
  /** @type {Map<string, PortForwardChannel>} */
  const channels = new Map();
  let dirty = false;
  let flushTimer = null;
  const flushMs = typeof opts.flushMs === "number" ? opts.flushMs : 400;

  const snapshot = () => Array.from(channels.values()).map((channel) => ({ ...channel }));

  const emit = (force = false) => {
    if (!force && !dirty) return;
    dirty = false;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    opts.onChange?.(snapshot());
  };

  const scheduleEmit = () => {
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(() => emit(true), flushMs);
  };

  const openChannel = ({
    tunnelId,
    ruleId,
    type,
    source,
    destination,
  }) => {
    const id = randomUUID();
    /** @type {PortForwardChannel} */
    const channel = {
      id,
      tunnelId,
      ruleId,
      type,
      source: source || "unknown",
      destination: destination || "unknown",
      bytesIn: 0,
      bytesOut: 0,
      openedAt: Date.now(),
    };
    channels.set(id, channel);
    emit(true);
    return channel;
  };

  const closeChannel = (channelId) => {
    if (!channels.delete(channelId)) return;
    emit(true);
  };

  const clearTunnel = (tunnelId) => {
    let removed = false;
    for (const [id, channel] of channels) {
      if (channel.tunnelId === tunnelId) {
        channels.delete(id);
        removed = true;
      }
    }
    if (removed) emit(true);
  };

  const clearAll = () => {
    if (channels.size === 0) return;
    channels.clear();
    emit(true);
  };

  /**
   * Attach byte counters and lifecycle to a local socket + SSH/remote stream pair.
   * bytesIn  = data from the local/source socket
   * bytesOut = data from the remote/destination stream
   */
  const attach = ({
    tunnelId,
    ruleId,
    type,
    source,
    destination,
    socket,
    stream,
  }) => {
    const channel = openChannel({ tunnelId, ruleId, type, source, destination });
    let closed = false;

    const onSocketData = (chunk) => {
      if (!chunk) return;
      channel.bytesIn += chunk.length;
      scheduleEmit();
    };
    const onStreamData = (chunk) => {
      if (!chunk) return;
      channel.bytesOut += chunk.length;
      scheduleEmit();
    };
    const finish = () => {
      if (closed) return;
      closed = true;
      try { socket.removeListener("data", onSocketData); } catch { /* ignore */ }
      try { stream.removeListener("data", onStreamData); } catch { /* ignore */ }
      closeChannel(channel.id);
    };

    socket.on("data", onSocketData);
    stream.on("data", onStreamData);
    socket.once("close", finish);
    socket.once("end", finish);
    stream.once("close", finish);
    stream.once("end", finish);

    return channel;
  };

  return {
    openChannel,
    closeChannel,
    clearTunnel,
    clearAll,
    attach,
    list: snapshot,
    formatSocketAddress,
    /** test helper */
    _channels: channels,
  };
}

module.exports = {
  createPortForwardChannelTracker,
  formatSocketAddress,
};
