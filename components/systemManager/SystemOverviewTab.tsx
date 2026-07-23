import {
  Activity,
  ChevronDown,
  Clock3,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Radio,
} from 'lucide-react';
import React, { memo, useEffect, useId, useMemo, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { cn } from '../../lib/utils';
import { useServerStats } from '../terminal/hooks/useServerStats';
import { ResourceBar } from './ResourceBar';
import {
  SystemPanelCollapsible,
  SystemPanelEmpty,
  SystemPanelError,
  SystemPanelInlineError,
  SystemPanelLoading,
  SystemPanelShell,
} from './SystemPanelUi';

interface SystemOverviewTabProps {
  sessionId: string;
  isVisible: boolean;
  isSupportedOs: boolean;
  refreshIntervalSec: number;
}

interface OverviewSample {
  at: number;
  cpu: number;
  memory: number;
  disk: number;
  network: number;
}

type MetricTone = 'sky' | 'emerald' | 'amber' | 'cyan' | 'rose' | 'violet';

const TONE_STYLES: Record<MetricTone, {
  text: string;
  soft: string;
  border: string;
  glow: string;
  stroke: string;
  fill: string;
  bar: string;
}> = {
  sky: {
    text: 'text-sky-400',
    soft: 'bg-sky-500/10',
    border: 'border-sky-500/25',
    glow: 'shadow-[0_0_20px_-8px_rgba(56,189,248,0.45)]',
    stroke: 'stroke-sky-400',
    fill: 'fill-sky-400',
    bar: 'bg-sky-400',
  },
  emerald: {
    text: 'text-emerald-400',
    soft: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    glow: 'shadow-[0_0_20px_-8px_rgba(52,211,153,0.45)]',
    stroke: 'stroke-emerald-400',
    fill: 'fill-emerald-400',
    bar: 'bg-emerald-400',
  },
  amber: {
    text: 'text-amber-400',
    soft: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    glow: 'shadow-[0_0_20px_-8px_rgba(251,191,36,0.4)]',
    stroke: 'stroke-amber-400',
    fill: 'fill-amber-400',
    bar: 'bg-amber-400',
  },
  cyan: {
    text: 'text-cyan-400',
    soft: 'bg-cyan-500/10',
    border: 'border-cyan-500/25',
    glow: 'shadow-[0_0_20px_-8px_rgba(34,211,238,0.45)]',
    stroke: 'stroke-cyan-400',
    fill: 'fill-cyan-400',
    bar: 'bg-cyan-400',
  },
  rose: {
    text: 'text-rose-400',
    soft: 'bg-rose-500/10',
    border: 'border-rose-500/25',
    glow: 'shadow-[0_0_20px_-8px_rgba(251,113,133,0.4)]',
    stroke: 'stroke-rose-400',
    fill: 'fill-rose-400',
    bar: 'bg-rose-400',
  },
  violet: {
    text: 'text-violet-400',
    soft: 'bg-violet-500/10',
    border: 'border-violet-500/25',
    glow: 'shadow-[0_0_20px_-8px_rgba(167,139,250,0.4)]',
    stroke: 'stroke-violet-400',
    fill: 'fill-violet-400',
    bar: 'bg-violet-400',
  },
};

function clampPercent(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Number(value)));
}

function ratioPercent(used: number | null | undefined, total: number | null | undefined): number | null {
  if (!Number.isFinite(used) || !Number.isFinite(total) || Number(total) <= 0) return null;
  return clampPercent((Number(used) / Number(total)) * 100);
}

function formatPercent(value: number | null | undefined, digits = 0): string {
  if (!Number.isFinite(value)) return '--';
  return `${Number(value).toFixed(digits)}%`;
}

function formatBytes(bytes: number): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

