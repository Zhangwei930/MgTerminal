import { notify } from "../notification";
import { sessionActivityStore } from "./sessionActivityStore";
import type { TriggerAction } from "../../domain/triggerActions";
import type { Snippet } from "../../domain/models";

export type TriggerActionEffectContext = {
  sessionId: string;
  snippet: Snippet;
  matchedText?: string;
  startSessionLog?: (sessionId: string) => void | Promise<void>;
  runScript?: (snippet: Snippet, sessionId: string) => void | Promise<void>;
};

/** Best-effort beep via Web Audio (no asset dependency). */
export function playTriggerSound(): void {
  try {
    const AudioCtx = globalThis.AudioContext
      || (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.07;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + 0.16);
    osc.onended = () => {
      void ctx.close().catch(() => {});
    };
  } catch {
    // ignore audio failures
  }
}

export function showTriggerDesktopNotification(title: string, body: string): void {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
      return;
    }
    if (Notification.permission !== "denied") {
      void Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(title, { body });
        }
      });
    }
  } catch {
    // ignore
  }
}

export async function executeTriggerActions(
  actions: readonly TriggerAction[],
  ctx: TriggerActionEffectContext,
): Promise<void> {
  for (const action of actions) {
    try {
      switch (action.type) {
        case "runScript": {
          if (ctx.runScript) {
            await ctx.runScript(ctx.snippet, ctx.sessionId);
          }
          break;
        }
        case "notify": {
          const title = action.title?.trim() || ctx.snippet.label || "Trigger";
          const body = action.body?.trim()
            || (ctx.matchedText
              ? `Matched: ${ctx.matchedText.slice(0, 120)}`
              : `Output trigger: ${ctx.snippet.label || ctx.snippet.id}`);
          notify.info(body, title);
          showTriggerDesktopNotification(title, body);
          break;
        }
        case "sound": {
          playTriggerSound();
          break;
        }
        case "markTab": {
          sessionActivityStore.setTabActive(ctx.sessionId, true);
          break;
        }
        case "startSessionLog": {
          if (ctx.startSessionLog) {
            await ctx.startSessionLog(ctx.sessionId);
          }
          break;
        }
        default:
          break;
      }
    } catch {
      // Keep remaining actions running after one failure.
    }
  }
}
