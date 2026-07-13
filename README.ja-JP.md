<p align="center">
  <img src="public/icon.png" alt="MagiesTerminal" width="128" height="128">
</p>

<h1 align="center">MagiesTerminal</h1>

<p align="center">
  <strong>🔥 AI 搭載の SSH クライアント、SFTP ブラウザ & ターミナルマネージャー 🚀</strong><br/>
  <a href="https://github.com/JasonZhangDad/MgTerminal"><strong>github.com/JasonZhangDad/MgTerminal</strong></a>
</p>

<p align="center">
  Electron、React、xterm.js で構築された機能豊富な SSH ワークスペース。<br/>
  🔥 内蔵 AI Agent · 分割ターミナル · Vault ビュー · SFTP ワークフロー · カスタムテーマ — すべてが一つに。
</p>

<p align="center">
  <a href="https://github.com/JasonZhangDad/MgTerminal/releases/latest"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/JasonZhangDad/MgTerminal?style=for-the-badge&logo=github&label=Release"></a>
  &nbsp;
  <a href="#"><img alt="Platform" src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=for-the-badge&logo=electron"></a>
  &nbsp;
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-GPL--3.0-green?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://github.com/JasonZhangDad/MgTerminal/releases/latest">
    <img src="https://img.shields.io/github/v/release/JasonZhangDad/MgTerminal?style=for-the-badge&logo=github&label=最新版をダウンロード&color=success" alt="最新版をダウンロード">
  </a>
</p>

<p align="center">
  <a href="https://ko-fi.com/binaricat">
    <img src="https://cdn.ko-fi.com/cdn/kofi3.png?v=2" width="150" alt="Ko-fi でサポート">
  </a>
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja-JP.md">日本語</a>
</p>

---

<img width="3142" height="1764" alt="Screenshot 2026-07-02 at 22 51 24" src="https://github.com/user-attachments/assets/3116165d-623a-4d3a-a28a-914befb9b72d" />

---

<a name="magiesTerminal-agent"></a>
# 🔥 MagiesTerminal Agent — あなたの IT 運用 AI パートナー

> 🚀 **AI で日常の IT 運用作業を加速。** MagiesTerminal Agent はサーバー環境を理解し、コマンドを実行し、自然な会話で複数ホストの複雑な操作をこなす内蔵 AI アシスタントです。

### 🔥 MagiesTerminal Agent にできること

- 🚀 **自然言語でサーバー管理** — コマンドを暗記せず、必要なことを話しかけるだけ
- 🔥 **リアルタイムサーバー診断** — 会話を通じてステータス確認、ログ調査、リソース監視
- 🚀 **マルチホスト連携** — 複数サーバーのタスクを同時にコーディネート
- 🔥 **インテリジェントなコンテキスト認識** — サーバー環境を理解し、的確な回答を提供
- 🚀 **ワンステップで複雑な操作** — クラスター構築、サービスデプロイなど簡単な指示で実行

---

# 目次 <!-- omit in toc -->

