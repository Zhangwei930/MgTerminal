import { Database, Plug, Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { activeTabStore, toDbWorkspaceTabId } from '../../application/state/activeTabStore';
import { dbWorkspaceTabStore } from '../../application/state/dbWorkspaceTabStore';
import { defaultPortForEngine, type DbConnectionProfile, type DbEngine } from '../../domain/models';
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

function emptyDraft(): {
  label: string;
  engine: DbEngine;
  hostId: string;
  remoteHost: string;
  remotePort: number;
  database: string;
  dbUsername: string;
  dbPassword: string;
} {
  return {
    label: '',
    engine: 'mysql',
    hostId: '',
    remoteHost: '127.0.0.1',
    remotePort: defaultPortForEngine('mysql'),
    database: '',
    dbUsername: '',
    dbPassword: '',
  };
}

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
  const [draft, setDraft] = useState(emptyDraft());

  const hostById = new Map<string, Host>(hosts.map((h) => [h.id, h]));
  const filtered = dbConnections.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase()),
  );

  const openWorkspace = (connectionId: string) => {
    dbWorkspaceTabStore.openOrFocus(connectionId);
    activeTabStore.setActiveTabId(toDbWorkspaceTabId(connectionId));
  };

  const handleSave = () => {
    if (!draft.label.trim() || !draft.hostId) return;
    onAddDbConnection({
      label: draft.label.trim(),
      engine: draft.engine,
      hostId: draft.hostId,
      remoteHost: draft.remoteHost.trim() || '127.0.0.1',
      remotePort: draft.remotePort,
      database: draft.database.trim() || undefined,
      dbUsername: draft.dbUsername.trim() || undefined,
      dbPassword: draft.dbPassword || undefined,
    });
    setDraft(emptyDraft());
    setShowNewForm(false);
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
          onClick={() => { setDraft(emptyDraft()); setShowNewForm(true); }}
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
          onClose={() => setShowNewForm(false)}
          title={t('db.connections.new')}
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
                    const engine = value as DbEngine;
                    setDraft((prev) => ({
                      ...prev,
                      engine,
                      remotePort: prev.remotePort === defaultPortForEngine(prev.engine)
                        ? defaultPortForEngine(engine)
                        : prev.remotePort,
                    }));
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

              <div className="space-y-1.5">
                <Label>{t('db.connections.selectHost')}</Label>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setShowHostSelector(true)}
                >
                  {hostById.get(draft.hostId)?.label ?? t('db.connections.selectHost')}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Remote host</Label>
                  <Input
                    value={draft.remoteHost}
                    onChange={(e) => setDraft({ ...draft, remoteHost: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Port</Label>
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
                />
              </div>
            </div>
          </AsidePanelContent>
          <AsidePanelFooter>
            <Button
              className="w-full h-10"
              disabled={!draft.label.trim() || !draft.hostId}
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
