# 打卡系統 V2.0 — 模擬員工綁定／GPS 打卡第三階段

**開發中，未發布。** 正式公司打卡網站 `line-punch/line-punch` 與目前能正常使用的驗證版 GitHub Pages `attendance-v2-test/main` 都不得修改。

## 前兩階段已通過

- Edge InPrivate：LINE → GitHub Pages → Apps Script 伺服器驗證成功。
- iPhone LINE 內建瀏覽器：同樣驗證成功。
- 獨立驗證服務 `YC_ATTENDANCE_V2_LOGIN_VERIFY_ONLY` 不連 Google Sheet，請保留不變。

## 第三階段：獨立資料測試服務

> 這是**第三份隔離 Apps Script 專案**，而非正式打卡 Apps Script；也不要將它加入原來的 `YC_ATTENDANCE_V2_TEST_GAS` 或唯讀驗證專案中。

1. 使用打卡專用 Google 帳號，建立全新**獨立 Apps Script** `YC_ATTENDANCE_V2_DATA_TEST_ONLY`。
2. 用 [`AttendanceV2_SandboxDataService.gs`](https://github.com/line-punch/line-punch/blob/feature/attendance-v2-staging-20261020/staging/AttendanceV2_SandboxDataService.gs) **一份完整程式**取代新專案的 `程式碼.gs`。不需要加入 HTML 或任何其他檔案。
3. 新專案設定「指令碼屬性」，僅設定：
   - `ATTENDANCE_V2_DATA_TEST` = `enabled`
   - `ATTENDANCE_V2_TEST_SHEET_ID` = **已存在的 `YC_ATTENDANCE_V2_TEST_ONLY` Google Sheet ID**
   - `LINE_LOGIN_CHANNEL_ID` = `2012136707`
4. 此服務每次請求會檢查測試表名稱、固定模擬員工 `TEST001`、允許地點 `TESTSITE`，以及 LINE ID Token 有效性。
5. 原則上先完成私有測試和程式審核，再由管理者明確授權將**這個最小範圍的新專案**部署為測試 Web App。「執行身分：我」，若需手機連線，「誰可以存取：任何人」。不要放寬已存在的舊測試 GAS 的權限。
6. 取得全新 `/exec` 網址後，才將本 GitHub 分支 `index.html` 的 `dataApi` 改為實際網址，並將 `enableDataTesting` 改為 `true`；測試、核對完成前不可合併到 GitHub Pages `main`。

## 模擬員工第一次綁定

1. 管理者在**這個獨立 DATA 測試專案** Apps Script 編輯器，手動執行 `v2IssueTestInvitation`。執行後會在**管理員私人執行記錄**顯示 32 位、30 分鐘有效的邀請碼。請勿公開分享或上傳 GitHub。
2. 用自己已通過測試的個人 LINE 進入 V2 測試 LIFF，輸入邀請碼，同意綁定 `TEST001／模擬員工甲`。
3. 綁定一次成功後，其他 LINE 帳號不能取代。若同一位測試者沒有收到回覆，重新查詢測試身分即可確認成功，避免重複綁定。
4. TEST001 只存在隔離 Google Sheet，不是正式員工帳號。

## GPS 測試場地與防重複

- 目前測試 Sheet「上班地點」的 `TESTSITE` 中心點預設為 `0,0`，故一律**拒絕首次測試打卡**。
- 管理者需親自在測試 Sheet `上班地點!D2` 填入**實際選定的測試場地** GPS `緯度,經度`（無需傳到聊天室），並在 `E2` 填寫容許半徑（10～300 公尺，依實測精度調整）。只改隔離測試表，不要改正式「上班地點」。
- 首次打卡必須使用當下新定位、精度 `<=150m`、120 秒內的新鮮座標。
- 打卡紀錄採原有 11 欄布局，來源欄 K 使用 `LINE-V2:<requestId>`。相同 requestId 重送可確認先前紀錄，不會多寫一筆。
- 在結果未確認時，**先查詢原 requestId**；不是簡單換一個新 ID 再按打卡。已確認拒絕（超出距離、GPS 過期）才清除 pending。

## 尚未完成的驗證／正式上線阻擋

- 本地後端測試 34/34 通過；未發布 LIFF 客戶端模擬測試 7/7 通過。
- 沒有進行真正的資料測試 Web App 部署及 iPhone GPS 打卡。
- GPS 可被惡意裝置偽造，不代表能單憑瀏覽器座標證明員工實際在場。NFC 動態防重播留待後續。
- 尚未加入請假實際寫入、主管審核、多人併發、離職/換機復原、後端速率限制及通知補償。
- 不得合併或部署至員工目前使用的正式打卡系統。
