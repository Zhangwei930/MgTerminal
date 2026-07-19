# 更新日誌


## [0.5.10] - 2026-07-19

### 修復
- **「更新內容」對話框遮罩過暗**：對話框開啟時遮罩過重,將設定視窗左側導覽列壓暗到幾乎看不清;現降低該對話框遮罩的不透明度與模糊,後方導覽保持可讀（僅影響此對話框）

## [0.5.9] - 2026-07-19

### 修復
- **對話框無法關閉**：設定視窗中的對話框（如「更新內容」）因右上角關閉按鈕（X）落在標題列拖曳區、點擊被當作拖曳視窗而無法關閉；現所有對話框均排除於拖曳區之外，X 可正常關閉

## [0.5.8] - 2026-07-19

### 安全
- **本機檔案 IPC 強化**：localFsBridge 的本機檔案讀/寫/刪/列舉介面新增呼叫方 sender 驗證，拒絕 webview/訪客內容，避免轉譯層 XSS 升級為任意本機檔案存取（縱深防禦）
- **相依套件安全強化**：清除生產相依樹全部 high 公告：fast-uri→4.1.1、fast-xml-parser→5.10.1、fast-xml-builder→1.3.0、hono→4.12.31；並將 @cursor/sdk 子樹的 node-gyp→11.4.2、tar→7.5.20（範圍收斂，不影響原生建置）

## [0.5.7] - 2026-07-18

### 功能
- **匿名當機回報(可選)**:預設關閉;在「設定 → 系統」開啟後,向 MagiesTerminal 團隊傳送去識別化的當機摘要(不含路徑、使用者名稱、主機名稱或工作階段資料),協助更快修復當機問題

## [0.5.6] - 2026-07-18

### 安全
- **HTTP inventory 認證標頭加密儲存**：json_http 資料來源的認證標頭(Authorization / API Key)不再以明文寫入本機儲存,改為隨 vault 進行欄位級加密;升級後首次啟動自動遷移既有的明文值
- **相依套件安全強化**：undici 升至 6.27.0、DOMPurify 升至 3.4.12、uuid 升至 13.0.2,修復過時 override 仍命中的可達 XSS 與請求走私 / DoS 公告

## [0.5.5] - 2026-07-18

### 修復
- **自動更新誤報「更新失敗」**：檢查階段錯誤不再視為下載失敗；檢查結束後正確清理 in-flight 狀態
- **Windows arm64 更新頻道**：讀取 `latest-arm64.yml`，避免誤下 x64 安裝包
- **更新檢查與下載路徑更穩**：雙源 feed 與 UI 狀態機對齊，減少併發檢查導致的假錯誤

## [0.5.4] - 2026-07-18

### 安全
- **Vault 解鎖邊界**：停用/改 PIN/註冊或清除 WebAuthn 需已解鎖或驗證目前 PIN；PIN 錯誤限速
- **SSH 診斷/健康檢查**：主機金鑰 unknown/changed 時在認證前中止，避免向中間人傳送密碼
- **工作階段跟隨**：LAN/WAN 應用幀用邀請 token 做 AES-GCM 端到端密封；relay 透明轉發；拒絕偽 wss/ws TLS
- **憑證 IPC**：vault 解鎖與加解密介面校驗呼叫端 sender
- **暫存目錄 / RDP / 深鏈 / 日誌 / AI 附件**：0700 與 symlink 防護、RDP 失敗立即清理 cmdkey、Telnet/JMS 確認、不再記錄 kbd-int 回應、附件大小上限

### 修復
- 健康檢查支援 keyboard-interactive 密碼探測；更新內容彈窗可捲動
- AI 可僅憑附件傳送；SFTP/連接埠轉發可正確傳入 verifyHostKeys

### 工程
- 新增 `npm run typecheck`；修復一批 vault/WebAuthn/更新/SFTP 相關生產型別錯誤

## [0.5.3] - 2026-07-18

### 修復
- **更新內容彈窗無法捲動**：長版釋出說明超出視窗後可正常下拉檢視

### 優化
- 更新日誌彈窗最新版本計數文案修正；10 種介面語言補齊「更新內容」相關文案

## [0.5.2] - 2026-07-18

