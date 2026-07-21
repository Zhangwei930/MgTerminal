import React, { useCallback } from "react";

import { useVaultState } from "../../application/state/useVaultState";
import { mergeTeamVaultInventory } from "../../domain/teamVault";
import type { HostInventoryShareDocument } from "../../domain/hostDataSource";
import { TeamVaultPanel } from "../TeamVaultPanel";

/**
 * Binds TeamVaultPanel to vault state, mirroring SettingsSyncTabWithVault.
 * The settings window is its own React root, so useVaultState() here is that
 * window's vault instance; the main window picks the change up via the
 * cross-window storage events useVaultState already listens for.
 */
export const TeamVaultPanelWithVault: React.FC = () => {
  const { hosts, updateHosts } = useVaultState();

  const handleImportInventory = useCallback(
    (inventory: HostInventoryShareDocument): number => {
      const merged = mergeTeamVaultInventory(hosts, inventory);
      if (merged.added > 0) {
        void updateHosts(merged.hosts);
      }
      return merged.added;
    },
    [hosts, updateHosts],
  );

  return <TeamVaultPanel hosts={hosts} onImportInventory={handleImportInventory} />;
};

export default TeamVaultPanelWithVault;
