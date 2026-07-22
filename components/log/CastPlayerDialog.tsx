/**
 * Plays back an asciinema cast v2 recording.
 *
 * The app could record `.cast` files but never open one, so a recording was a
 * write-only artefact. The file is read through a plain file input rather than
 * a new filesystem IPC channel — nothing here needs to reach outside the
 * renderer.
 */
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { FileUp, Pause, Play, RotateCcw } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import {
  castDurationSeconds,
  findCastEventIndexAt,
  parseAsciinemaCast,
  sliceCastOutputUpTo,
  type CastEvent,
} from "../../domain/sessionCastPlayback";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export interface CastPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SPEEDS = [1, 2, 4] as const;

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export const CastPlayerDialog: React.FC<CastPlayerDialogProps> = ({ open, onOpenChange }) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [events, setEvents] = useState<CastEvent[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  const duration = castDurationSeconds(events);
  // Index of the next event to write, so playback never re-writes output.
  const cursorRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const term = new XTerm({
      fontFamily: '"JetBrains Mono", "SF Mono", Monaco, Menlo, monospace',
      fontSize: 12,
      cursorBlink: false,
      disableStdin: true,
      convertEol: false,
      theme: { background: "#0b0f14", foreground: "#e6edf3" },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    try { fit.fit(); } catch { /* ignore */ }
    termRef.current = term;
    fitRef.current = fit;
    return () => {
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [open]);

  /** Rewind the terminal and replay everything up to `seconds` at once. */
  const seekTo = useCallback((seconds: number, list: CastEvent[]) => {
    const term = termRef.current;
    if (!term) return;
    term.reset();
    term.write(sliceCastOutputUpTo(list, seconds));
    cursorRef.current = findCastEventIndexAt(list, seconds);
    setElapsed(seconds);
  }, []);

  const handleFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPlaying(false);
    const parsed = parseAsciinemaCast(await file.text());
    if (!parsed.ok) {
      setEvents([]);
      setFileName(file.name);
      setError(t(`castPlayer.error.${parsed.error}`));
      return;
    }
    setError(null);
    setFileName(file.name);
    setSkipped(parsed.skipped);
    setEvents(parsed.events);
    cursorRef.current = 0;
    setElapsed(0);
    termRef.current?.reset();
  }, [t]);

  // The rAF loop reads elapsed without wanting to restart on every tick.
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;

  // Drive playback off wall-clock time rather than counting frames, so a
  // dropped frame skips ahead instead of slowing the recording down.
  useEffect(() => {
    if (!playing || events.length === 0) return;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const next = elapsedRef.current + ((now - last) / 1000) * speed;
      last = now;

      const term = termRef.current;
      if (term) {
        let chunk = "";
        while (cursorRef.current < events.length && events[cursorRef.current]!.time <= next) {
          const event = events[cursorRef.current]!;
          if (event.type === "o") chunk += event.data;
          cursorRef.current += 1;
        }
        if (chunk) term.write(chunk);
      }

      setElapsed(next);
      if (cursorRef.current >= events.length) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, events, speed]);

  const atEnd = events.length > 0 && cursorRef.current >= events.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("castPlayer.title")}</DialogTitle>
          <DialogDescription>{t("castPlayer.description")}</DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".cast,application/json,text/plain"
          className="hidden"
          onChange={(event) => void handleFile(event)}
        />

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={14} className="mr-1.5 shrink-0" />
            {t("castPlayer.open")}
          </Button>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {fileName || t("castPlayer.noFile")}
          </span>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && skipped > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t("castPlayer.skipped", { count: skipped })}
          </p>
        )}

        <div
          ref={containerRef}
          className="h-[22rem] w-full overflow-hidden rounded-md border border-border/60 bg-[#0b0f14] p-1"
        />

        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 shrink-0"
            disabled={events.length === 0}
            onClick={() => {
              if (atEnd) seekTo(0, events);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? t("castPlayer.pause") : t("castPlayer.play")}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            disabled={events.length === 0}
            onClick={() => { setPlaying(false); seekTo(0, events); }}
            aria-label={t("castPlayer.restart")}
          >
            <RotateCcw size={14} />
          </Button>

          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.001)}
            step={0.05}
            value={Math.min(elapsed, duration)}
            disabled={events.length === 0}
            onChange={(e) => { setPlaying(false); seekTo(Number(e.target.value), events); }}
            className="min-w-0 flex-1 accent-primary"
            aria-label={t("castPlayer.seek")}
          />

          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {formatClock(elapsed)} / {formatClock(duration)}
          </span>

          <div className="flex shrink-0 gap-1">
            {SPEEDS.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={speed === option ? "secondary" : "ghost"}
                className="h-7 px-2 text-[11px]"
                onClick={() => setSpeed(option)}
              >
                {option}x
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CastPlayerDialog;