- [🔥 MagiesTerminal Agent — AI パートナー](#magiesTerminal-agent)
- [MagiesTerminal とは](#magiesTerminal-とは)
- [なぜ MagiesTerminal](#なぜ-magiesTerminal)
- [機能](#機能)
- [対応ディストリビューション](#対応ディストリビューション)
- [はじめに](#はじめに)
- [ビルドとパッケージ](#ビルドとパッケージ)
- [技術スタック](#技術スタック)
- [コントリビューション](#コントリビューション)
- [コントリビューター](#コントリビューター)
- [Star 履歴](#star-履歴)
- [ライセンス](#ライセンス)

---

<a name="magiesTerminal-とは"></a>
# MagiesTerminal とは

**MagiesTerminal** は、複数のリモートサーバーを効率的に管理する必要がある開発者、システム管理者、DevOps エンジニア向けに設計された、モダンなクロスプラットフォーム SSH クライアントおよびターミナルマネージャーです。

- **MagiesTerminal は** PuTTY、Termius、SecureCRT、macOS Terminal.app の代替となる SSH 接続ツール
- **MagiesTerminal は** デュアルペインのファイルブラウザを備えた強力な SFTP クライアント
- **MagiesTerminal は** 分割ペイン、タブ、セッション管理を備えたターミナルワークスペース
- **MagiesTerminal は** SSH、ローカルターミナル、Telnet、Mosh、シリアル接続をサポートします（利用可能な場合）
- **MagiesTerminal は** シェルの代替ではありません — SSH/Telnet/Mosh またはローカル/シリアルセッション経由でシェルに接続します

---

<a name="なぜ-magiesTerminal"></a>
# なぜ MagiesTerminal

複数サーバーを日常的に扱うなら、MagiesTerminal は「スピード」と「流れ」を重視した作りになっています：

- **ワークスペース中心** — 分割ペイン + タブ + セッション復元で常時使うワークフローに対応
- **Vault の整理** — グリッド/リスト/ツリー表示、高速検索、ドラッグしやすいワークフロー
- **本格的な SFTP** — 内蔵エディタ + ドラッグ＆ドロップ + スムーズなファイル操作

---

<a name="機能"></a>
# 機能

### 🗂️ Vault
- **複数ビュー** — グリッド / リスト / ツリー
- **高速検索** — ホストやグループを素早く見つける

### 🖥️ ターミナルワークスペース
- **分割ペイン** — 水平・垂直分割でマルチタスク
- **セッション管理** — 複数の接続を並行して扱う

### 📁 SFTP + 内蔵エディタ
- **ファイル作業** — ドラッグ＆ドロップでアップロード/ダウンロード
- **その場で編集** — 内蔵エディタで小さな修正を素早く

### 🎨 パーソナライズ
- **カスタムテーマ** — UI の見た目を好みに調整
- **キーワードハイライト** — ターミナル出力の強調表示ルールをカスタマイズ

---

<a name="対応ディストリビューション"></a>
# 対応ディストリビューション

MagiesTerminal は接続したホストの OS を検出し、ホスト一覧でアイコンとして表示します：

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

<a name="はじめに"></a>
# はじめに

### ダウンロード

[GitHub Releases](https://github.com/JasonZhangDad/MgTerminal/releases/latest) からお使いのプラットフォームに対応した最新版をダウンロードしてください。

| OS | サポート状況 |
| :--- | :--- |
| **macOS** | Universal (x64 / arm64) |
| **Windows** | x64 / arm64 |
| **Linux** | x64 / arm64 |

または [GitHub Releases](https://github.com/JasonZhangDad/MgTerminal/releases) ですべてのリリースを参照してください。

> **macOS ユーザーへ：** 現在のリリースはコード署名と notarization が行われている想定です。Gatekeeper の警告が出る場合は、GitHub Releases から最新版の公式ビルドを取得しているか確認してください。

### Nix / NixOS

MagiesTerminal は Nix および NixOS ユーザー向けに、公式 Linux AppImage リリースをラップした flake を提供しています：

```bash
nix run github:JasonZhangDad/MgTerminal
```

宣言型インストールには、MagiesTerminal flake を input として追加し、NixOS または Home Manager のパッケージリストで `inputs.magiesTerminal.packages.${pkgs.system}.default` を使用してください。

### 前提条件
- Node.js 18+ と npm
- macOS、Windows 10+、または Linux

### 開発

```bash
# リポジトリをクローン
git clone https://github.com/JasonZhangDad/MgTerminal.git
cd MgTerminal

# 依存関係をインストール
npm install

# 開発モードを起動（Vite + Electron）
npm run dev
```

---

<a name="ビルドとパッケージ"></a>
# ビルドとパッケージ

```bash
# 本番用ビルド
npm run build

# 現在のプラットフォーム用にパッケージ
npm run pack

# 特定のプラットフォーム用にパッケージ
npm run pack:mac     # macOS (DMG + ZIP)
npm run pack:win     # Windows (NSIS インストーラー)
npm run pack:linux   # Linux (AppImage + DEB + RPM)
```

---

<a name="技術スタック"></a>
# 技術スタック

| カテゴリ | テクノロジー |
|--------|------------|
| フレームワーク | Electron 40 |
| フロントエンド | React 19, TypeScript |
| ビルドツール | Vite 7 |
| ターミナル | xterm.js 5 |
| スタイリング | Tailwind CSS 4 |
| SSH/SFTP | ssh2, ssh2-sftp-client |
| PTY | node-pty |
| アイコン | Lucide React |

---

<a name="コントリビューション"></a>
# コントリビューション

コントリビューションを歓迎します！お気軽に Pull Request を提出してください。

1. リポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Request をオープン

アーキテクチャの概要とコーディング規約については [agents.md](agents.md) を参照してください。

---

<a name="コントリビューター"></a>
# コントリビューター

<a href="https://github.com/JasonZhangDad">
  <img src="https://github.com/JasonZhangDad.png" width="64" alt="JasonZhangDad" />
</a>

---

<a name="ライセンス"></a>
# ライセンス

このプロジェクトは **GPL-3.0 ライセンス** の下でライセンスされています - 詳細は [LICENSE](LICENSE) ファイルをご覧ください。

---

<a name="star-履歴"></a>
# Star 履歴

<a href="https://star-history.com/#JasonZhangDad/MgTerminal&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=JasonZhangDad/MgTerminal&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=JasonZhangDad/MgTerminal&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=JasonZhangDad/MgTerminal&type=Date" />
 </picture>
</a>

---

<p align="center">
  ❤️ を込めて作成 by <a href="https://github.com/JasonZhangDad">JasonZhangDad</a>
</p>
