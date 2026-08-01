import Editor, { loader, type Monaco, type OnMount, useMonaco } from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useRef } from 'react';
import {
  buildSqlCompletions,
  resolveQualifiedTable,
  resolveQualifier,
  type SqlCompletionCandidate,
} from '../../domain/db/sqlCompletion';
import { useMagiesTerminalMonacoTheme } from '../../infrastructure/monaco/useMagiesTerminalMonacoTheme';

const viteEnv = import.meta.env ?? { BASE_URL: '/' };
const monacoBasePath = viteEnv.DEV
  ? './node_modules/monaco-editor/min/vs'
  : `${viteEnv.BASE_URL}monaco/vs`;
loader.config({ paths: { vs: monacoBasePath } });

export interface SqlCompletionSource {
  tables: DbSchemaTable[] | null;
  /** Resolves (and caches) the columns of one table. */
  getColumns: (table: string) => Promise<DbSchemaColumn[] | null>;
}

export interface SqlCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Cmd/Ctrl+Enter — run the current query. */
  onRun?: () => void;
  /** Live schema for completion. Absent means keywords only. */
  completionSource?: SqlCompletionSource;
}

/** Maps our engine-agnostic candidates onto Monaco's item kinds. */
function toMonacoKind(monacoInstance: Monaco, kind: SqlCompletionCandidate['kind']) {
  const kinds = monacoInstance.languages.CompletionItemKind;
  if (kind === 'keyword') return kinds.Keyword;
  if (kind === 'column') return kinds.Field;
  return kinds.Struct;
}

export const SqlCodeEditor: React.FC<SqlCodeEditorProps> = ({
  value,
  onChange,
  onRun,
  completionSource,
}) => {
  const monaco = useMonaco();
  const themeName = useMagiesTerminalMonacoTheme(monaco ?? undefined);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  // The provider is registered once and reads through this ref, so a schema
  // reload does not require tearing the registration down and back up.
  const completionRef = useRef(completionSource);
  completionRef.current = completionSource;

  useEffect(() => {
    const frame = requestAnimationFrame(() => editorRef.current?.layout());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!monaco) return;
    const provider = monaco.languages.registerCompletionItemProvider('sql', {
      // '.' so columns appear the moment the qualifier is typed; Monaco already
      // re-triggers on word characters.
      triggerCharacters: ['.', ' '],
      async provideCompletionItems(model, position) {
        const source = completionRef.current;
        const tables = source?.tables ?? [];
        const lineUpToCursor = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        let columns: DbSchemaColumn[] | null = null;
        const qualifier = resolveQualifier(lineUpToCursor);
        if (qualifier && source) {
          const table = resolveQualifiedTable(model.getValue(), qualifier, tables);
          if (table) columns = await source.getColumns(table);
        }

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        return {
          suggestions: buildSqlCompletions({ lineUpToCursor, tables, columns }).map((candidate) => ({
            label: candidate.label,
            kind: toMonacoKind(monaco, candidate.kind),
            insertText: candidate.label,
            detail: candidate.detail,
            // Schema names first: they are what the user cannot remember.
            sortText: candidate.kind === 'keyword' ? '1' : '0',
            range,
          })),
        };
      },
    });
    return () => provider.dispose();
  }, [monaco]);

  const handleMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor;
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
      () => onRunRef.current?.(),
    );
    requestAnimationFrame(() => editor.layout());
  }, []);

  return (
    <div className="relative h-full min-h-0">
      <Editor
        height="100%"
        language="sql"
        value={value}
        onChange={(next) => onChange(next ?? '')}
        onMount={handleMount}
        theme={themeName}
        loading={(
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          folding: true,
          renderLineHighlight: 'line',
          padding: { top: 8, bottom: 8 },
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  );
};
