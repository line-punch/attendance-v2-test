# 打卡系統 V2.0 — LINE 登入隔離測試

此儲存庫專供 LINE 登入與**唯讀後端身分驗證**測試，與正式打卡網站 `line-punch/line-punch` 完全分離。

## 目前部署狀態（2026-10-21）

- 測試網頁：<https://line-punch.github.io/attendance-v2-test/>
- 測試 LIFF：<https://liff.line.me/2012136707-2dDU0aSJ>
- LINE Login Channel ID：`2012136707`（Developing）。
- GitHub Pages `main/index.html` 已切換成**驗證服務連線測試版**。
- 後端：獨立 `YC_ATTENDANCE_V2_LOGIN_VERIFY_ONLY` Apps Script 專案。
- 僅提交 `verify` 請求，使用 LINE ID Token 向後端驗證；成功回覆僅包含布林值 `verified:true`。
- 沒有連接 Google Sheet、查詢員工、打卡、請假、主管審核及資料寫入功能。
- **正式 Google Apps Script 與正式 LINE LIFF 完全未修改**。

## 測試方法

1. 等 GitHub Pages 自動發布最新 main 程式。
2. 以有測試 Channel 權限的個人 LINE 帳號開啟上方**測試 LIFF**。
3. 頁面會自動檢查 LINE 登入狀態；如尚未登入，點「驗證 LINE 登入」。
4. 理想結果：`✅ 已由 LINE 與獨立 Apps Script 後端驗證登入`。
5. 若顯示驗證失敗或等待逾時，提供畫面中的**錯誤文字即可**；不要提供 LINE ID Token、登入網址參數或驗證碼。

## 重要界線

- GitHub Pages 的原本「僅檢查瀏覽器 LINE 登入」版本已備份於
  `backup/login-smoke-passed-20261021`，可用於測試環境還原。
- 新版前端已進行 HTML/JavaScript 語法檢查及模擬請求測試，但尚未由 ChatGPT 確認**真實 GAS + LINE 跨網站 POST / iframe 回覆**可以成功。
- 新驗證後端完全不需要 Google Sheet 權限。不要在任何公開 GitHub 儲存庫上傳 LINE Channel secret、密碼、LINE ID Token 或員工資料。
- 即使此次身分驗證成功，也不代表 V2.0 打卡／請假可上線；這些功能需要另行完成授權、併發、資料保護及手機測試。

## 2026-10-21 實際測試：後端回覆逾時

測試者已完成 LINE 登入，但 GitHub Pages 向獨立 Apps Script `/exec`
送出 `verify` 表單後，約 45 秒沒有收到跨網站 iframe 的 `postMessage`。
Edge 顯示第三方 Cookie 被封鎖。**目前無法確認 `doPost` 是否有執行**，
不能將逾時等同於 LINE Token 驗證失敗或成功。

Google 官方 HTMLService 文件指出網頁以 iframe sandbox 運作：
<https://developers.google.com/apps-script/guides/html/restrictions>。
另有 2026 年 7 月 Google Issue Tracker 記錄：即使設定
`XFrameOptionsMode.ALLOWALL`，GAS web app 跨來源 iframe
仍可能被 CSP/`X-Frame-Options: SAMEORIGIN` 阻擋：
<https://issuetracker.google.com/issues/532860188>。

**現階段確認：** 不開放打卡、請假、寫入功能；不更動正式系統；
不要求使用者全面啟用第三方 Cookie。

**下次定位問題的第一個證據：** 在專用專案
`YC_ATTENDANCE_V2_LOGIN_VERIFY_ONLY` 的 Apps Script 左側「執行項目」
檢查測試當時是否有 `doPost` 紀錄。
- 若無 `doPost`，優先排查測試部署「誰可以存取」、網路或請求被導向登入頁。
- 若有 `doPost` 完成，優先排查 Google 跨來源 iframe 回覆遭阻擋。
- 若 `doPost` 失敗，依錯誤訊息修正驗證程式或 LINE 通訊。

