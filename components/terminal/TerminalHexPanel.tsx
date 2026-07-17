import React, { useEffect, useRef } from "react";
import { Copy, Eraser, X } from "lucide-react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { toast } from "../ui/toast";

export const TERMINAL_HEX_PANEL_HEIGHT_PX = 168;

export type TerminalHexPanelProps = {
  open: boolean;
  text: string;
  byteLength: number;
  onClose: () => void;
  onClear: () => void;
  className?: string;
};

export const TerminalHexPanel: React.FC<TerminalHexPanelProps> = ({
  open,
  text,
  byteLength,
  onClose,
  onClear,
  className,
}) => {
  const { t } = useI18n();
  const preRef = useRef<HTMLPreElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    if (!open) return;
    const el = preRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [open, text]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text || "");
      toast.success(t("terminal.hex.copied"));
    } catch {
      toast.error(t("terminal.hex.copyFailed"));
    }
  };

  return (
    <div
      className={cn(
        "absolute left-0 right-0 bottom-0 z-20 flex flex-col border-t border-[color:var(--terminal-ui-border)]",
        "bg-[color:var(--terminal-ui-bg)] text-[color:var(--terminal-ui-fg)]",
        className,
      )}
      style={{ height: TERMINAL_HEX_PANEL_HEIGHT_PX }}
      data-terminal-hex-panel="true"
    >
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[color:var(--terminal-ui-border)] shrink-0">
        <span className="text-[11px] font-medium opacity-90">
          {t("terminal.hex.title")}
        </span>
        <span className="text-[10px] opacity-60">
          {t("terminal.hex.bytes", { count: byteLength })}
        </span>
        <span className="text-[10px] opacity-50 truncate flex-1">
          {t("terminal.hex.hint")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[11px]"
          onClick={() => void handleCopy()}
          disabled={!text}
        >
          <Copy size={12} className="mr-1" />
          {t("terminal.hex.copy")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[11px]"
          onClick={onClear}
          disabled={!text}
        >
          <Eraser size={12} className="mr-1" />
          {t("terminal.hex.clear")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          aria-label={t("terminal.hex.close")}
        >
          <X size={12} />
        </Button>
      </div>
      <pre
        ref={preRef}
        className="flex-1 min-h-0 overflow-auto px-2 py-1 m-0 text-[11px] leading-[1.35] font-mono whitespace-pre select-text"
        onScroll={(event) => {
          const el = event.currentTarget;
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
          stickToBottomRef.current = distance < 24;
        }}
      >
        {text || t("terminal.hex.empty")}
      </pre>
    </div>
  );
};
