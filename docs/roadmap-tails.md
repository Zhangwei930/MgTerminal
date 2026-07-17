# MagiesTerminal 路线图长尾：竞品可借鉴能力

本文档整理自 Xshell / Termius 的能力对照，作为 `feat/roadmap-p0-p2-batch` 之后的**产品长尾**优先级参考。目标不是功能堆叠，而是在保持 MagiesTerminal「开源、本地优先、AI 运维工作台」定位的前提下，优先吸收 Xshell 的操作安全与终端成熟度，再吸收 Termius 的工作区、日志与团队协作能力。

**明确不做 / 不优先：**

- 不直接复制 Termius 的强账号 / 订阅依赖。
- 不为了功能数量优先加入 SSH1、Rlogin 等低需求旧协议。
- 不把「企业账号体系」当作个人本地工具的默认路径。

相关参考：

- Termius API Bridge: https://termius.com/blog/keep-connection-details-up-to-date-with-api-bridge
- Termius Terminal Multiplayer / 团队能力: https://www.termius.com/

---

## 现状锚点（避免重复造轮子）

MagiesTerminal 已具备大量同类能力，后续工作应**增强而不是重写**：

| 已有能力 | 备注 |
| --- | --- |
| SFTP、Mosh、串口、跳板链、HTTP/SOCKS5 代理 | 连接面已较完整 |
| 本地 / 远程 / 动态端口转发 | 有规则与状态，缺活动通道细粒度视图 |
| 主机分组配置继承 | GroupConfig 继承 |
| Snippet、启动脚本、触发器 | `manual` / `onConnect` / `onOutput`；动作偏「跑脚本」 |
| 工作区分屏、广播、恢复 | 广播当前按 workspace 开关；恢复为断连占位 |
| 自动补全、历史命令 | 终端侧已有 |
| 凭据加密与多种云同步 | 本地优先 + 可选同步 |
| 会话日志保存与回放 | 有自动保存 / 回放，缺命令级书签与备注检索 |
| X11、系统指标、Docker、Process、tmux | 运维侧栏能力 |
| AI Agent 与多主机工具调用 | 相对 Termius 命令生成更完整 |

实现核对要点（截至本分支）：

- **广播**：`useSessionState` 以 `broadcastWorkspaceIds` 按 workspace 开关；未发现按选定标签 / 分组 / 排除会话的目标选择器。
- **粘贴 / 发送节流**：bracketed paste、snippet/startup 的 `lineDelay` 已有；通用「字符延时 / 等提示符 / 危险命令粘贴二次确认」未作为用户粘贴路径一等公民。
- **触发器**：`Snippet.trigger` + `HostOutputTrigger` 主要驱动脚本；桌面通知、声音、标标签、自动记日志等动作面偏窄。
- **Workspace**：有运行时分屏 / 创建 / session restore（布局占位）；不是可命名、可复用的「主机 + 分屏 + cwd + 启动命令」模板库。
- **端口转发**：有规则与 start/stop 状态；缺少每条活动连接的来源 / 目标 / 流量明细视图。
- **日志**：连接日志 + 会话日志导出 / 回放已有；缺少日志内命令位置书签、备注与全文检索产品化。

---

## P0：建议优先实现

面向日常运维安全与重复效率，投入产出比最高。

| 来源 | 值得借鉴的能力 | MagiesTerminal 当前差距 | 价值 |
| --- | --- | --- | --- |
| Xshell | **精确广播目标** | 当前主要按 Workspace 广播；应支持选定标签、分组、当前窗口、排除会话 | 降低批量误操作 |
| Xshell | **安全粘贴和发送节流** | 增加字符延时、行延时、等待 Shell 提示符、危险命令二次确认 | 非常适合生产运维 |
| Termius | **日志书签与备注** | 当前能保存和回放，但缺少命令位置书签、备注和检索 | 排障、复盘价值高 |
| Termius | **Workspace 模板** | 保存主机、分屏、工作目录、启动命令和运行状态（模板化，非进程复活） | 提升重复工作效率 |
| Xshell | **隧道活动通道视图** | 当前有转发状态，但缺少每条活动连接、来源、目标和流量信息 | 方便诊断端口转发 |
| Xshell | **更强的触发器动作** | 增加桌面通知、声音、标记标签、执行 Snippet、自动记录日志 | 与现有触发器体系契合 |

### P0 落地建议（实现顺序）

1. **精确广播目标** — 在现有 workspace 广播之上增加目标集（selected tabs / group / window / exclude），默认保持现状行为。
2. **安全粘贴与发送节流** — 设置项 + 粘贴路径统一：char/line delay、wait-for-prompt、危险模式二次确认；可复用 snippet `lineDelay` 与 prompt detector。
3. **触发器动作扩展** — 在现有 `onOutput` 匹配上增加 action 类型枚举，避免再造一套规则引擎。
4. **隧道活动通道视图** — 主进程统计 active channels + UI 列表；先做连接元组与字节计数，不做完整抓包。
5. **日志书签与备注** — 在现有 connection/session log 模型上挂 offset/标记/备注索引，再补检索 UI。
6. **Workspace 模板** — 与 session restore 区分：模板是用户命名的可复用配方；restore 仍是启动时布局占位。

---

## P1：战略性能力

适合作为中期架构投资，依赖更清晰的产品边界与安全模型。

| 来源 | 功能 | 建议 |
| --- | --- | --- |
| Termius | API Bridge / Ansible / CMDB 同步 | 建立可插拔「主机数据源」，动态同步主机、分组和凭据引用（凭据仍本地或引用，不默认上云） |
| Termius | 团队 Vault | 增加角色权限、主机共享、凭据不落地、操作审计（可选自托管，非强制账号） |
| Termius | Terminal Multiplayer | 支持观看、请求控制权、单人输入锁、协作审计 |
| Termius | 设备绑定 Passkey | 优先基于系统 Keychain、Secure Enclave、Windows Hello 或 FIDO2 实现 |
| Termius | 后量子 SSH | 跟随底层 SSH 库支持混合 ML-KEM 密钥交换 |
| Xshell | PKCS#11、GSSAPI/Kerberos | 面向企业、堡垒机、智能卡和域认证客户 |
| Xshell | Hex / 原始数据诊断 | 对串口、乱码、协议调试和非文本输出非常有用 |

### P1 原则

- **可插拔数据源** 优于「写死某一家 CMDB」。
- **协作与团队能力** 优先本地 / 自托管协议，避免订阅墙。
- **密码学与企业认证** 跟随 ssh2 / OS 能力成熟度，不自研算法。

---

## P2：根据用户需求再做

- iOS / Android 完整客户端。
- RDP 支持。
- VT220 / VT320、SCOANSI 等旧终端仿真。
- 云厂商账号直接导入。
- 企业 SAML / SSO、组织管理后台。
- 强制日志和集中审计策略。

---

## 产品结论

1. **保留定位**：开源、本地优先、AI 运维工作台。
2. **P0 优先序**：Xshell 式操作安全与终端成熟度（广播精度、安全粘贴、触发器动作、隧道可视）→ Termius 式工作区模板与日志复盘。
3. **P1 再谈团队 / 企业**：数据源同步、协作、Passkey、企业认证与后量子，按真实客户需求驱动。
4. **P2 按需**：移动端、RDP、冷门仿真与集中合规，不抢主线带宽。
)