### 功能
- **本機優先團隊 Vault**：僅中繼資料主機清單包分享、角色（owner/editor/viewer）與 HMAC 簽名稽核；密碼與私鑰永不離開本機
- **工作階段跟隨 WAN 中繼**：TCP NDJSON 中繼支援 NAT 後協作觀看；可內嵌本機中繼或自建 `scripts/follow-relay.cjs`
- **裝置 Passkey 解鎖 Vault**：WebAuthn 平台驗證器（Touch ID / Windows Hello / 安全金鑰）主行程驗證；非雲端多裝置同步
- **內建 ssh2 混合後量子 KEX**：優先 `mlkem768x25519-sha256`，伺服器不支援時回退經典演算法
- **RDP 主機支援**：Vault 一鍵啟動系統遠端桌面用戶端（Windows mstsc、macOS Windows App、Linux xfreerdp）
- **系統 OpenSSH 跳板與代理**：跳板鏈與 HTTP/SOCKS 代理可用於系統 OpenSSH 工作階段

### 優化
- **全域 UI 元件升級**：按鈕、輸入、浮層、側欄、空狀態、Toast 等統一圓角/陰影/焦點環
- **AI 側欄體驗**：問答版面、模型/權限控制、思考指示器（方塊旋轉）與輸入排版
- **更新日誌對話框重設計**：依版本摺疊、分類著色、跟隨介面語言

## [0.5.0] - 2026-07-17

### 功能
- **終端 Hex/Raw 串流診斷面板**：可選開啟，逐位元組檢視工作階段原始輸入輸出，便於排查編碼/跳脫序列問題
- **JSON 主機資料來源**：從本機 JSON 檔案或 HTTP(S) 介面拉取主機清單（CMDB / Ansible / 自訂 API 風格），僅中繼資料、拒絕含金鑰清單；支援 HTTP 認證標頭
- **主機清單分享與匯入**：匯出僅含中繼資料的清單用於團隊交接（含 Ansible YAML 格式），剪貼簿匯入
- **命名工作區範本**：把主機繫結、分割版面、可選 cwd/啟動指令存成範本，快速切換器一鍵套用
- **連線日誌書籤**：重播位置書籤 + 備註 + 搜尋跳轉，日誌清單顯示書籤數
- **連接埠轉送即時通道檢視**：本機/遠端/動態轉送的逐連線來源、目標與流量位元組統計
- **指令碼 onOutput 觸發動作擴充**：命中輸出模式可選桌面通知、提示音、標記分頁、開始工作階段錄製
- **安全貼上與精確廣播**：多行貼上延遲/等待提示符/危險指令確認；廣播可精確指定工作區/選定/分組/視窗
- **系統 OpenSSH 通道增強**：GSSAPI/Kerberos 與後量子（PQ）演算法經系統 OpenSSH 支援；支援跳板鏈與 HTTP/SOCKS 代理
- **內建 ssh2 混合後量子 KEX**：優先協商 `mlkem768x25519-sha256`（ML-KEM-768 + X25519），伺服器不支援時回退經典演算法；不必強制使用系統 ssh
- **RDP 主機支援**：Vault 主機可啟用 RDP，一鍵啟動系統遠端桌面用戶端（Windows mstsc、macOS Windows App、Linux xfreerdp）
- **更新日誌跟隨介面語言**：應用內 Changelog 依目前 UI 語言顯示（10 種語言）

### Windows ARM64
- **win-arm64 安裝包補齊 mosh / ET 綑綁**：MoshMagies 0.1.9 與 EternalTerminal 6.2.10 首發 Windows arm64 原生二進位
- **win-arm64 獨立自動更新來源**：更新中繼資料改走 `latest-arm64.yml` 專用頻道，不再跟隨 x64 更新（此前 arm64 更新會裝到 x64 套件、依賴模擬執行）

## [0.4.10] - 2026-07-17

### 功能
- **SSH 連線診斷中心**：主機編輯面板「測試連線」+ 連線失敗時「執行診斷」，分步檢查 DNS / TCP / 跳板機 / 主機金鑰 / 認證 / SFTP
- **SSH Agent 一等公民認證**：主機可明確選擇 Agent 認證、檢視 Agent 中金鑰指紋並指定偏好身分；連線日誌記錄實際認證方式
- **多主機健康快照**：Vault 一鍵批次檢查線上延遲、認證與負載/記憶體/磁碟，篩選異常主機並執行指令碼
- **SFTP 可靠性一期**：斷點續傳、失敗自動退避重試、傳輸佇列持久化（重啟可恢復）、可選 SHA-256 校驗
- **產品化引導**：首次空 Vault 三步引導；快速切換器指令項（設定/匯入/健康檢查等）；空狀態遷移提示；首次連線成功建議；README 功能矩陣

### 修復
- 升級既有 Vault 的使用者不再彈出首次引導；健康檢查認證失敗時正確關閉跳板連線

## [0.4.9] - 2026-07-17

