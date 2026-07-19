# Changelog


## [0.5.8] - 2026-07-19

### Security
- **Local file IPC hardening**: the local file read/write/delete/enumerate IPC handlers now validate the calling renderer's sender and reject webview/guest contexts, so a renderer XSS cannot escalate to arbitrary local file access (defense-in-depth)
- **Dependency hardening**: cleared all high-severity advisories in the production dependency tree: fast-uri → 4.1.1, fast-xml-parser → 5.10.1, fast-xml-builder → 1.3.0, hono → 4.12.31; and, scoped to the @cursor/sdk subtree, node-gyp → 11.4.2 and tar → 7.5.20 (scoped so native builds are unaffected)

## [0.5.7] - 2026-07-18

### Features
- **Opt-in anonymous crash reporting**: off by default; when enabled in Settings → System, sanitized crash summaries (no paths, usernames, hostnames, or session data) are sent to help fix crashes faster

## [0.5.6] - 2026-07-18

### Security
- **Encrypted HTTP inventory auth header**: the auth header (Authorization / API key) for json_http data sources is no longer stored in plaintext; it now uses vault field-level encryption, and existing plaintext values are migrated on first launch after upgrade
- **Dependency hardening**: undici → 6.27.0, DOMPurify → 3.4.12, uuid → 13.0.2, clearing reachable XSS and request-smuggling / DoS advisories that the stale overrides still matched

## [0.5.5] - 2026-07-18

### Fixes
- **False "Update Failed" toasts**: check-phase feed errors are no longer treated as download failures; clear in-flight check state after every IPC check
- **Windows arm64 update channel**: use `latest-arm64.yml` so arm64 clients do not pull x64 installers
- **More reliable update check/download path**: dual-source feed + UI state machine alignment reduces false errors from concurrent checks

## [0.5.4] - 2026-07-18

### Security
- **Vault unlock boundary**: disable/change PIN and WebAuthn enroll/clear require unlock or current PIN; PIN attempt rate limiting
- **SSH diagnostics/health**: abort before auth when host key is unknown/changed so passwords are never offered to a MITM
- **Session follow**: AES-GCM E2E sealing of LAN/WAN app frames with invite token; opaque relay forward; reject fake wss/ws TLS
- **Credential IPC**: validate sender on vault unlock and encrypt/decrypt handlers
- **Temp dir / RDP / deep links / logs / AI attachments**: 0700+symlink-safe temp dir, immediate cmdkey cleanup on RDP launch failure, Telnet/JMS confirm, no kbd-int response logging, attachment size caps

### Fixes
- Health probes support keyboard-interactive password auth; changelog dialog scrolls
- AI can send attachment-only messages; SFTP/port-forward honor verifyHostKeys typing

### Engineering
- Add `npm run typecheck`; fix a first batch of production type errors (vault/WebAuthn/update/SFTP)

## [0.5.3] - 2026-07-18

### Fixes
- **Changelog dialog scroll**: long release notes can be scrolled when they exceed the dialog viewport

### Improvements
- Fix latest-version change count wording; fill missing What's New strings for all 10 UI languages

## [0.5.2] - 2026-07-18

### Features
- **Local-first team vault**: metadata-only host inventory packages, roles (owner/editor/viewer), and HMAC-signed audit; passwords and private keys never leave the device
- **Session follow over WAN relay**: TCP NDJSON relay for NAT-friendly co-viewing; embedded local relay or self-hosted `scripts/follow-relay.cjs`
- **Device passkey vault unlock**: WebAuthn platform authenticators (Touch ID / Windows Hello / security key) verified in the main process; not multi-device cloud sync
- **Built-in ssh2 hybrid post-quantum KEX**: prefers `mlkem768x25519-sha256`, falls back to classical algorithms when unsupported
- **RDP host support**: launch the system remote-desktop client from Vault (Windows mstsc, macOS Windows App, Linux xfreerdp)
- **System OpenSSH jump and proxy**: jump chains and HTTP/SOCKS proxies work for system OpenSSH sessions

