const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  registerHandlers,
  ENC_PREFIX_V1,
  ENC_PREFIX_V2,
} = require('./credentialBridge.cjs');

function registerCredentialHandlers(safeStorage, options = {}) {
  const handlers = new Map();
  registerHandlers({
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  }, { safeStorage }, options);
  return handlers;
}

function tempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'magies-cred-'));
}

test('credential encryption fails closed when no backend is available', () => {
  const handlers = registerCredentialHandlers(
    { isEncryptionAvailable: () => false, encryptString: () => { throw new Error('no'); } },
    { platform: 'linux', userDataPath: undefined },
  );

  assert.throws(
    () => handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret'),
    (error) => error?.code === 'ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE',
  );
});

test('falls back to local vault when safeStorage is unavailable', () => {
  const dir = tempUserData();
  const handlers = registerCredentialHandlers(
    {
      isEncryptionAvailable: () => false,
      encryptString: () => { throw new Error('keychain down'); },
    },
    { platform: 'darwin', userDataPath: dir },
  );

  const encrypted = handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret');
  assert.match(encrypted, new RegExp(`^${ENC_PREFIX_V2}`));
  assert.equal(
    handlers.get('magiesTerminal:credentials:decrypt')(null, encrypted),
    'secret',
  );
  assert.equal(handlers.get('magiesTerminal:credentials:available')(), true);
  const status = handlers.get('magiesTerminal:credentials:status')();
  assert.equal(status.safeStorage, false);
  assert.equal(status.localVault, true);
});

test('credential encryption never returns plaintext after both backends fail', () => {
  const handlers = registerCredentialHandlers({
    isEncryptionAvailable: () => true,
    encryptString: () => {
      throw new Error('keychain failure');
    },
  }, { platform: 'linux', userDataPath: undefined });

  assert.throws(
    () => handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret'),
    (error) =>
      error?.code === 'ERR_CREDENTIAL_ENCRYPTION_FAILED'
      || error?.code === 'ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE',
  );
});

test('encrypted v1 credentials fail closed when safeStorage cannot decrypt them', () => {
  const handlers = registerCredentialHandlers(
    { isEncryptionAvailable: () => false },
    { platform: 'linux', userDataPath: undefined },
  );

  assert.throws(
    () => handlers.get('magiesTerminal:credentials:decrypt')(null, 'enc:v1:c2VjcmV0'),
    (error) => error?.code === 'ERR_CREDENTIAL_DECRYPTION_UNAVAILABLE',
  );
});

test('plaintext credential migration remains readable', () => {
  const handlers = registerCredentialHandlers(null, { userDataPath: undefined });

  assert.equal(
    handlers.get('magiesTerminal:credentials:decrypt')(null, 'legacy-secret'),
    'legacy-secret',
  );
});

test('credential bridge encrypts and decrypts values with safeStorage', () => {
  const handlers = registerCredentialHandlers({
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`cipher:${value}`),
    decryptString: (value) => value.toString().replace(/^cipher:/, ''),
  }, { userDataPath: tempUserData() });

  const encrypted = handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret');
  assert.match(encrypted, new RegExp(`^${ENC_PREFIX_V1}`));
  assert.equal(
    handlers.get('magiesTerminal:credentials:decrypt')(null, encrypted),
    'secret',
  );
  assert.equal(
    handlers.get('magiesTerminal:credentials:encrypt')(null, encrypted),
    encrypted,
  );
  assert.equal(handlers.get('magiesTerminal:credentials:available')(), true);
});

test('encrypt never double-wraps enc:v1 ciphertext it cannot verify', () => {
  // Broken keychain: enc:v1 blobs cannot be verified by decrypting. They must
  // still be recognized as ciphertext, not re-encrypted into enc:v2(enc:v1).
  const dir = tempUserData();
  const handlers = registerCredentialHandlers(
    { isEncryptionAvailable: () => false },
    { platform: 'linux', userDataPath: dir },
  );

  const v1Blob = `${ENC_PREFIX_V1}${Buffer.from('v10-old-keychain-cipher').toString('base64')}`;
  assert.equal(
    handlers.get('magiesTerminal:credentials:encrypt')(null, v1Blob),
    v1Blob,
  );
});

