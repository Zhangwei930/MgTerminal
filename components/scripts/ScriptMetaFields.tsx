import React, { useMemo } from 'react';
import { useI18n } from '@/application/i18n/I18nProvider';
import type { ScriptTrigger, Snippet } from '@/domain/models';
import {
  isTriggerActionEnabled,
  toggleTriggerAction,
  type TriggerActionType,
} from '@/domain/triggerActions';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export interface ScriptMetaFieldsProps {
  snippet: Snippet;
  onChange: (snippet: Snippet) => void;
  layout?: 'stack' | 'toolbar';
}

export const ScriptMetaFields: React.FC<ScriptMetaFieldsProps> = ({
  snippet,
  onChange,
  layout = 'stack',
}) => {
  const { t } = useI18n();

  const triggerOptions = useMemo(() => ([
    { value: 'manual', label: t('scripts.trigger.manual') },
    { value: 'onConnect', label: t('scripts.trigger.onConnect') },
    { value: 'onOutput', label: t('scripts.trigger.onOutput') },
  ]), [t]);

  const actionOptions = useMemo(() => ([
    { type: 'runScript' as const, label: t('scripts.trigger.action.runScript') },
    { type: 'notify' as const, label: t('scripts.trigger.action.notify') },
    { type: 'sound' as const, label: t('scripts.trigger.action.sound') },
    { type: 'markTab' as const, label: t('scripts.trigger.action.markTab') },
    { type: 'startSessionLog' as const, label: t('scripts.trigger.action.startSessionLog') },
  ]), [t]);

  const setActionEnabled = (type: TriggerActionType, enabled: boolean) => {
    // Start from resolved list so toggling off "runScript" from legacy default works.
    const base = snippet.triggerActions === undefined || snippet.triggerActions === null
      ? [{ type: 'runScript' as const }]
      : snippet.triggerActions;
    const next = toggleTriggerAction(base, type, enabled);
    const isLegacyDefault = next.length === 1 && next[0]?.type === 'runScript';
    onChange({
      ...snippet,
      triggerActions: isLegacyDefault ? undefined : next,
    });
  };

  const renderActionToggles = (compact: boolean) => (
    <div className={compact ? 'col-span-full space-y-1.5' : 'col-span-2 space-y-1.5'}>
      <label className={compact
        ? 'text-[11px] font-medium text-muted-foreground'
        : 'text-xs font-semibold text-muted-foreground'}
      >
        {t('scripts.trigger.actions')}
      </label>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {actionOptions.map((option) => {
          const checked = isTriggerActionEnabled(snippet.triggerActions, option.type);
          return (
            <label
              key={option.type}
              className="inline-flex items-center gap-1.5 text-[11px] text-foreground cursor-pointer"
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={checked}
                onChange={(event) => setActionEnabled(option.type, event.target.checked)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      <p className={compact
        ? 'text-[10px] text-muted-foreground leading-relaxed'
        : 'text-[11px] text-muted-foreground leading-relaxed'}
      >
        {t('scripts.trigger.actionsHint')}
      </p>
    </div>
  );

  if (layout === 'toolbar') {
    return (
      <div className="flex flex-col gap-2 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_148px] gap-2 items-end">
          <div className="min-w-0 space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">{t('scripts.meta.name')}</label>
            <Input
              value={snippet.label}
              onChange={(event) => onChange({ ...snippet, label: event.target.value })}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">{t('scripts.meta.trigger')}</label>
            <Select
              value={snippet.trigger || 'manual'}
              onValueChange={(value) => onChange({
                ...snippet,
                trigger: value as ScriptTrigger,
              })}
            >
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {triggerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {snippet.trigger === 'onOutput' ? (
            <>
              <div className="col-span-full space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">{t('scripts.meta.triggerPattern')}</label>
                <Input
                  value={snippet.triggerPattern || ''}
                  onChange={(event) => onChange({ ...snippet, triggerPattern: event.target.value })}
                  placeholder="sudo.*password"
                  className="h-8 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground leading-relaxed">{t('scripts.trigger.onOutputHint')}</p>
              </div>
              {renderActionToggles(true)}
            </>
          ) : null}
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">{t('scripts.meta.description')}</label>
          <Input
            value={snippet.description || ''}
            onChange={(event) => onChange({ ...snippet, description: event.target.value })}
            className="h-8"
            placeholder={t('scripts.meta.descriptionPlaceholder')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground">{t('scripts.meta.name')}</label>
        <Input
          value={snippet.label}
          onChange={(event) => onChange({ ...snippet, label: event.target.value })}
          className="h-9"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground">{t('scripts.meta.description')}</label>
        <Textarea
          value={snippet.description || ''}
          onChange={(event) => onChange({ ...snippet, description: event.target.value })}
          rows={2}
          className="min-h-0 resize-none"
          placeholder={t('scripts.meta.descriptionPlaceholder')}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">{t('scripts.meta.trigger')}</label>
          <Select
            value={snippet.trigger || 'manual'}
            onValueChange={(value) => onChange({
              ...snippet,
              trigger: value as ScriptTrigger,
            })}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {triggerOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {snippet.trigger === 'onOutput' ? (
          <>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">{t('scripts.meta.triggerPattern')}</label>
              <Input
                value={snippet.triggerPattern || ''}
                onChange={(event) => onChange({ ...snippet, triggerPattern: event.target.value })}
                placeholder="sudo.*password"
                className="h-9 font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t('scripts.trigger.onOutputHint')}</p>
            </div>
            {renderActionToggles(false)}
          </>
        ) : null}
      </div>
    </div>
  );
};