### Improvements
- **Global UI component refresh**: consistent radius, soft shadows, and focus rings across buttons, inputs, popovers, aside panels, empty states, and toasts
- **AI sidebar polish**: Q&A layout, model/permission controls, square thinking spinner, and input typography
- **Changelog dialog redesign**: collapsible versions, section coloring, and locale-matched release notes

## [0.5.0] - 2026-07-17

### Features
- **Terminal Hex/Raw stream diagnostics panel**: optional byte-by-byte view of raw session input/output, for debugging encoding/escape-sequence issues
- **JSON host source**: pull host inventories from a local JSON file or HTTP(S) endpoint (CMDB / Ansible / custom API style); metadata only, inventories containing secrets are rejected; HTTP auth headers supported
- **Host inventory sharing and import**: export metadata-only inventories for team handover (including Ansible YAML format), import from clipboard
- **Named workspace templates**: save host bindings, split layouts, and optional cwd/startup commands as templates; apply with one click from the quick switcher
- **Connection log bookmarks**: playback position bookmarks + notes + search jumping; log list shows bookmark counts
- **Port forwarding live channel view**: per-connection source, target, and traffic byte statistics for local/remote/dynamic forwards
- **Script onOutput trigger action extensions**: matching output patterns can fire desktop notifications, sounds, tab markers, or start session recording
- **Safe paste and precise broadcast**: multi-line paste delay / wait-for-prompt / dangerous-command confirmation; broadcast can target workspace/selected/group/window precisely
- **System OpenSSH channel enhancements**: GSSAPI/Kerberos and post-quantum (PQ) algorithms supported via system OpenSSH; jump chains and HTTP/SOCKS proxies available
- **Built-in ssh2 hybrid post-quantum KEX**: prefers `mlkem768x25519-sha256` (ML-KEM-768 + X25519) with classical fallback; no longer requires system ssh
- **RDP host support**: enable RDP on Vault hosts and launch the system remote-desktop client (Windows mstsc, macOS Windows App, Linux xfreerdp)
- **Changelog follows UI language**: in-app release notes render in the current UI locale (10 languages)

### Windows ARM64
- **win-arm64 installers now bundle mosh / ET**: MoshMagies 0.1.9 and EternalTerminal 6.2.10 debut native Windows arm64 binaries
- **Dedicated win-arm64 auto-update feed**: update metadata moves to the dedicated `latest-arm64.yml` channel instead of following x64 updates (previously arm64 updates installed the x64 package and ran under emulation)

## [0.4.10] - 2026-07-17

### Features
- **SSH connection diagnostics center**: "Test connection" in the host edit panel + "Run diagnostics" on connection failure, with step-by-step checks for DNS / TCP / jump host / host key / auth / SFTP
- **SSH agent as a first-class auth method**: hosts can explicitly select agent auth, view key fingerprints in the agent, and pick a preferred identity; connection logs record the actual auth method used
- **Multi-host health snapshot**: one-click batch check of latency, auth, and load/memory/disk from the Vault; filter unhealthy hosts and run scripts against them
- **SFTP reliability phase 1**: resumable transfers, automatic backoff retries on failure, persistent transfer queue (survives restarts), optional SHA-256 verification
- **Productization onboarding**: three-step guide for a first empty Vault; quick-switcher command items (settings/import/health check, etc.); empty-state migration hints; first-successful-connection tips; README feature matrix

### Fixes
- Users upgrading an existing Vault no longer see the first-run guide; health checks now correctly close jump connections when auth fails

## [0.4.9] - 2026-07-17

### Improvements
- **Releases and auto-update feed moved to a dedicated release repository**: installers and update metadata are now published in the MgTerminal-releases repository; website downloads and in-app auto-update are unchanged, and older clients keep receiving updates via redirects from the original URLs

## [0.4.8] - 2026-07-16

