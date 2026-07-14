const assert = require('node:assert/strict');
const test = require('node:test');

const { registerHandlers } = require('./credentialBridge.cjs');

function registerCredentialHandlers(safeStorage, options = {}) {
  const handlers = new Map();
  registerHandlers({
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  }, { safeStorage }, options);
  return handlers;
}

test('credential encryption fails closed when safeStorage is unavailable', () => {
  const handlers = registerCredentialHandlers(
    { isEncryptionAvailable: () => false, encryptString: () => { throw new Error('no'); } },
    { platform: 'linux' },
  );

  assert.throws(
    () => handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret'),
    (error) => error?.code === 'ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE',
  );
});

test('credential encryption never returns plaintext after an encryption failure', () => {
  const handlers = registerCredentialHandlers({
    isEncryptionAvailable: () => true,
    encryptString: () => {
      throw new Error('keychain failure');
    },
  }, { platform: 'linux' });

  assert.throws(
    () => handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret'),
    (error) => error?.code === 'ERR_CREDENTIAL_ENCRYPTION_FAILED',
  );
});

test('encrypted credentials fail closed when safeStorage cannot decrypt them', () => {
  const handlers = registerCredentialHandlers({ isEncryptionAvailable: () => false }, { platform: 'linux' });

  assert.throws(
    () => handlers.get('magiesTerminal:credentials:decrypt')(null, 'enc:v1:c2VjcmV0'),
    (error) => error?.code === 'ERR_CREDENTIAL_DECRYPTION_UNAVAILABLE',
  );
});

test('plaintext credential migration remains readable', () => {
  const handlers = registerCredentialHandlers(null);

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
  });

  const encrypted = handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret');
  assert.match(encrypted, /^enc:v1:/);
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

test('macOS encrypt auto-repairs stale keychain then succeeds', () => {
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
      resetMacSafeStorageKeychain: () => {
        repairCalls += 1;
        available = true;
        return { attempted: true, deleted: ['Magies Terminal Safe Storage'] };
      },
    },
  );

  const encrypted = handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret');
  assert.match(encrypted, /^enc:v1:/);
  assert.equal(repairCalls, 1);
  assert.equal(handlers.get('magiesTerminal:credentials:available')(), true);
});

test('macOS credentials:repair resets keychain and reports availability', () => {
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
});

test('non-macOS repair does not claim a keychain reset', () => {
  const handlers = registerCredentialHandlers(
    { isEncryptionAvailable: () => true },
    { platform: 'win32' },
  );
  const result = handlers.get('magiesTerminal:credentials:repair')();
  assert.equal(result.attempted, false);
  assert.deepEqual(result.deleted, []);
  assert.equal(result.available, true);
});