function formatThroughput(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatStorageGb(gb: number | null | undefined): string {
  if (!Number.isFinite(gb)) return '--';
  const value = Number(gb);
  if (value >= 1024) return `${(value / 1024).toFixed(1)} TB`;
  return `${value.toFixed(value >= 10 ? 0 : 1)} GB`;
}

function formatMemoryMb(mb: number | null | undefined): string {
  if (!Number.isFinite(mb)) return '--';
  const value = Number(mb);
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
  return `${Math.round(value)} MB`;
}

function formatDuration(seconds: number | null | undefined, t: ReturnType<typeof useI18n>['t']): string {
  if (!Number.isFinite(seconds) || Number(seconds) < 0) return '--';
  const totalHours = Math.floor(Number(seconds) / 3600);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((Number(seconds) % 3600) / 60);
  if (days > 0) return t('systemManager.overview.duration.daysHours', { days, hours });
  if (hours > 0) return t('systemManager.overview.duration.hoursMinutes', { hours, minutes });
  return t('systemManager.overview.duration.minutes', { minutes });
}

function formatLoad(loadAverage: number[] | undefined): string {
  if (!loadAverage || loadAverage.length === 0) return '--';
  return loadAverage.map((load) => load.toFixed(2)).join(' / ');
}

function formatClock(ts: number | null | undefined): string {
  if (!Number.isFinite(ts)) return '--';
  try {
    return new Date(Number(ts)).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '--';
  }
}

function severityTone(value: number | null | undefined, base: MetricTone): MetricTone {
  const clamped = clampPercent(value);
  if (clamped == null) return base;
  if (clamped >= 90) return 'rose';
  if (clamped >= 75) return 'amber';
  return base;
}

function buildSeriesPoints(
  values: number[],
  width: number,
  height: number,
  max: number,
  padY = 3,
): { x: number; y: number }[] {
  const safeValues = values.length > 1 ? values : [0, values[0] ?? 0];
  const usable = Math.max(1, height - padY * 2);
  return safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? width : (index / (safeValues.length - 1)) * width;
    const clamped = Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
    const y = height - padY - (clamped / max) * usable;
    return { x, y };
  });
}

/** Step-after interpolation: flat plateau at the previous value until the next sample lands,
 *  then a vertical jump — matches the HUD-style telemetry look instead of a smoothed line. */
function toStepPoints(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 2) return points;
  const stepped: { x: number; y: number }[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    stepped.push({ x: points[i].x, y: points[i - 1].y });
    stepped.push(points[i]);
  }
  return stepped;
}

function MetricTrend({
  values,
  max,
  tone,
  className,
}: {
  values: number[];
  max?: number;
  tone: MetricTone;
  className?: string;
}) {
  const width = 140;
  const height = 36;
  const finite = values.filter((value) => Number.isFinite(value));
  const computedMax = max ?? Math.max(1, ...finite);
  const points = buildSeriesPoints(values, width, height, computedMax, 3);
  const linePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `M0,${height} L${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} L${width},${height} Z`;
  const last = points[points.length - 1];
  const styles = TONE_STYLES[tone];
  const reactId = useId().replace(/:/g, '');
  const gradientId = `metric-trend-${tone}-${reactId}`;

  return (
    <svg className={cn('h-9 w-full overflow-visible', className)} viewBox={`0 0 ${width} ${height}`} role="img">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} className={styles.text} />
      <polyline
        points={linePoints}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(styles.text, 'drop-shadow-[0_0_4px_currentColor]')}
        vectorEffect="non-scaling-stroke"
      />
      {last && (
        <circle
          cx={last.x}
          cy={last.y}
          r="2.5"
          className={cn(styles.fill, 'system-monitor-pulse-dot')}
        />
      )}
    </svg>
  );
}

