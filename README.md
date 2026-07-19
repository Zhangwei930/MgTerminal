<p align="center">
  <img src="public/icon.png" alt="MagiesTerminal" width="128" height="128">
</p>

<h1 align="center">MagiesTerminal</h1>

<p align="center">
  <strong>🔥 AI-Powered SSH Client, SFTP Browser & Terminal Manager 🚀</strong><br/>
  <a href="https://shell.magies.top"><strong>shell.magies.top</strong></a>
</p>

<p align="center">
  A beautiful, feature-rich SSH workspace built with Electron, React, and xterm.js.<br/>
  🔥 Built-in AI Agent · Split terminals · Vault views · SFTP workflows · Custom themes — all in one.
</p>

<p align="center">
  <a href="https://shell.magies.top"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/JasonZhangDad/MgTerminal-releases?style=for-the-badge&logo=github&label=Release"></a>
  &nbsp;
  <a href="#"><img alt="Platform" src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=for-the-badge&logo=electron"></a>
  &nbsp;
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-GPL--3.0-green?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://shell.magies.top">
    <img src="https://img.shields.io/github/v/release/JasonZhangDad/MgTerminal-releases?style=for-the-badge&logo=github&label=Download%20Latest&color=success" alt="Download Latest Release">
  </a>
</p>

<p align="center">
  <a href="https://ko-fi.com/binaricat">
    <img src="https://cdn.ko-fi.com/cdn/kofi3.png?v=2" width="150" alt="Support on Ko-fi">
  </a>
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja-JP.md">日本語</a>
</p>

---

<img width="3142" height="1764" alt="MagiesTerminal workspace with Magies Agent" src="./docs/screenshots/readme-hero.png" />

---

<a name="magiesTerminal-agent"></a>
# 🔥 MagiesTerminal Agent — Your IT Ops AI Partner

> 🚀 **Boost your IT ops daily work with AI power.** MagiesTerminal Agent is the built-in AI assistant that understands your servers, executes commands, and handles complex multi-host operations — all through natural conversation.
### 🔥 What can MagiesTerminal Agent do?

- 🚀 **Natural language server management** — just tell it what you need, no more memorizing commands
- 🔥 **Real-time server diagnostics** — check status, inspect logs, monitor resources through conversation
- 🚀 **Multi-host orchestration** — coordinate tasks across multiple servers simultaneously
- 🔥 **Intelligent context awareness** — understands your server environment and provides tailored responses
- 🚀 **One-click complex operations** — set up clusters, deploy services, and more with simple instructions

---

# Contents <!-- omit in toc -->