### Features
- **Quick Connect supports EternalTerminal**: the QuickConnect wizard adds an ET protocol entry (SSH port + ET service port, default 2022); matching ET client binaries are bundled (macOS / Linux / Windows x64)
- **Credential self-check**: Settings → System → Credential protection adds "Self-check" — an encrypt/decrypt round-trip probe plus a credential-store scan that lists the exact entries this device cannot decrypt (hosts / keys / identities / groups / proxies), making it easy to locate credentials that need re-entry after a keychain failure
- **First Windows ARM64 installer**: new win-arm64 build (mosh / et not bundled yet; auto-update temporarily follows the x64 feed)
- **Session restore expiry cleanup**: restore layouts older than 14 days are discarded on startup instead of restoring piles of stale placeholders

### Fixes
- **Russian UI: 203 missing strings filled in** (the whole scripts / automation / recording namespace previously fell back to English), plus 3 for Simplified Chinese; a new full-parity test prevents regressions
- Quick Connect for Mosh previously collected a custom mosh-server path without applying it; it is now written to the host config correctly

### Improvements
- SFTP select-all (Cmd/Ctrl+A) and list rendering now share a single visibility rule, eliminating behavior drift with hidden files / filter terms
- README macOS notes now match the actual release process (unsigned, with Gatekeeper bypass steps; in-app updates unaffected)

## [0.4.7] - 2026-07-15

### Features
- **UI languages expanded to 10**: client and website aligned; added 日本語 / 한국어 / Deutsch / Français / Español / Português (existing en / ru / zh-CN / zh-TW retained)
- Settings → Appearance → Language offers all supported languages; untranslated strings still fall back to English

## [0.4.6] - 2026-07-15

### Security
- **Disabling SSH host key verification is no longer silent**: with `verifyHostKeys` off (terminal sessions and mosh stats connections), an explicit warning is logged stating that any host key is being accepted without prompting
- **Persistent settings-page warning**: after turning off "Verify SSH host keys", a man-in-the-middle risk notice stays visible under the toggle (en / zh-CN / zh-TW). Default remains on

## [0.4.5] - 2026-07-15

### Fixes
- **401 / empty streams caused by nested ciphertext**: repeated saves during a keychain outage wrapped keys in layers of encryption (`enc:v2(enc:v1(...))`); with the decryption loop boundary fixed, multi-layer nesting within budget decrypts fully — no more "decrypted correctly then discarded" or false decryption failures
- **A single bad credential no longer breaks loading the whole credential store**: on field decryption failure the stored value is kept as-is (fail-soft), the store loads normally, and keys remain recoverable once the keychain is repaired
- **Web search API key**: after a decryption failure, focus/blur alone no longer wipes a saved key; explicit decrypt/encrypt failure notices added instead of silence
- **Windows DPAPI ciphertext detection fixed**: the anti-double-encryption guard previously missed DPAPI keys (`AQAAAN` header), so a keychain outage could re-encrypt them into nested ciphertext; now fixed
- **Cursor Agent**: decryption failures no longer inject ciphertext into the child process as an API key
- Unified across the Provider / Web search / Cursor settings: decryption failures now clearly prompt re-entering the key, and switching UI language no longer overwrites an unsaved key

## [0.4.4] - 2026-07-14

### Fixes
- **AI 401 / empty streams**: when API key decryption fails or the key has not synced to the main process, requests no longer go out with the `__IPC_SECURED__` placeholder; they fail immediately with a prompt to re-save the key
- Message sending now waits for providers to sync to the main process, avoiding race-induced auth failures
- Clear auth guidance when the local key is unusable (decryption failure / missing / leftover placeholder)

## [0.4.3] - 2026-07-14

### Fixes
- **API key decryption**: the main process now correctly decrypts `enc:v2` local-vault keys; on failure, ciphertext is no longer sent to providers as plaintext (avoiding 401s and the `…5Q==` suffix)
- **Credential placeholder recognition**: connection boundaries / cloud-sync guards now also recognize `enc:v2`, preventing local-vault ciphertext from being sent as a password or uploaded to sync
- Actionable error messages for model empty streams (`NoOutputGeneratedError`) and 401 auth failures
- Cursor SDK install detection switched to `require.resolve`, avoiding false "not installed" reports

