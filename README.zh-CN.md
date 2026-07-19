<p align="center">
  <img src="public/icon.png" alt="MagiesTerminal" width="128" height="128">
</p>

<h1 align="center">MagiesTerminal</h1>

<p align="center">
  <strong>🔥 AI 驱动的 SSH 客户端、SFTP 浏览器 & 终端管理器 🚀</strong><br/>
  <a href="https://shell.magies.top"><strong>shell.magies.top</strong></a>
</p>

<p align="center">
  一个基于 Electron、React 和 xterm.js 构建的功能丰富的 SSH 工作空间。<br/>
  🔥 内置 AI Agent · 分屏终端 · Vault 多视图 · SFTP 工作流 · 自定义主题 —— 一应俱全。
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
    <img src="https://img.shields.io/github/v/release/JasonZhangDad/MgTerminal-releases?style=for-the-badge&logo=github&label=下载最新版&color=success" alt="下载最新版">
  </a>
</p>

<p align="center">
  <a href="https://ko-fi.com/binaricat">
    <img src="https://cdn.ko-fi.com/cdn/kofi3.png?v=2" width="150" alt="在 Ko-fi 上支持我">
  </a>
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja-JP.md">日本語</a>
</p>

---

<img width="3142" height="1764" alt="MagiesTerminal workspace with Magies Agent" src="./docs/screenshots/readme-hero.png" />

---

<a name="magiesTerminal-agent"></a>
# 🔥 MagiesTerminal Agent — 你的 IT 运维 AI 搭档

> 🚀 **用 AI 赋能你的日常 IT 运维工作。** MagiesTerminal Agent 是内置的 AI 助手，能理解你的服务器环境、执行命令，并通过自然对话完成复杂的多主机操作。

### 🔥 MagiesTerminal Agent 能做什么？

- 🚀 **自然语言管理服务器** —— 直接说出需求，不再需要记忆命令
- 🔥 **实时服务器诊断** —— 通过对话检查状态、查看日志、监控资源
- 🚀 **多主机协同** —— 跨多台服务器同时协调任务
- 🔥 **智能上下文感知** —— 理解你的服务器环境，给出有针对性的回应
- 🚀 **一键完成复杂操作** —— 搭集群、部署服务，一句话搞定

---

# 目录 <!-- omit in toc -->

