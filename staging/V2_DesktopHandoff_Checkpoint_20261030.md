# LINE 打卡 V2｜桌面版接手檢核點（2026-10-30）

## 目前成果，請勿從頭重做

- 本專案開發分支：`feature/v2-batch-build-20261030`（`line-punch/attendance-v2-test`）。
- 此分支的 `staging/batch/` 已有一套整合候選：四格模擬操作、請假／補打卡、人資簽核、同公司隔離、通知佇列、原單回查、月結準備度、獨立技術流水與 NFC 安全入口契約。
- 2026-10-30 本次重跑 GitHub 分支既有 11 組離線測試，合計 **223／223 PASS**；另新增 NFC 20／20 PASS，整批 **12 組共 243／243 離線測試**（NFC 結果以最新提交版本重新核對通過）。
- 所有回歸在工具內以虛構資料執行，不是 Apps Script/Google Sheet 的真正執行。
- 先前 iPhone LINE 使用**另一個獨立唯讀 GAS V4**，2026-10-30 12:46 實際查到 TEST001 原單號固定虛構假單，使用者已確認將 `V2HR_READONLY_TEST_ENABLED` 恢復 `disabled`。
- 原 TEST001 GPS 上下班已實測，距離 50 公尺；此批不應覆蓋原 GPS 測試部署。
- 使用者要求**先一次建齊程式，再分 A～E 批次測試**；不再做完一個小點就要求使用者重新部署。

## 桌面接手第一輪：先識別正確帳號，全部唯讀

1. 確認是有權操作 TEST001 隔離試算表、GitHub 測試專案及 LINE LIFF 測試設定的正確 Google／LINE／GitHub 帳號；**不要將另一個帳號登入的 Drive 檔案或 GAS 專案誤當 TEST001**。
2. 開啟正確 TEST001 試算表和專案，先核對名稱、功能、目前部署版本、Script Properties 安全開關；不能用猜測的 Spreadsheet ID。
3. 正式 `打卡系統`、正式 LINE OA 主選單、正式資料工作表一律保持不動。
4. 原 `YC_ATTENDANCE_V2_DATA_TEST_ONLY` GPS 打卡第 2 版及 `attendance-v2-test/main/index.html` 保留，未通過回歸前不得重部署。
5. 新獨立 `YC_ATTENDANCE_V2_LEAVE_STATUS_READONLY_TEST` V4 保持 `V2HR_READONLY_TEST_ENABLED=disabled`；不得為了追蹤新功能擅自開啟。
6. 核對公司工作日曆、特殊出勤事件、原 12 欄請假／11 欄補打卡，尤其「補打卡申請」的公司在 E 欄、班別在 F 欄；**真實既有工作表仍須實機核對表頭和狀態字串**。

## 尚待桌面版／Work 取得有效授權後實作，沒有聲稱已完成

- **Google Apps Script 安全寫入與出錯補償**：候選 `V2_BatchGASJournalPort_QA_NOT_DEPLOYED.gs` 只允許額外的**獨立 QA 技術活頁簿**、既有 8 欄技術流水分頁，在 ScriptLock 下新增同時包含申請狀態與待通知事件的一列；未建立 QA 活頁簿，也未安裝或部署此檔。Apps Script + Google Sheets 不是真正原子交易，寫入後逾時必須查原 requestId。
- **LINE 真實通知**：已有 outbox 規則，但尚未接上訊息 API／實際收件對象核對與可靠重送工作器；不得讓模擬畫面推播。
- **真正的人資核准與狀態查詢**：需要真實測試角色，驗證 LINE ID Token、角色及同公司隔離。不可直接相信前端角色字串。
- **NFC NTAG 424 DNA**：候選 `V2_BatchNFCDynamicGate.js` 已設定預設停用、驗證器信任來源、讀取計數器／重放與已驗證員工地點範圍。真正 AES-128 SDM/SUN 加解密、私密金鑰保存、實體貼紙配置及 iOS/Android 測試**尚未完成**。標籤簽名可降低舊網址重放，但無法完全阻擋即時轉傳或遠端接力，正式上線前需評估額外現場限制。
- **月結、資料封存、薪資與本機備份**：目前只有純離線核對規則；未寫入薪資 Excel、未實際匯出封存或將每月備份回公司電腦。
- **四格正式上線**：整合預覽 `staging/batch/demo/` 只用記憶體虛構資料，尚未接到 LINE OA 正式四格或 GPS 系統。

