/**
 * Preload ML-KEM-768 for the built-in ssh2 hybrid post-quantum KEX
 * (mlkem768x25519-sha256). The patched ssh2 reads the implementation from
 * globalThis.__MAGIES_MLKEM768__ so the crypto stays outside the vendored
 * library and can be swapped/disabled without re-patching.
 *
 * Safe to call more than once; a failed require leaves PQ unavailable and the
 * algorithm builder simply omits mlkem768x25519-sha256 from the offer list.
 */

"use strict";

let loaded = false;
let available = false;

function installMlkem768() {
  if (loaded) return available;
  loaded = true;

  try {
    // CJS subpath export of @noble/post-quantum
    const { ml_kem768 } = require("@noble/post-quantum/ml-kem.js");
    if (!ml_kem768 || typeof ml_kem768.keygen !== "function") {
      available = false;
      return available;
    }

    // Shape expected by the ssh2 patch (see patches/ssh2+*.patch kex.js):
    //   keygen() -> { publicKey: Uint8Array(1184), secretKey: Uint8Array }
    //   decapsulate(ct: Uint8Array(1088), sk) -> Uint8Array(32) shared secret
    globalThis.__MAGIES_MLKEM768__ = {
      keygen: () => ml_kem768.keygen(),
      decapsulate: (ciphertext, secretKey) =>
        ml_kem768.decapsulate(ciphertext, secretKey),
    };
    available = true;
  } catch (err) {
    available = false;
    if (process.env.MAGIES_DEBUG_SSH) {
      console.warn(
        "[ssh] ML-KEM-768 preload failed; built-in PQ KEX unavailable:",
        err?.message || err,
      );
    }
  }

  return available;
}

function isBuiltinPostQuantumKexAvailable() {
  if (!loaded) installMlkem768();
  return (
    available
    && typeof globalThis.__MAGIES_MLKEM768__?.keygen === "function"
    && typeof globalThis.__MAGIES_MLKEM768__?.decapsulate === "function"
  );
}

/** Hybrid PQ KEX name offered by the patched ssh2 client. */
const BUILTIN_PQ_KEX = "mlkem768x25519-sha256";

module.exports = {
  installMlkem768,
  isBuiltinPostQuantumKexAvailable,
  BUILTIN_PQ_KEX,
};
