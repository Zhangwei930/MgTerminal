import { useCallback, useEffect, useState } from "react";
import type { DbConnectionProfile } from "../../domain/models";
import { getNextVaultOrder, normalizeVaultOrder } from "../../domain/vaultOrder";
import { STORAGE_KEY_DB_CONNECTIONS } from "../../infrastructure/config/storageKeys";
import { localStorageAdapter } from "../../infrastructure/persistence/localStorageAdapter";
import {
  decryptDbConnections,
  encryptDbConnections,
} from "../../infrastructure/persistence/secureFieldAdapter";

/** Appends a profile, assigning it an id, an order past the existing ones, and a timestamp. */
export function appendDbConnection(
  prev: readonly DbConnectionProfile[],
  profile: Omit<DbConnectionProfile, "id" | "order" | "createdAt">,
  newId: () => string,
  now: () => number,
): DbConnectionProfile[] {
  return [
    ...prev,
    {
      ...profile,
      id: newId(),
      order: getNextVaultOrder(prev),
      createdAt: now(),
    } as DbConnectionProfile,
  ];
}

/**
 * Owns saved DB connection profiles, persisted with the same field-level
 * encryption (`dbPassword`) used for `Host.password`.
 *
 * Loading is asynchronous — reading localStorage is cheap, but decrypting each
 * password is an IPC round-trip to the main process. Persistence is therefore
 * gated on `loaded`: until the saved list is in state, nothing is written back.
 *
 * That gate is the whole point. A previous version wrote on every mutation and
 * used a version counter to discard stale loads, so saving a connection before
 * decryption finished appended to an *empty* list and overwrote the stored one,
 * while the same counter bump made the in-flight load discard itself. The saved
 * connections were gone. Writes now flow from state changes only, and state
 * cannot be persisted before it has been populated.
 */
export function useDbConnectionsState() {
  const [dbConnections, setDbConnections] = useState<DbConnectionProfile[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load once. Unlike useVaultState.ts's hosts/keys, this doesn't check the
  // platform vault-lock gate before decrypting: decryptField() already fails
  // soft (keeps ciphertext, warns) when the main-process decrypt call is
  // rejected because the vault is locked — retried by
  // unlockDbConnectionSecrets() once the vault unlocks.
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const saved = localStorageAdapter.read<DbConnectionProfile[]>(STORAGE_KEY_DB_CONNECTIONS);
      if (!saved) {
        if (!cancelled) setLoaded(true);
        return;
      }

      const decrypted = await decryptDbConnections(saved);
      if (cancelled) return;

      setDbConnections(normalizeVaultOrder(decrypted));
      setLoaded(true);
    };

    void init();
    return () => { cancelled = true; };
  }, []);

  // Persist whatever is in state, but never before the load has finished —
  // writing an empty list over the saved one is exactly the data loss above.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;

    void encryptDbConnections(dbConnections).then((enc) => {
      if (!cancelled) localStorageAdapter.write(STORAGE_KEY_DB_CONNECTIONS, enc);
    });

    return () => { cancelled = true; };
  }, [dbConnections, loaded]);

  const updateDbConnections = useCallback((data: DbConnectionProfile[]) => {
    setDbConnections(normalizeVaultOrder(data));
  }, []);

  const addDbConnection = useCallback(
    (profile: Omit<DbConnectionProfile, "id" | "order" | "createdAt">) => {
      // Pure updater: the persistence effect above reacts to the new state.
      setDbConnections((prev) =>
        normalizeVaultOrder(appendDbConnection(prev, profile, () => crypto.randomUUID(), () => Date.now())),
      );
    },
    [],
  );

  /** Re-decrypts secrets currently held as ciphertext — call after platform vault unlock. */
  const unlockDbConnectionSecrets = useCallback(async () => {
    const decrypted = await decryptDbConnections(dbConnections);
    setDbConnections(normalizeVaultOrder(decrypted));
  }, [dbConnections]);

  return { dbConnections, updateDbConnections, addDbConnection, unlockDbConnectionSecrets };
}