test('decrypt unwraps nested enc:v2(enc:v1) ciphertext', () => {
  const dir = tempUserData();
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`cipher:${value}`),
    decryptString: (value) => value.toString().replace(/^cipher:/, ''),
  };
  const handlers = registerCredentialHandlers(safeStorage, { userDataPath: dir });

  const { createLocalVault } = require('./credentialBridge.cjs');
  const vault = createLocalVault({ userDataPath: dir });
  const inner = `${ENC_PREFIX_V1}${Buffer.from('cipher:sk-real-key').toString('base64')}`;
  const nested = vault.encrypt(inner);

  assert.equal(
    handlers.get('magiesTerminal:credentials:decrypt')(null, nested),
    'sk-real-key',
  );
});

test('decrypt fully unwraps nesting up to the budget without off-by-one drop', () => {
  const dir = tempUserData();
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`cipher:${value}`),
    decryptString: (value) => value.toString().replace(/^cipher:/, ''),
  };
  const handlers = registerCredentialHandlers(safeStorage, { userDataPath: dir });

  const { createLocalVault } = require('./credentialBridge.cjs');
  const vault = createLocalVault({ userDataPath: dir });
  // enc:v2(enc:v2(enc:v2(enc:v1(secret)))) — 4 layers = MAX_NESTED_DECRYPTS.
  let nested = `${ENC_PREFIX_V1}${Buffer.from('cipher:deep-secret').toString('base64')}`;
  for (let i = 0; i < 3; i++) nested = vault.encrypt(nested);

  assert.equal(
    handlers.get('magiesTerminal:credentials:decrypt')(null, nested),
    'deep-secret',
  );
});

test('encrypt recognizes a Windows DPAPI enc:v1 blob and does not re-wrap it', () => {
  // A DPAPI blob base64-encodes to "AQAAAN…" (bytes 01 00 00 00 D0 8C …).
  const dpapiBytes = Buffer.from([0x01, 0x00, 0x00, 0x00, 0xd0, 0x8c, 0x9d, 0xdf, 0x01, 0x02, 0x03, 0x04]);
  const payload = dpapiBytes.toString('base64');
  assert.match(payload, /^AQAAAN/, 'sanity: DPAPI header must base64 to AQAAAN');
  const v1Blob = `${ENC_PREFIX_V1}${payload}`;

  const handlers = registerCredentialHandlers(
    { isEncryptionAvailable: () => false },
    { platform: 'win32', userDataPath: tempUserData() },
  );
  assert.equal(
    handlers.get('magiesTerminal:credentials:encrypt')(null, v1Blob),
    v1Blob,
  );
});

test('credential decryption reports corrupt ciphertext without returning it', () => {
  const handlers = registerCredentialHandlers({
    isEncryptionAvailable: () => true,
    decryptString: () => {
      throw new Error('corrupt ciphertext');
    },
  });

  assert.throws(
    () => handlers.get('magiesTerminal:credentials:decrypt')(null, 'enc:v1:Y29ycnVwdA=='),
    (error) => error?.code === 'ERR_CREDENTIAL_DECRYPTION_FAILED',
  );
});

test('macOS encrypt auto-repairs stale keychain then uses safeStorage', () => {
  let available = false;
  let repairCalls = 0;
  const handlers = registerCredentialHandlers(
    {
      isEncryptionAvailable: () => available,
      encryptString: (value) => {
        if (!available) throw new Error('Keychain ACL denied');
        return Buffer.from(`cipher:${value}`);
      },
    },
    {
      platform: 'darwin',
      userDataPath: tempUserData(),
      resetMacSafeStorageKeychain: () => {
        repairCalls += 1;
        available = true;
        return { attempted: true, deleted: ['Magies Terminal Safe Storage'] };
      },
    },
  );

  const encrypted = handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret');
  assert.match(encrypted, new RegExp(`^${ENC_PREFIX_V1}`));
  assert.equal(repairCalls, 1);
});