## [0.4.2] - 2026-07-14

### Fixes
- **API key encryption failures fixed for good**: when the keychain (safeStorage) is unavailable, a local encrypted vault (`enc:v2`) is used automatically, so app updates no longer make API keys unsavable after Keychain ACL invalidation
- macOS still tries the system keychain first and falls back silently on failure; Settings → System shows the active backend

## [0.4.1] - 2026-07-14

### Improvements
- Theme picker: card previews (background + primary/secondary colors), Core / All scope toggle, search and empty states
- Default Snow / Midnight themes get higher contrast and card depth, with matching `ui-snow` / `ui-midnight` terminal palettes
- Unified selection states and visual hierarchy: Vault hosts/tree, SFTP list/tree/tab bar, settings navigation, AI sidebar, terminal top bar
- Terminal theme lists (dialog / sidebar) support search and clearer color swatch previews
- Hardcoded colors for sync status, info toasts, update badges, drag-drop highlights, etc. consolidated into theme tokens

## [0.4.0] - 2026-07-13

### Features
- Faster downloads and auto-updates for users in China: region auto-detected with a switch to a domestic mirror, with two-way GitHub fallback
- Settings "What's new" now shows per-version release notes in an in-app dialog instead of linking to GitHub
- New "Contact support" entry that copies the contact email
- SSH auto-reconnect now uses exponential backoff (from 5s up to 60s); after 10 consecutive failures it stops and prompts for manual reconnect
- Local/dynamic port forwarding reuses the already-authenticated terminal SSH connection, skipping a second password/2FA prompt
- Importing FIDO2 security keys (sk-*) now suggests switching to ssh-agent auth

### Changes
- Removed the "Report an issue" and "Community" GitHub entries from Settings

## [0.3.0] - 2026-07-13

### Fixes
- API key encryption failures during AI provider saves are no longer silently swallowed; a clear localized error appears under the API key field

## [0.2.9] - 2026-07-13

### Features
- macOS auto-update support: installs by replacing the bundle after download, bypassing Squirrel's restrictions on unsigned apps (from 0.2.9, all platforms can auto-upgrade)

### Fixes
- App icon keeps the official artwork's rounded base, consistent in light and dark modes

## [0.2.8] - 2026-07-13

### Fixes
- Windows package exiting silently on launch: afterPack now re-embeds the integrity hash after rewriting the asar, with a CI check to prevent regressions
- Update install progress and errors are now visible on all platforms

## [0.2.7] - 2026-07-13

### Fixes
- Windows now ships an architecture-safe x64 installer

## [0.2.6] - 2026-07-12

### Security
- The packaged tray window ignores `VITE_DEV_SERVER_URL` and blocks navigation / new windows
- preload no longer adds the dev server to trusted origins under `app.asar`
- Dependency overrides upgraded to DOMPurify 3.3.2 and undici 6.23.0, fixing a reachable XSS / decompression-chain DoS
- afterPack repairs the ASAR file integrity hash and syncs Info.plist, avoiding macOS crash-on-launch

### Fixes
- The Telnet auto-login integration test now waits for the command prompt before asserting the completion event

## [0.2.5] - 2026-07-12

### Fixes
- Hid the "GitHub source code" entry in the settings Community section
- "What's new" / issue links point to `JasonZhangDad/MgTerminal`, fixing 404s
- Fixed unresponsive "Restart now": the update-install quit is no longer cancelled by the async dirty check in before-quit
- "Restart and update" failures now show a clear message; platforms without auto-install open the Releases page instead

## [0.2.4] - 2026-07-12

### Security
- Credential saves stop when encryption is unavailable; falling back to plaintext is forbidden
- SSH deep links are off by default, URLs containing passwords are rejected, and connections require confirmation
- OSC52 clipboard access is off by default
- Tightened the Electron CSP, enabled ASAR integrity and security fuses
- Removed the macOS disable-library-validation entitlement

## [0.2.3] - 2026-07-11

