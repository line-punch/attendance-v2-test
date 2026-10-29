# V2 TEST001｜假單狀態查詢手機候選版（2026-10-29）

> 這個檔案所在分支是 `feature/v2-leave-status-ui-disabled-20261029`，不是 `main`。**沒有發布 GitHub Pages、沒有修改正式 LINE Rich Menu，也沒有部署 Apps Script。**

## 為何要保留關閉狀態

TEST001 的 Apps Script 編輯器內已驗證固定虛構假單的寫入、重複辨識和唯讀查詢；但這**不等於目前對外 `doPost` 已開放 `leaveStatus`**。現有測試後端仍只有 `whoami`、`bind`、`clock`、`clockStatus`、`todayAttendance` 五個操作。若提前打開按鈕，LINE 端只會收到拒絕或未確認結果。為避免誤導使用者，新候選畫面在預設設定中使用：

    enableLeaveStatus:false

因此已綁定 TEST001 的員工目前也看不到查詢區，更不會發出 `leaveStatus` 請求。

## 候選介面已具備

- 只允許 TEST001 經過 `whoami` 後端確認後顯示查詢區。
- 原固定虛構假單 `LEAVEV2_TEST_20261110_0001` 由程式提供，員工不輸入別人 ID 或公司。
- 查詢按鈕有「查詢中」及 disabled 防連點回饋。
- 查到 `PENDING_REVIEW_TEST` 時顯示「已確認原模擬假單存在」。
- 回傳 `NOT_FOUND_YET`、逾時、格式異常時不宣稱申請失敗，也不引導重新送單。
- 失去授權或重新確認身分失敗，立即隱藏假單查詢區。
- 完全保留原 GPS、原 requestId、今日打卡、員工綁定等功能。

## 完成的離線測試

- `staging/AttendanceV2_LeaveStatus_UIFlag.test.js`：**13／13 通過**。
- 已確認瀏覽器內部 JS 可編譯。
- `postForm`、`testClock`、`sendPendingClock`、`checkPendingClock`、`retryPendingClock` 與 `main/index.html` 相同，未被新功能修改。
- 這些均是**程式模擬與靜態核對**，不是 LINE 手機實測。

## 尚未進行的步驟

1. 由正確 TEST001 Apps Script 帳號核對目前實際編輯器來源與部署版本。
2. 在隔離環境審核並加上後端 `leaveStatus` 唯讀路由，驗證 TEST001 身分權限及拒絕非測試請求。
3. 用**獨立測試部署**驗證現有跨網域 iframe 回覆；確認後才將測試 UI flag 打開，不能直接動正式打卡或目前正常的 GPS 測試首頁。
4. TEST001 手機測試「查到原單、逾時重新查、不重複寫」後，才能評估下一階段真正送單。

相關測試後端候選位於另一個隔離分支 `feature/v2-sandbox-calendar-special-attendance-20261029`，其程式名為 `AttendanceV2_LeaveStatus_RouterAdapter_CANDIDATE.gs`，不含第二個 `doPost`。原 TEST001 分派的五個操作在模擬下 13／13 PASS，但**尚未套入實際 Apps Script 編輯器**。
