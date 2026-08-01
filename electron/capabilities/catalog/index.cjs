"use strict";

const { META_CAPABILITIES } = require("./meta.cjs");
const { TERMINAL_CAPABILITIES } = require("./terminal.cjs");
const { SFTP_CAPABILITIES } = require("./sftp.cjs");
const { VAULT_CAPABILITIES } = require("./vault.cjs");
const { PORT_FORWARD_CAPABILITIES } = require("./portforward.cjs");
const { HARNESS_CAPABILITIES } = require("./harness.cjs");
const { KUBERNETES_CAPABILITIES } = require("./kubernetes.cjs");
const { DB_CAPABILITIES } = require("./db.cjs");

const ALL_CAPABILITIES = Object.freeze([
  ...META_CAPABILITIES,
  ...TERMINAL_CAPABILITIES,
  ...SFTP_CAPABILITIES,
  ...VAULT_CAPABILITIES,
  ...PORT_FORWARD_CAPABILITIES,
  ...HARNESS_CAPABILITIES,
  ...KUBERNETES_CAPABILITIES,
  ...DB_CAPABILITIES,
]);

module.exports = {
  META_CAPABILITIES,
  TERMINAL_CAPABILITIES,
  SFTP_CAPABILITIES,
  VAULT_CAPABILITIES,
  PORT_FORWARD_CAPABILITIES,
  HARNESS_CAPABILITIES,
  KUBERNETES_CAPABILITIES,
  DB_CAPABILITIES,
  ALL_CAPABILITIES,
};