若 iframe 確定受阻，最終架構應移除 iframe 回覆通道，
改用能提供標準 HTTPS JSON 回應及受限 CORS 的獨立後端，
避免依賴瀏覽器第三方 Cookie 設定。

## 2026-10-22：真實後端驗證成功

使用者透過 Edge InPrivate，開啟 **測試 LIFF** 並以開發者測試帳號登入後，前端顯示：

> ✅ 已由 LINE 與獨立 Apps Script 後端驗證登入。  
> 本階段仍不開放任何打卡、請假或寫入功能。

這個結果表示在本次測試環境中，**LINE 前端登入 → GitHub Pages → 獨立 GAS verify-only 服務 → 前端成功回覆** 的實際通道已完成驗證。不同手機、瀏覽器與同時使用者仍需測試。

同時核對：
- 測試網站 main 仍只呼叫 `verify`，後端驗證功能已啟用。
- 專用 GAS 驗證程式不含 `SpreadsheetApp` 及員工資料存取。
- 正式 `line-punch/line-punch` 的 `main/index.html` SHA 仍維持先前值 `fe86e76285938f0013e8d457c9547866654fb9b6`。
- **尚未**將 LINE 登入綁定到模擬員工，也尚未以手機真正操作打卡、請假、查詢、審核。

### 下一個里程碑

1. 同一測試 LIFF 在 iPhone／Android 實際開啟與重新登入，排除桌機成功、手機失敗。
2. 另行設計授權的測試員工綁定與具防重覆／逾時查詢的 GAS 資料操作 API，維持專用 verify-only 服務不做資料寫入。
3. 完成權限與同時操作安全測試後，才考慮讓獨立 LIFF 操作模擬試算表；不得直接重用原有不安全 JSONP API，也不得放寬正式專案權限。

## 2026-10-22：iPhone LINE 內建瀏覽器驗證成功

使用者提供 iPhone 實際操作截圖，測試 LIFF `2012136707-2dDU0aSJ` 在 LINE 內建瀏覽器顯示：

> ✅ 已由 LINE 與獨立 Apps Script 後端驗證登入。\n本階段仍不開放任何打卡、請假或寫入功能。

驗證範圍：**iPhone LINE 內建瀏覽器 → GitHub Pages → 專用 Apps Script verify-only 服務 → 成功回傳畫面**。此前已在桌機 Edge InPrivate 成功。

未完成：Android 手機相容性、模擬員工身分綁定、GPS 真實打卡寫入、請假審核整合、通知與備援。尚不能將 V2.0 視為正式可上線系統。

## 2026-10-22：iPhone 隔離資料 whoami 實測通過

使用者提供 iPhone LINE 內建瀏覽器截圖，確認：
- LINE 後端驗證成功
- 獨立 DATA TEST Apps Script 可查詢隔離試算表
- 模擬員工 TEST001 尚未綁定
- 頁面顯示「目前僅檢查連線，不開放綁定或打卡」

其後已核對 11/11 項客戶端模擬回歸通過，並僅在 V2 測試網站開啟一次性邀請碼綁定：
- enableDataTesting=true
- enableBinding=true
- enableClock=false
- GitHub Pages 測試 main/index.html SHA 7dfd1209ca765a7ac9e70a0f0b7fe426b9a4ab5a
- 先前 whoami 唯讀版備份在 backup/stage3-whoami-passed-20261022
- 正式 line-punch/line-punch/main/index.html 維持 SHA fe86e76285938f0013e8d457c9547866654fb9b6

下一步：使用者在打卡帳號所屬的獨立 DATA TEST Apps Script 編輯器，手動執行 v2IssueTestInvitation，取得 30 分鐘有效一次性測試碼；不要貼至聊天／公開儲存庫。用 iPhone LINE 內建瀏覽器輸入邀請碼，測試將本人 LINE 綁到隔離資料表 TEST001。GPS 地點仍為未設定，不得開放打卡。
