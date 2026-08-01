import { AlertTriangle, Loader2, X } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { useDbClientBackend } from '../../application/state/useDbClientBackend';
import { buildSyncScript, diffSchemas, type SchemaSnapshot } from '../../domain/db/schemaDiff';
import type { DbConnectionProfile } from '../../domain/models';
import { Button } from '../ui/button';

interface DbSchemaDiffPanelProps {
  /** The connection whose schema is the source of truth. */
  sourceProfile: DbConnectionProfile;
  sourceSnapshot: () => Promise<SchemaSnapshot | null>;
  /** Other saved connections, offered as the comparison target. */
  candidates: DbConnectionProfile[];
  onClose: () => void;
  onScript: (sql: string) => void;
}

export const DbSchemaDiffPanel: React.FC<DbSchemaDiffPanelProps> = ({
  sourceProfile,
  sourceSnapshot,
  candidates,
  onClose,
  onScript,
}) => {
  const { t } = useI18n();
  const { connect, close, listTables, listColumns } = useDbClientBackend();
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * Reads a whole schema over a temporary connection. This is one query per
   * table, which is why it is only done on demand and shows progress — a
   * hundred-table schema is a hundred round trips.
   */
  const readTargetSchema = useCallback(
    async (profile: DbConnectionProfile): Promise<SchemaSnapshot> => {
      const connectionId = `diff-${profile.id}-${crypto.randomUUID()}`;
      const result = await connect({
        connectionId,
        engine: profile.engine,
        hostId: profile.hostId || undefined,
        remoteHost: profile.remoteHost,
        remotePort: profile.remotePort,
        database: profile.database,
        dbUsername: profile.dbUsername,
        dbPassword: profile.dbPassword,
      });
      if (!result?.success) throw new Error(result?.error || 'Could not connect to the target');

      try {
        const tableResult = await listTables(connectionId);
        if (!tableResult?.success) throw new Error(tableResult?.error || 'Could not read the target schema');
        const tables = (tableResult.tables ?? []).filter((table) => table.kind === 'table');

        const snapshot: SchemaSnapshot = { tables: [] };
        for (let i = 0; i < tables.length; i += 1) {
          setProgress(t('db.diff.reading', { done: i + 1, total: tables.length }));
          const columns = await listColumns(connectionId, tables[i].name);
          snapshot.tables.push({
            name: tables[i].name,
            columns: (columns?.columns ?? []).map((c) => ({
              name: c.name, dataType: c.dataType, nullable: c.nullable,
            })),
          });
        }
        return snapshot;
      } finally {
        // Always closes, including on a failure partway through the tables —
        // otherwise a failed comparison leaks a connection and its tunnel.
        await close(connectionId);
      }
    },
    [close, connect, listColumns, listTables, t],
  );

  const handleCompare = useCallback(async () => {
    const target = candidates.find((c) => c.id === targetId);
    if (!target) return;

    setBusy(true);
    setError(null);
    setProgress('');
    try {
      const source = await sourceSnapshot();
      if (!source) throw new Error('Could not read this connection\'s schema');
      const targetSchema = await readTargetSchema(target);
      const differences = diffSchemas(source, targetSchema);
      onScript(buildSyncScript(target.engine, differences, source));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }, [candidates, onClose, onScript, readTargetSchema, sourceSnapshot, targetId]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-medium">{t('db.diff.title')}</span>
        <button
          type="button"
          onClick={onClose}
          title={t('db.diff.close')}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
        <p className="text-muted-foreground">
          {t('db.diff.explain', { source: sourceProfile.label })}
        </p>

        {candidates.length === 0 ? (
          <div className="text-muted-foreground">{t('db.diff.noCandidates')}</div>
        ) : (
          <label className="block space-y-1">
            <span className="text-muted-foreground">{t('db.diff.target')}</span>
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              disabled={busy}
              className="w-full max-w-sm rounded border border-border/60 bg-background px-2 py-1 outline-none focus:border-primary/60"
            >
              <option value="">{t('db.diff.pick')}</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label} ({candidate.engine})
                </option>
              ))}
            </select>
          </label>
        )}

        {/* The script only ever adds things without being edited; say so before
            the user runs a comparison, not only in the file it produces. */}
        <p className="text-muted-foreground">{t('db.diff.safety')}</p>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void handleCompare()} disabled={!targetId || busy}>
            {busy && <Loader2 size={13} className="mr-1.5 animate-spin" />}
            {t('db.diff.compare')}
          </Button>
          {progress && <span className="text-muted-foreground">{progress}</span>}
        </div>

        {error && (
          <div className="flex items-start gap-1.5 text-destructive">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
      </div>
    </div>
  );
};