### 最佳化
- **發布與自動更新來源遷移至獨立發布儲存庫**：安裝包與更新中繼資料現發布在 MgTerminal-releases 儲存庫，官網下載與應用內自動更新體驗不變；既有舊版本用戶端經原網址跳轉繼續正常接收更新

## [0.4.8] - 2026-07-16

### 功能
- **快速連線支援 EternalTerminal**：QuickConnect 精靈新增 ET 協定入口（SSH 連接埠 + ET 服務連接埠，預設 2022），配套 ET 用戶端二進位已隨包綑綁（macOS / Linux / Windows x64）
- **憑證自檢**：設定 → 系統 → 憑證保護新增「自檢」——加解密迴環探測 + 掃描憑證庫，列出在本裝置無法解密的具體條目（主機 / 金鑰 / 身分 / 群組 / 代理），便於鑰匙圈故障後定位需重新輸入的憑證
- **Windows ARM64 安裝包首發**：新增 win-arm64 建置（暫不綑綁 mosh / et，自動更新暫隨 x64 更新來源）
- **工作階段恢復過期清理**：超過 14 天的恢復版面在啟動時自動丟棄，不再恢復大量陳舊佔位符

### 修復
- **俄語介面補齊 203 條缺失文案**（指令碼 / 自動化 / 錄製整個命名空間此前回退英文）、簡體中文補 3 條；新增全量對齊測試防止再回歸
- 快速連線 Mosh 的自訂 mosh-server 路徑此前只收集不生效，現正確寫入主機設定

### 最佳化
- SFTP 全選（Cmd/Ctrl+A）與清單渲染的可見性規則統一為單一實作，消除隱藏檔案 / 過濾詞情境下的行為漂移
- README 的 macOS 說明與實際發布方式對齊（未簽章，附 Gatekeeper 放行步驟；應用內更新不受影響）

## [0.4.7] - 2026-07-15

### 功能
- **介面語言擴充到 10 種**：用戶端與官網對齊，新增日本語 / 한국어 / Deutsch / Français / Español / Português（原有 en / ru / zh-CN / zh-TW 保留）
- 設定 → 外觀 → 語言 可選全部支援語言；未覆蓋的文案仍回退到英語

## [0.4.6] - 2026-07-15

### 安全
- **SSH 主機金鑰校驗關閉時不再靜默**：`verifyHostKeys` 關閉時（終端工作階段與 mosh 統計連線）會記錄明確的告警日誌，說明正在不加詢問地接受任意主機金鑰
- **設定頁持續警示**：關閉「校驗 SSH 主機金鑰」後，開關下方持續顯示中間人風險提示（en / zh-CN / zh-TW）。預設仍為開啟

## [0.4.5] - 2026-07-15

### 修復
- **巢狀密文導致的 401 / 空串流**：鑰匙圈失效期間反覆儲存會把金鑰層層加密（`enc:v2(enc:v1(...))`）；解密迴圈邊界修正後，預算內的多層巢狀能完整解出，不再「解對了又丟棄」或誤報解密失敗
- **單個壞憑證不再拖垮整個憑證庫載入**：欄位解密失敗時改為保留原儲存值（fail-soft），憑證庫照常載入，金鑰在鑰匙圈修復後仍可恢復
- **Web 搜尋 API Key**：解密失敗後僅聚焦/失焦不再誤刪已存金鑰；補充解密/加密失敗的明確提示，不再靜默
- **Windows DPAPI 密文識別修正**：防重複加密守衛此前漏判 DPAPI 金鑰（`AQAAAN` 標頭），鑰匙圈失效時會二次加密成巢狀密文，現已修正
- **Cursor Agent**：解密失敗時不再把密文當 API Key 注入子程序
- 設定頁 Provider / Web 搜尋 / Cursor 三處統一：解密失敗時明確提示重新輸入 Key，切換介面語言不再覆蓋未儲存的 Key

## [0.4.4] - 2026-07-14

### 修復
- **AI 401 / 空串流**：API Key 解密失敗或未同步到主程序時，不再帶著 `__IPC_SECURED__` 佔位符請求供應商；改為立即報錯並提示重新儲存 Key
- 傳送訊息前等待 providers 同步到主程序，避免競態導致鑑權失敗
- 本機 Key 不可用時給出明確 auth 提示（解密失敗 / 缺失 / 佔位符殘留）

## [0.4.3] - 2026-07-14

