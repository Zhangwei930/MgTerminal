import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_KEY_BINDINGS } from "../../../domain/models/keyBindings.ts";
import { HOST_ICON_COLORS, HOST_ICON_IDS } from "../../../domain/hostIcon.ts";
import zhCN from "./zh-CN.ts";
import ru from "./ru.ts";

const LOCALIZED_SETTINGS_LOCALES = [
  { name: "zh-CN", messages: zhCN },
  { name: "ru", messages: ru },
];

test("localized settings include names for every default shortcut", () => {
  for (const locale of LOCALIZED_SETTINGS_LOCALES) {
    const missing = DEFAULT_KEY_BINDINGS
      .map((binding) => `settings.shortcuts.binding.${binding.id}`)
      .filter((key) => !locale.messages[key]);

    assert.deepEqual(missing, [], `${locale.name} is missing shortcut labels`);
  }
});

test("localized settings include workspace focus indicator labels", () => {
  const keys = [
    "settings.terminal.section.workspaceFocus",
    "settings.terminal.workspaceFocus.style",
    "settings.terminal.workspaceFocus.style.desc",
    "settings.terminal.workspaceFocus.dim",
    "settings.terminal.workspaceFocus.border",
  ];

  for (const locale of LOCALIZED_SETTINGS_LOCALES) {
    const missing = keys.filter((key) => !locale.messages[key]);
    assert.deepEqual(missing, [], `${locale.name} is missing workspace focus labels`);
  }
});

test("localized settings include network proxy labels", () => {
  const keys = [
    "settings.system.networkProxy.title",
    "settings.system.networkProxy.description",
    "settings.system.networkProxy.mode",
    "settings.system.networkProxy.mode.system",
    "settings.system.networkProxy.mode.direct",
    "settings.system.networkProxy.mode.custom",
    "settings.system.networkProxy.url",
    "settings.system.networkProxy.url.placeholder",
    "settings.system.networkProxy.url.desc",
    "settings.system.networkProxy.bypass",
    "settings.system.networkProxy.bypass.placeholder",
    "settings.system.networkProxy.bypass.desc",
    "settings.system.networkProxy.hint",
  ];

  for (const locale of LOCALIZED_SETTINGS_LOCALES) {
    const missing = keys.filter((key) => !locale.messages[key]);
    assert.deepEqual(missing, [], `${locale.name} is missing network proxy labels`);
  }
});

test("localized settings include terminal font weight option labels", () => {
  const keys = [
    "settings.terminal.font.weight.thin",
    "settings.terminal.font.weight.extraLight",
    "settings.terminal.font.weight.light",
    "settings.terminal.font.weight.normal",
    "settings.terminal.font.weight.medium",
    "settings.terminal.font.weight.semiBold",
    "settings.terminal.font.weight.bold",
    "settings.terminal.font.weight.extraBold",
    "settings.terminal.font.weight.black",
  ];

  for (const locale of LOCALIZED_SETTINGS_LOCALES) {
    const missing = keys.filter((key) => !locale.messages[key]);
    assert.deepEqual(missing, [], `${locale.name} is missing font weight labels`);
  }
});

test("localized settings include UI theme picker labels", () => {
  const keys = [
    "settings.appearance.themeColor.picker.desc",
    "settings.appearance.themeColor.scope.core",
    "settings.appearance.themeColor.scope.all",
    "settings.appearance.themeColor.search.placeholder",
    "settings.appearance.themeColor.search.empty",
  ];

  for (const locale of LOCALIZED_SETTINGS_LOCALES) {
    const missing = keys.filter((key) => !locale.messages[key]);
    assert.deepEqual(missing, [], `${locale.name} is missing UI theme picker labels`);
  }
});

test("localized settings include terminal theme modal search labels", () => {
  const keys = [
    "settings.terminal.themeModal.search.placeholder",
    "settings.terminal.themeModal.search.empty",
    "settings.terminal.themeModal.missingTheme.title",
    "settings.terminal.themeModal.missingTheme.desc",
  ];

  for (const locale of LOCALIZED_SETTINGS_LOCALES) {
    const missing = keys.filter((key) => !locale.messages[key]);
    assert.deepEqual(missing, [], `${locale.name} is missing terminal theme modal search labels`);
  }
});

test("localized vault messages include host icon labels", () => {
  const keys = [
    "hostDetails.icon.title",
    "hostDetails.icon.desc",
    "hostDetails.icon.mode.auto",
    "hostDetails.icon.mode.custom",
    "hostDetails.icon.reset",
    "hostDetails.icon.showLibrary",
    "hostDetails.icon.hideLibrary",
    "hostDetails.icon.autoUsesDistro",
    "hostDetails.icon.customOverridesDistro",
    ...HOST_ICON_IDS.map((id) => `hostDetails.icon.option.${id}`),
    ...HOST_ICON_COLORS.map((color) => `hostDetails.icon.color.${color.id}`),
  ];

  for (const locale of LOCALIZED_SETTINGS_LOCALES) {
    const missing = keys.filter((key) => !locale.messages[key]);
    assert.deepEqual(missing, [], `${locale.name} is missing host icon labels`);
  }
});

test("localized settings include credential self-test labels", () => {
  const keys = [
    "settings.system.credentials.selftest",
    "settings.system.credentials.selftest.running",
    "settings.system.credentials.selftest.probe.unavailable",
    "settings.system.credentials.selftest.probe.failed",
    "settings.system.credentials.selftest.probe.mismatch",
    "settings.system.credentials.selftest.noIssues",
    "settings.system.credentials.selftest.noSecrets",
    "settings.system.credentials.selftest.issues",
  ];

  for (const locale of LOCALIZED_SETTINGS_LOCALES) {
    const missing = keys.filter((key) => !locale.messages[key]);
    assert.deepEqual(missing, [], `${locale.name} is missing credential self-test labels`);
  }
});
