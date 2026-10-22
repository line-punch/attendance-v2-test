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

## 2026-10-22 14:29：iPhone 邀請碼畫面實機確認

使用者提供 iPhone LINE 內建瀏覽器截圖，確認使用帶版本參數的 LIFF 測試入口重新載入後，顯示：
- LINE 後端驗證成功，隔離資料服務連線成功。
- TEST001 尚未綁定。
- 「一次性測試邀請碼」及「確認綁定模擬員工」已可見。
- GPS 打卡仍未開放。

這是前端畫面與真實後端唯讀查詢確認，不等於已實際寫入綁定。下一步須由管理員從 YC_ATTENDANCE_V2_DATA_TEST_ONLY 私有編輯器執行 v2IssueTestInvitation，在 iPhone 輸入 32 位、30 分鐘有效的邀請碼；不要公開邀請碼或截圖洩漏。此測試僅可修改隔離 Google Sheet TEST001。

## 2026-10-22：使用者確認 TEST001 首次綁定成功

使用者回覆「綁定成功」。此為真實 iPhone LINE 內建瀏覽器發起的一次性 TEST001 綁定操作結果，尚未額外獨立查詢 Google Sheet 確認 D2；需要時可由管理員重跑只讀 v2CheckSandboxDataSetup，預期顯示「TEST001：已綁定」。

下一步將隔離測試 Sheet `YC_ATTENDANCE_V2_TEST_ONLY` 的「上班地點」分頁 D2 由 `0,0` 設為測試者實際所在地點的 `緯度,經度`。E2 保持 30 公尺或依場地定位精度審慎調整（後端只接受 10–300 公尺）。此時仍保持測試網站 `enableClock:false`，待實際 GPS 地點填妥再啟用。切勿傳送私人測試地點座標或邀請碼到聊天，也不可更動正式資料表或正式打卡系統。

## 2026-10-22：50 公尺 GPS 隔離實機測試版發布

使用者確認在隔離測試 Sheet 上班地點 D2 GPS 座標、E2 50 公尺設定重新整理後仍保留。此前 TEST001 已由真實 iPhone LINE 帳號完成模擬綁定。

- 已備份上一版成功的綁定測試：backup/stage3-test001-bound-20261022。
- 已發布隔離 GitHub Pages `attendance-v2-test/main/index.html`：SHA `8cf6a31784a0f71048ed5d96ad44eefcb1578b13`。
- 前端功能 enableDataTesting=true / enableBinding=true / enableClock=true，GPS 模擬測試 11/11 PASS。
- 原 Apps Script DATA TEST 後端不變；本次已增補本地 GPS 50 公尺範圍測試，後端 37/37 PASS。
- 正式 `line-punch/line-punch/main/index.html` SHA 仍為 `fe86e76285938f0013e8d457c9547866654fb9b6`。
- 尚未實際用 iPhone 執行 GPS 寫入，亦未確認打卡紀錄資料表產生新列。

實機操作順序：
1. 使用 `https://liff.line.me/2012136707-2dDU0aSJ/?v=20261022gps1`（版本參數只為避免快取）。
2. 確認已綁定 TEST001、看到「上班測試打卡」「下班測試打卡」按鈕。
3. 在隔離 Sheet 設定的實際場地附近，手機開啟位置服務、同意 LINE 定位權限；先單次按「上班測試打卡」。
4. 如果成功，先查看隔離 Sheet 打卡紀錄是否有一筆員工 TEST001、來源 LINE-V2:<requestId>；下一步才測重複處理及下班。
5. 若出現「結果未確認」或逾時，先按「查詢上一筆打卡結果」，不要產生新打卡。
6. 若出現「超出打卡範圍」，核實測試場地和手機定位精度；勿為了測試任意提高範圍上限。

限制：瀏覽器 GPS 不是防偽定位；NFC / NFC SUN-SDM 驗證、正式權限與大量同時打卡仍未完成，不應提供正式員工使用。

## 2026-10-22：使用者回報 iPhone 首筆 GPS 上班打卡成功

使用者表示「上班測試打卡成功」，背景條件：
- iPhone LINE 內建 LIFF，個人 LINE 已以一次性邀請碼綁定隔離測試員工 TEST001。
- 隔離測試表上班地點 D2 已設定當地座標、E2 50 公尺，使用者重新整理確認已儲存。
- GitHub Pages 模擬打卡版 main/index.html SHA 8cf6a31784a0f71048ed5d96ad44eefcb1578b13，enableClock=true。
- 這是**使用者回報手機成功提示**，目前尚未透過 Sheets API 或由使用者提供截圖，獨立核對「打卡紀錄」分頁實際新增的 11 欄資料；不能將資料落地驗證標為 PASS。
- Google Drive 連線目前使用另一公司帳號，對測試 Sheet 權限為 403，未能從此連線直接查表；不應請求授權或分享給錯誤帳號來繞過。
- 下一步請使用者自行查看**隔離測試表**「打卡紀錄」第二列：D=TEST001，F=上班，K 來源前綴 LINE-V2:；保護 GPS 座標與 LINE ID 不外傳。
- 該行確認後，測試同日再次點「上班測試打卡」時應被阻擋（ALREADY_CLOCKED），並確認不增加第二筆。其後才測下班，要求同樣防重。
- 正式主站 main/index.html SHA fe86e76285938f0013e8d457c9547866654fb9b6 仍未改變。