### 修復
- **API Key 解密**：主程序正確解密 `enc:v2` 本機保險箱金鑰；解密失敗時不再把密文當明文發給供應商（避免 401 與 `…5Q==` 尾綴）
- **憑證佔位符識別**：連線邊界 / 雲同步守衛同步識別 `enc:v2`，避免把本機保險箱密文當密碼發出或上傳到同步
- 模型空串流（`NoOutputGeneratedError`）與 401 鑑權失敗給出可操作的錯誤提示
- Cursor SDK 安裝探測改為 `require.resolve`，避免誤報未安裝

## [0.4.2] - 2026-07-14

### 修復
- **一次性解決 API Key 加密失敗**：鑰匙圈（safeStorage）不可用時自動改用本機加密保險箱（`enc:v2`），應用更新後不再因 Keychain ACL 失效而無法儲存 API Key
- macOS 仍會優先嘗試系統鑰匙圈，失敗時靜默回退；設定 → 系統 可檢視目前後端

## [0.4.1] - 2026-07-14

### 最佳化
- 主題選擇器：卡片預覽（背景 + 主色/次色）、Core / 全部範圍切換、搜尋與空狀態
- 預設 Snow / Midnight 提升對比度與卡片層次，同步 `ui-snow` / `ui-midnight` 終端配色
- 統一選中態與介面層次：Vault 主機/樹、SFTP 清單/樹/分頁列、設定頁導覽、AI 側欄、終端頂列
- 終端主題清單（彈窗 / 側欄）支援搜尋與更清晰色塊預覽
- 將同步狀態、Toast info、更新徽章、拖放高亮等硬編碼色收斂到主題 token

## [0.4.0] - 2026-07-13

### 功能
- 中國使用者下載與自動更新加速：自動識別地區並切換到當地鏡像來源，與 GitHub 雙向回退
- 設定頁「更新內容」改為應用內彈框展示各版本更新記錄，不再跳轉 GitHub
- 新增「問題諮詢」入口，點擊複製聯絡信箱
- SSH 斷線自動重連改為指數退避（5 秒起、最長 60 秒），連續失敗 10 次自動停止並提示手動重連
- 本機/動態連接埠轉送自動重用已認證的終端 SSH 連線，免二次密碼/2FA 驗證
- 匯入 FIDO2 安全金鑰（sk-*）時提示改用 ssh-agent 認證

### 變更
- 設定頁移除「回饋問題」「社群」兩個 GitHub 入口

## [0.3.0] - 2026-07-13

### 修復
- AI 供應商儲存時 API Key 加密失敗不再被靜默吞掉，會在 API Key 下方顯示明確的本地化錯誤提示

## [0.2.9] - 2026-07-13

### 功能
- macOS 支援自動更新：下載後以 bundle 替換方式安裝，繞開未簽章應用的 Squirrel 限制（0.2.9 起全平台可自動升級）

### 修復
- 應用圖示保留官方素材的圓角底板，深淺色下顯示一致

## [0.2.8] - 2026-07-13

### 修復
- Windows 套件啟動即靜默退出：afterPack 重寫 asar 後重新嵌入完整性雜湊，並增加 CI 校驗防止復發
- 更新安裝的進度與錯誤資訊在各平台均可見

## [0.2.7] - 2026-07-13

### 修復
- Windows 發布架構安全的 x64 安裝包

## [0.2.6] - 2026-07-12

### 安全
- 打包版系統匣視窗忽略 `VITE_DEV_SERVER_URL`，並攔截導覽 / 新視窗
- preload 在 `app.asar` 環境下不再把開發伺服器加入可信來源
- 覆蓋升級 DOMPurify 3.3.2、undici 6.23.0，修復可達 XSS / 解壓鏈 DoS
- afterPack 修復 ASAR 檔案完整性雜湊並同步 Info.plist，避免 macOS 啟動即崩潰

### 修復
- Telnet 自動登入整合測試改為等待指令提示符後再斷言完成事件

## [0.2.5] - 2026-07-12

### 修復
- 設定頁社群隱藏「GitHub 原始碼」入口
- 更新內容 / 問題回饋連結改為 `JasonZhangDad/MgTerminal`，修復 404
- 修復「立即重啟」無回應：更新安裝退出不再被 before-quit 非同步髒檢查取消
- 「重啟並更新」失敗時給出明確提示；不支援自動安裝的平台自動開啟 Releases

## [0.2.4] - 2026-07-12

### 安全
- 憑證加密不可用時停止儲存，禁止回退為明文
- SSH 深層連結預設關閉，拒絕包含密碼的 URL，連線前必須確認
- OSC52 剪貼簿預設關閉
- 收緊 Electron CSP，啟用 ASAR 完整性及安全 fuses
- 移除 macOS disable-library-validation 權限