- [🔥 MagiesTerminal Agent — AI Partner](#magiesTerminal-agent)
- [What is MagiesTerminal](#what-is-magiesTerminal)
- [Why MagiesTerminal](#why-magiesTerminal)
- [Features](#features)
- [Supported Distros](#supported-distros)
- [Getting Started](#getting-started)
- [Build & Package](#build--package)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [Contributors](#contributors)
- [License](#license)

---

<a name="what-is-magiesTerminal"></a>
# What is MagiesTerminal

**MagiesTerminal** is a modern SSH client and terminal manager for macOS, Windows, and Linux, designed for developers, sysadmins, and DevOps engineers who need to manage multiple remote servers efficiently.

- **MagiesTerminal is** an alternative to PuTTY, Termius, SecureCRT, and macOS Terminal.app for SSH connections
- **MagiesTerminal is** a powerful SFTP client with dual-pane file browser
- **MagiesTerminal is** a terminal workspace with split panes, tabs, and session management
- **MagiesTerminal supports** SSH, local terminal, Telnet, Mosh, and Serial connections (when available)
- **MagiesTerminal is not** a shell replacement — it connects to shells via SSH/Telnet/Mosh or local/serial sessions

---

<a name="why-magiesTerminal"></a>
# Why MagiesTerminal

If you regularly work with a fleet of servers, MagiesTerminal is built for speed and flow:

- **Workspace-first** — split panes + tabs + session restore for “always-on” workflows
- **Vault organization** — grid/list/tree views with fast search and drag-friendly workflows
- **Serious SFTP** — built-in editor + drag & drop + smooth file operations

---

<a name="features"></a>
# Features

### Feature matrix

| Area | Highlights |
|------|------------|
| **Vault** | Grid / list / tree hosts, groups, tags, import/export, notes, known hosts, connection logs |
| **Auth** | Password, key, certificate, **SSH Agent** (identity picker + preferred fingerprint), jump hosts, proxies |
| **Connection UX** | Progress logs, **Test Connection** diagnostics (DNS → TCP → jump → host key → auth → SFTP), deep links |
| **Terminal** | Split panes, workspaces, session restore, broadcast, snippets/scripts, serial / telnet / mosh / ET |
| **SFTP** | Dual pane, conflict handling, transfer queue with **resume / auto-retry / optional checksum**, editor |
| **Ops** | Port forwarding, system manager, **multi-host health snapshot**, AI sidebar agent |
| **Productization** | First-run onboarding, command palette (quick switcher), empty-state migration paths |

### 🗂️ Vault
- **Multiple views** — grid / list / tree
- **Fast search** — locate hosts and groups quickly
- **Test Connection** — stepwise diagnostics before you save or after a failure
- **Host health snapshot** — batch latency / auth / load·mem·disk check on demand

### 🖥️ Terminal Workspaces
- **Split panes** — horizontal and vertical splits for multi-tasking
- **Session management** — run multiple connections side-by-side
- **Session restore** — bring back previous layouts after restart

### 📁 SFTP + Built-in Editor
- **File workflows** — drag & drop uploads/downloads
- **Reliable transfers** — resume partial files, auto-retry with backoff, optional SHA-256 verify
- **Edit in place** — built-in editor for quick changes

### 🎨 Personalization
- **Custom themes** — tune the app appearance to your taste
- **Keyword highlighting** — customize highlight rules for terminal output
- **Command palette** — search hosts, tabs, settings, and actions from the quick switcher

---

<a name="supported-distros"></a>
# Supported Distros

MagiesTerminal automatically detects and displays OS icons for connected hosts:

<p align="center">
  <img src="public/distro/ubuntu.svg" width="48" alt="Ubuntu" title="Ubuntu">
  <img src="public/distro/debian.svg" width="48" alt="Debian" title="Debian">
  <img src="public/distro/centos.svg" width="48" alt="CentOS" title="CentOS">
  <img src="public/distro/fedora.svg" width="48" alt="Fedora" title="Fedora">
  <img src="public/distro/arch.svg" width="48" alt="Arch Linux" title="Arch Linux">
  <img src="public/distro/alpine.svg" width="48" alt="Alpine" title="Alpine">
  <img src="public/distro/amazon.svg" width="48" alt="Amazon Linux" title="Amazon Linux">
  <img src="public/distro/redhat.svg" width="48" alt="Red Hat" title="Red Hat">
  <img src="public/distro/rocky.svg" width="48" alt="Rocky Linux" title="Rocky Linux">
  <img src="public/distro/opensuse.svg" width="48" alt="openSUSE" title="openSUSE">
  <img src="public/distro/oracle.svg" width="48" alt="Oracle Linux" title="Oracle Linux">
  <img src="public/distro/kali.svg" width="48" alt="Kali Linux" title="Kali Linux">
  <img src="public/distro/almalinux.svg" width="48" alt="AlmaLinux" title="AlmaLinux">
</p>

<a name="getting-started"></a>
# Getting Started

### Download

Download the latest release for your platform from the [official site](https://shell.magies.top).

| OS | Support |
| :--- | :--- |
| **macOS** | Universal (x64 / arm64) |
| **Windows** | x64 / arm64 |
| **Linux** | x64 / arm64 |

Or browse all releases at [GitHub Releases](https://github.com/JasonZhangDad/MgTerminal-releases/releases).

> **macOS Users:** Releases are not code-signed or notarized. On first launch, Gatekeeper will warn — right-click the app and choose **Open**, or run `xattr -dr com.apple.quarantine /Applications/MagiesTerminal.app`. In-app auto-updates install via bundle replacement and do not re-trigger this warning.

### Nix / NixOS

MagiesTerminal provides a flake that wraps the official Linux AppImage release for Nix and NixOS users:

```bash
nix run github:Zhangwei930/MgTerminal
```

For declarative installs, add the MagiesTerminal flake as an input and use `inputs.magiesTerminal.packages.${pkgs.system}.default` in your NixOS or Home Manager package list.

### Prerequisites
- Node.js 22+ and npm
- macOS, Windows 10+, or Linux

### Development

```bash
# Clone the repository
git clone https://github.com/Zhangwei930/MgTerminal.git
cd MgTerminal

# Install dependencies
npm install

# Start development mode (Vite + Electron)
npm run dev
```

---

<a name="build--package"></a>
# Build & Package

```bash
# Build for production
npm run build

# Package for current platform
npm run pack

# Package for specific platforms
npm run pack:mac     # macOS (DMG + ZIP)
npm run pack:win     # Windows (NSIS installer)
npm run pack:linux   # Linux (AppImage + DEB + RPM)
```

---

<a name="tech-stack"></a>
# Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Electron 42 |
| Frontend | React 19, TypeScript |
| Build Tool | Vite 7 |
| Terminal | xterm.js 6 |
| Styling | Tailwind CSS 4 |
| SSH/SFTP | ssh2, ssh2-sftp-client |
| PTY | node-pty |
| Icons | Lucide React |

---

<a name="contributing"></a>
# Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [AGENTS.md](AGENTS.md) for architecture overview and coding conventions.

---

<a name="contributors"></a>
# Contributors

<a href="https://github.com/JasonZhangDad">
  <img src="https://github.com/JasonZhangDad.png" width="64" alt="JasonZhangDad" />
</a>

---

<a name="license"></a>
# License

This project is licensed under the **GPL-3.0-or-later** - see the [LICENSE](LICENSE) file for details.

Copyright © 2025 JasonZhangDad and the MagiesTerminal contributors.

## Based on Netcatty

MagiesTerminal is a **fork of [Netcatty](https://github.com/binaricat/Netcatty)** (© binaricat and the Netcatty contributors), which is also licensed under GPL-3.0-or-later. Significant modifications — rebranding, UI and theme changes, and additional features — have been made by JasonZhangDad and the MagiesTerminal contributors since December 2025. See the [NOTICE](NOTICE) file for full attribution.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/JasonZhangDad">JasonZhangDad</a>
</p>
