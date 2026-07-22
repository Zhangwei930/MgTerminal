/**
 * Pre-paint boot script: applies the saved theme, accent and language to
 * <html> before React mounts, so the window does not flash the wrong colours.
 *
 * It lives in a file rather than inline because script-src has no
 * 'unsafe-inline' — as an inline block the CSP refused to run it at all.
 */
(function () {
  try {
    var theme = localStorage.getItem('magiesTerminal_theme_v1');
    var accentMode = localStorage.getItem('magiesTerminal_accent_mode_v1');
    var accentColor = localStorage.getItem('magiesTerminal_color_v1');
    var lang = localStorage.getItem('magiesTerminal_ui_language_v1');
    var root = document.documentElement;

    // Resolve 'system' (or absent — default is 'system') via OS preference
    var resolved = theme;
    if (!theme || theme === 'system') {
      resolved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    if (resolved === 'dark' || resolved === 'light') {
      root.classList.remove('light', 'dark');
      root.classList.add(resolved);
    }

    if (accentMode === 'custom' && accentColor) {
      root.style.setProperty('--primary', accentColor);
      root.style.setProperty('--accent', accentColor);
      root.style.setProperty('--ring', accentColor);
      var parts = accentColor.split(/\s+/);
      var lightness = parseFloat((parts[2] || '').replace('%', ''));
      var accentForeground = resolved === 'dark'
        ? '220 40% 96%'
        : (!isNaN(lightness) && lightness < 55 ? '0 0% 98%' : '222 47% 12%');
      root.style.setProperty('--accent-foreground', accentForeground);
      root.style.setProperty('--primary-foreground', accentForeground);
    }

    if (lang) root.lang = lang;

    var ua = navigator.userAgent || '';
    if (/Win/i.test(ua)) {
      root.classList.add('platform-win32');
    }
  } catch {
    // ignore
  }
})();
