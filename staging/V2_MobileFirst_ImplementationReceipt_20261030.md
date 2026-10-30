# 三介面優先：實作與驗證紀錄

範圍依 `V2_ConfirmedMobileScope_20261030.md` 與後續使用者確認；人資查詢建置中、NFC 後接、線下 Excel 結算。

## 本輪已實作

- QA 四入口與獨立畫面：上下班打卡、請假、補打卡、人資查詢（建置中）。
- 正常打卡月表只有日期／上班時間／下班時間；缺卡留白，不讀請假／補打卡流水。
- 獨立 QA GPS 服務：伺服器核對 LINE TEST001/TEST_CO、50 公尺、定位有效時間與精度、一天同類一次、requestId 防重複及原單回查。
- 正常打卡寫入額外的 `V2_正常打卡_QA` 分頁，含 SOURCE=GPS。原 GPS 服務、原測試工作簿與正式系統均未寫入。
- 請假／補打卡有各自的月列表，保留審核狀態；時數請假顯示申請起訖時間。
- 補打卡月查詢加入核心、同步 GAS 與受保護路由，依員工及公司隔離。
- GPS 未確認結果鎖定新寫入；跨頁重載保留原 requestId 與上下班類型。

## 實際 Google 操作

新 QA 專案 `YC_ATTENDANCE_V2_BATCH_QA_ONLY_20261030` 已儲存更新後整包程式。

17:52:05 開始執行 `desktopQaInstallNormalClockTab`；執行記錄顯示 `QA_NORMAL_CLOCK_TAB_READY; existing data preserved`，並顯示執行完畢。此安裝函式必須在主開關與寫入開關皆為 disabled 時才執行；只在已核對的獨立 QA 活頁簿新增分頁，既有分頁及資料不清除。

證據：`evidence/qa-normal-clock-tab-installed.png`。

這僅證明程式已儲存、實際 QA 分頁建立及表頭核對成功；尚未證明新版 GPS 真實定位寫入或 LINE 手機端整合成功。原既有部署版本未因此自動更新。

## 本輪離線測試

- 工作流程核心：39/39。
- 同步 GAS 整包：17/17。
- 受保護路由：17/17。
- 手機流程（假 LINE／DOM／定位）：32/32。
- 新正常打卡 QA 服務（假 Google／GPS）：11/11。

共 116/116 離線案例；不是 116 次實機測試，也不代表先前 327 案例全部重跑。

本機 Edge 實際確認四入口切換與人資查詢建置中頁；未向後端送件。尚待獨立 QA LIFF、可由 LINE 存取的 QA 部署、真實手機定位與三介面完整送件回查。下載供 Excel 的資料格式亦須驗證，尚不宣稱已完成。

## GitHub 與登入串接準備

- feature 分支提交：`a8ba7c39ec568fe48501c22b81191fb89b0cca5b`。
- 獨立靜態 QA 倉庫提交：`3a2ef18d7b7ef94887d491d0c6012a56e7f35bde`；Edge 已實際開啟網站核對四入口。這是頁面發布，不代表新版 GAS 已發布或手機端整合完成。
- LINE Developers 的新 QA LIFF 表單已填妥，尚未提交：名稱「打卡V2獨立整批QA_20261030」，Full，僅 openid，profile／chat_message.write 未選，Add friend Off，Scan QR／Module mode Off。
- 新 QA LIFF 建立與 QA Web App 對 LINE 開放連線，涉及持續登入連線及存取權限變更，需操作當下確認。原 GPS LIFF 保留。
- 證據：`evidence/qa-mobile-four-pages.png`、`evidence/qa-liff-create-review-full.png`。