- [🔥 MagiesTerminal Agent — AI 搭档](#magiesTerminal-agent)
- [MagiesTerminal 是什么](#magiesTerminal-是什么)
- [为什么是 MagiesTerminal](#为什么是-magiesTerminal)
- [功能特性](#功能特性)
- [支持的发行版](#支持的发行版)
- [快速开始](#快速开始)
- [构建与打包](#构建与打包)
- [技术栈](#技术栈)
- [参与贡献](#参与贡献)
- [贡献者](#贡献者)
- [开源协议](#开源协议)

---

<a name="magiesTerminal-是什么"></a>
# MagiesTerminal 是什么

**MagiesTerminal** 是一款现代化的跨平台 SSH 客户端和终端管理器，专为需要高效管理多台远程服务器的开发者、系统管理员和 DevOps 工程师设计。

- **MagiesTerminal 是** PuTTY、Termius、SecureCRT 和 macOS Terminal.app 的现代替代品
- **MagiesTerminal 是** 一个强大的 SFTP 客户端，支持双窗格文件浏览
- **MagiesTerminal 是** 一个终端工作空间，支持分屏、标签页和会话管理
- **MagiesTerminal 支持** SSH、本地终端、Telnet、Mosh、串口（Serial）等连接方式（视环境而定）
- **MagiesTerminal 不是** Shell 替代品 —— 它通过 SSH/Telnet/Mosh 或本地/串口会话连接到 Shell

---

<a name="为什么是-magiesTerminal"></a>
# 为什么是 MagiesTerminal

如果你需要同时维护多台服务器，MagiesTerminal 更像是“工作台”而不是单一终端：

- **以工作区为核心** —— 分屏 + 标签页 + 会话恢复，适合长期驻留的工作流
- **Vault 管理** —— 网格/列表/树形视图，配合快速搜索与拖拽流程更顺手
- **认真做的 SFTP** —— 内置编辑器 + 拖拽上传/下载，文件操作更丝滑

---

<a name="功能特性"></a>
# 功能特性

### 🗂️ Vault
- **多种视图** —— 网格 / 列表 / 树形
- **快速搜索** —— 迅速定位主机与分组

### 🖥️ 终端工作区
- **分屏** —— 水平/垂直分割，多任务并行
- **多会话管理** —— 多连接并排处理

### 📁 SFTP + 内置编辑器
- **文件工作流** —— 拖拽上传/下载更直观
- **就地编辑** —— 内置编辑器快速修改文件

### 🎨 个性化
- **自定义主题** —— 按喜好调整应用外观
- **关键词高亮** —— 自定义终端输出高亮规则

---

<a name="支持的发行版"></a>
# 支持的发行版

MagiesTerminal 会自动识别并在主机列表中展示对应的系统图标：

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

<a name="快速开始"></a>
# 快速开始

### 下载

从[官网](https://shell.magies.top)下载适合您平台的最新版本。

| 操作系统 | 支持情况 |
| :--- | :--- |
| **macOS** | Universal (x64 / arm64) |
| **Windows** | x64 / arm64 |
| **Linux** | x64 / arm64 |

或在 [GitHub Releases](https://github.com/JasonZhangDad/MgTerminal-releases/releases) 浏览所有版本。

> **macOS 用户注意：** 发布版本未做代码签名与公证。首次启动 Gatekeeper 会提示风险——请右键应用选择「打开」，或执行 `xattr -dr com.apple.quarantine /Applications/MagiesTerminal.app`。应用内自动更新采用 bundle 替换安装，不会再次触发该提示。

### Nix / NixOS

MagiesTerminal 提供了一个 flake，为 Nix 和 NixOS 用户封装了官方 Linux AppImage 发行版：

```bash
nix run github:Zhangwei930/MgTerminal
```

声明式安装时，将 MagiesTerminal flake 添加为输入，并在 NixOS 或 Home Manager 的软件包列表中使用 `inputs.magiesTerminal.packages.${pkgs.system}.default`。

### 前置条件
- Node.js 22+ 和 npm
- macOS、Windows 10+ 或 Linux

### 开发

```bash
# 克隆仓库
git clone https://github.com/Zhangwei930/MgTerminal.git
cd MgTerminal

# 安装依赖
npm install

# 启动开发模式（Vite + Electron）
npm run dev
```

---

<a name="构建与打包"></a>
# 构建与打包

```bash
# 生产构建
npm run build

# 为当前平台打包
npm run pack

# 为特定平台打包
npm run pack:mac     # macOS (DMG + ZIP)
npm run pack:win     # Windows (NSIS 安装程序)
npm run pack:linux   # Linux (AppImage + DEB + RPM)
```

---

<a name="技术栈"></a>
# 技术栈

| 分类 | 技术 |
|-----|-----|
| 框架 | Electron 42 |
| 前端 | React 19, TypeScript |
| 构建工具 | Vite 7 |
| 终端 | xterm.js 6 |
| 样式 | Tailwind CSS 4 |
| SSH/SFTP | ssh2, ssh2-sftp-client |
| PTY | node-pty |
| 图标 | Lucide React |

---

<a name="参与贡献"></a>
# 参与贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 本仓库
2. 创建你的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个 Pull Request

查看 [AGENTS.md](AGENTS.md) 了解架构概述和编码规范。

---

<a name="贡献者"></a>
# 贡献者

<a href="https://github.com/JasonZhangDad">
  <img src="https://github.com/JasonZhangDad.png" width="64" alt="JasonZhangDad" />
</a>

---

<a name="开源协议"></a>
# 开源协议

本项目采用 **GPL-3.0 协议** 开源 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

<p align="center">
  用 ❤️ 制作，作者 <a href="https://github.com/JasonZhangDad">JasonZhangDad</a>
</p>
