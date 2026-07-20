/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { preserveConcurrentHostLineTimestampUpdate } from "../../domain/host";
import { STORAGE_KEY_VAULT_HOST_PANEL_WIDTH } from "@/infrastructure/config/storageKeys.ts";
import { VaultHostListSection } from "./VaultHostListSection";
import {
  VaultHeaderSearch,
  VaultPageHeader,
  vaultHeaderIconButtonClass,
  vaultHeaderSecondaryButtonClass,
  vaultHeaderToolbarClusterClass,
} from "./VaultPageHeader";
import { LazyLoadBoundary } from "../ui/lazy-load-boundary";
import HostHealthPanel from "../health/HostHealthPanel";

type VaultViewLayoutContext = Record<string, any>;

const VaultSectionLoading = () => (
  <div className="magiesTerminal-lazy-fade-in min-h-[320px] flex-1" aria-hidden="true" />
);

export function VaultViewLayout({ ctx }: { ctx: VaultViewLayoutContext }) {
  const { Activity, allGroupPaths, allTags, AppLogo, Array, Badge, BookMarked, Boolean, Button, cancelInlineGroupEdit, CheckSquare, ChevronDown, clearHostSelection, ClipboardCopy, Clock, cn, commitInlineGroupRename, connectionLogs, connectSelectedHosts, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, Copy, currentSection, customGroups, Database, deleteGroupPath, deleteGroupWithHosts, deleteSelectedHosts, deleteTargetPath, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, displayedGroups, displayedHosts, DistroAvatar, Download, Share2, Dropdown, DropdownContent, DropdownTrigger, Edit2, editingGroupPath, editingHost, editingHostGroupDefaults, FileCode, FileSymlink, FolderPlus, FolderTree, getDropTargetClasses, getEffectiveHostDistro, Globe, groupConfigs, GroupDetailsPanel, groupedDisplayHosts, handleConnectClick, handleCopyCredentials, handleDeleteTag, handleDuplicateHost, handleEditGroupConfig, handleEditHost, handleEditTag, handleExportHosts, handleShareInventory, handleShareInventoryAnsible, handleShareInventoryYaml, handleCopyInventoryJson, handleCopyInventoryAnsible, handleCopyInventoryYaml, handleHostConnect, handleImportFileSelected, handleNewHost, handleProtocolSelect, handleQuickConnect, handleQuickConnectSaveHost, handleSaveGroupConfig, handleSearchKeyDown, handleUnmanageGroup, handleSidebarWidthCommit, hasHostsSidePanel, HostDetailsPanel, hostListScrollRef, hosts, HostTreeView, hotkeyScheme, identities, ImportVaultDialog, Input, isDeleteGroupOpen, isGroupPanelOpen, isHostPanelOpen, isHostsSectionActive, isImportOpen, isMultiSelectMode, isNewFolderOpen, isQuickConnectOpen, isRenameGroupOpen, isSearchQuickConnect, isSerialModalOpen, Key, keyBindings, KeychainManager, keys, knownHostsManagerElement, Label, lastPinnedId, LayoutGrid, LazyConnectionLogsManager, LazyProtocolSelectDialog, List, managedGroupPaths, managedSources, moveGroup, moveHostToGroup, Network, newFolderName, newHostGroupPath, onClearUnsavedConnectionLogs, onConnectSerial, onCreateLocalTerminal, onDeleteConnectionLog, onDeleteHost, onImportOrReuseKey, onOpenLogView, onOpenSettings, onRunSnippet, onToggleConnectionLogSaved, onUpdateCustomGroups, onUpdateGroupConfigs, onUpdateHosts, onUpdateIdentities, onUpdateKeys, onUpdateProxyProfiles, onUpdateSnippetPackages, onUpdateSnippets, Pin, pinnedHosts, pinnedRecentIds, Plug, Plus, PortForwarding, protocolSelectHost, proxyProfiles, ProxyProfilesManager, quickConnectTarget, quickConnectWarnings, QuickConnectWizard, recentHosts, renameGroupError, renameGroupName, renameTargetPath, reorderGroup, reorderHost, RippleButton, rootRef, sanitizeHost, search, selectedGroupPath, selectedHostIds, selectedTags, SerialConnectModal, SerialHostDetailsPanel, sessionCount, Set, setCurrentSection, setDeleteGroupWithHosts, setDeleteTargetPath, setDragOverDropTarget, setEditingGroupPath, setEditingHost, setGroupDragOverDropTarget, setIsDataSourcesOpen, setIsDeleteGroupOpen, setIsGroupPanelOpen, setIsHostPanelOpen, setIsImportOpen, setIsMultiSelectMode, setIsNewFolderOpen, setIsQuickConnectOpen, setIsRenameGroupOpen, setIsSerialModalOpen, setLastPinnedId, setNewFolderName, setNewHostGroupPath, setProtocolSelectHost, setQuickConnectTarget, setQuickConnectWarnings, setRenameGroupError, setRenameGroupName, setRenameTargetPath, setSearch, setSelectedGroupPath, setSelectedHostIds, setSelectedTags, setSidebarCollapsed, setSidebarWidth, setSortMode, setTargetParentPath, Settings, setViewMode, shellHistory, shouldHideEmptyRootHostsSection, showRecentHosts, sidebarCollapsed, sidebarWidth, snippetPackages, snippets, SnippetsManager, SortDropdown, sortMode, splitViewGridStyle, Square, Star, startInlineDeleteGroup, startInlineNewGroup, startInlineRenameGroup, submitNewFolder, submitRenameGroup, Suspense, t, TagFilterDropdown, targetParentPath, terminalFontSize, terminalSettings, TerminalSquare, terminalThemeId, toggleHostPinned, toggleHostSelection, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, Trash2, treeExpandedState, treeViewGroupTree, treeViewHosts, Upload, upsertHostById, Usb, viewMode, visibleDisplayedHosts, X, Zap } = ctx;
  const { knownHosts, noteGroups, NotebookText, notes, NotesManager, onOpenHostFromNote, onOpenNoteIdHandled, onOpenSnippetIdHandled, onUpdateNoteGroups, onUpdateNotes, openNoteId, openSnippetId } = ctx;
  const vaultHostPanelResizeProps = {
    resizable: true as const,
    persistWidthStorageKey: STORAGE_KEY_VAULT_HOST_PANEL_WIDTH,
    resizeAriaLabel: t("vault.panel.resizeWidth"),
  };
  const [isSidebarResizing, setIsSidebarResizing] = React.useState(false);
  const [isHealthPanelOpen, setIsHealthPanelOpen] = React.useState(false);
  const newHostActionsRef = React.useRef<HTMLDivElement>(null);
  const sessionActionsRef = React.useRef<HTMLDivElement>(null);
  const sidebarMinWidth = 56;
  const sidebarMaxWidth = 320;
  const effectiveSidebarWidth = Math.max(
    sidebarMinWidth,
    Math.min(sidebarMaxWidth, Number(sidebarWidth) || 208),
  );
  const handleSidebarResizeStart = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = effectiveSidebarWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    setIsSidebarResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const clampWidth = (value: number) =>
      Math.max(sidebarMinWidth, Math.min(sidebarMaxWidth, value));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(clampWidth(startWidth + moveEvent.clientX - startX));
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      const nextWidth = clampWidth(startWidth + upEvent.clientX - startX);
      setSidebarWidth(nextWidth);
      handleSidebarWidthCommit(nextWidth);
      setIsSidebarResizing(false);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }, [effectiveSidebarWidth, handleSidebarWidthCommit, setSidebarWidth]);

  React.useEffect(() => {
    if (!isHostPanelOpen) return;
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    if (
      newHostActionsRef.current?.contains(activeElement)
      || sessionActionsRef.current?.contains(activeElement)
    ) {
      activeElement.blur();
    }
  }, [isHostPanelOpen]);

  const vaultNavActiveClass = "magiesTerminal-nav-active font-semibold";
  const vaultNavIdleClass =
    "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] rounded-xl";

  return (
    <div ref={rootRef} className="absolute inset-0 min-h-0 flex magiesTerminal-vault-stage" data-section="vault-view">
      {/* Sidebar */}
      <TooltipProvider delayDuration={100}>
        <div
          className={cn(
            "relative shrink-0 magiesTerminal-vault-sidebar flex flex-col",
            isSidebarResizing ? "transition-none" : "transition-[width] duration-200",
          )}
          style={{ width: effectiveSidebarWidth }}
          data-section="vault-sidebar"
        >
          <div className={cn(
            "pt-5 pb-6 flex items-center",
            sidebarCollapsed ? "px-2 justify-center" : "px-4"
          )}>
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="flex items-center gap-2.5 rounded-xl transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <AppLogo className="h-8 w-8 flex-shrink-0 drop-shadow-sm" />
                  {!sidebarCollapsed && (
                    <p className="text-xl font-black italic tracking-tight text-foreground leading-none">
                      MagiesTerminal
                    </p>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {sidebarCollapsed ? t("vault.sidebar.expand") : t("vault.sidebar.collapse")}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className={cn("space-y-1", sidebarCollapsed ? "px-1.5" : "px-2")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  variant={currentSection === "hosts" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full h-9 rounded-xl",
                    sidebarCollapsed ? "justify-center p-0" : "justify-start gap-2.5 px-2.5",
                    currentSection === "hosts" ? vaultNavActiveClass : vaultNavIdleClass,
                  )}
                  onClick={() => {
                    setCurrentSection("hosts");
                    setSelectedGroupPath(null);
                  }}
                >
                  <LayoutGrid size={16} className="flex-shrink-0" />
                  {!sidebarCollapsed && t("vault.nav.hosts")}
                </RippleButton>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">{t("vault.nav.hosts")}</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  variant={currentSection === "keys" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full h-9 rounded-xl",
                    sidebarCollapsed ? "justify-center p-0" : "justify-start gap-2.5 px-2.5",
                    currentSection === "keys" ? vaultNavActiveClass : vaultNavIdleClass,
                  )}
                  onClick={() => {
                    setCurrentSection("keys");
                  }}
                >
                  <Key size={16} className="flex-shrink-0" />
                  {!sidebarCollapsed && t("vault.nav.keychain")}
                </RippleButton>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">{t("vault.nav.keychain")}</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  variant={currentSection === "proxies" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full h-9 rounded-xl",
                    sidebarCollapsed ? "justify-center p-0" : "justify-start gap-2.5 px-2.5",
                    currentSection === "proxies" ? vaultNavActiveClass : vaultNavIdleClass,
                  )}
                  onClick={() => {
                    setCurrentSection("proxies");
                  }}
                >
                  <Globe size={16} className="flex-shrink-0" />
                  {!sidebarCollapsed && t("vault.nav.proxies")}
                </RippleButton>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">{t("vault.nav.proxies")}</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  variant={currentSection === "port" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full h-9 rounded-xl",
                    sidebarCollapsed ? "justify-center p-0" : "justify-start gap-2.5 px-2.5",
                    currentSection === "port" ? vaultNavActiveClass : vaultNavIdleClass,
                  )}
                  onClick={() => setCurrentSection("port")}
                >
                  <Plug size={16} className="flex-shrink-0" />
                  {!sidebarCollapsed && t("vault.nav.portForwarding")}
                </RippleButton>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">{t("vault.nav.portForwarding")}</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  variant={currentSection === "snippets" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full h-9 rounded-xl",
                    sidebarCollapsed ? "justify-center p-0" : "justify-start gap-2.5 px-2.5",
                    currentSection === "snippets" ? vaultNavActiveClass : vaultNavIdleClass,
                  )}
                  onClick={() => {
                    setCurrentSection("snippets");
                  }}
                >
                  <FileCode size={16} className="flex-shrink-0" />
                  {!sidebarCollapsed && t("vault.nav.scripts")}
                </RippleButton>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">{t("vault.nav.scripts")}</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  variant={currentSection === "notes" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full h-9 rounded-xl",
                    sidebarCollapsed ? "justify-center p-0" : "justify-start gap-2.5 px-2.5",
                    currentSection === "notes" ? vaultNavActiveClass : vaultNavIdleClass,
                  )}
                  onClick={() => {
                    setCurrentSection("notes");
                  }}
                >
                  <NotebookText size={16} className="flex-shrink-0" />
                  {!sidebarCollapsed && t("vault.nav.notes")}
                </RippleButton>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">{t("vault.nav.notes")}</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  variant={currentSection === "knownhosts" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full h-9 rounded-xl",
                    sidebarCollapsed ? "justify-center p-0" : "justify-start gap-2.5 px-2.5",
                    currentSection === "knownhosts" ? vaultNavActiveClass : vaultNavIdleClass,
                  )}
                  onClick={() => setCurrentSection("knownhosts")}
                >
                  <BookMarked size={16} className="flex-shrink-0" />
                  {!sidebarCollapsed && t("vault.nav.knownHosts")}
                </RippleButton>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">{t("vault.nav.knownHosts")}</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <RippleButton
                  variant={currentSection === "logs" ? "secondary" : "ghost"}
                  className={cn(
                    "w-full h-9 rounded-xl",
                    sidebarCollapsed ? "justify-center p-0" : "justify-start gap-2.5 px-2.5",
                    currentSection === "logs" ? vaultNavActiveClass : vaultNavIdleClass,
                  )}
                  onClick={() => setCurrentSection("logs")}
                >
                  <Activity size={16} className="flex-shrink-0" />
                  {!sidebarCollapsed && t("vault.nav.logs")}
                </RippleButton>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">{t("vault.nav.logs")}</TooltipContent>}
            </Tooltip>
          </div>

          <div className={cn("mt-auto pb-4 space-y-2 border-t border-border/30 pt-3", sidebarCollapsed ? "px-1.5" : "px-2.5")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full text-muted-foreground hover:text-foreground",
                    sidebarCollapsed ? "justify-center p-0" : "justify-start gap-3"
                  )}
                  onClick={onOpenSettings}
                >
                  <Settings size={16} className="flex-shrink-0" />
                  {!sidebarCollapsed && t("common.settings")}
                </Button>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">{t("common.settings")}</TooltipContent>}
            </Tooltip>
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("vault.sidebar.resize")}
            className={cn(
              "app-no-drag absolute right-0 top-0 z-20 h-full w-2 translate-x-1/2 cursor-col-resize",
              "after:absolute after:right-1/2 after:top-2 after:h-[calc(100%-16px)] after:w-px after:translate-x-1/2 after:bg-border/0 after:transition-colors",
              "hover:after:bg-border/70",
              isSidebarResizing && "after:bg-primary/70",
            )}
            onPointerDown={handleSidebarResizeStart}
          />
        </div>
      </TooltipProvider>

      <div className="flex min-w-0 flex-1 py-0 pr-2 pb-2 pl-0" data-section="vault-stage">
        <div
          className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl magiesTerminal-vault-surface"
          data-section="vault-surface"
        >
          {/* Main Area */}
          <div
            className="flex-1 min-w-0 flex flex-col min-h-0 relative"
            data-section="vault-main"
          >
        <VaultPageHeader
          className={cn(!isHostsSectionActive && "hidden")}
          dataSection="vault-hosts-header"
        >
              <VaultHeaderSearch
                placeholder={t("vault.hosts.search.placeholder")}
                className="min-w-0 flex-1"
                inputClassName={cn(
                  isSearchQuickConnect &&
                  "border-primary/50 ring-1 ring-primary/20",
                )}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                rightAdornment={
                  isSearchQuickConnect ? (
                    <Zap size={14} className="text-primary" />
                  ) : null
                }
              />
            <Button
              variant={isSearchQuickConnect ? "default" : "secondary"}
              className={cn(
                "h-9 shrink-0 px-3.5 rounded-xl",
                !isSearchQuickConnect &&
                vaultHeaderSecondaryButtonClass,
              )}
              onClick={handleConnectClick}
            >
              {t("vault.hosts.connect")}
            </Button>
            {/* View mode, tag filter, and sort controls — themed toolbar cluster */}
            <div className={cn(vaultHeaderToolbarClusterClass, "app-no-drag shrink-0")}>
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(vaultHeaderIconButtonClass, "w-auto min-w-9 gap-0.5 px-1.5")}
                  >
                    {viewMode === "grid" ? (
                      <LayoutGrid size={15} />
                    ) : viewMode === "list" ? (
                      <List size={15} />
                    ) : (
                      <Network size={15} />
                    )}
                    <ChevronDown size={11} className="opacity-70" />
                  </Button>
                </DropdownTrigger>
                <DropdownContent className="w-36 p-1.5" align="end">
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    className="w-full justify-start gap-2 h-9 rounded-lg"
                    onClick={() => setViewMode("grid")}
                  >
                    <LayoutGrid size={14} /> {t("vault.view.grid")}
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    className="w-full justify-start gap-2 h-9 rounded-lg"
                    onClick={() => setViewMode("list")}
                  >
                    <List size={14} /> {t("vault.view.list")}
                  </Button>
                  <Button
                    variant={viewMode === "tree" ? "secondary" : "ghost"}
                    className="w-full justify-start gap-2 h-9 rounded-lg"
                    onClick={() => setViewMode("tree")}
                  >
                    <Network size={14} /> {t("vault.view.tree")}
                  </Button>
                </DropdownContent>
              </Dropdown>
              <TagFilterDropdown
                allTags={allTags}
                selectedTags={selectedTags}
                onChange={setSelectedTags}
                onEditTag={handleEditTag}
                onDeleteTag={handleDeleteTag}
                className={vaultHeaderIconButtonClass}
              />
              <SortDropdown
                value={sortMode}
                onChange={setSortMode}
                className={vaultHeaderIconButtonClass}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    data-active={isMultiSelectMode ? "true" : undefined}
                    className={cn(
                      vaultHeaderIconButtonClass,
                      isMultiSelectMode && "bg-primary/12 text-primary border-primary/20",
                    )}
                    onClick={() => {
                      if (isMultiSelectMode) {
                        clearHostSelection();
                      } else {
                        setIsMultiSelectMode(true);
                      }
                    }}
                  >
                    <CheckSquare size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("vault.hosts.multiSelect")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={vaultHeaderIconButtonClass}
                    onClick={() => setIsHealthPanelOpen(true)}
                  >
                    <Activity size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("health.open")}</TooltipContent>
              </Tooltip>
            </div>
            {/* New Host split button — collapses with an animation when the
                host details / new-host aside panel is open, since the button
                would be a no-op in that state. */}
            <div
              ref={newHostActionsRef}
              className={cn(
                "flex items-center app-no-drag overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-in-out",
                isHostPanelOpen
                  ? "max-w-0 opacity-0 -ml-2 pointer-events-none"
                  : "max-w-[260px] opacity-100",
              )}
              aria-hidden={isHostPanelOpen ? true : undefined}
              inert={isHostPanelOpen ? true : undefined}
            >
              <Dropdown>
                <div className="flex items-center overflow-hidden rounded-xl bg-primary text-primary-foreground shadow-[0_4px_14px_-6px_hsl(var(--primary)/0.55)]">
                  <Button
                    size="sm"
                    className="h-9 px-3 rounded-none bg-transparent hover:bg-white/12 shadow-none"
                    onClick={handleNewHost}
                    tabIndex={isHostPanelOpen ? -1 : 0}
                  >
                    <Plus size={14} className="mr-1.5" /> {t("vault.hosts.newHost")}
                  </Button>
                  <DropdownTrigger asChild>
                    <Button
                      size="sm"
                      className="h-9 px-2 rounded-none bg-transparent hover:bg-white/12 border-l border-primary-foreground/20 shadow-none"
                      tabIndex={isHostPanelOpen ? -1 : 0}
                    >
                      <ChevronDown size={14} />
                    </Button>
                  </DropdownTrigger>
                </div>
                <DropdownContent className="w-44" align="end" alignToParent>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      setTargetParentPath(selectedGroupPath);
                      setNewFolderName("");
                      setIsNewFolderOpen(true);
                    }}
                  >
                    <FolderTree size={14} /> {t("vault.hosts.newGroup")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      setIsImportOpen(true);
                    }}
                  >
                    <Upload size={14} /> {t("vault.hosts.import")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      setIsDataSourcesOpen(true);
                    }}
                  >
                    <Database size={14} /> {t("vault.hosts.dataSources")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={handleShareInventory}
                  >
                    <Share2 size={14} /> {t("vault.hosts.share")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={handleShareInventoryAnsible}
                  >
                    <Share2 size={14} /> {t("vault.hosts.shareAnsible")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={handleShareInventoryYaml}
                  >
                    <Share2 size={14} /> {t("vault.hosts.shareYaml")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={handleCopyInventoryJson}
                  >
                    <ClipboardCopy size={14} /> {t("vault.hosts.copyJson")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={handleCopyInventoryAnsible}
                  >
                    <ClipboardCopy size={14} /> {t("vault.hosts.copyAnsible")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={handleCopyInventoryYaml}
                  >
                    <ClipboardCopy size={14} /> {t("vault.hosts.copyYaml")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={handleExportHosts}
                  >
                    <Download size={14} /> {t("vault.hosts.export")}
                  </Button>
                </DropdownContent>
              </Dropdown>
            </div>
            {/* Terminal + Serial — collapse together with an animation when
                the host details / new-host aside panel is open, freeing
                horizontal space for the panel. */}
            <div
              ref={sessionActionsRef}
              className={cn(
                "flex items-center gap-2 overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-in-out",
                isHostPanelOpen
                  ? "max-w-0 opacity-0 -ml-2 pointer-events-none"
                  : "max-w-[320px] opacity-100",
              )}
              aria-hidden={isHostPanelOpen ? true : undefined}
              inert={isHostPanelOpen ? true : undefined}
            >
              <Button
                size="sm"
                variant="secondary"
                className={vaultHeaderSecondaryButtonClass}
                onClick={onCreateLocalTerminal}
                tabIndex={isHostPanelOpen ? -1 : 0}
              >
                <TerminalSquare size={14} className="mr-1.5" /> {t("common.terminal")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className={vaultHeaderSecondaryButtonClass}
                onClick={() => setIsSerialModalOpen(true)}
                tabIndex={isHostPanelOpen ? -1 : 0}
              >
                <Usb size={14} className="mr-1.5" /> {t("serial.button")}
              </Button>
            </div>
        </VaultPageHeader>

        {isMultiSelectMode && isHostsSectionActive && (
          <div className="flex items-center gap-2 border-b border-border/45 bg-gradient-to-r from-primary/[0.06] via-background to-background px-3.5 py-2">
            <span className="inline-flex h-7 items-center rounded-lg bg-primary/10 px-2 text-xs font-medium text-primary leading-none">
              {t("vault.hosts.selected", { count: selectedHostIds.size })}
            </span>
            <div className="flex-1" />
            <div className={cn(vaultHeaderToolbarClusterClass, "gap-0.5")}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg px-2.5 text-xs"
                onClick={() => {
                  const allIds = new Set(displayedHosts.map(h => h.id));
                  setSelectedHostIds(allIds);
                }}
              >
                {t("vault.hosts.selectAll")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg px-2.5 text-xs"
                onClick={clearHostSelection}
              >
                {t("vault.hosts.deselectAll")}
              </Button>
            </div>
            <Button
              variant="default"
              size="sm"
              className="h-8 rounded-lg px-2.5 text-xs shadow-sm shadow-primary/25"
              disabled={selectedHostIds.size === 0}
              onClick={connectSelectedHosts}
            >
              <Plug size={12} className="mr-1" />
              {t("vault.hosts.connectSelected", { count: selectedHostIds.size })}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 rounded-lg px-2.5 text-xs"
              disabled={selectedHostIds.size === 0}
              onClick={deleteSelectedHosts}
            >
              <Trash2 size={12} className="mr-1" />
              {t("vault.hosts.deleteSelected", { count: selectedHostIds.size })}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(vaultHeaderIconButtonClass, "h-8 w-8")}
              onClick={clearHostSelection}
            >
              <X size={13} />
            </Button>
          </div>
        )}

        {/* Keep hosts mounted so switching sections does not reset scroll or remount the list. */}
        
        <VaultHostListSection ctx={{ Badge, Boolean, Button, cancelInlineGroupEdit, CheckSquare, ClipboardCopy, Clock, cn, commitInlineGroupRename, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, Copy, displayedGroups, displayedHosts, DistroAvatar, Edit2, FileSymlink, FolderPlus, FolderTree, getDropTargetClasses, getEffectiveHostDistro, groupConfigs, groupedDisplayHosts, handleCopyCredentials, handleDuplicateHost, handleEditGroupConfig, handleEditHost, handleHostConnect, handleNewHost, handleUnmanageGroup, hasHostsSidePanel, hostListScrollRef, HostTreeView, isHostsSectionActive, isMultiSelectMode, lastPinnedId, LayoutGrid, managedGroupPaths, moveGroup, moveHostToGroup, onDeleteHost, Pin, pinnedHosts, pinnedRecentIds, Plug, recentHosts, reorderGroup, reorderHost, sanitizeHost, selectedGroupPath, selectedHostIds, sessionCount, setDeleteTargetPath, setDragOverDropTarget, setGroupDragOverDropTarget, setIsDeleteGroupOpen, setIsImportOpen, setIsNewFolderOpen, setLastPinnedId, setNewFolderName, setSelectedGroupPath, setTargetParentPath, shouldHideEmptyRootHostsSection, showRecentHosts, sortMode, splitViewGridStyle, Square, Star, startInlineDeleteGroup, startInlineNewGroup, startInlineRenameGroup, t, toggleHostPinned, toggleHostSelection, Trash2, treeExpandedState, treeViewGroupTree, treeViewHosts, viewMode, visibleDisplayedHosts }} />

        {currentSection === "snippets" && (
          <LazyLoadBoundary name="Snippets" resetKey="snippets">
            <Suspense fallback={<VaultSectionLoading />}>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <SnippetsManager
                snippets={snippets}
                packages={snippetPackages}
                hosts={hosts}
                customGroups={customGroups}
                shellHistory={shellHistory}
                hotkeyScheme={hotkeyScheme}
                keyBindings={keyBindings}
                onPackagesChange={onUpdateSnippetPackages}
                onSave={(s) =>
                  onUpdateSnippets(
                    snippets.find((ex) => ex.id === s.id)
                      ? snippets.map((ex) => (ex.id === s.id ? s : ex))
                      : [...snippets, s],
                  )
                }
                onBulkSave={onUpdateSnippets}
                onDelete={(id) =>
                  onUpdateSnippets(snippets.filter((s) => s.id !== id))
                }
                onRunSnippet={onRunSnippet}
                availableKeys={keys}
                proxyProfiles={proxyProfiles}
                managedSources={managedSources}
                onSaveHost={(host) => onUpdateHosts([...hosts, host])}
                onUpdateHosts={onUpdateHosts}
                onCreateGroup={(groupPath) =>
                  onUpdateCustomGroups(
                    Array.from(new Set([...customGroups, groupPath])),
                  )
                }
                openSnippetId={openSnippetId ?? null}
                onOpenSnippetIdHandled={onOpenSnippetIdHandled}
              />
              </div>
            </Suspense>
          </LazyLoadBoundary>
        )}
        <div
          className={cn("min-h-0 flex-1", currentSection !== "notes" && "hidden")}
          data-section="vault-notes-retained"
        >
          <NotesManager
            notes={notes}
            noteGroups={noteGroups}
            hosts={hosts}
            onUpdateNotes={onUpdateNotes}
            onUpdateNoteGroups={onUpdateNoteGroups}
            openNoteId={openNoteId ?? null}
            onOpenNoteIdHandled={onOpenNoteIdHandled}
            onOpenHost={(host: any, source: any) => {
              if (source?.noteId && onOpenHostFromNote) {
                onOpenHostFromNote(host, source);
                return;
              }
              handleHostConnect(host);
            }}
          />
        </div>
        {currentSection === "keys" && (
          <LazyLoadBoundary name="Keychain" resetKey="keys">
            <Suspense fallback={<VaultSectionLoading />}>
              <KeychainManager
              keys={keys}
              identities={identities}
              hosts={hosts}
              proxyProfiles={proxyProfiles}
              customGroups={customGroups}
              groupConfigs={groupConfigs}
              managedSources={managedSources}
              onSave={(k) => onUpdateKeys([...keys, k])}
              onUpdate={(k) =>
                onUpdateKeys(
                  keys.map((existing) => (existing.id === k.id ? k : existing)),
                )
              }
              onReorderKeys={onUpdateKeys}
              onDelete={(id) => onUpdateKeys(keys.filter((k) => k.id !== id))}
              onSaveIdentity={(identity) =>
                onUpdateIdentities(
                  identities.find((ex) => ex.id === identity.id)
                    ? identities.map((ex) =>
                      ex.id === identity.id ? identity : ex,
                    )
                    : [...identities, identity],
                )
              }
              onDeleteIdentity={(id) =>
                onUpdateIdentities(identities.filter((i) => i.id !== id))
              }
              onReorderIdentities={onUpdateIdentities}
              onSaveHost={(host) => {
                // Update existing host or add new one
                const existingIndex = hosts.findIndex((h) => h.id === host.id);
                if (existingIndex >= 0) {
                  onUpdateHosts(hosts.map((h) => (h.id === host.id ? host : h)));
                } else {
                  onUpdateHosts([...hosts, host]);
                }
              }}
              onCreateGroup={(groupPath) =>
                onUpdateCustomGroups(
                  Array.from(new Set([...customGroups, groupPath])),
                )
              }
              />
            </Suspense>
          </LazyLoadBoundary>
        )}
        {currentSection === "proxies" && (
          <LazyLoadBoundary name="Proxy profiles" resetKey="proxies">
            <Suspense fallback={<VaultSectionLoading />}>
              <ProxyProfilesManager
                proxyProfiles={proxyProfiles}
                hosts={hosts}
                groupConfigs={groupConfigs}
                identities={identities}
                onUpdateProxyProfiles={onUpdateProxyProfiles}
                onUpdateHosts={onUpdateHosts}
                onUpdateGroupConfigs={onUpdateGroupConfigs}
              />
            </Suspense>
          </LazyLoadBoundary>
        )}
        {currentSection === "port" && (
          <LazyLoadBoundary name="Port forwarding" resetKey="port-forwarding">
            <Suspense fallback={<VaultSectionLoading />}>
              <PortForwarding
              hosts={hosts}
              keys={keys}
              identities={identities}
              knownHosts={knownHosts}
              proxyProfiles={proxyProfiles}
              customGroups={customGroups}
              managedSources={managedSources}
              groupConfigs={groupConfigs}
              onSaveHost={(host) => onUpdateHosts([...hosts, host])}
              onCreateGroup={(groupPath) =>
                onUpdateCustomGroups(
                  Array.from(new Set([...customGroups, groupPath])),
                )
              }
              terminalSettings={terminalSettings}
              />
            </Suspense>
          </LazyLoadBoundary>
        )}
        {/* Always render KnownHostsManager but hide with CSS to prevent unmounting */}
        <div
          style={{
            display: currentSection === "knownhosts" ? "contents" : "none",
          }}
        >
          {knownHostsManagerElement}
        </div>
        {/* Connection Logs */}
        {currentSection === "logs" && (
          <LazyLoadBoundary name="Connection logs" resetKey="connection-logs">
            <Suspense fallback={<VaultSectionLoading />}>
              <LazyConnectionLogsManager
                logs={connectionLogs}
                hosts={hosts}
                onToggleSaved={onToggleConnectionLogSaved}
                onDelete={onDeleteConnectionLog}
                onClearUnsaved={onClearUnsavedConnectionLogs}
                onOpenLogView={onOpenLogView}
              />
            </Suspense>
          </LazyLoadBoundary>
        )}
      </div>

      {isHealthPanelOpen && (
        <HostHealthPanel
          open={isHealthPanelOpen}
          onClose={() => setIsHealthPanelOpen(false)}
          hosts={hosts}
          allHosts={hosts}
          keys={keys}
          identities={identities}
          knownHosts={knownHosts}
          snippets={snippets}
          onRunSnippet={onRunSnippet}
        />
      )}

      {/* Group Details Panel */}
      {currentSection === "hosts" && isGroupPanelOpen && editingGroupPath && (
        <GroupDetailsPanel
          key={editingGroupPath}
          groupPath={editingGroupPath}
          config={groupConfigs.find(c => c.path === editingGroupPath)}
          availableKeys={keys}
          identities={identities}
          proxyProfiles={proxyProfiles}
          allHosts={hosts}
          groups={allGroupPaths}
          terminalThemeId={terminalThemeId}
          groupConfigs={groupConfigs}
          terminalFontSize={terminalFontSize}
          onSave={handleSaveGroupConfig}
          onCancel={() => {
            setIsGroupPanelOpen(false);
            setEditingGroupPath(null);
          }}
          layout="inline"
          {...vaultHostPanelResizeProps}
        />
      )}

      {/* Host Details Panel */}
      {currentSection === "hosts" && isHostPanelOpen && editingHost?.protocol !== 'serial' && (
        <HostDetailsPanel
          initialData={editingHost}
          availableKeys={keys}
          identities={identities}
          proxyProfiles={proxyProfiles}
          groups={allGroupPaths}
          managedSources={managedSources}
          allTags={allTags}
          allHosts={hosts}
          defaultGroup={editingHost ? undefined : (newHostGroupPath || selectedGroupPath)}
          terminalThemeId={terminalThemeId}
          terminalFontSize={terminalFontSize}
          groupDefaults={editingHostGroupDefaults}
          groupConfigs={groupConfigs}
          snippets={snippets}
          onSnippetsChange={onUpdateSnippets}
          onImportKey={onImportOrReuseKey}
          knownHosts={knownHosts}
          onSave={(host) => {
            const latestHost = hosts.find((entry: { id: string }) => entry.id === host.id);
            const nextHost = preserveConcurrentHostLineTimestampUpdate({
              draft: host,
              openedHost: editingHost,
              latestHost,
            });
            onUpdateHosts(upsertHostById(hosts, nextHost));
            setIsHostPanelOpen(false);
            setEditingHost(null);
            setNewHostGroupPath(null);
          }}
          onCancel={() => {
            setIsHostPanelOpen(false);
            setEditingHost(null);
            setNewHostGroupPath(null);
          }}
          onCreateGroup={(groupPath) => {
            onUpdateCustomGroups(
              Array.from(new Set([...customGroups, groupPath])),
            );
          }}
          layout="inline"
          {...vaultHostPanelResizeProps}
        />
      )}

      {/* Serial Host Details Panel - for editing serial port hosts */}
      {currentSection === "hosts" && isHostPanelOpen && editingHost?.protocol === 'serial' && (
        <SerialHostDetailsPanel
          initialData={editingHost}
          allTags={allTags}
          groups={allGroupPaths}
          onSave={(host) => {
            onUpdateHosts(upsertHostById(hosts, host));
            setIsHostPanelOpen(false);
            setEditingHost(null);
            setNewHostGroupPath(null);
          }}
          onCancel={() => {
            setIsHostPanelOpen(false);
            setEditingHost(null);
            setNewHostGroupPath(null);
          }}
          layout="inline"
          {...vaultHostPanelResizeProps}
        />
      )}
        </div>
      </div>

      <Dialog open={isNewFolderOpen} onOpenChange={(open) => {
        setIsNewFolderOpen(open);
        if (!open) {
          setNewFolderName("");
          setTargetParentPath(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {targetParentPath
                ? t("vault.groups.createSubfolder")
                : t("vault.groups.createRoot")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("vault.groups.createDialog.desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>{t("vault.groups.field.name")}</Label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t("vault.groups.placeholder.example")}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submitNewFolder()}
            />
            {targetParentPath && (
              <p className="text-xs text-muted-foreground mt-2">
                {t("vault.groups.parentLabel")}:{" "}
                <span className="font-mono">{targetParentPath}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsNewFolderOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitNewFolder}>{t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isRenameGroupOpen}
        onOpenChange={(open) => {
          setIsRenameGroupOpen(open);
          if (!open) {
            setRenameTargetPath(null);
            setRenameGroupName("");
            setRenameGroupError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("vault.groups.renameDialogTitle")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("vault.groups.renameDialog.desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label>{t("vault.groups.field.name")}</Label>
            <Input
              value={renameGroupName}
              onChange={(e) => {
                setRenameGroupName(e.target.value);
                setRenameGroupError(null);
              }}
              placeholder={t("vault.groups.placeholder.example")}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submitRenameGroup()}
            />
            {renameTargetPath && (
              <p className="text-xs text-muted-foreground">
                {t("vault.groups.pathLabel")}:{" "}
                <span className="font-mono">{renameTargetPath}</span>
              </p>
            )}
            {renameGroupError && (
              <p className="text-xs text-destructive">{renameGroupError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRenameGroupOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitRenameGroup}>{t("common.rename")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteGroupOpen}
        onOpenChange={(open) => {
          setIsDeleteGroupOpen(open);
          if (!open) {
            setDeleteTargetPath(null);
            setDeleteGroupWithHosts(false);
          }
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
          <DialogHeader className="min-w-0 pr-6">
            <DialogTitle className="truncate">{t("vault.groups.deleteDialogTitle")}</DialogTitle>
            <DialogDescription className="break-words [overflow-wrap:anywhere]">
              {deleteTargetPath && managedGroupPaths.has(deleteTargetPath)
                ? t("vault.groups.deleteDialog.managedDesc")
                : t("vault.groups.deleteDialog.desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-4 py-4">
            {deleteTargetPath && (
              <>
                <p className="min-w-0 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  {t("vault.groups.pathLabel")}:{" "}
                  <span className="font-mono">{deleteTargetPath}</span>
                </p>
                {!managedGroupPaths.has(deleteTargetPath) && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteGroupWithHosts}
                      onChange={(e) => setDeleteGroupWithHosts(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span>{t("vault.groups.deleteDialog.deleteHosts")}</span>
                  </label>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteGroupOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTargetPath) {
                  const isManaged = managedGroupPaths.has(deleteTargetPath);
                  deleteGroupPath(deleteTargetPath, isManaged || deleteGroupWithHosts);
                }
                setIsDeleteGroupOpen(false);
                setDeleteGroupWithHosts(false);
              }}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportVaultDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onFileSelected={handleImportFileSelected}
      />

      {/* Quick Connect Wizard */}
      {isQuickConnectOpen && quickConnectTarget && (
        <QuickConnectWizard
          open={isQuickConnectOpen}
          target={quickConnectTarget}
          keys={keys}
          onConnect={handleQuickConnect}
          onSaveHost={handleQuickConnectSaveHost}
          onClose={() => {
            setIsQuickConnectOpen(false);
            setQuickConnectTarget(null);
            setQuickConnectWarnings([]);
          }}
          warnings={quickConnectWarnings}
        />
      )}

      {/* Protocol Select Dialog */}
      {protocolSelectHost && (
        <LazyLoadBoundary name="Protocol selector" resetKey={protocolSelectHost.id}>
          <Suspense fallback={null}>
            <LazyProtocolSelectDialog
              host={protocolSelectHost}
              onSelect={handleProtocolSelect}
              onCancel={() => setProtocolSelectHost(null)}
            />
          </Suspense>
        </LazyLoadBoundary>
      )}

      {/* Serial Connect Modal */}
      <SerialConnectModal
        open={isSerialModalOpen}
        onClose={() => setIsSerialModalOpen(false)}
        onConnect={(config, options) => {
          if (onConnectSerial) {
            onConnectSerial(config, options);
          }
        }}
        onSaveHost={(host) => {
          onUpdateHosts([...hosts, host]);
        }}
      />
    </div>
  );
}