## 分批驗收安排（待整套真正後端功能備齊後）

A. 身分、LINE 四格、GPS 上下班、NFC 未啟用時回饋、查詢秒數與狀態。

B. 員工請假單日、多上班日、指定時段、假日／補班／停班與本人近三月紀錄。

C. 補打卡、兩名人資權限、核准／駁回、防重複、通知、結果不明回查。

D. 月結、天災照薪、封存、公司電腦備份、與真正薪資表勾稽。

E. iPhone／Android、不同 Google 帳號、斷線逾時、重試、NFC 實體標籤與正式切換前簽收。

## 重要安全界線

- 不允許修改正式資料，也不刪除 TEST001 既有測試資料。
- 同一申請或寫入結果不明，先查原請求，不可反覆按送出。
- 本文件不包含 Spreadsheet ID、LINE Token、AES 私鑰或其他憑證。
- GitHub 模擬測試通過 ≠ 真實 Google Sheets 寫入成功；桌面版能否直接操作，取決於當時已連接的帳號、Work 或電腦操作授權。

## 2026-10-30 本輪接續更新｜13 組離線回歸與多帳號檢查

已逐組重新執行原 11 組 **223／223 項**，新增 NFC 動態 SUN 驗證契約 **20／20 項**及帳號／QA 工作簿唯讀預檢 **13／13 項**。合計 **13 組 256／256 項離線測試通過**；不是 Google Sheet／LINE／NFC 實機成功。已在 `staging/batch/package.json` 安排 13 組的 npm test 測試指令。

本輪新增 `staging/batch/V2_BatchNFCDynamicGate.js`／`.test.js`：必須由真正伺服器 AES SDM 驗證器確認 SUN，才允許用 read counter 防重播。NFC 仍為 disabled，沒有金鑰，無實體標籤實測，合法且尚未使用的 SUN 網址有即時轉送風險。

本輪新增 `staging/batch/V2_BatchQAOwnerPreflight_READONLY_NOT_DEPLOYED.gs`／`.test.js`：未安裝、不會寫入，未來只有選對 TEST001 技術 QA 的 Google 帳號、feature flag disabled 和正確 8 欄技術流水時才顯示預檢通過，避免網站多個 Google 帳號切換而誤操作。若 QA 技術工作簿未建立，函式會安全報未配置，不能拿其他同名帳本代替。

開始桌面／Work 接手時，先唯讀查核 GitHub 分支、正確 Google 帳號、QA 工作簿身分、既有 TEST001 GPS 第 2 版與 V4 disabled，再按 A～E 驗收。原正式資料禁止修改、原測試資料禁止刪除，寫入不明時先查原單號。

## 桌面接手補充：2026-10-30 跨公司重複申請漏洞修正及工期

GitHub 批次分支已補強 `V2_BatchWorkflowCore.js`：同一申請 ID 的指紋與重送核對加入 `company`，預防不同公司共用員工 ID 時的越權重用。新增 3 項核心測試及 1 項 journal E2E，更新後核心 34／34、journal E2E 10／10 離線 PASS。這不是正式 GAS 實機。每天 4 小時、預計主要功能可供集中實機驗收 10–15 天，完整上線與 NFC/備份/薪資核對 18–26 天；詳 `staging/V2_Estimate_4hPerDay_20261030.md`。