function FullWidthTelemetryChart({
  title,
  samplesLabel,
  series,
}: {
  title: string;
  samplesLabel: string;
  series: Array<{
    key: string;
    label: string;
    values: number[];
    tone: MetricTone;
    max?: number;
    formatValue: (value: number) => string;
  }>;
}) {
  const width = 320;
  const height = 88;
  const reactId = useId().replace(/:/g, '');
  const sampleCount = Math.max(...series.map((s) => s.values.length), 0);

  const rendered = series.map((item) => {
    const finite = item.values.filter((v) => Number.isFinite(v));
    const max = item.max ?? Math.max(1, ...finite, 1);
    const points = buildSeriesPoints(item.values, width, height, max, 6);
    const stepPoints = toStepPoints(points);
    const linePoints = stepPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `M0,${height} L${stepPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} L${width},${height} Z`;
    const last = points[points.length - 1];
    const lastValue = item.values[item.values.length - 1] ?? 0;
    return { ...item, max, linePoints, area, last, lastValue, styles: TONE_STYLES[item.tone] };
  });

  return (
    <section
      data-section="system-manager-telemetry"
      className="mt-3 overflow-hidden rounded-lg border border-border/60 bg-muted/15 p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/10">
            <Activity size={12} className="text-violet-400" />
          </span>
          <span className="tracking-wide">{title}</span>
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{samplesLabel}</span>
      </div>

      <div className="system-monitor-telemetry-plot relative overflow-hidden rounded-md p-1.5">
        <svg className="h-[88px] w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
          <defs>
            {rendered.map((item) => (
              <linearGradient key={item.key} id={`telemetry-fill-${item.key}-${reactId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
              </linearGradient>
            ))}
          </defs>
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              x2={width}
              y1={height * ratio}
              y2={height * ratio}
              stroke="rgba(148,163,184,0.15)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {rendered.map((item) => (
            <g key={item.key} className={item.styles.text}>
              <path d={item.area} fill={`url(#telemetry-fill-${item.key}-${reactId})`} />
              <polyline
                points={item.linePoints}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="system-monitor-line-glow"
                vectorEffect="non-scaling-stroke"
              />
              {item.last && sampleCount > 0 && (
                <>
                  <circle
                    cx={item.last.x}
                    cy={item.last.y}
                    r="2.25"
                    className={cn(item.styles.fill, 'system-monitor-radar-ping')}
                  />
                  <circle
                    cx={item.last.x}
                    cy={item.last.y}
                    r="2.25"
                    className={cn(item.styles.fill, 'system-monitor-pulse-dot')}
                  />
                </>
              )}
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {rendered.map((item) => (
          <div
            key={item.key}
            className={cn(
              'flex items-center justify-between gap-1 rounded-md border px-2 py-1',
              item.styles.border,
              'bg-background/40',
            )}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', item.styles.bar)} />
              <span className="truncate text-[10px] text-muted-foreground">{item.label}</span>
            </div>
            <span className={cn('shrink-0 font-mono text-[10px] tabular-nums font-medium', item.styles.text)}>
              {item.formatValue(item.lastValue)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RadialGauge({
  value,
  tone,
  className,
}: {
  value: number | null;
  tone: MetricTone;
  className?: string;
}) {
  const clamped = clampPercent(value) ?? 0;
  const styles = TONE_STYLES[tone];
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);

  return (
    <div className={cn('relative h-[68px] w-[68px] shrink-0', className)}>
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="4.5"
          className="stroke-muted/60"
        />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="4.5"
          strokeLinecap="round"
          className={cn(styles.stroke, 'transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none')}
          style={{
            strokeDasharray: c,
            strokeDashoffset: offset,
            filter: `drop-shadow(0 0 4px currentColor)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[13px] font-semibold tabular-nums leading-none tracking-tight text-foreground">
          {formatPercent(value)}
        </span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  gaugeValue,
  trendValues,
  trendMax,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  gaugeValue: number | null;
  trendValues: number[];
  trendMax?: number;
  tone: MetricTone;
}) {
  const styles = TONE_STYLES[tone];
  const activeTone = severityTone(gaugeValue, tone);
  const activeStyles = TONE_STYLES[activeTone];

  return (
    <section
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-gradient-to-br from-muted/30 via-muted/10 to-transparent p-3',
        'transition-[border-color,box-shadow] duration-300',
        activeStyles.border,
        activeStyles.glow,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-40 blur-2xl transition-opacity group-hover:opacity-70',
          styles.soft,
        )}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md', styles.soft)}>
              <Icon size={12} className={styles.text} />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </span>
          </div>
          <div className="truncate text-xl font-semibold tabular-nums leading-tight tracking-tight text-foreground">
            {value}
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground/90">{detail}</div>
        </div>
        <RadialGauge value={gaugeValue} tone={activeTone} />
      </div>
      <MetricTrend values={trendValues} max={trendMax} tone={activeTone} className="relative mt-2" />
    </section>
  );
}

function InfoPill({
  label,
  value,
  tone = 'sky',
}: {
  label: string;
  value: string;
  tone?: MetricTone;
}) {
  return (
    <div
      className={cn(
        'relative min-w-0 overflow-hidden rounded-md border border-border/50 bg-background/50 px-2.5 py-2',
        'before:absolute before:inset-y-0 before:left-0 before:w-0.5',
        tone === 'sky' && 'before:bg-sky-400/70',
        tone === 'emerald' && 'before:bg-emerald-400/70',
        tone === 'amber' && 'before:bg-amber-400/70',
        tone === 'cyan' && 'before:bg-cyan-400/70',
        tone === 'rose' && 'before:bg-rose-400/70',
        tone === 'violet' && 'before:bg-violet-400/70',
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs font-medium text-foreground">
        {value || '--'}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  tone,
  trailing,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: MetricTone;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const styles = TONE_STYLES[tone];
  return (
    <section className={cn('rounded-lg border bg-muted/15', styles.border)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/25"
      >
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
          <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md', styles.soft)}>
            <Icon size={12} className={styles.text} />
          </span>
          <span className="tracking-wide truncate">{title}</span>
          {trailing}
        </div>
        <ChevronDown
          size={14}
          className={cn(
            'shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>
      <SystemPanelCollapsible open={open}>
        <div className="border-t border-border/40 px-3 pb-3 pt-2.5">{children}</div>
      </SystemPanelCollapsible>
    </section>
  );
}

function LiveTelemetryBar({
  liveLabel,
  updatedLabel,
  lastUpdated,
  tick,
}: {
  liveLabel: string;
  updatedLabel: string;
  lastUpdated: number | null;
  tick: number;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        </span>
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
          <Radio size={11} className="opacity-80" />
          {liveLabel}
        </span>
        <span
          key={tick}
          className="system-monitor-tick h-1.5 w-1.5 rounded-full bg-emerald-400/80"
          aria-hidden
        />
      </div>
      <div className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        {updatedLabel} {formatClock(lastUpdated)}
      </div>
    </div>
  );
}

export const SystemOverviewTab = memo(function SystemOverviewTab({
  sessionId,
  isVisible,
  isSupportedOs,
  refreshIntervalSec,
}: SystemOverviewTabProps) {
  const { t } = useI18n();
  const [history, setHistory] = useState<OverviewSample[]>([]);
  const [tick, setTick] = useState(0);

  const {
    stats,
    error,
    isLoading: loading,
    refresh,
  } = useServerStats({
    sessionId,
    enabled: true,
    refreshInterval: refreshIntervalSec,
    isSupportedOs,
    isConnected: true,
    isVisible,
  });
  const hasStats = Boolean(stats.lastUpdated);

  const memoryPercent = ratioPercent(stats?.memUsed, stats?.memTotal);
  const diskPercent = clampPercent(stats?.diskPercent);
  const networkSpeed = (stats?.netRxSpeed ?? 0) + (stats?.netTxSpeed ?? 0);
  const networkGauge = Math.min(100, Math.log10(networkSpeed + 1) * 14);
  const loadOne = stats?.loadAverage?.[0] ?? null;
  const loadPercent = ratioPercent(loadOne, stats?.cpuCores);

  useEffect(() => {
    setHistory([]);
    setTick(0);
  }, [sessionId]);

  useEffect(() => {
    if (!isVisible || !hasStats) return;
    setHistory((prev) => {
      const next = [
        ...prev,
        {
          at: Date.now(),
          cpu: clampPercent(stats.cpu) ?? 0,
          memory: memoryPercent ?? 0,
          disk: diskPercent ?? 0,
          network: networkSpeed,
        },
      ];
      return next.slice(-32);
    });
    setTick((n) => n + 1);
  }, [diskPercent, hasStats, isVisible, memoryPercent, networkSpeed, stats.cpu]);

  const trends = useMemo(() => ({
    cpu: history.map((sample) => sample.cpu),
    memory: history.map((sample) => sample.memory),
    disk: history.map((sample) => sample.disk),
    network: history.map((sample) => sample.network),
  }), [history]);

  const showBlockingError = Boolean(error && !hasStats && !loading);
  const showInitialLoading = Boolean(loading && !hasStats);

  return (
    <SystemPanelShell section="system-manager-overview">
      {error && hasStats && !loading && (
        <SystemPanelInlineError
          message={error}
          onRetry={() => void refresh()}
          retryLabel={t('history.action.retry')}
          loading={loading}
        />
      )}

      {showBlockingError && error ? (
        <SystemPanelError message={error} onRetry={() => void refresh()} retryLabel={t('history.action.retry')} loading={loading} />
      ) : showInitialLoading ? (
        <SystemPanelLoading message={t('systemManager.overview.loading')} />
      ) : !hasStats ? (
        <SystemPanelEmpty icon={Activity} message={t('systemManager.overview.empty')} />
      ) : (
        <div className="system-monitor-surface relative flex-1 min-h-0 overflow-y-auto px-3 py-3">
          <div className="pointer-events-none absolute inset-0 system-monitor-grid opacity-[0.35]" />
          <div className="relative">
            <LiveTelemetryBar
              liveLabel={t('systemManager.overview.live')}
              updatedLabel={t('systemManager.overview.updated')}
              lastUpdated={stats.lastUpdated}
              tick={tick}
            />

            <div className="grid grid-cols-2 gap-2.5">
              <MetricCard
                label="CPU"
                value={formatPercent(stats.cpu, 1)}
                detail={stats.cpuCores ? t('systemManager.overview.cores', { count: String(stats.cpuCores) }) : '--'}
                icon={Cpu}
                gaugeValue={stats.cpu}
                trendValues={trends.cpu}
                trendMax={100}
                tone="sky"
              />
              <MetricCard
                label={t('systemManager.overview.memory')}
                value={formatPercent(memoryPercent, 1)}
                detail={`${formatMemoryMb(stats.memUsed)} / ${formatMemoryMb(stats.memTotal)}`}
                icon={MemoryStick}
                gaugeValue={memoryPercent}
                trendValues={trends.memory}
                trendMax={100}
                tone="emerald"
              />
              <MetricCard
                label={t('systemManager.overview.disk')}
                value={formatPercent(diskPercent, 1)}
                detail={`${formatStorageGb(stats.diskUsed)} / ${formatStorageGb(stats.diskTotal)}`}
                icon={HardDrive}
                gaugeValue={diskPercent}
                trendValues={trends.disk}
                trendMax={100}
                tone="amber"
              />
              <MetricCard
                label={t('systemManager.overview.network')}
                value={formatThroughput(networkSpeed)}
                detail={`${t('systemManager.overview.rx')} ${formatThroughput(stats.netRxSpeed)} · ${t('systemManager.overview.tx')} ${formatThroughput(stats.netTxSpeed)}`}
                icon={Network}
                gaugeValue={networkGauge}
                trendValues={trends.network}
                tone="cyan"
              />
            </div>

            <FullWidthTelemetryChart
              title={t('systemManager.overview.telemetry')}
              samplesLabel={t('systemManager.overview.samples', { count: String(history.length) })}
              series={[
                {
                  key: 'cpu',
                  label: 'CPU',
                  values: trends.cpu,
                  tone: 'sky',
                  max: 100,
                  formatValue: (v) => formatPercent(v, 1),
                },
                {
                  key: 'memory',
                  label: t('systemManager.overview.memory'),
                  values: trends.memory,
                  tone: 'emerald',
                  max: 100,
                  formatValue: (v) => formatPercent(v, 1),
                },
                {
                  key: 'disk',
                  label: t('systemManager.overview.disk'),
                  values: trends.disk,
                  tone: 'amber',
                  max: 100,
                  formatValue: (v) => formatPercent(v, 1),
                },
                {
                  key: 'network',
                  label: t('systemManager.overview.network'),
                  values: trends.network,
                  tone: 'cyan',
                  formatValue: (v) => formatThroughput(v),
                },
              ]}
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <InfoPill label={t('systemManager.overview.load')} value={formatLoad(stats.loadAverage)} tone="violet" />
              <InfoPill label={t('systemManager.overview.uptime')} value={formatDuration(stats.uptimeSeconds, t)} tone="sky" />
              <InfoPill label={t('systemManager.overview.system')} value={stats.osName || '--'} tone="emerald" />
              <InfoPill label={t('systemManager.overview.kernel')} value={stats.kernelRelease || '--'} tone="cyan" />
              <InfoPill
                label={t('systemManager.overview.swap')}
                value={`${formatMemoryMb(stats.swapUsed)} / ${formatMemoryMb(stats.swapTotal)}`}
                tone="amber"
              />
              <InfoPill
                label={t('systemManager.overview.latency')}
                value={Number.isFinite(stats.latencyMs) ? `${Math.round(stats.latencyMs ?? 0)} ms` : '--'}
                tone="rose"
              />
            </div>

            <div className="mt-3 space-y-2.5">
              <SectionCard
                title={t('systemManager.overview.cpuCores')}
                icon={Cpu}
                tone="sky"
                trailing={
                  <span className="ml-1 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {loadPercent !== null
                      ? `${t('systemManager.overview.load')} ${formatPercent(loadPercent)}`
                      : t('systemManager.overview.noData')}
                  </span>
                }
              >
                {stats.cpuPerCore.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {stats.cpuPerCore.slice(0, 12).map((core, index) => (
                      <ResourceBar
                        key={`core-${index}`}
                        label={`C${index + 1}`}
                        value={core}
                        tone="sky"
                        animated
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">{t('systemManager.overview.noData')}</div>
                )}
              </SectionCard>

              <SectionCard title={t('systemManager.overview.disks')} icon={HardDrive} tone="amber">
                {stats.disks.length > 0 ? (
                  <div className="space-y-2.5">
                    {stats.disks.slice(0, 5).map((disk) => (
                      <div key={disk.mountPoint} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="min-w-0 truncate font-mono text-foreground">{disk.mountPoint}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatStorageGb(disk.used)} / {formatStorageGb(disk.total)}
                          </span>
                        </div>
                        <ResourceBar label="" value={disk.percent} tone="amber" animated />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">{t('systemManager.overview.noDisks')}</div>
                )}
              </SectionCard>

              <SectionCard title={t('systemManager.overview.interfaces')} icon={Network} tone="cyan" defaultOpen={false}>
                {stats.netInterfaces.length > 0 ? (
                  <div className="space-y-2">
                    {stats.netInterfaces.slice(0, 5).map((iface) => {
                      const total = iface.rxSpeed + iface.txSpeed;
                      const activity = Math.min(100, Math.log10(total + 1) * 18);
                      return (
                        <div key={iface.name} className="space-y-1">
                          <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-[11px]">
                            <span className="min-w-0 truncate font-mono text-foreground">{iface.name}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {t('systemManager.overview.rx')} {formatThroughput(iface.rxSpeed)}
                              {' · '}
                              {t('systemManager.overview.tx')} {formatThroughput(iface.txSpeed)}
                            </span>
                          </div>
                          <ResourceBar label="" value={activity} tone="cyan" animated showPercent={false} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">{t('systemManager.overview.noInterfaces')}</div>
                )}
              </SectionCard>

              <SectionCard title={t('systemManager.overview.topProcesses')} icon={Clock3} tone="rose" defaultOpen={false}>
                {stats.topProcesses.length > 0 ? (
                  <div className="space-y-2.5">
                    {stats.topProcesses.slice(0, 5).map((proc) => (
                      <div key={`${proc.pid}-${proc.command}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="min-w-0 truncate text-foreground">{proc.command}</span>
                          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">PID {proc.pid}</span>
                        </div>
                        <ResourceBar label="MEM" value={proc.memPercent} tone="rose" animated />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">{t('systemManager.overview.noTopProcesses')}</div>
                )}
              </SectionCard>
            </div>
          </div>
        </div>
      )}
    </SystemPanelShell>
  );
});
