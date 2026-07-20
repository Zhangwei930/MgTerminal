const process = require('node:process');
const { moshExtraResources } = require('./scripts/mosh-extra-resources.cjs');
const { etExtraResources } = require('./scripts/et-extra-resources.cjs');

function requestedArch() {
    return process.env.npm_config_arch || process.env.npm_config_target_arch || process.arch;
}

/**
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
    appId: 'top.magies.terminal',
    productName: 'MagiesTerminal',
    // Set explicitly: without this electron-builder derives the bundle's
    // copyright string (macOS NSHumanReadableCopyright, Windows file version
    // info) from package.json `author`, so the shipped binary's copyright
    // silently tracked whatever that field happened to say. Full licence and
    // attribution live in LICENSE and NOTICE at the repository root.
    copyright: 'Copyright © 2026 JasonZhangDad and the MagiesTerminal contributors',
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    protocols: [
        {
            name: 'SSH URL',
            schemes: ['ssh']
        },
        {
            name: 'Telnet URL',
            schemes: ['telnet']
        },
        {
            name: 'JumpServer URL',
            schemes: ['jms']
        }
    ],
    electronLanguages: ['en', 'en-US', 'zh_CN', 'zh-CN', 'zh_TW', 'zh-TW', 'ru'],
    // afterPack (scripts/afterPackMacUuid.cjs) does three things:
    //  1. All platforms: repairs per-file ASAR integrity hashes that
    //     electron-builder embeds incorrectly (transformed package.json).
    //  2. Windows: re-embeds the ASAR header hash into the exe's INTEGRITY/
    //     ELECTRONASAR resource after that repair — electron-builder writes it
    //     BEFORE afterPack, so without this the asar-integrity fuse kills the
    //     app at launch (v0.2.7 "Windows won't start" bug).
    //  3. macOS: refreshes ElectronAsarIntegrity in Info.plist, then gives the
    //     build a unique Mach-O LC_UUID before signing, so macOS Local Network
    //     privacy treats MagiesTerminal distinctly from every other Electron
    //     app (which all share Electron's prebuilt LC_UUID) — see #1040.
    beforePack: './scripts/beforePackCursorSdk.cjs',
    afterPack: './scripts/afterPackMacUuid.cjs',
    // Platform-split icons (#813):
    //   - public/icon.png keeps Apple's HIG grid margin so the rendered
    //     squircle sits at ~88% of the PNG canvas. macOS needs this —
    //     the dock renders icons with its own rounding/shadow and most
    //     third-party apps (#803) leave that grid margin alone so the
    //     squircle lines up with neighbors.
    //   - public/icon-win.png uses a tight-crop viewBox so the squircle
    //     fills 100% of the PNG. Windows / Linux taskbars render icons
    //     full-bleed, so the Apple margin showed up as visible padding,
    //     making the app icon look smaller than other apps in taskbar /
    //     Start menu / desktop shortcuts.
    icon: 'public/icon.png',
    // npmRebuild must stay enabled for macOS and Windows builds — without it,
    // node-pty's native module is not recompiled for the Electron ABI, causing
    // "posix_spawnp failed" on macOS. Linux builds set npm_config_arch in CI
    // and run ensure-node-pty-linux.sh before packaging, so the rebuild is
    // redundant but harmless there.
    npmRebuild: true,
    electronFuses: {
        runAsNode: false,
        enableCookieEncryption: true,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true
    },
    directories: {
        buildResources: 'build',
        output: 'release'
    },
    files: [
        'dist/**/*',
        'electron/**/*',
        // GPL-3.0 binaries should carry the licence text they are distributed
        // under, so ship LICENSE inside the app bundle rather than leaving it
        // only in the source repository.
        'LICENSE',
        // Main-process terminal flow control reads shared thresholds from here
        // (terminalFlowAck.cjs). Must ship beside electron/ in app.asar.
        'infrastructure/config/terminalFlowConstants.cjs',
        'infrastructure/config/terminalFlowConstants.json',
        'lib/**/*.cjs',
        'lib/**/*.json',
        'skills/**/*',
        '!public/**/*',
        '!**/*.map',
        '!**/*.d.ts',
        '!**/*.d.mts',
        '!**/*.d.cts',
        '!**/*.ts',
        '!**/*.tsx',
        '!**/*.test.*',
        '!**/*.spec.*',
        '!**/__tests__/**/*',
        '!**/test/**/*',
        '!**/tests/**/*',
        '!**/example/**/*',
        '!**/examples/**/*',
        '!node_modules/**/docs/**/*',
        '!node_modules/**/doc/**/*',
        '!node_modules/**/benchmark/**/*',
        '!node_modules/**/benchmarks/**/*',
        // Renderer-only packages are compiled into dist by Vite. Keep them
        // installed for npm run dev/build, but do not ship the duplicate source
        // packages in release artifacts.
        '!node_modules/@fontsource/**/*',
        '!node_modules/@monaco-editor/**/*',
        '!node_modules/@radix-ui/**/*',
        '!node_modules/@xterm/**/*',
        '!node_modules/lucide-react/**/*',
        '!node_modules/monaco-editor/**/*',
        '!node_modules/react/**/*',
        '!node_modules/react-dom/**/*',
        // Heavy cloud completion specs are intentionally not bundled. The main
        // process filters the same prefixes so dev and packaged builds behave
        // consistently.
        '!node_modules/@withfig/autocomplete/build/aws.js',
        '!node_modules/@withfig/autocomplete/build/aws/**/*',
        '!node_modules/@withfig/autocomplete/build/gcloud.js',
        '!node_modules/@withfig/autocomplete/build/gcloud/**/*',
        '!node_modules/@withfig/autocomplete/build/az/**/*',
        // Fig specs are already compiled JavaScript; TypeScript is only pulled
        // in by Fig helper packages as build tooling and is not needed at app
        // runtime.
        '!node_modules/typescript/**/*',
        // ── Exclude per-platform native agent binaries (~100s of MB each). ──
        // MagiesTerminal is "bring your own CLI": each SDK is pointed at the user's
        // system-installed CLI via an absolute path override (claude
        // pathToClaudeCodeExecutable / codex codexPathOverride / copilot cliPath).
        // Only the SDKs' JS is bundled; the heavy per-arch binaries are dropped.
        // NOTE: claude-agent-sdk vendors the `claude` binary as a NESTED package
        // (claude-agent-sdk/node_modules/@anthropic-ai/claude-agent-sdk-<arch>),
        // so this exclusion must match at any depth (**/), not just top-level.
        // The codex/copilot exclusions target only the per-arch binary packages
        // (codex-<arch> / copilot-<arch>) — NOT @openai/codex-sdk / copilot-sdk,
        // whose JS we DO bundle. @github/copilot is the full ~288MB CLI (with
        // per-platform prebuilds); magiesTerminal uses the user's copilot via cliPath,
        // so it is excluded entirely.
        '!**/@anthropic-ai/claude-agent-sdk-*/**/*',
        '!node_modules/@anthropic-ai/claude-code-*/**/*',
        '!node_modules/@openai/codex-{darwin,linux,linuxmusl,win32}-*/**/*',
        '!node_modules/@github/copilot-{darwin,linux,linuxmusl,win32}-*/**/*',
        '!node_modules/@github/copilot/**/*',
        '!node_modules/opencode-{darwin,linux,linuxmusl,windows}-*/**/*',
        '!node_modules/opencode-ai/**/*',
        // CodeBuddy follows the same first-party integration model as the
        // other coding agents: MagiesTerminal discovers and passes the user's
        // installed CLI path to the SDK. Keep the small SDK wrapper, but do not
        // bundle the full CodeBuddy CLI payload (rg vendors + web UI).
        '!node_modules/@tencent-ai/agent-sdk/cli/**/*',
        // MagiesTerminal loads Cursor SDK through ESM dynamic import, so the duplicate
        // CommonJS build and type metadata are not needed at runtime.
        '!node_modules/@cursor/sdk/dist/cjs/**/*',
        '!node_modules/@cursor/sdk/dist/**/*.d.ts',
        '!node_modules/@cursor/sdk/dist/**/*.d.ts.map',
        // sqlite3 rebuilds a native module for Electron; its upstream source
        // tarball is build-time payload only.
        '!node_modules/sqlite3/deps/**/*'
    ],
    asarUnpack: [
        'node_modules/node-pty/**/*',
        'node_modules/ssh2/**/*',
        'node_modules/cpu-features/**/*',
        'node_modules/@vscode/windows-process-tree/**/*',
        'node_modules/@anthropic-ai/claude-agent-sdk/**/*',
        'node_modules/@cursor/sdk-*/**/*',
        'node_modules/sqlite3/**/*',
        'node_modules/@modelcontextprotocol/sdk/**/*',
        'lib/**/*.cjs',
        'lib/**/*.json',
        'node_modules/zod/**/*',
        'node_modules/zod-to-json-schema/**/*',
        'node_modules/ajv/**/*',
        'node_modules/ajv-formats/**/*',
        'node_modules/fast-deep-equal/**/*',
        'node_modules/fast-uri/**/*',
        'node_modules/json-schema-traverse/**/*',
        'electron/cli/**/*',
        'electron/capabilities/**/*',
        'electron/shared/**/*',
        'electron/mcp/**/*',
        'skills/**/*'
    ],
    mac: {
        target: [
            {
                target: 'dmg',
                arch: ['arm64', 'x64']
            },
            {
                target: 'zip',
                arch: ['arm64', 'x64']
            }
        ],
        category: 'public.app-category.developer-tools',
        hardenedRuntime: true,
        notarize: true,
        entitlements: 'electron/entitlements.mac.plist',
        entitlementsInherit: 'electron/entitlements.mac.plist',
        extendInfo: {
            NSCameraUsageDescription: 'MagiesTerminal may use the camera for video calls',
            NSMicrophoneUsageDescription: 'MagiesTerminal may use the microphone for audio',
            NSLocalNetworkUsageDescription: 'MagiesTerminal needs local network access for SSH connections',
            CFBundleDocumentTypes: [
                {
                    CFBundleTypeName: 'Folder',
                    CFBundleTypeRole: 'Viewer',
                    LSHandlerRank: 'Alternate',
                    LSItemContentTypes: ['public.folder']
                }
            ]
        },
        extraResources: [...moshExtraResources('darwin'), ...etExtraResources('darwin')]
    },
    dmg: {
        title: '${productName}',
        iconSize: 100,
        iconTextSize: 12,
        window: {
            width: 540,
            height: 380
        },
        contents: [
            { x: 140, y: 158 },
            { x: 400, y: 158, type: 'link', path: '/Applications' }
        ]
    },
    win: {
        icon: 'public/icon-win.png',
        // CI currently prepares Windows native dependencies for x64 only.
        // Let the --x64 CLI flag select the architecture so electron-builder
        // does not also emit ARM64 and combined installers with x64 payloads.
        target: ['nsis', 'portable', 'zip'],
        extraResources: [...moshExtraResources('win32'), ...etExtraResources('win32')],
        // The arm64 build publishes its update metadata on its own channel
        // (latest-arm64.yml) so it cannot clobber the x64 latest.yml in the
        // release assets, and arm64 installs update to arm64 payloads.
        ...(requestedArch() === 'arm64'
            ? {
                publish: [
                    {
                        provider: 'github',
                        owner: 'JasonZhangDad',
                        repo: 'MgTerminal-releases',
                        releaseType: 'release',
                        channel: 'latest-arm64'
                    }
                ]
            }
            : {})
    },
    portable: {
        artifactName: '${productName}-${version}-portable-${os}-${arch}.${ext}',
    },
    nsis: {
        oneClick: false,
        perMachine: false,
        allowElevation: true,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'MagiesTerminal'
    },
    linux: {
        // Linux .deb/.rpm/AppImage icons come from build/icons/* (see
        // scripts/generate-linux-icons.sh). Point at the icons directory
        // under buildResources — electron-builder still falls back to the
        // top-level icon (public/icon.png) when linux.icon is unset, which
        // installs only hicolor/1024x1024 and launchers miss the icon (#274,
        // #1340). Do NOT set linux.icon to a single 1024px PNG either.
        icon: 'icons',
        // Keep the Linux binary/icon basename aligned with the rebrand:
        // package.json "name" is magies-terminal, but install layout,
        // Icon=magiesTerminal, and verify-linux-deb-artifact.sh expect
        // /opt/MagiesTerminal/magiesTerminal.
        executableName: 'magiesTerminal',
        target: ['AppImage', 'deb', 'rpm', 'pacman'],
        category: 'Development',
        extraResources: [...moshExtraResources('linux'), ...etExtraResources('linux')]
    },
    deb: {
        // Use gzip instead of default xz(lzma) for better compatibility with
        // Deepin OS and other distros that have issues with lzma decompression
        compression: 'gz'
    },
    rpm: {
        // Default fpm/electron-builder RPM compression is "xzmt" (multi-threaded
        // xz). AlmaLinux/RHEL 8 images provide `xz` but not the `xzmt` shim, so
        // rpmbuild fails with exit 127 during packaging. gzip is portable and
        // matches our deb preference for older distros.
        compression: 'gzip',
        fpm: [
            // Avoid rpm's generated /usr/lib/.build-id symlinks. Those hashes
            // are global on the host, so owning them can conflict with other RPMs.
            '--rpm-rpmbuild-define', '_build_id_links none',
            // Electron ships prebuilt binaries. RHEL/Alma brp post-install
            // scripts (strip/compress/etc.) can exit 127 when a helper is
            // missing or a gcc-toolset `strip` is on PATH; skip them.
            '--rpm-rpmbuild-define', '__os_install_post %{nil}',
        ]
    },
    pacman: {
        // FPM-generated .pacman packages bypass Arch's alpm hooks that
        // normally refresh the hicolor icon cache. Without this, KDE cannot
        // resolve Icon=magiesTerminal and shows a generic placeholder (#1358).
        afterInstall: 'scripts/linux/after-install.tpl',
        afterRemove: 'scripts/linux/after-remove.tpl',
    },
    publish: [
        {
            provider: 'github',
            owner: 'JasonZhangDad',
            repo: 'MgTerminal-releases',
            releaseType: 'release'
        }
    ]
};