## [0.2.3] - 2026-07-11

### 修復
- 修復打包版 `app://` 主機名被 Chromium 正規化為小寫後，preload 拒絕注入 Electron bridge，導致終端、SFTP、設定、檔案選擇和連接埠轉送等功能不可用
- 統一主視窗、設定視窗及應用權限檢查對 `app://magiesterminal` 的識別，恢復剪貼簿和本機字型權限

## [0.2.2] - 2026-07-11

### 修復
- 主機詳情「Select Color Theme」巢狀 ScrollArea 導致主題點擊無回應；改為單層捲動並用 pointerdown 選擇
- SSH 金鑰/本機金鑰檔案選擇對話框未繫結父視窗，macOS 上無法彈出選檔案
- Settings 視窗在 `app://` 協定下無法開啟
- 側邊欄與安裝包應用圖示改為新圖示資源

## [0.2.1] - 2026-07-11

### CI/CD
- 重新啟用 macOS 和 Windows 自動建置機制（無程式碼簽章模式），提供更多平台的開箱即用套件。

## [0.2.0] - 2026-07-11

### 功能
- 修復自動更新 IPC 事件僅傳送到單一視窗的問題，改為廣播所有視窗（主視窗 + 設定視窗均可收到）
- 統一手動檢查更新與自動更新的狀態機，消除三套並行狀態
- 手動「檢查更新」透過 GitHub API 偵測版本，發現更新後非同步觸發 electron-updater 下載
- 設定視窗中點擊「檢查更新」後，下載進度可即時反映在 UI 中
- 應用啟動後 5 秒自動觸發 `electron-updater` 檢查更新，無需使用者手動點擊
- 發現新版本後自動開始下載（`autoDownload=true`）
- 下載完成後彈出持久 toast 通知，使用者點擊「立即重啟」即可安裝
- 下載失敗時彈出錯誤 toast，提供「開啟 Releases」降級入口
- Settings > System 進度條即時展示自動下載進度，由 `useUpdateCheck` 統一驅動
- Linux deb/rpm/snap 等不支援 electron-updater 的平台自動跳過，保持原有 GitHub API 通知行為

### 設計原理
- `broadcastToAllWindows` 替換 `getSenderWindow` 單點傳送，保證所有視窗都能收到 IPC 事件
- `manualCheckStatus` 欄位追蹤手動檢查 UI 狀態（idle/checking/available/up-to-date/error），與 `autoDownloadStatus` 在 UI 層按優先級渲染
- `SettingsSystemTab` 不再持有本機 update state，單向接收 `useUpdateCheck` 統一資料
- 將原有兩套獨立系統（GitHub API 通知 + electron-updater 手動下載）合併為統一狀態機：`useUpdateCheck` 作為唯一事實來源，同時驅動 `App.tsx` toast 和 `SettingsSystemTab` 進度條
- 全域持久化 IPC 監聽器在 `autoUpdateBridge.init()` 時一次性註冊，避免每次手動下載請求重複註冊/清理監聽器
- `autoInstallOnAppQuit=false`，不做靜默安裝，由使用者主動觸發重啟

### 介面變更（SettingsSystemTabProps）
- 移除：`autoDownloadStatus`、`downloadPercent`
- 新增：`updateState`（完整 UpdateState）、`checkNow`、`installUpdate`、`openReleasePage`

### 注意事項
- `checkNow` 語義：使用 GitHub API（`performCheck`）偵測是否有新版本，若發現更新且 electron-updater 尚未開始下載，則非同步觸發 `bridge.checkForUpdate()` 啟動自動下載流程
- 此功能僅對打包後的應用（Windows NSIS、macOS dmg/zip、Linux AppImage）生效，dev 模式需配合 `forceDevUpdateConfig=true` + `dev-app-update.yml` 測試（見 `.gitignore`）
- `hasUpdate` 舊 toast 在 `autoDownloadStatus !== 'idle'` 時自動抑制，避免與新 toast 重複

### CI / 建置改進
- 跳過 macOS / Windows 建置（需要付費程式碼簽章憑證），專注提供免費 Linux 發行套件
- Linux x64（AlmaLinux 8）編譯器升級：優先使用 Clang，回退 gcc-toolset-13
- Linux arm64（Debian Bullseye）編譯器升級：從 `build-essential` 升級為 `clang-14 + lld-14`
- Release job 不再依賴 macOS/Windows 建置，tag 推送後直接基於 Linux 產物發布 Release
- 軟化 deb 產物校驗：找不到檔案時輸出 warning 而非 error，避免因平台跳過導致 CI 失敗
