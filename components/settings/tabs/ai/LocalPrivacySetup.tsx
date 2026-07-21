import { CheckCircle2, HardDrive, Loader2, Shield, XCircle } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { AIPermissionMode, AIProviderId, ProviderConfig } from '../../../../infrastructure/ai/types';
import {
  hasLocalOpenAICompatProvider,
  isLocalOpenAICompatProviderId,
  type LocalOpenAICompatProviderId,
} from '../../../../infrastructure/ai/localProviders';
import { useI18n } from '../../../../application/i18n/I18nProvider';
import { Button } from '../../../ui/button';
import { SettingCard, Toggle } from '../../settings-ui';
import { ProviderIconBadge } from './ProviderIconBadge';
import { probeModelCapabilities } from '../../../../infrastructure/ai/modelCapabilityProbe';
import { getFetchBridge } from './types';

export const LocalPrivacySetup: React.FC<{
  providers: ProviderConfig[];
  globalPermissionMode: AIPermissionMode;
  onAddProvider: (providerId: AIProviderId) => void;
  onSetPermissionMode: (mode: AIPermissionMode) => void;
  strictLocalPrivacy: boolean;
  onSetStrictLocalPrivacy: (enabled: boolean) => void;
  onUpdateProvider: (id: string, updates: Partial<ProviderConfig>) => void;
}> = ({
  providers,
  globalPermissionMode,
  onAddProvider,
  onSetPermissionMode,
  strictLocalPrivacy,
  onSetStrictLocalPrivacy,
  onUpdateProvider,
}) => {
  const { t } = useI18n();
  const hasLocal = useMemo(() => hasLocalOpenAICompatProvider(providers), [providers]);
  const hasOllama = providers.some((p) => p.providerId === 'ollama');
  const hasLmStudio = providers.some((p) => p.providerId === 'lmstudio');
  const localProviders = providers.filter((p) => isLocalOpenAICompatProviderId(p.providerId));
  const [probingProviderId, setProbingProviderId] = useState<string | null>(null);
  const [probeErrors, setProbeErrors] = useState<Record<string, string>>({});

  const addLocal = (providerId: LocalOpenAICompatProviderId) => {
    if (providers.some((p) => p.providerId === providerId)) return;
    onAddProvider(providerId);
    if (globalPermissionMode === 'auto') {
      onSetPermissionMode('confirm');
    }
  };

  const setStrictMode = (enabled: boolean) => {
    onSetStrictLocalPrivacy(enabled);
    if (enabled && globalPermissionMode === 'auto') {
      onSetPermissionMode('confirm');
    }
  };

  const probeProvider = async (provider: ProviderConfig) => {
    const bridge = getFetchBridge();
    const modelId = provider.defaultModel?.trim() || '';
    if (!bridge?.aiFetch || !modelId) return;
    setProbingProviderId(provider.id);
    setProbeErrors((current) => ({ ...current, [provider.id]: '' }));
    try {
      const result = await probeModelCapabilities({ provider, fetch: bridge.aiFetch });
      if (result.ok === false) {
        setProbeErrors((current) => ({ ...current, [provider.id]: result.error }));
        return;
      }
      onUpdateProvider(provider.id, {
        modelCapabilities: {
          ...provider.modelCapabilities,
          [modelId]: {
            supportsTools: result.supportsTools,
            checkedAt: result.checkedAt,
          },
        },
      });
    } finally {
      setProbingProviderId(null);
    }
  };

  return (
    <SettingCard padded className="space-y-3 border-emerald-500/20 bg-emerald-500/[0.04]">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-500">
          <HardDrive size={16} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{t('ai.localPrivacy.title')}</p>
            {hasLocal && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <Shield size={10} />
                {t('ai.localPrivacy.badge')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('ai.localPrivacy.description')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={hasOllama}
          onClick={() => addLocal('ollama')}
        >
          <ProviderIconBadge providerId="ollama" size="sm" />
          {hasOllama ? t('ai.localPrivacy.addedOllama') : t('ai.localPrivacy.addOllama')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={hasLmStudio}
          onClick={() => addLocal('lmstudio')}
        >
          <ProviderIconBadge providerId="lmstudio" size="sm" />
          {hasLmStudio ? t('ai.localPrivacy.addedLmStudio') : t('ai.localPrivacy.addLmStudio')}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {t('ai.localPrivacy.safetyNote')}
      </p>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/55 bg-background/65 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{t('ai.localPrivacy.strictMode')}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {t('ai.localPrivacy.strictModeDescription')}
          </p>
        </div>
        <Toggle
          checked={strictLocalPrivacy}
          onChange={setStrictMode}
          ariaLabel={t('ai.localPrivacy.strictMode')}
        />
      </div>

      {globalPermissionMode === 'auto' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2">
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            {t('ai.localPrivacy.autoModeWarning')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => onSetPermissionMode('confirm')}
          >
            {t('ai.localPrivacy.useConfirmMode')}
          </Button>
        </div>
      )}

      {hasLocal && (
        <div className="space-y-2">
          {localProviders.map((provider) => {
            const modelId = provider.defaultModel?.trim() || '';
            const capability = modelId ? provider.modelCapabilities?.[modelId] : undefined;
            const error = probeErrors[provider.id];
            const probing = probingProviderId === provider.id;
            return (
              <div key={provider.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/45 bg-background/45 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-foreground">
                    {provider.name} · {modelId || t('ai.localPrivacy.selectModel')}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground/90">
                    {provider.baseURL || PROVIDER_HINT[provider.providerId as LocalOpenAICompatProviderId]}
                  </p>
                  {(capability || error) && (
                    <p className={`mt-1 flex items-center gap-1 text-[10px] ${capability?.supportsTools ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
                      {capability?.supportsTools ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                      {error
                        ? t('ai.localPrivacy.probeFailed', { detail: error })
                        : capability?.supportsTools
                          ? t('ai.localPrivacy.toolsSupported')
                          : t('ai.localPrivacy.toolsUnsupported')}
                    </p>
                  )}
                  {capability && !capability.supportsTools && !error && (
                    <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                      {t('ai.localPrivacy.toolsUnsupportedAdvice')}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  disabled={!modelId || probing || probingProviderId !== null}
                  onClick={() => void probeProvider(provider)}
                >
                  {probing && <Loader2 size={11} className="animate-spin" />}
                  {probing ? t('ai.localPrivacy.probing') : t('ai.localPrivacy.probe')}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </SettingCard>
  );
};

const PROVIDER_HINT: Record<LocalOpenAICompatProviderId, string> = {
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
};