### Fixes
- Fixed the packaged `app://` hostname being lowercased by Chromium, which made preload refuse to inject the Electron bridge and broke terminal, SFTP, settings, file pickers, and port forwarding
- Unified recognition of `app://magiesterminal` across the main window, settings window, and app permission checks, restoring clipboard and local font permissions

## [0.2.2] - 2026-07-11

### Fixes
- Host details "Select Color Theme": nested ScrollAreas made theme clicks unresponsive; switched to single-layer scrolling with pointerdown selection
- SSH key / local key file picker dialogs were not bound to a parent window, so macOS could not show them
- The Settings window failed to open under the `app://` protocol
- Sidebar and installer app icons updated to the new icon assets

## [0.2.1] - 2026-07-11

### CI/CD
- Re-enabled automated macOS and Windows builds (unsigned mode), providing out-of-the-box packages for more platforms.

## [0.2.0] - 2026-07-11

### Features
- Fixed auto-update IPC events being sent to a single window; now broadcast to all windows (main + settings both receive them)
- Unified the state machines for manual update checks and auto-updates, eliminating three parallel states
- Manual "Check for updates" detects versions via the GitHub API, then asynchronously triggers the electron-updater download when an update is found
- Download progress after clicking "Check for updates" in the settings window is reflected live in the UI
- The app automatically triggers an `electron-updater` check 5 seconds after startup, no manual click needed
- Downloads start automatically when a new version is found (`autoDownload=true`)
- A persistent toast appears when the download completes; clicking "Restart now" installs it
- A failed download shows an error toast with an "Open Releases" fallback
- The Settings > System progress bar shows live auto-download progress, driven by `useUpdateCheck`
- Linux deb/rpm/snap and other platforms unsupported by electron-updater are skipped automatically, keeping the original GitHub API notification behavior

### Design notes
- `broadcastToAllWindows` replaces the single-target `getSenderWindow`, guaranteeing every window receives IPC events
- The `manualCheckStatus` field tracks manual-check UI state (idle/checking/available/up-to-date/error) and is rendered alongside `autoDownloadStatus` by priority in the UI
- `SettingsSystemTab` no longer holds local update state; it receives the unified `useUpdateCheck` data one-way
- The two previously independent systems (GitHub API notifications + manual electron-updater downloads) merge into one state machine: `useUpdateCheck` is the single source of truth driving both the `App.tsx` toast and the `SettingsSystemTab` progress bar
- Global persistent IPC listeners are registered once in `autoUpdateBridge.init()`, avoiding repeated listener registration/cleanup per manual download request
- `autoInstallOnAppQuit=false`: no silent installs; the user triggers the restart

### Interface changes (SettingsSystemTabProps)
- Removed: `autoDownloadStatus`, `downloadPercent`
- Added: `updateState` (full UpdateState), `checkNow`, `installUpdate`, `openReleasePage`

### Notes
- `checkNow` semantics: uses the GitHub API (`performCheck`) to detect new versions; if an update exists and electron-updater has not started downloading, it asynchronously triggers `bridge.checkForUpdate()` to start the auto-download flow
- This only works in packaged apps (Windows NSIS, macOS dmg/zip, Linux AppImage); dev mode requires `forceDevUpdateConfig=true` + `dev-app-update.yml` for testing (see `.gitignore`)
- The old `hasUpdate` toast is suppressed while `autoDownloadStatus !== 'idle'`, avoiding duplicates with the new toast

### CI / build improvements
- Skipped macOS / Windows builds (which require paid code-signing certificates) to focus on free Linux packages
- Linux x64 (AlmaLinux 8) compiler upgrade: prefer Clang, fall back to gcc-toolset-13
- Linux arm64 (Debian Bullseye) compiler upgrade: from `build-essential` to `clang-14 + lld-14`
- The release job no longer depends on macOS/Windows builds; tag pushes publish a Release directly from Linux artifacts
- Softened deb artifact validation: missing files emit a warning instead of an error, so platform skips no longer fail CI
