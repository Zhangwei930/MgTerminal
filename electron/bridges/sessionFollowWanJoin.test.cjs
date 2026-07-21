"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const terminalBridge = require("./terminalBridge.cjs");
const follow = require("./sessionFollowManager.cjs");
const wan = require("./sessionFollowWan.cjs");

const VIEWER_WC_ID = 9;

function setupJoinHandlers() {
  const sent = [];
  const written = [];
  const webContents = {
    id: VIEWER_WC_ID,
    send(channel, payload) {
      sent.push([channel, payload]);
    },
    isDestroyed: () => false,
  };
  terminalBridge.init({
    sessions: new Map(),
    electronModule: { webContents: { fromId: () => webContents } },
  });
  const handlers = new Map();
  terminalBridge.registerHandlers(
    { handle: (channel, handler) => handlers.set(channel, handler), on: () => {} },
    {},
  );
  // registerHandlers wires the real terminal writer; capture instead.
  wan.configure({
    writeToSession: (_target, data) => { written.push(String(data)); },
    addDataTap: () => () => {},
  });
  return { handlers, sent, written };
}

async function waitFor(predicate, message, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for: ${message}`);
}

test("a WAN (v2) invite joins through the same handler the join window calls", async (t) => {
  follow.__resetForTests();
  await wan._resetForTests();
  const { handlers, sent, written } = setupJoinHandlers();

  const created = await wan.createWanInvite({
    sessionId: "sess-wan-join",
    hostLabel: "WAN demo",
    webContentsId: VIEWER_WC_ID,
    useLocalRelay: true,
  });
  assert.equal(created.success, true, created.error);
  const shareString = created.invite.shareString;
  assert.match(shareString, /^magies-follow:2:/);

  t.after(async () => {
    follow.__resetForTests();
    await wan._resetForTests();
  });

  // This is the exact call LanFollowJoinPage makes with whatever the user pasted.
  const joined = await handlers.get("magiesTerminal:follow:lanConnect")(
    { sender: { id: VIEWER_WC_ID } },
    { shareString },
  );
  assert.equal(joined.success, true, joined.error);
  assert.ok(joined.clientId, "the viewer window needs a handle to send input with");
  assert.equal(joined.sessionId, "sess-wan-join");

  // Host-side frames must reach the renderer on the same channel LAN uses,
  // otherwise the join window renders an empty terminal forever.
  await waitFor(
    () => sent.some(([channel, payload]) => (
      channel === "magiesTerminal:follow:lanClientEvent"
      && payload?.clientId === joined.clientId
      && payload?.message?.type
    )),
    "a follow client event addressed to the joined client",
  );

  await waitFor(
    () => follow.getState("sess-wan-join")?.peers?.some((peer) => peer.peerId === joined.peerId),
    "the host to register the WAN viewer",
  );
  assert.equal(follow.grantControl("sess-wan-join", VIEWER_WC_ID, joined.peerId).success, true);

  const input = await handlers.get("magiesTerminal:follow:lanViewerInput")(
    { sender: { id: VIEWER_WC_ID } },
    { clientId: joined.clientId, data: "hello-wan" },
  );
  assert.equal(input.success, true, input.error);
  await waitFor(() => written.join("").includes("hello-wan"), "viewer input to reach the host");

  const left = await handlers.get("magiesTerminal:follow:lanViewerDisconnect")(
    { sender: { id: VIEWER_WC_ID } },
    { clientId: joined.clientId },
  );
  assert.equal(left.success, true);
});

test("an unknown invite version is still rejected", async (t) => {
  follow.__resetForTests();
  await wan._resetForTests();
  const { handlers } = setupJoinHandlers();
  t.after(async () => {
    follow.__resetForTests();
    await wan._resetForTests();
  });

  const share = `magies-follow:9:${Buffer.from("{}", "utf8").toString("base64url")}`;
  const result = await handlers.get("magiesTerminal:follow:lanConnect")(
    { sender: { id: VIEWER_WC_ID } },
    { shareString: share },
  );
  assert.equal(result.success, false);
  assert.equal(result.error, "version");
});
