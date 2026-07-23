import { useSyncExternalStore } from "react";

// A DB workspace tab is 1:1 with a saved DbConnectionProfile (keyed by its id),
// unlike editor tabs which can open several tabs against the same host. See
// activeTabStore.ts's toDbWorkspaceTabId/fromDbWorkspaceTabId for the "db:"
// top-tab id prefix this store's ids feed into.
export interface DbWorkspaceTab {
  /** Same id as the DbConnectionProfile this tab was opened for. */
  connectionId: string;
  /** Scratch SQL text, kept here so it survives switching away and back. */
  sqlDraft: string;
}

type Listener = () => void;

class DbWorkspaceTabStore {
  private tabs: DbWorkspaceTab[] = [];
  private listeners = new Set<Listener>();

  getTabs = (): readonly DbWorkspaceTab[] => this.tabs;
  getTab = (connectionId: string): DbWorkspaceTab | undefined =>
    this.tabs.find((t) => t.connectionId === connectionId);
  isOpen = (connectionId: string): boolean => this.tabs.some((t) => t.connectionId === connectionId);

  /** Opens a tab for this connection if one isn't already open; returns its id either way. */
  openOrFocus = (connectionId: string): string => {
    if (!this.isOpen(connectionId)) {
      this.tabs = [...this.tabs, { connectionId, sqlDraft: "" }];
      this.notify();
    }
    return connectionId;
  };

  setSqlDraft = (connectionId: string, sqlDraft: string) => {
    const tab = this.getTab(connectionId);
    if (!tab || tab.sqlDraft === sqlDraft) return;
    this.tabs = this.tabs.map((t) => (t.connectionId === connectionId ? { ...t, sqlDraft } : t));
    this.notify();
  };

  close = (connectionId: string) => {
    const next = this.tabs.filter((t) => t.connectionId !== connectionId);
    if (next.length !== this.tabs.length) {
      this.tabs = next;
      this.notify();
    }
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private notify = () => {
    this.listeners.forEach((listener) => listener());
  };
}

export const dbWorkspaceTabStore = new DbWorkspaceTabStore();

const getTabsSnapshot = () => dbWorkspaceTabStore.getTabs();

export const useDbWorkspaceTabs = (): readonly DbWorkspaceTab[] =>
  useSyncExternalStore(dbWorkspaceTabStore.subscribe, getTabsSnapshot, getTabsSnapshot);
