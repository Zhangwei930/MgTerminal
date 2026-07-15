import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptField,
  decryptGroupConfigs,
  decryptHosts,
  decryptIdentities,
  decryptKeys,
  decryptProviderSecrets,
  decryptProxyProfiles,
  encryptField,
  encryptGroupConfigs,
  encryptHosts,
  encryptIdentities,
  encryptKeys,
  encryptProviderSecrets,
  encryptProxyProfiles,
} from './secureFieldAdapter.ts';

function installCredentialBridge() {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      magiesTerminal: {
        credentialsEncrypt: async (value: string) => `encrypted:${value}`,
        credentialsDecrypt: async (value: string) => value.replace(/^encrypted:/, ''),
      },
    },
  });
  return () => Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: previousWindow,
  });
}

test('renderer credential persistence fails closed when its encryption bridge is missing', async () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });

  try {
    await assert.rejects(
      () => encryptField('secret'),
      (error) => error instanceof Error && error.name === 'CredentialEncryptionUnavailableError',
    );
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  }
});

test('decryptField fails soft and returns the stored value when the bridge throws', async () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      magiesTerminal: {
        credentialsDecrypt: async () => {
          throw new Error('keychain unavailable');
        },
      },
    },
  });

  try {
    // Must not reject — a single bad credential should never abort a vault load;
    // the stored (still-encrypted) value is kept for later recovery.
    assert.equal(await decryptField('enc:v1:djEwZ2FyYmFnZQ=='), 'enc:v1:djEwZ2FyYmFnZQ==');
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  }
});

test('renderer credential adapter delegates encryption and decryption to the bridge', async () => {
  const restoreWindow = installCredentialBridge();

  try {
    assert.equal(await encryptField('secret'), 'encrypted:secret');
    assert.equal(await decryptField('encrypted:secret'), 'secret');
  } finally {
    restoreWindow();
  }
});

test('model adapters protect every supported credential field', async () => {
  const restoreWindow = installCredentialBridge();
  try {
    const [host] = await encryptHosts([{
      password: 'host-password',
      telnetPassword: 'telnet-password',
      proxyConfig: { password: 'proxy-password' },
    } as never]);
    const [key] = await encryptKeys([{ privateKey: 'private-key', passphrase: 'passphrase' } as never]);
    const [identity] = await encryptIdentities([{ password: 'identity-password' } as never]);
    const [group] = await encryptGroupConfigs([{
      password: 'group-password',
      telnetPassword: 'group-telnet-password',
      proxyConfig: { password: 'group-proxy-password' },
    } as never]);
    const [profile] = await encryptProxyProfiles([{
      config: { password: 'profile-password' },
    } as never]);
    const webDav = await encryptProviderSecrets({
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      config: { authType: 'password', password: 'webdav-password', token: 'webdav-token' },
    } as never);
    const s3 = await encryptProviderSecrets({
      config: { secretAccessKey: 's3-secret', sessionToken: 's3-session' },
    } as never);

    assert.equal(host.password, 'encrypted:host-password');
    assert.equal(key.privateKey, 'encrypted:private-key');
    assert.equal(identity.password, 'encrypted:identity-password');
    assert.equal(group.proxyConfig?.password, 'encrypted:group-proxy-password');
    assert.equal(profile.config.password, 'encrypted:profile-password');
    assert.equal(webDav.tokens?.accessToken, 'encrypted:access-token');
    assert.equal(s3.config && 'secretAccessKey' in s3.config ? s3.config.secretAccessKey : '', 'encrypted:s3-secret');

    assert.equal((await decryptHosts([host]))[0].password, 'host-password');
    assert.equal((await decryptKeys([key]))[0].privateKey, 'private-key');
    assert.equal((await decryptIdentities([identity]))[0].password, 'identity-password');
    assert.equal((await decryptGroupConfigs([group]))[0].password, 'group-password');
    assert.equal((await decryptProxyProfiles([profile]))[0].config.password, 'profile-password');
    assert.equal((await decryptProviderSecrets(webDav)).tokens?.accessToken, 'access-token');
    const decryptedS3 = await decryptProviderSecrets(s3);
    assert.equal(
      decryptedS3.config && 'secretAccessKey' in decryptedS3.config
        ? decryptedS3.config.secretAccessKey
        : '',
      's3-secret',
    );
  } finally {
    restoreWindow();
  }
});
