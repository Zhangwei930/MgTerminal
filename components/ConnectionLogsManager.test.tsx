import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "../application/i18n/I18nProvider.tsx";
import type { ConnectionLog } from "../types.ts";
import ConnectionLogsManager from "./ConnectionLogsManager.tsx";
import { TooltipProvider } from "./ui/tooltip.tsx";

const baseLog: ConnectionLog = {
  id: "log-1",
  hostId: "host-1",
  hostLabel: "Database",
  hostname: "db.example.com",
  username: "root",
  protocol: "ssh",
  hostOs: "linux",
  hostDistro: "ubuntu",
  startTime: 1_700_000_000_000,
  localUsername: "alice",
  localHostname: "workstation",
  saved: false,
};

const renderLogs = (log: ConnectionLog) =>
  renderToStaticMarkup(
    <I18nProvider locale="en">
      <TooltipProvider>
        <ConnectionLogsManager
          logs={[log]}
          hosts={[]}
          onToggleSaved={() => {}}
          onDelete={() => {}}
          onClearUnsaved={() => {}}
          onOpenLogView={() => {}}
        />
      </TooltipProvider>
    </I18nProvider>,
  );

test("ConnectionLogsManager renders saved custom host icon snapshots", () => {
  const markup = renderLogs({
    ...baseLog,
    hostIconMode: "custom",
    hostIconId: "database",
    hostIconColor: "blue",
  });

  assert.match(markup, /background-color:#2563EB/i);
  assert.doesNotMatch(markup, /bg-\[#E95420\]/);
});

test("ConnectionLogsManager renders saved distro icon snapshots with custom colors", () => {
  const markup = renderLogs({
    ...baseLog,
    hostIconMode: "auto",
    hostIconColor: "violet",
  });

  assert.match(markup, /background-color:#7C3AED/i);
  assert.match(markup, /src="\/distro\/ubuntu.svg"/);
  assert.doesNotMatch(markup, /bg-\[#E95420\]/);
});

test("formatLogAuthMethod maps bridge auth ids to readable labels", async () => {
  const { formatLogAuthMethod } = await import("./ConnectionLogsManager.tsx");
  assert.equal(formatLogAuthMethod("agent"), "agent");
  assert.equal(formatLogAuthMethod("password"), "password");
  assert.equal(formatLogAuthMethod("publickey-user"), "key");
  assert.equal(formatLogAuthMethod("publickey-default-id_ed25519"), "key (id_ed25519)");
  assert.equal(formatLogAuthMethod("publickey-encrypted-id_rsa"), "key (id_rsa)");
});

test("renders the recorded auth method on ssh log rows", () => {
  const markup = renderLogs({ ...baseLog, authMethod: "agent" });
  assert.ok(markup.includes("ssh, root"));
  assert.ok(markup.includes("agent"));
});
