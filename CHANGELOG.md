# Changelog

## [0.4.7] - 2026-07-15

### 功能
- **界面语言扩展到 10 种**：客户端与官网对齐，新增日本語 / 한국어 / Deutsch / Français / Español / Português（原有 en / ru / zh-CN / zh-TW 保留）
- 设置 → 外观 → 语言 可选全部支持语言；未覆盖的文案仍回退到英语

## [0.4.6] - 2026-07-15

### 安全
- **SSH 主机密钥校验关闭时不再静默**：`verifyHostKeys` 关闭时（终端会话与 mosh 统计连接）会记录明确的告警日志，说明正在不加询问地接受任意主机密钥
- **设置页持续警示**：关闭「校验 SSH 主机密钥」后，开关下方持续显示中间人风险提示（en / zh-CN / zh-TW）。默认仍为开启

## [0.4.5] - 2026-07-15

### 修复
- **嵌套密文导致的 401 / 空流**：钥匙串失效期间反复保存会把密钥层层加密（`enc:v2(enc:v1(...))`）；解密循环边界修正后，预算内的多层嵌套能完整解出，不再"解对了又丢弃"或误报解密失败
- **单个坏凭据不再拖垮整个凭据库加载**：字段解密失败时改为保留原存储值（fail-soft），凭据库照常加载，密钥在钥匙串修复后仍可恢复
- **Web 搜索 API Key**：解密失败后仅聚焦/失焦不再误删已存密钥；补充解密/加密失败的明确提示，不再静默
- **Windows DPAPI 密文识别修正**：防重复加密守卫此前漏判 DPAPI 密钥（`AQAAAN` 头），钥匙串失效时会二次加密成嵌套密文，现已修正
- **Cursor Agent**：解密失败时不再把密文当 API Key 注入子进程
- 设置页 Provider / Web 搜索 / Cursor 三处统一：解密失败时明确提示重新输入 Key，切换界面语言不再覆盖未保存的 Key

## [0.4.4] - 2026-07-14

### 修复
- **AI 401 / 空流**：API Key 解密失败或未同步到主进程时，不再带着 `__IPC_SECURED__` 占位符请求供应商；改为立即报错并提示重新保存 Key
- 发送消息前等待 providers 同步到主进程，避免竞态导致鉴权失败
- 本地 Key 不可用时给出明确 auth 提示（解密失败 / 缺失 / 占位符残留）

## [0.4.3] - 2026-07-14

### 修复
- **API Key 解密**：主进程正确解密 `enc:v2` 本地保险箱密钥；解密失败时不再把密文当明文发给供应商（避免 401 与 `…5Q==` 尾缀）
- **凭据占位符识别**：连接边界 / 云同步守卫同步识别 `enc:v2`，避免把本地保险箱密文当密码发出或上传到同步
- 模型空流（`NoOutputGeneratedError`）与 401 鉴权失败给出可操作的错误提示
- Cursor SDK 安装探测改为 `require.resolve`，避免误报未安装

## [0.4.2] - 2026-07-14

### 修复
- **一次性解决 API Key 加密失败**：钥匙串（safeStorage）不可用时自动改用本地加密保险箱（`enc:v2`），应用更新后不再因 Keychain ACL 失效而无法保存 API Key
- macOS 仍会优先尝试系统钥匙串，失败时静默回退；设置 → 系统 可查看当前后端

## [0.4.1] - 2026-07-14

### 优化
- 主题选择器：卡片预览（背景 + 主色/次色）、Core / 全部范围切换、搜索与空状态
- 默认 Snow / Midnight 提升对比度与卡片层次，同步 `ui-snow` / `ui-midnight` 终端配色
- 统一选中态与界面层次：Vault 主机/树、SFTP 列表/树/标签栏、设置页导航、AI 侧栏、终端顶栏
- 终端主题列表（弹窗 / 侧栏）支持搜索与更清晰色块预览
- 将同步状态、Toast info、更新徽章、拖放高亮等硬编码色收敛到主题 token

## [0.4.0] - 2026-07-13

### 功能
- 国内用户下载与自动更新加速：自动识别地区并切换到国内镜像源，与 GitHub 双向回退
- 设置页「更新内容」改为应用内弹框展示各版本更新记录，不再跳转 GitHub
- 新增「问题咨询」入口，点击复制联系邮箱
- SSH 断线自动重连改为指数退避（5 秒起、最长 60 秒），连续失败 10 次自动停止并提示手动重连
- 本地/动态端口转发自动复用已认证的终端 SSH 连接，免二次密码/2FA 验证
- 导入 FIDO2 安全密钥（sk-*）时提示改用 ssh-agent 认证

### 变更
- 设置页移除「反馈问题」「社区」两个 GitHub 入口

## [0.3.0] - 2026-07-13

### 修复
- AI 供应商保存时 API Key 加密失败不再被静默吞掉，会在 API Key 下方显示明确的本地化错误提示

## [0.2.9] - 2026-07-13

### 功能
- macOS 支持自动更新：下载后以 bundle 替换方式安装，绕开未签名应用的 Squirrel 限制（0.2.9 起全平台可自动升级）

### 修复
- 应用图标保留官方素材的圆角底板，深浅色下显示一致

## [0.2.8] - 2026-07-13

### 修复
- Windows 包启动即静默退出：afterPack 重写 asar 后重新嵌入完整性哈希，并增加 CI 校验防止复发
- 更新安装的进度与错误信息在各平台均可见

## [0.2.7] - 2026-07-13

### 修复
- Windows 发布架构安全的 x64 安装包

## [0.2.6] - 2026-07-12

### 安全
- 打包版托盘窗口忽略 `VITE_DEV_SERVER_URL`，并拦截导航 / 新窗口
- preload 在 `app.asar` 环境下不再把开发服务器加入可信来源
- 覆盖升级 DOMPurify 3.3.2、undici 6.23.0，修复可达 XSS / 解压链 DoS
- afterPack 修复 ASAR 文件完整性哈希并同步 Info.plist，避免 macOS 启动即崩溃

### 修复
- Telnet 自动登录集成测试改为等待命令提示符后再断言完成事件

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
