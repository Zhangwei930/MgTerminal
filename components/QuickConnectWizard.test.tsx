import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import QuickConnectWizard from "./QuickConnectWizard.tsx";

const renderWizard = () =>
  renderToStaticMarkup(
    React.createElement(QuickConnectWizard, {
      open: true,
      target: { hostname: "example.com" },
      keys: [],
      onConnect: () => {},
      onClose: () => {},
    }),
  );

test("QuickConnectWizard: protocol step offers EternalTerminal option", () => {
  const markup = renderWizard();
  assert.ok(markup.includes("EternalTerminal"), "ET option button missing");
  assert.ok(markup.includes("et example.com"), "ET command hint missing");
});

test("QuickConnectWizard: ET option defaults etserver port to 2022", () => {
  const markup = renderWizard();
  assert.ok(markup.includes("2022"), "default ET port 2022 missing");
});
