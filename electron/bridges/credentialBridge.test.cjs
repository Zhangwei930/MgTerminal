const assert = require('node:assert/strict');
const test = require('node:test');

const { registerHandlers } = require('./credentialBridge.cjs');

function registerCredentialHandlers(safeStorage) {
  const handlers = new Map();
  registerHandlers({
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  }, { safeStorage });
  return handlers;
}

test('credential encryption fails closed when safeStorage is unavailable', () => {
  const handlers = registerCredentialHandlers({ isEncryptionAvailable: () => false });

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
  });

  assert.throws(
    () => handlers.get('magiesTerminal:credentials:encrypt')(null, 'secret'),
    (error) => error?.code === 'ERR_CREDENTIAL_ENCRYPTION_FAILED',
  );
});

test('encrypted credentials fail closed when safeStorage cannot decrypt them', () => {
  const handlers = registerCredentialHandlers({ isEncryptionAvailable: () => false });

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
