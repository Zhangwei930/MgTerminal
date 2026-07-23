import Editor, { loader, type Monaco, type OnMount, useMonaco } from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useRef } from 'react';
import { useMagiesTerminalMonacoTheme } from '../../infrastructure/monaco/useMagiesTerminalMonacoTheme';

const viteEnv = import.meta.env ?? { BASE_URL: '/' };
const monacoBasePath = viteEnv.DEV
  ? './node_modules/monaco-editor/min/vs'
  : `${viteEnv.BASE_URL}monaco/vs`;
loader.config({ paths: { vs: monacoBasePath } });

export interface SqlCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Cmd/Ctrl+Enter — run the current query. */
  onRun?: () => void;
}

export const SqlCodeEditor: React.FC<SqlCodeEditorProps> = ({ value, onChange, onRun }) => {
  const monaco = useMonaco();
  const themeName = useMagiesTerminalMonacoTheme(monaco ?? undefined);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  useEffect(() => {
    const frame = requestAnimationFrame(() => editorRef.current?.layout());
    return () => cancelAnimationFrame(frame);
  }, []);

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