test('macOS encrypt falls back to local vault when repair cannot restore safeStorage', () => {
  const dir = tempUserData();
  const handlers = registerCredentialHandlers(
    {
      isEncryptionAvailable: () => false,
      encryptString: () => {
        throw new Error('still denied');
      },
    },
    {
      platform: 'darwin',
      userDataPath: dir,
      resetMacSafeStorageKeychain: () => ({ attempted: true, deleted: [] }),
    },
  );

  const encrypted = handlers.get('magiesTerminal:credentials:encrypt')(null, 'api-key-xyz');
  assert.match(encrypted, new RegExp(`^${ENC_PREFIX_V2}`));
  assert.equal(
    handlers.get('magiesTerminal:credentials:decrypt')(null, encrypted),
    'api-key-xyz',
  );
});

test('macOS credentials:repair resets keychain and reports dual backends', () => {
  let available = false;
  const handlers = registerCredentialHandlers(
    {
      isEncryptionAvailable: () => available,
      encryptString: () => {
        available = true;
        return Buffer.from('probe');
      },
    },
    {
      platform: 'darwin',
      userDataPath: tempUserData(),
      resetMacSafeStorageKeychain: () => ({
        attempted: true,
        deleted: ['Magies Terminal Safe Storage', 'Electron Safe Storage'],
      }),
    },
  );

  const result = handlers.get('magiesTerminal:credentials:repair')();
  assert.equal(result.attempted, true);
  assert.deepEqual(result.deleted, ['Magies Terminal Safe Storage', 'Electron Safe Storage']);
  assert.equal(result.available, true);
  assert.equal(result.localVault, true);
});

test('non-macOS repair does not claim a keychain reset', () => {
  const handlers = registerCredentialHandlers(
    { isEncryptionAvailable: () => true },
    { platform: 'win32', userDataPath: tempUserData() },
  );
  const result = handlers.get('magiesTerminal:credentials:repair')();
  assert.equal(result.attempted, false);
  assert.deepEqual(result.deleted, []);
  assert.equal(result.available, true);
});

test('local vault round-trip is stable across re-registration (survives app restart)', () => {
  const dir = tempUserData();
  const options = {
    platform: 'darwin',
    userDataPath: dir,
    resetMacSafeStorageKeychain: () => ({ attempted: true, deleted: [] }),
  };
  const deadSafeStorage = {
    isEncryptionAvailable: () => false,
    encryptString: () => { throw new Error('no'); },
  };

  const first = registerCredentialHandlers(deadSafeStorage, options);
  const encrypted = first.get('magiesTerminal:credentials:encrypt')(null, 'persist-me');

  const second = registerCredentialHandlers(deadSafeStorage, options);
  assert.equal(
    second.get('magiesTerminal:credentials:decrypt')(null, encrypted),
    'persist-me',
  );
});

test('decrypt is refused while the vault unlock gate is locked', () => {
  const dir = tempUserData();
  let locked = true;
  const gate = {
    assertUnlocked() {
      if (locked) {
        const err = new Error('locked');
        err.code = 'ERR_VAULT_LOCKED';
        throw err;
      }
    },
  };
  const handlers = registerCredentialHandlers(
    { isEncryptionAvailable: () => false, encryptString: () => { throw new Error('down'); } },
    { platform: 'darwin', userDataPath: dir, vaultUnlockGate: gate },
  );

  const encrypted = handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret');
  assert.throws(
    () => handlers.get('magiesTerminal:credentials:decrypt')(null, encrypted),
    (error) => error?.code === 'ERR_VAULT_LOCKED',
  );

  locked = false;
  assert.equal(handlers.get('magiesTerminal:credentials:decrypt')(null, encrypted), 'secret');
});