## 2026-10-22：iPhone GPS 四次操作回歸測試

使用者於 iPhone LINE V2 隔離測試網站回報下列**實機操作**：
1. 「上班測試打卡」：成功。
2. 同日再次按「上班測試打卡」：被系統阻擋。
3. 「下班測試打卡」：成功。
4. 同日再次按「下班測試打卡」：被系統阻擋。

**目前可確認的是使用者實機操作的介面回覆**，尚未經有權限帳號獨立讀取隔離試算表「打卡紀錄」核實持久化筆數。先前直接 Sheets API 使用了另一個 Google 帳號，對本隔離試算表回覆 403；不要藉此要求使用者分享表格給不相關帳號。

下一個核對目標：開啟 YC_ATTENDANCE_V2_TEST_ONLY 的「打卡紀錄」分頁，確認標題列之外，應只有**兩筆 TEST001 紀錄**：一筆上班、一筆下班，且每筆來源 K 欄為 `LINE-V2:` 開頭；沒有其他重複列。用戶不需分享 GPS 座標或 token。

已再次核對：
- V2 測試網站 main/index.html SHA 8cf6a31784a0f71048ed5d96ad44eefcb1578b13。
- 正式 line-punch/line-punch/main/index.html SHA fe86e76285938f0013e8d457c9547866654fb9b6 未更動。

後續尚需驗證：網路逾時後依同一 requestId 查詢、GPS 越界、位置權限被拒、不同裝置/同時操作、日跨界/排班規則。現階段不等於正式上線。

## 2026-10-22：打卡實機資料庫只有兩筆

使用者已親自開啟隔離測試 Sheet「打卡紀錄」確認：**上班一筆、下班一筆，共兩筆**。與實機四次操作結果對應：
- 首次上班打卡成功，重複上班被阻擋。
- 首次下班打卡成功，重複下班被阻擋。
- 四次操作未產生重複寫入。此項隔離 iPhone → LINE LIFF → GAS → 測試 Sheet 實機流程判定 PASS。
- 這些為使用者提供的實機與資料庫核對結果，尚未獨立審查逐筆時間、來源欄或 Google Sheets API 完整讀取。

下一輪：
1. 關閉 iPhone LINE 內建測試網頁並重新開啟同一 LIFF；確認再次按「上班」／「下班」均被伺服器阻擋，模擬跨頁重啟後的防重複。
2. 針對原始客訴「不知道打卡是否成功」，設計並驗證後端已驗證身分的**今日本人打卡紀錄查詢**，即使手機已重新開啟、前端的 requestId 不在 sessionStorage，也能查到成功與否。
3. 針對「請求逾時」以測試專用方式模擬已寫入但回覆遺失，要求按原 requestId 查詢，不准無辨識碼重送。
4. 加做 GPS 超出距離、拒絕定位、同時寫入與跨日測試。
5. 正式打卡應用和真實員工資料不變。

## 2026-10-22：重新開啟 iPhone LINE 後防重複打卡通過

使用者用 iPhone 關閉 LINE 內建測試頁後，重新由測試 LIFF 進入，再按「上班測試打卡」：
- 顯示「今日已完成此類型打卡，請先查詢紀錄」；使用者確認 OK。
- 前輪已獨立打開隔離測試 Sheet 確認總共兩筆：TEST001 上班一筆、下班一筆。
- 這證實在已查到當日成功寫入資料的情況下，跨頁重新載入仍能在後端阻擋重複上班打卡。
- 本輪尚未再次直接核實 Sheet 有無第三筆，但返回的後端防重複訊息符合既有規則。

下一步優先開發經 LINE 身分驗證的本人「今日打卡紀錄」，不依賴同一瀏覽器 sessionStorage 的原 requestId；必須後端驗證與指定隔離資料庫，僅查 TEST001 當日上、下班時間，不回傳 GPS、LINE ID、請求碼。其他正式員工資料不能查。

開發分支：
- 打卡 GAS：line-punch/line-punch 分支 feature/v2-today-attendance-query-20261022，檔案 staging/AttendanceV2_SandboxDataService.gs。
- 測試 LIFF 網頁：line-punch/attendance-v2-test 分支 feature/today-attendance-query-20261022，檔案 index.html；enableTodayQuery=false，不會提前呼叫尚未部署的新後端功能。
- 需要更新專用 DATA TEST Apps Script 同一既有網頁應用程式部署並核對 URL 不變，之後才能啟用前端；**正式打卡不動**。

## 2026-10-22：今日打卡紀錄查詢開發完成、待隔離部署

因使用者確認「iPhone LINE 關閉後重開，再按上班測試打卡會被今日已打卡訊息阻擋」，需要進一步解決「打卡後不知道是否真的成功」的 UX 問題，已完成下列尚未發布的功能：

