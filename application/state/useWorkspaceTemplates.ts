import { useCallback, useEffect, useState } from "react";
import {
  normalizeWorkspaceTemplateStore,
  removeWorkspaceTemplate,
  renameWorkspaceTemplate,
  upsertWorkspaceTemplate,
  type WorkspaceTemplate,
  type WorkspaceTemplateStore,
} from "../../domain/workspaceTemplates";
import { STORAGE_KEY_WORKSPACE_TEMPLATES } from "../../infrastructure/config/storageKeys";
import {
  LOCAL_STORAGE_ADAPTER_CHANGED_EVENT,
  localStorageAdapter,
} from "../../infrastructure/persistence/localStorageAdapter";

const readStore = (): WorkspaceTemplateStore =>
  normalizeWorkspaceTemplateStore(
    localStorageAdapter.read<WorkspaceTemplateStore>(STORAGE_KEY_WORKSPACE_TEMPLATES) ?? [],
  );

const writeStore = (store: WorkspaceTemplateStore): void => {
  localStorageAdapter.write(STORAGE_KEY_WORKSPACE_TEMPLATES, store);
};

export function useWorkspaceTemplates() {
  const [templates, setTemplates] = useState<WorkspaceTemplateStore>(() => readStore());

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key && detail.key !== STORAGE_KEY_WORKSPACE_TEMPLATES) return;
      setTemplates(readStore());
    };
    window.addEventListener(LOCAL_STORAGE_ADAPTER_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LOCAL_STORAGE_ADAPTER_CHANGED_EVENT, onChange);
  }, []);

  const commit = useCallback((next: WorkspaceTemplateStore) => {
    writeStore(next);
    setTemplates(next);
  }, []);

  const saveTemplate = useCallback((template: WorkspaceTemplate) => {
    commit(upsertWorkspaceTemplate(templates, {
      ...template,
      updatedAt: Date.now(),
    }));
  }, [commit, templates]);

  const deleteTemplate = useCallback((templateId: string) => {
    commit(removeWorkspaceTemplate(templates, templateId));
  }, [commit, templates]);

  const renameTemplate = useCallback((templateId: string, name: string) => {
    commit(renameWorkspaceTemplate(templates, templateId, name));
  }, [commit, templates]);

  return {
    templates,
    saveTemplate,
    deleteTemplate,
    renameTemplate,
  };
}
