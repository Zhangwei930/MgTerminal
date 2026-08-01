import { Database, Pencil, Plug, Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { activeTabStore, toDbWorkspaceTabId } from '../../application/state/activeTabStore';
import { dbWorkspaceTabStore } from '../../application/state/dbWorkspaceTabStore';
import { type DbConnectionProfile, type DbEngine } from '../../domain/models';
import {
  applyEngineToDraft,
  buildDbConnectionPayload,
  buildDbConnectionUpdate,
  canSaveDbConnectionDraft,
  draftFromDbConnection,
  emptyDbConnectionDraft,
} from './dbConnectionDraft';
import type { Host } from '../../types';
import SelectHostPanel from '../SelectHostPanel';
import { AsidePanel, AsidePanelContent, AsidePanelFooter } from '../ui/aside-panel';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { VaultHeaderSearch, VaultPageHeader, vaultHeaderSecondaryButtonClass } from '../vault/VaultPageHeader';

interface DbConnectionsPanelProps {
  hosts: Host[];
  dbConnections: DbConnectionProfile[];
  onUpdateDbConnections: (profiles: DbConnectionProfile[]) => void;
  onAddDbConnection: (profile: Omit<DbConnectionProfile, 'id' | 'order' | 'createdAt'>) => void;
}

const ENGINE_LABELS: Record<DbEngine, string> = {
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  mssql: 'SQL Server',
  oracle: 'Oracle',
};

const DbConnectionsPanel: React.FC<DbConnectionsPanelProps> = ({
  hosts,
  dbConnections,
  onUpdateDbConnections,
  onAddDbConnection,
}) => {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [showHostSelector, setShowHostSelector] = useState(false);
  const [draft, setDraft] = useState(emptyDbConnectionDraft());
  const [editingId, setEditingId] = useState<string | null>(null);

  const hostById = new Map<string, Host>(hosts.map((h) => [h.id, h]));
  const filtered = dbConnections.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase()),
  );

  const openWorkspace = (connectionId: string) => {
    dbWorkspaceTabStore.openOrFocus(connectionId);
    activeTabStore.setActiveTabId(toDbWorkspaceTabId(connectionId));
  };

  const handleSave = () => {
    if (!canSaveDbConnectionDraft(draft)) return;
    const existing = editingId ? dbConnections.find((c) => c.id === editingId) : undefined;
    if (existing) {
      const updated = buildDbConnectionUpdate(draft, existing);
      onUpdateDbConnections(dbConnections.map((c) => (c.id === existing.id ? updated : c)));
    } else {
      onAddDbConnection(buildDbConnectionPayload(draft));
    }
    setDraft(emptyDbConnectionDraft());
    setEditingId(null);
    setShowNewForm(false);
  };

  const handleEdit = (conn: DbConnectionProfile) => {
    setDraft(draftFromDbConnection(conn));
    setEditingId(conn.id);
    setShowNewForm(true);
  };

  const handleDelete = (id: string) => {
    onUpdateDbConnections(dbConnections.filter((c) => c.id !== id));
  };

  return (
    <div className="flex h-full flex-col">
      <VaultPageHeader>
        <Button
          variant="secondary"
          className={vaultHeaderSecondaryButtonClass}
          onClick={() => { setDraft(emptyDbConnectionDraft()); setEditingId(null); setShowNewForm(true); }}
        >
          <Plus size={14} /> {t('db.connections.new')}
        </Button>
        <div className="ml-auto">
          <VaultHeaderSearch
            placeholder={t('common.searchPlaceholder')}
            className="w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </VaultPageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Database size={28} className="opacity-50" />
            {t('db.connections.empty')}
          </div>
        ) : (
          <div className="grid gap-2">
            {filtered.map((conn) => {
              const host = hostById.get(conn.hostId);
              return (
                <div
                  key={conn.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5"
                >
                  <Database size={16} className="shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{conn.label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {ENGINE_LABELS[conn.engine]} · {host?.label ?? conn.hostId} · {conn.remoteHost}:{conn.remotePort}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => openWorkspace(conn.id)}>
                    <Plug size={13} className="mr-1.5" /> {t('vault.hosts.connect')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit(conn)}
                    aria-label={t('action.edit')}
                  >
                    <Pencil size={13} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(conn.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showNewForm && (
        <AsidePanel
          open
          onClose={() => { setShowNewForm(false); setEditingId(null); }}
          title={editingId ? t('db.connections.edit') : t('db.connections.new')}
          width="w-[360px]"
        >
          <AsidePanelContent>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('db.connections.label')}</Label>
                <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </div>

              <div className="space-y-1.5">
                <Label>{t('db.connections.selectEngine')}</Label>
                <Select
                  value={draft.engine}
                  onValueChange={(value) => {
                    setDraft((prev) => applyEngineToDraft(prev, value as DbEngine));
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue>{ENGINE_LABELS[draft.engine]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="postgres">PostgreSQL</SelectItem>
                    <SelectItem value="mssql">SQL Server</SelectItem>
                    <SelectItem value="oracle">Oracle</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 rounded-lg border border-border/50 p-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.hostId)}
                    onChange={(e) => setDraft({ ...draft, hostId: e.target.checked ? draft.hostId : '' })}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  {t('db.connections.useTunnel')}
                </label>
                {draft.hostId ? (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setShowHostSelector(true)}
                  >
                    {hostById.get(draft.hostId)?.label ?? t('db.connections.selectHost')}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-muted-foreground"
                      onClick={() => setShowHostSelector(true)}
                    >
                      {t('db.connections.selectHost')}
                    </Button>
                    <p className="text-[11px] text-muted-foreground/70">{t('db.connections.directHint')}</p>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>{t('db.connections.remoteHost')}</Label>
                  <Input
                    value={draft.remoteHost}
                    onChange={(e) => setDraft({ ...draft, remoteHost: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('db.connections.remotePort')}</Label>
                  <Input
                    type="number"
                    value={draft.remotePort}
                    onChange={(e) => setDraft({ ...draft, remotePort: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t('db.connections.database')}</Label>
                <Input value={draft.database} onChange={(e) => setDraft({ ...draft, database: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('db.connections.username')}</Label>
                <Input value={draft.dbUsername} onChange={(e) => setDraft({ ...draft, dbUsername: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('db.connections.password')}</Label>
                <Input
                  type="password"
                  value={draft.dbPassword}
                  onChange={(e) => setDraft({ ...draft, dbPassword: e.target.value })}
                  placeholder={editingId ? t('db.connections.passwordKeep') : undefined}
                />
              </div>
            </div>
          </AsidePanelContent>
          <AsidePanelFooter>
            <Button
              className="w-full h-10"
              disabled={!canSaveDbConnectionDraft(draft)}
              onClick={handleSave}
            >
              {t('common.save')}
            </Button>
          </AsidePanelFooter>
        </AsidePanel>
      )}

      {showHostSelector && (
        <SelectHostPanel
          hosts={hosts}
          onBack={() => setShowHostSelector(false)}
          onSelect={(host) => {
            setDraft((prev) => ({ ...prev, hostId: host.id }));
            setShowHostSelector(false);
          }}
        />
      )}
    </div>
  );
};

export default DbConnectionsPanel;
