# Changelog

## [0.2.5] - 2026-07-12

### 修复
- 设置页社区隐藏「GitHub 源代码」入口
- 更新内容 / 问题反馈链接改为 `JasonZhangDad/MgTerminal`，修复 404
- 修复「立即重启」无响应：更新安装退出不再被 before-quit 异步脏检查取消
- 「重启并更新」失败时给出明确提示；不支持自动安装的平台自动打开 Releases

## [0.2.4] - 2026-07-12

### 安全
- 凭据加密不可用时停止保存，禁止回退为明文
- SSH 深链默认关闭，拒绝包含密码的 URL，连接前必须确认
- OSC52 剪贴板默认关闭
- 收紧 Electron CSP，启用 ASAR 完整性及安全 fuses
- 移除 macOS disable-library-validation 权限

## [0.2.3] - 2026-07-11

### 修复
- 修复打包版 `app://` 主机名被 Chromium 规范化为小写后，preload 拒绝注入 Electron bridge，导致终端、SFTP、设置、文件选择和端口转发等功能不可用
- 统一主窗口、设置窗口及应用权限检查对 `app://magiesterminal` 的识别，恢复剪贴板和本地字体权限

## [0.2.2] - 2026-07-11

### 修复
- 主机详情「Select Color Theme」嵌套 ScrollArea 导致主题点击无响应；改为单层滚动并用 pointerdown 选择
- SSH 密钥/本地密钥文件选择对话框未绑定父窗口，macOS 上无法弹出选文件
- Settings 窗口在 `app://` 协议下无法打开
- 侧边栏与安装包应用图标改为新图标资源

## [0.2.1] - 2026-07-11

### CI/CD
- 重新启用 macOS 和 Windows 自动构建机制（无代码签名模式），提供更多平台的开箱即用包。

## [0.2.0] - 2026-07-11

### 功能
- 修复自动更新 IPC 事件仅发送到单个窗口的问题，改为广播所有窗口（主窗口 + 设置窗口均可收到）
- 统一手动检查更新与自动更新的状态机，消除三套并行状态
- 手动"检查更新"通过 GitHub API 检测版本，发现更新后异步触发 electron-updater 下载
- 设置窗口中点击"检查更新"后，下载进度可实时反映在 UI 中
- 应用启动后 5 秒自动触发 `electron-updater` 检查更新，无需用户手动点击
- 发现新版本后自动开始下载（`autoDownload=true`）
- 下载完成后弹出持久 toast 通知，用户点击"立即重启"即可安装
- 下载失败时弹出错误 toast，提供"打开 Releases"降级入口
- Settings > System 进度条实时展示自动下载进度，由 `useUpdateCheck` 统一驱动
- Linux deb/rpm/snap 等不支持 electron-updater 的平台自动跳过，保持原有 GitHub API 通知行为

### 设计原理
- `broadcastToAllWindows` 替换 `getSenderWindow` 单点发送，保证所有窗口都能收到 IPC 事件
- `manualCheckStatus` 字段追踪手动检查 UI 状态（idle/checking/available/up-to-date/error），与 `autoDownloadStatus` 在 UI 层按优先级渲染
- `SettingsSystemTab` 不再持有本地 update state，单向接收 `useUpdateCheck` 统一数据
- 将原有两套独立系统（GitHub API 通知 + electron-updater 手动下载）合并为统一状态机：`useUpdateCheck` 作为唯一事实来源，同时驱动 `App.tsx` toast 和 `SettingsSystemTab` 进度条
- 全局持久化 IPC 监听器在 `autoUpdateBridge.init()` 时一次性注册，避免每次手动下载请求重复注册/清理监听器
- `autoInstallOnAppQuit=false`，不做静默安装，由用户主动触发重启

### 接口变更（SettingsSystemTabProps）
- 移除：`autoDownloadStatus`、`downloadPercent`
- 新增：`updateState`（完整 UpdateState）、`checkNow`、`installUpdate`、`openReleasePage`

### 注意事项
- `checkNow` 语义：使用 GitHub API（`performCheck`）检测是否有新版本，若发现更新且 electron-updater 尚未开始下载，则异步触发 `bridge.checkForUpdate()` 启动自动下载流程
- 此功能仅对打包后的应用（Windows NSIS、macOS dmg/zip、Linux AppImage）生效，dev 模式需配合 `forceDevUpdateConfig=true` + `dev-app-update.yml` 测试（见 `.gitignore`）
- `hasUpdate` 旧 toast 在 `autoDownloadStatus !== 'idle'` 时自动抑制，避免与新 toast 重复

### CI / 构建改进
- 跳过 macOS / Windows 构建（需要付费代码签名证书），专注提供免费 Linux 发行包
- Linux x64（AlmaLinux 8）编译器升级：优先使用 Clang，回退 gcc-toolset-13
- Linux arm64（Debian Bullseye）编译器升级：从 `build-essential` 升级为 `clang-14 + lld-14`
- Release job 不再依赖 macOS/Windows 构建，tag 推送后直接基于 Linux 产物发布 Release
- 软化 deb 产物校验：找不到文件时输出 warning 而非 error，避免因平台跳过导致 CI 失败
