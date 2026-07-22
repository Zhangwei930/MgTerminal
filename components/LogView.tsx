import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { FileText, Download, Palette, X } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import { useLogBookmarks } from "../application/state/useLogBookmarks";
import {
  labelFromTerminalDataLine,
  terminalDataLineToOffset,
  type LogBookmark,
} from "../domain/logBookmarks";
import { cn } from "../lib/utils";
import { ConnectionLog, TerminalTheme } from "../types";
import { TERMINAL_THEMES } from "../infrastructure/config/terminalThemes";
import { useCustomThemes } from "../application/state/customThemeStore";
import { Button } from "./ui/button";
import { LogBookmarkPanel } from "./log/LogBookmarkPanel";
import { TerminalSearchBar } from "./terminal/TerminalSearchBar";
import { SEARCH_OPTIONS } from "./terminal/hooks/useTerminalSearch";
import ThemeCustomizeModal from "./terminal/ThemeCustomizeModal";

interface LogViewProps {
    log: ConnectionLog;
    defaultTerminalTheme: TerminalTheme;
    defaultFontSize: number;
    isVisible: boolean;
    onClose: () => void;
    onUpdateLog: (logId: string, updates: Partial<ConnectionLog>) => void;
}

const LogViewComponent: React.FC<LogViewProps> = ({
    log,
    defaultTerminalTheme,
    defaultFontSize,
    isVisible,
    onClose,
    onUpdateLog,
}) => {
    const { t, resolvedLocale } = useI18n();
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    // Deliberately local state, not the terminal's persisted search key: the
    // log viewer opening should not toggle search in live terminals.
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchFocusToken, setSearchFocusToken] = useState(0);
    const [searchMatchCount, setSearchMatchCount] = useState<{ current: number; total: number } | null>(null);
    const searchTermRef = useRef("");
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [isReady, setIsReady] = useState(false);
    const {
      bookmarks,
      addBookmark,
      updateBookmark,
      removeBookmark,
    } = useLogBookmarks(log.id);
    const [themeModalOpen, setThemeModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [previewTheme, setPreviewTheme] = useState<TerminalTheme | null>(null);

    // Subscribe to custom theme changes so editing triggers re-render
    const customThemes = useCustomThemes();
    const explicitThemeId = useMemo(() => {
        if (!log.themeId) return undefined;
        const exists = TERMINAL_THEMES.some((theme) => theme.id === log.themeId)
            || customThemes.some((theme) => theme.id === log.themeId);
        return exists ? log.themeId : undefined;
    }, [customThemes, log.themeId]);

    useEffect(() => {
        if (log.themeId && !explicitThemeId) {
            onUpdateLog(log.id, { themeId: undefined });
        }
    }, [explicitThemeId, log.id, log.themeId, onUpdateLog]);

    // Use log's saved theme/fontSize or fall back to defaults
    const currentTheme = useMemo(() => {
        if (previewTheme) {
            return previewTheme;
        }
        if (explicitThemeId) {
            return TERMINAL_THEMES.find(t => t.id === explicitThemeId)
                || customThemes.find(t => t.id === explicitThemeId)
                || defaultTerminalTheme;
        }
        return defaultTerminalTheme;
    }, [customThemes, defaultTerminalTheme, explicitThemeId, previewTheme]);

    const currentFontSize = log.fontSize ?? defaultFontSize;

    // Format date for display
    const formattedDate = useMemo(() => {
        const date = new Date(log.startTime);
        return date.toLocaleString(resolvedLocale || undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }, [log.startTime, resolvedLocale]);

    // Handle theme change
    const handleThemeChange = useCallback((themeId: string) => {
        onUpdateLog(log.id, { themeId });
    }, [log.id, onUpdateLog]);

    useEffect(() => {
        if (!themeModalOpen) {
            setPreviewTheme(null);
        }
    }, [themeModalOpen]);

    // Handle font size change
    const handleFontSizeChange = useCallback((fontSize: number) => {
        onUpdateLog(log.id, { fontSize });
    }, [log.id, onUpdateLog]);

    // Handle export
    const handleExport = useCallback(async () => {
        if (!log.terminalData || isExporting) return;

        setIsExporting(true);
        try {
            const { magiesTerminalBridge } = await import("../infrastructure/services/magiesTerminalBridge");
            const bridge = magiesTerminalBridge.get();
            if (bridge?.exportSessionLog) {
                await bridge.exportSessionLog({
                    terminalData: log.terminalData,
                    hostLabel: log.hostLabel,
                    hostname: log.hostname,
                    startTime: log.startTime,
                    format: 'txt',
                });
            }
        } catch (err) {
            console.error('Failed to export session log:', err);
        } finally {
            setIsExporting(false);
        }
    }, [log.terminalData, log.hostLabel, log.hostname, log.startTime, isExporting]);

    // Initialize terminal
    useEffect(() => {
        if (!containerRef.current || !isVisible) return;

        // Create terminal
        const term = new XTerm({
            fontFamily: '"JetBrains Mono", "SF Mono", Monaco, Menlo, monospace',
            fontSize: currentFontSize,
            cursorBlink: false,
            cursorStyle: "underline",
            allowProposedApi: true,
            disableStdin: true, // Read-only mode
            theme: currentTheme.colors,
            scrollback: 10000,
        });

        termRef.current = term;

        // Create fit addon
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        fitAddonRef.current = fitAddon;

        const searchAddon = new SearchAddon();
        term.loadAddon(searchAddon);
        searchAddonRef.current = searchAddon;

        // Open terminal
        term.open(containerRef.current);

        // Try to load WebGL addon for better performance
        try {
            const webglAddon = new WebglAddon();
            term.loadAddon(webglAddon);
        } catch {
            // WebGL not available, canvas renderer will be used
        }

        // Fit terminal
        setTimeout(() => {
            try {
                fitAddon.fit();
            } catch {
                // Ignore fit errors
            }
        }, 50);

        // Write terminal data if available
        if (log.terminalData) {
            term.write(log.terminalData);
        } else {
            // No terminal data available
            term.writeln("\x1b[2m--- No terminal data captured for this session ---\x1b[0m");
            term.writeln("");
            term.writeln(`\x1b[36mHost:\x1b[0m ${log.hostname}`);
            term.writeln(`\x1b[36mUser:\x1b[0m ${log.username}`);
            term.writeln(`\x1b[36mProtocol:\x1b[0m ${log.protocol}`);
            term.writeln(`\x1b[36mTime:\x1b[0m ${formattedDate}`);
            if (log.endTime) {
                const duration = Math.round((log.endTime - log.startTime) / 1000);
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                term.writeln(`\x1b[36mDuration:\x1b[0m ${minutes}m ${seconds}s`);
            }
        }

        setIsReady(true);

        // Cleanup
        return () => {
            term.dispose();
            termRef.current = null;
            fitAddonRef.current = null;
            searchAddonRef.current = null;
            setIsReady(false);
        };
        // Only re-create terminal when visibility or terminalData changes
        // Theme and font size updates are handled separately
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible, log.id, log.terminalData]);

    // Update theme instantly without recreating terminal
    useEffect(() => {
        if (termRef.current && isReady) {
            termRef.current.options.theme = currentTheme.colors;
        }
    }, [currentTheme, isReady]);

    // Update font size instantly without recreating terminal
    useEffect(() => {
        if (termRef.current && isReady) {
            termRef.current.options.fontSize = currentFontSize;
            // Refit after font size change
            setTimeout(() => {
                try {
                    fitAddonRef.current?.fit();
                } catch {
                    // Ignore fit errors
                }
            }, 10);
        }
    }, [currentFontSize, isReady]);

    // Handle resize
    useEffect(() => {
        if (!isVisible || !fitAddonRef.current) return;

        const handleResize = () => {
            if (fitAddonRef.current) {
                try {
                    fitAddonRef.current.fit();
                } catch {
                    // Ignore fit errors
                }
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        if (containerRef.current?.parentElement) {
            resizeObserver.observe(containerRef.current.parentElement);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [isVisible]);

    const isLocal = log.protocol === "local" || log.hostname === "localhost";

    const handleSearch = useCallback((term: string): boolean => {
        const searchAddon = searchAddonRef.current;
        if (!searchAddon || !term) {
            setSearchMatchCount(null);
            return false;
        }
        searchTermRef.current = term;
        searchAddon.clearDecorations();
        const found = searchAddon.findNext(term, SEARCH_OPTIONS);
        setSearchMatchCount(found ? { current: 1, total: 1 } : { current: 0, total: 0 });
        return found;
    }, []);

    const handleFindNext = useCallback((): boolean => {
        const term = searchTermRef.current;
        if (!searchAddonRef.current || !term) return false;
        return searchAddonRef.current.findNext(term, SEARCH_OPTIONS);
    }, []);

    const handleFindPrevious = useCallback((): boolean => {
        const term = searchTermRef.current;
        if (!searchAddonRef.current || !term) return false;
        return searchAddonRef.current.findPrevious(term, SEARCH_OPTIONS);
    }, []);

    const handleCloseSearch = useCallback(() => {
        setIsSearchOpen(false);
        setSearchMatchCount(null);
        searchAddonRef.current?.clearDecorations();
    }, []);

    // Cmd/Ctrl+F while the log viewer is on screen. Scoped to this component so
    // it cannot steal the shortcut from a terminal behind it.
    useEffect(() => {
        if (!isVisible) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() !== "f" || !(event.metaKey || event.ctrlKey)) return;
            if (!rootRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
            event.preventDefault();
            setIsSearchOpen(true);
            setSearchFocusToken((n) => n + 1);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isVisible]);

    const handleAddBookmark = useCallback(() => {
      const term = termRef.current;
      if (!term) return;
      const buffer = term.buffer.active;
      const line = Math.max(0, buffer.baseY + buffer.viewportY);
      const data = log.terminalData || "";
      const offset = terminalDataLineToOffset(data, line);
      // `line` is an xterm display-buffer index, which counts auto-wrapped rows
      // and reflects cursor movement from progress bars / full-screen apps. The
      // jump target (scrollToLine) uses that same index, so derive the label
      // from the rendered buffer row rather than the raw \n-split data — the two
      // diverge under wrapping/ANSI and produced mismatched labels.
      const displayLabel = buffer.getLine(line)?.translateToString(true)?.trim();
      const label = displayLabel && displayLabel.length > 0
        ? displayLabel.slice(0, 80)
        : labelFromTerminalDataLine(data, line);
      addBookmark({ line, offset, label });
    }, [addBookmark, log.terminalData]);

    const handleJumpBookmark = useCallback((bookmark: LogBookmark) => {
      const term = termRef.current;
      if (!term) return;
      try {
        term.scrollToLine(Math.max(0, bookmark.line));
      } catch {
        // ignore scroll errors
      }
    }, []);

    const handleUpdateBookmarkNote = useCallback((bookmarkId: string, note: string) => {
      updateBookmark(bookmarkId, { note });
    }, [updateBookmark]);

    return (
        <div ref={rootRef} className="h-full w-full flex flex-col bg-background">
            {/* Header */}
            <div className="flex h-9 items-center justify-between gap-3 px-3 py-1 border-b border-border/50 bg-secondary/30 shrink-0">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div
                        className={cn(
                            "h-6 w-6 shrink-0 rounded-md flex items-center justify-center",
                            isLocal
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "bg-primary/10 text-primary"
                        )}
                    >
                        <FileText size={14} />
                    </div>
                    <div className="flex min-w-0 flex-1 items-baseline gap-2">
                        <div className="min-w-0 text-sm font-medium leading-none truncate">
                            {isLocal ? t("logs.localTerminal") : log.hostname}
                        </div>
                        <div className="text-xs leading-none text-muted-foreground truncate">
                            {formattedDate} • {log.localUsername}@{log.localHostname}
                        </div>
                    </div>
                </div>
                <div className="flex h-7 shrink-0 items-center gap-1.5">
                    {/* Export button */}
                    {log.terminalData && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 h-7 px-2 text-xs"
                            onClick={handleExport}
                            disabled={isExporting}
                        >
                            <Download size={14} />
                            <span className="text-xs">{t("logView.export")}</span>
                        </Button>
                    )}

                    {/* Theme & font customization button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 h-7 px-2 text-xs"
                        onClick={() => setThemeModalOpen(true)}
                    >
                        <Palette size={14} />
                        <span className="text-xs">{t("logView.appearance")}</span>
                    </Button>

                    <span className="h-6 inline-flex items-center rounded bg-secondary px-2 text-xs text-muted-foreground">
                        {t("logView.readOnly")}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                        <X size={14} />
                    </Button>
                </div>
            </div>

            {/* Terminal + bookmark side panel */}
            <div className="flex-1 min-h-0 flex">
              <div
                  className="flex-1 overflow-hidden p-2 min-w-0 flex flex-col"
                  style={{ backgroundColor: currentTheme?.colors?.background || '#000000' }}
              >
                  <div ref={containerRef} className="flex-1 min-h-0 w-full" />
                  <TerminalSearchBar
                    isOpen={isSearchOpen}
                    focusToken={searchFocusToken}
                    onClose={handleCloseSearch}
                    onSearch={handleSearch}
                    onFindNext={handleFindNext}
                    onFindPrevious={handleFindPrevious}
                    matchCount={searchMatchCount}
                  />
              </div>
              <LogBookmarkPanel
                bookmarks={bookmarks}
                onAdd={handleAddBookmark}
                onJump={handleJumpBookmark}
                onUpdateNote={handleUpdateBookmarkNote}
                onRemove={removeBookmark}
                canAdd={Boolean(log.terminalData) && isReady}
              />
            </div>

            {/* Theme Customize Modal */}
            <ThemeCustomizeModal
                open={themeModalOpen}
                onClose={() => setThemeModalOpen(false)}
                currentThemeId={explicitThemeId}
                displayThemeId={currentTheme.id}
                currentFontSize={currentFontSize}
                onThemeChange={handleThemeChange}
                onThemeReset={() => onUpdateLog(log.id, { themeId: undefined })}
                onFontSizeChange={handleFontSizeChange}
                onPreviewThemeChange={setPreviewTheme}
            />
        </div>
    );
};

// Memoization comparison
const logViewAreEqual = (prev: LogViewProps, next: LogViewProps): boolean => {
    // Bookmarks are owned by an internal hook/store subscription, so identity
    // equality on log metadata is enough for memoization here.
    return (
        prev.log.id === next.log.id &&
        prev.log.themeId === next.log.themeId &&
        prev.log.fontSize === next.log.fontSize &&
        prev.log.terminalData === next.log.terminalData &&
        prev.isVisible === next.isVisible &&
        prev.defaultFontSize === next.defaultFontSize &&
        prev.defaultTerminalTheme.id === next.defaultTerminalTheme.id
    );
};

export default memo(LogViewComponent, logViewAreEqual);
