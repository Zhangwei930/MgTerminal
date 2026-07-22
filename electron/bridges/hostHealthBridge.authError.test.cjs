const test = require("node:test");
const assert = require("node:assert/strict");

const { describeFailedProbe } = require("./hostHealth/healthCore.cjs");

// Previously this asserted on strings inside hostHealthBridge.cjs. The
// classification moved into healthCore, so it now checks the behaviour
// instead — the reasons must survive, wherever they live.
test("health probe surfaces interactive / missing-credential errors clearly", () => {
  assert.match(
    describeFailedProbe({ needsInteractive: true }).error,
    /Server requires interactive authentication \(e\.g\. MFA\)/,
  );
  assert.match(
    describeFailedProbe({ encryptedKeySkipped: true, methodsTried: [] }).error,
    /Configured private key is encrypted and no passphrase is saved/,
  );
  assert.match(
    describeFailedProbe({ methodsTried: [] }).error,
    /No usable authentication credentials available/,
  );
});

test("an untrusted host key is not reported as an authentication failure", () => {
  const result = describeFailedProbe({
    hostKeyRejected: true,
    hostKeyStatus: "changed",
    methodsTried: [],
    error: "All configured authentication methods failed",
  });
  assert.equal(result.status, "host-key-untrusted");
  assert.doesNotMatch(result.error, /authentication methods failed/);
});