- **DATA TEST GAS**：`line-punch/line-punch` 分支 `feature/v2-today-attendance-query-20261022` 中 `staging/AttendanceV2_SandboxDataService.gs`（SHA `523a6ec271a4e5241968fdd375c55897dffd2a54`）。增加 `todayAttendance` 操作，驗證 LINE ID token、只查綁定的 TEST001、台灣當天「上班／下班」時間，無 GPS / LINE ID / requestId 回傳；日期儲存格支援 Date 與文字，重複紀錄警示。保留 `v2CheckSandboxDataSetup` 唯讀檢查函式，適合完整覆蓋原 GAS 程式碼。
- **UI test branch**：`line-punch/attendance-v2-test` 分支 `feature/today-attendance-query-20261022` 中 `index.html`（SHA `e7503e0935dc958e919a6d7189eb687556dd9781`）。新增「今日打卡紀錄」「重新查詢」介面與登入後自動載入，僅已綁定者可見；對逾時顯示不確定、不推論打卡失敗；`enableTodayQuery:false` 在後端更新前保持關閉。
- **自動模擬回歸**：GAS 46/46 PASS；前端 16/16 PASS。
- **尚未實際部署**：必須由使用者在打卡專用 Google 帳號的 `YC_ATTENDANCE_V2_DATA_TEST_ONLY` Apps Script 編輯器，使用以上 GAS 檔案整份覆蓋、儲存，並編輯既有 Web App 部署 → 新版本；保留原 /exec URL，不要建立新部署或更動任何指令碼屬性。
- 後端部署完成、測試既有 URL 與資料皆正確後，再將**測試 GitHub Pages** `enableTodayQuery:true`，並在 iPhone 實際確認上下班紀錄。正式員工網站及員工資料均不動。

## 2026-10-22：今日打卡查詢已發布到隔離測試網站

使用者回報已在打卡專用 Google 帳號 `YC_ATTENDANCE_V2_DATA_TEST_ONLY` 將新完整程式貼入、更新既有 Web App 部署新版本（待 iPhone 實測 todayAttendance API）。使用者此前確認 iPhone LINE 關閉再進入，同日上班重按被後端阻擋；隔離 Sheet 已核對一筆上班與一筆下班。

在隔離 GitHub 測試站 `line-punch/attendance-v2-test/main/index.html` 上發布「今日打卡紀錄」：
- SHA `aa002a8257d1a5963766df026cc04c37b3ab38f4`，`enableTodayQuery:true`。
- 已有 `TEST001` LINE 綁定時，頁面載入後自動以受驗證的 token 查詢當日上、下班記錄與時間；也能按「重新查詢今日打卡紀錄」。
- 保留隔離員工綁定、GPS 50m 打卡、原 requestId 查詢與重送安全機制，不會回傳 GPS、LINE ID、原請求碼。
- 前端模擬測試 16/16 通過；新後端模擬測試 46/46 通過。
- 發布前先在 `backup/stage4-gps-inout-verified-20261022` 保留前一版成功的 GPS 站點（SHA `8cf6a31784a0f71048ed5d96ad44eefcb1578b13`）。
- 正式 `line-punch/line-punch/main/index.html` SHA 仍為 `fe86e76285938f0013e8d457c9547866654fb9b6`，未更動。

**尚待實機確認**：iPhone LINE 打開 `https://liff.line.me/2012136707-2dDU0aSJ/?v=20261022today1`，查詢畫面顯示 TEST001 當日上、下班時間。不要再新增打卡；若查詢異常須回報原訊息再診斷既有部署與回傳。

## 2026-10-22 16:14：iPhone 今日上班與下班紀錄查詢實機通過

使用者提供兩張 iPhone LINE 內建瀏覽器截圖（上方 16:14 狀態列），證明新版隔離 V2.0 第五階段「今日打卡紀錄」在手機實際成功：
- LINE 後端驗證成功，隔離資料服務連線成功，身分顯示「已綁定：模擬員工甲（TEST001）」。
- 「今日打卡紀錄（2026/10/22，台灣時間）」成功自動顯示：
  - 上班：15:08:30（測試場地）。
  - 下班：15:33:27（測試場地）。
- 頁面提供「重新查詢今日打卡紀錄」按鈕，查詢不依賴瀏覽器 sessionStorage 中的原打卡請求編號。
- 截圖中無 GPS 座標、LINE userId、原打卡 requestId 直接顯示。
- **本輪只驗證當天已成功寫入的歷史兩筆可查**。尚未完成真實網路中斷、回覆遺失及隔日空紀錄測試；不能誤標為這些異常 PASS。
- 測試 GitHub Pages `main/index.html` SHA `aa002a8257d1a5963766df026cc04c37b3ab38f4`，備份分支 `backup/stage5-today-inout-verified-20261022`。
- 正式 `line-punch/line-punch/main/index.html` SHA `fe86e76285938f0013e8d457c9547866654fb9b6` 沒有修改。
