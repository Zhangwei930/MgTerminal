import test from "node:test";
import assert from "node:assert/strict";

import { vaultViewAreEqual } from "./VaultView.tsx";

test("VaultView re-renders when an external section navigation request changes", () => {
  const baseProps = {
    hosts: [],
    keys: [],
    identities: [],
    proxyProfiles: [],
    snippets: [],
    snippetPackages: [],
    notes: [],
    noteGroups: [],
    customGroups: [],
    knownHosts: [],
    shellHistory: [],
    connectionLogs: [],
    sessions: [],
    managedSources: [],
    groupConfigs: {},
    terminalThemeId: "default",
    terminalFontSize: 14,
    navigateToSection: null,
  };

  assert.equal(
    vaultViewAreEqual(
      baseProps as never,
      { ...baseProps, navigateToSection: "snippets" } as never,
    ),
    false,
  );
});

test("VaultView re-renders when proxy profiles change", () => {
  const baseProps = {
    hosts: [],
    keys: [],
    identities: [],
    proxyProfiles: [],
    snippets: [],
    snippetPackages: [],
    notes: [],
    noteGroups: [],
    customGroups: [],
    knownHosts: [],
    shellHistory: [],
    connectionLogs: [],
    sessions: [],
    managedSources: [],
    groupConfigs: {},
    terminalThemeId: "default",
    terminalFontSize: 14,
    navigateToSection: null,
  };

  assert.equal(
    vaultViewAreEqual(
      baseProps as never,
      {
        ...baseProps,
        proxyProfiles: [
          {
            id: "proxy-1",
            label: "Proxy",
            config: { type: "http", host: "proxy.example.com", port: 3128 },
            createdAt: 1,
          },
        ],
      } as never,
    ),
    false,
  );
});

test("VaultView re-renders when host-key verification setting changes", () => {
  const baseProps = {
    hosts: [],
    keys: [],
    identities: [],
    proxyProfiles: [],
    snippets: [],
    snippetPackages: [],
    notes: [],
    noteGroups: [],
    customGroups: [],
    knownHosts: [],
    shellHistory: [],
    connectionLogs: [],
    sessions: [],
    managedSources: [],
    groupConfigs: {},
    terminalThemeId: "default",
    terminalFontSize: 14,
    navigateToSection: null,
    terminalSettings: {
      verifyHostKeys: true,
      keepaliveInterval: 30,
      keepaliveCountMax: 10,
    },
  };

  assert.equal(
    vaultViewAreEqual(
      baseProps as never,
      {
        ...baseProps,
        terminalSettings: {
          ...baseProps.terminalSettings,
          verifyHostKeys: false,
        },
      } as never,
    ),
    false,
  );
});

// vaultViewAreEqual lists every prop that must trigger a re-render. A prop
// missing from that list makes VaultView keep rendering stale data while the
// state behind it moves on — saving, deleting and loading all appear to do
// nothing, because only the view is frozen. dbConnections was missing.
test("VaultView re-renders when the database connection list changes", () => {
  const baseProps = {
    hosts: [], keys: [], identities: [], proxyProfiles: [], snippets: [],
    snippetPackages: [], notes: [], noteGroups: [], customGroups: [],
    knownHosts: [], shellHistory: [], connectionLogs: [], sessions: [],
    managedSources: [], groupConfigs: {}, terminalThemeId: "default",
    terminalFontSize: 14, navigateToSection: null, dbConnections: [],
  };

  const added = [{ id: "c1", label: "db", engine: "postgres" }];

  assert.equal(
    vaultViewAreEqual(baseProps as never, { ...baseProps, dbConnections: added } as never),
    false,
    "adding a connection must re-render",
  );
  assert.equal(
    vaultViewAreEqual(
      { ...baseProps, dbConnections: added } as never,
      { ...baseProps, dbConnections: [] } as never,
    ),
    false,
    "deleting the last connection must re-render",
  );
  assert.equal(
    vaultViewAreEqual(baseProps as never, { ...baseProps } as never),
    true,
    "an unchanged list must still skip the re-render",
  );
});
