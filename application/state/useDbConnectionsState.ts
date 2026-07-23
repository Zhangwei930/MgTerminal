import { useCallback, useEffect, useRef, useState } from "react";
import type { DbConnectionProfile } from "../../domain/models";
import { getNextVaultOrder, normalizeVaultOrder } from "../../domain/vaultOrder";
import { STORAGE_KEY_DB_CONNECTIONS } from "../../infrastructure/config/storageKeys";
import { localStorageAdapter } from "../../infrastructure/persistence/localStorageAdapter";
import {
  decryptDbConnections,
  encryptDbConnections,
} from "../../infrastructure/persistence/secureFieldAdapter";

/**
 * Owns saved DB connection profiles, persisted with the same field-level
 * encryption (`dbPassword`) used for `Host.password` — see useVaultState.ts's
 * `updateHosts`/init effect for the pattern this mirrors.
 */
export function useDbConnectionsState() {
  const [dbConnections, setDbConnections] = useState<DbConnectionProfile[]>([]);
  const writeVersion = useRef(0);

  // Unlike useVaultState.ts's hosts/keys, this doesn't check the platform
  // vault-lock gate before decrypting: decryptField() already fails soft
  // (keeps ciphertext, warns) when the main-process decrypt call is rejected
  // because the vault is locked, so an unconditional attempt here is safe —
  // just retried by unlockDbConnectionSecrets() once the vault unlocks.
  useEffect(() => {
    const init = async () => {
      const saved = localStorageAdapter.read<DbConnectionProfile[]>(STORAGE_KEY_DB_CONNECTIONS);
      if (!saved) return;

      const ver = ++writeVersion.current;
      const decrypted = await decryptDbConnections(saved);
      if (ver !== writeVersion.current) return;

      const sanitized = normalizeVaultOrder(decrypted);
      setDbConnections(sanitized);
    };
    void init();
  }, []);

  const updateDbConnections = useCallback((data: DbConnectionProfile[]) => {
    const cleaned = normalizeVaultOrder(data);
    setDbConnections(cleaned);
    const ver = ++writeVersion.current;
    encryptDbConnections(cleaned).then((enc) => {
      if (ver === writeVersion.current) {
        localStorageAdapter.write(STORAGE_KEY_DB_CONNECTIONS, enc);
      }
    });
  }, []);

  const addDbConnection = useCallback((profile: Omit<DbConnectionProfile, "id" | "order" | "createdAt">) => {
    setDbConnections((prev) => {
      const newProfile: DbConnectionProfile = {
        ...profile,
        id: crypto.randomUUID(),
        order: getNextVaultOrder(prev),
        createdAt: Date.now(),
      };
      const updated = [...prev, newProfile];
      const ver = ++writeVersion.current;
      encryptDbConnections(updated).then((enc) => {
        if (ver === writeVersion.current) {
          localStorageAdapter.write(STORAGE_KEY_DB_CONNECTIONS, enc);
        }
      });
      return updated;
    });
  }, []);

  /** Re-decrypts secrets currently held as ciphertext — call after platform vault unlock. */
  const unlockDbConnectionSecrets = useCallback(async () => {
    const ver = ++writeVersion.current;
    const decrypted = await decryptDbConnections(dbConnections);
    if (ver !== writeVersion.current) return;
    const sanitized = normalizeVaultOrder(decrypted);
    setDbConnections(sanitized);
    encryptDbConnections(sanitized).then((enc) => {
      if (ver === writeVersion.current) {
        localStorageAdapter.write(STORAGE_KEY_DB_CONNECTIONS, enc);
      }
    });
  }, [dbConnections]);

  return { dbConnections, updateDbConnections, addDbConnection, unlockDbConnectionSecrets };
}
