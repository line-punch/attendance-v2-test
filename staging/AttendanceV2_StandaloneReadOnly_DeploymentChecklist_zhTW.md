# LINE 打卡 V2｜TEST001 獨立唯讀假單查詢：部署前檢核與回復方案

> 2026-10-29 編寫。**此為候選部署規範，尚未建立新 Google Apps Script 專案，亦未啟用或部署對外查詢。** 禁止把本候選程式覆蓋至正式 `打卡系統` 或既有 GPS 後端 `YC_ATTENDANCE_V2_DATA_TEST_ONLY`。

## 為何改為獨立唯讀 Web App

- 現有 `YC_ATTENDANCE_V2_DATA_TEST_ONLY` 公開 Web App 為 **第 2 版**（2026/10/22 16:05），**以部署者身分執行／所有人可存取**。它的 GPS 上、下班、綁定和今日紀錄已曾經實機通過；保留原部署與現行 V2 GitHub Pages `main/index.html`。
- 該 GAS **編輯器草稿**已有多個由擁有人手動執行的資料建立／驗證函式；把整個草稿直接製成新公開部署會額外納入測試寫入碼。即使未直接從 `doPost` 路由引用，也增加權限暴露、誤觸或未來維護風險。
- 新候選 `staging/AttendanceV2_StandaloneLeaveStatus_READONLY_CANDIDATE.gs` 是**單一獨立專案專用**，只有 `doPost`、`doGet` 兩個公開 Web App 函式；其他輔助函式全部以 `_` 結尾，沒有任何寫入、新假單、主管簽核、GPS 或推播操作。
- 單純查既有 `V2請假寫入測試` 臨時分頁的**固定虛構**單號 `LEAVEV2_TEST_20261110_0001`，不是正式人資介面。

## 安全屬性（僅擁有人於新專案手動填入，禁止公開分享真值）

| Script Property 名稱 | 規定 |
|---|---|
| `V2HR_READONLY_TEST_ENABLED` | 預設不存在或 `disabled`；**所有安全檢查完成才設定為 `enabled`** |
| `V2HR_TEST_SHEET_ID` | 已存在的 TEST001 **隔離**試算表 ID。不得填正式工作表，禁止放入 GitHub、瀏覽器或聊天訊息 |
| `LINE_LOGIN_CHANNEL_ID` | `2012136707`，僅限 TEST001 測試 LINE Channel |

所有請求先檢查固定 40 字元 nonce、唯一 `leaveStatus` 操作、表單 JSON 僅允許 `idToken` 及固定模擬 `requestId`；停用時不向 LINE 驗證或開啟試算表。啟用後先向 LINE 驗證 ID Token 的 issuer/audience/subject/期限，再以 TEST001 隔離員工資料中的綁定 LINE 身分核對唯一員工、公司 `TEST_CO`、狀態「在職」和地點 `TESTSITE`，最後才讀取臨時假單。

## 新服務啟用前必須核對

1. Google 帳號必須是原 TEST001 試算表的合法管理者。若新專案需開啟「以我身分執行／所有人」，應理解外部可向該 Web App 發請求；所有資料存取都靠伺服器端驗證與固定 ID 限制。
2. 新專案**只貼** `AttendanceV2_StandaloneLeaveStatus_READONLY_CANDIDATE.gs` 一支候選檔案；**不可**把原 `程式碼.gs`、`v2hrRunSyntheticLeaveWrite_TEST_ONLY`、`v2IssueTestInvitation` 或正式 `打卡系統` 的任何管理者函式複製進去。
3. 確認新程式不存在 `.setValues`、`.appendRow`、`.setValue`、`.insertSheet`、LINE push、LINE reply，也不接觸正式試算表。
4. 從原隔離 Sheet 在 Google UI 自行複製 ID，**不可貼到對話**，以 Script Properties 設定。起初保持功能旗標 `disabled`，確認即使外部能連線也不讀取。
5. 僅建立**新獨立 Web App 部署**，不得修改現有第 2 版部署的 URL、版本、執行身分、存取權限或 GitHub Pages 主首頁。
6. 先測試被禁用、錯誤 LINE Token、其他 LINE 帳號、未綁定、錯誤單號、資料夾與來源偽造、惡意輸入，再用已綁定 TEST001 的 LINE 帳號測試唯讀查詢。不要送出任何新假單或新 GPS 紀錄。
7. 新服務可能因「所有人可存取」遭無效請求耗用 Apps Script 或 LINE 驗證配額；公開前需要觀察請求錯誤與配額、評估限制測試期／停用機制。這些面向尚未做實網負載測試。

## LINE 測試前端

- 前端候選 `feature/v2-leave-status-ui-disabled-20261029/index.html` 使用 `enableLeaveStatus:false` 與 `leaveStatusApi:"__NOT_CONFIGURED__"`；目前**完全不發出假單查詢**。
- 後端獨立部署完成且安全驗證通過後，才考慮在專用手機測試入口填入**新服務** `/exec` URL，並開啟 `enableLeaveStatus`。原本 `CONFIG.dataApi` 一律保留，繼續供 GPS 測試服務使用，絕不能指向新服務。
- 查詢畫面使用現有 LIFF ID Token 供新後端驗證，前端不允許傳送員工 ID、公司、GPS 或試算表 ID。iframe nonce 與回覆來源仍依原有安全管控。
- 不能把這個分支直接視為已上線：目前 GitHub Pages 正式測試入口仍是 `main`，且沒有開啟上述新功能。

## 已驗證、未驗證與回復

- `AttendanceV2_PublicWebApp_ThreatMock.test.js`：使用先前 GitHub 存檔的 DATA_TEST 參考 `doPost` 契約，**20／20** 公開請求攻擊情境模擬通過，不代表現有第 2 版完整部署程式已被讀取。
- `AttendanceV2_StandaloneLeaveStatus_READONLY_CANDIDATE.test.js`：新獨立唯讀服務 **25／25** 模擬測試通過；目前尚未部署，也沒有經手機驗證。
- 新隔離 UI 的 `AttendanceV2_LeaveStatus_UIFlag.test.js`：獨立 URL 預設不設定、不會打到 GPS 後端，**16／16** 測試通過。
- **回復方式**：在新專案將 `V2HR_READONLY_TEST_ENABLED` 改回 `disabled`，即可拒絕新查詢；若已部署再由新專案管理者封存／停用**新的** Web App 部署。舊第 2 版 GPS 部署和正式系統不需異動。

## 留待後續

目前只完成唯讀固定測試假單的技術方案；一般員工多筆假單、跨月查詢、主管核准／駁回、LINE 通知、薪資整合、NFC 與正式年度日曆實際導入均未在本服務完成。務必以隔離方式逐階段開放，不要把模擬測試 PASS 當成正式上線證據。

## 2026-10-29：使用者已建立獨立空白 Apps Script 專案

使用者已回覆：**新專案已建立**（約定名稱 `YC_ATTENDANCE_V2_LEAVE_STATUS_READONLY_TEST`）。目前僅確認使用者建立了新空白專案，**尚未收到程式已貼妥、Script Properties 已設定或執行／部署的證據**。

下一步安裝步驟：在新專案的預設 `程式碼.gs` 以本分支 `staging/AttendanceV2_StandaloneLeaveStatus_READONLY_CANDIDATE.gs` 全覆蓋，儲存。僅在該新專案的「專案設定 → 指令碼屬性」設定 `V2HR_READONLY_TEST_ENABLED=disabled`、`LINE_LOGIN_CHANNEL_ID=2012136707`、`V2HR_TEST_SHEET_ID=既有 YC_ATTENDANCE_V2_TEST_ONLY 試算表網址 /d/ 與 /edit 之間的 ID`。不要把真實 Sheet ID 貼到聊天或 GitHub；不可取 Apps Script 專案 ID 或 Web App 部署 ID 代替。不要部署也不要執行 doPost/doGet。

獨立新專案尚未有真實手機測試，待使用者確認程式及三個指令碼屬性已儲存且功能旗標為 `disabled` 後，再討論唯讀安裝確認及權限授予。原 DATA_TEST 第 2 版及正式 LINE 打卡都不變。

## 2026-10-29 17:28｜擁有人確認新專案程式與三項屬性已儲存

使用者已回報 `YC_ATTENDANCE_V2_LEAVE_STATUS_READONLY_TEST` 新獨立 Apps Script 專案的完整唯讀程式及三筆 Script Properties **已儲存**；其中 `V2HR_READONLY_TEST_ENABLED=disabled`。未由助手直接讀取/驗證新專案設定，所以這是使用者確認，尚非線上公開 Web App 實測。

**建議下一步僅做最小風險連線冒煙測試**：在新專案內先建立『網頁應用程式』部署，執行身分『我』、存取權『只有我』，而且保持 `disabled`。使用新部署 `/exec` 連結在同一個已登入 Google 測試帳號開啟，確認 `doGet` 只顯示「TEST001 模擬假單唯讀查詢服務；沒有網頁操作入口。」。此步不測試 LINE 身分、不開啟假單查詢，不涉及任何 POST 或寫入。

不要將此新 `/exec` URL 設為原 TEST001 GPS `dataApi`，不要變更 `attendance-v2-test/main` 或正式 LINE。將來要公開給 LINE 用時，才依安全測試結果評估改成『所有人』與啟用新服務；新獨立部署不應連帶改動舊第 2 版。

## 2026-10-29：新獨立專案「僅自己」部署首次 doGet 連線成功

使用者確認在新獨立 Apps Script 專案 `YC_ATTENDANCE_V2_LEAVE_STATUS_READONLY_TEST` 建立 **執行身分：我、存取權：只有我** 的新網頁應用程式部署後，打開該部署 `/exec` 看見：`TEST001 模擬假單唯讀查詢服務；沒有網頁操作入口。`。這表示新服務 **`doGet`** 及擁有人可存取的 Web App URL 冒煙測試成功。

仍未驗證：此部署的 LINE idToken 後端確認、`doPost`、綁定 TEST001 查詢、對外公開路徑、跨網站 iframe postMessage、手機實機。安全屬性 `V2HR_READONLY_TEST_ENABLED` 預設應保持 `disabled`，不能因 `doGet` 成功就宣稱假單已可查。

建議下一階段在**同一個新獨立查詢專案**建立另一筆測試 Web App 部署（不取代僅自己可存取的原部署）：執行身分「我」、存取權「所有人」，功能旗標先保持 `disabled`。僅用 Edge InPrivate 或未登入 Google 的瀏覽器開新 URL 確認 `doGet` 的相同固定說明文字，驗證對外傳遞能力；此時不應對外讀取假單。

此步必須注意新舊部署同屬同一 Apps Script 專案，**Script Properties 是專案共用設定**，將來開啟時會影響所有使用這組程式設定的部署，不可誤以為每筆部署有獨立開關。若公開關閉測試通過，仍應先做錯誤 token／匿名請求 `doPost` 回覆驗證，再考慮短時間開啟僅允許已綁定 TEST001 的唯讀查詢。絕不可修改 DATA_TEST GPS 第 2 版或正式打卡專案。

## 2026-10-29：無痕視窗公開 GET 通過，準備匿名 POST 拒絕測試

使用者已回報：新獨立 Apps Script 專案以「我」身分執行、「所有人」可存取之第二筆 Web App 部署，使用 Edge InPrivate 無痕視窗打開 `/exec`，仍看到 `TEST001 模擬假單唯讀查詢服務；沒有網頁操作入口。`。因此匿名 **GET /exec** 冒煙測試成功；這**尚未**確認匿名 `POST`、LINE 令牌或試算表權限。

為降低使用者操作成本，在 `attendance-v2-test/main` 新增獨立靜態路徑 `leave-status-smoke/index.html`（**沒有修改 main/index.html**）。預計 GitHub Pages 路徑：`https://line-punch.github.io/attendance-v2-test/leave-status-smoke/`。GitHub 原始檔案已成功建立，但 Pages 發布可用性需由使用者當前瀏覽器開啟確認。

測試頁做法：使用者只在本機輸入**新唯讀服務**的 `/exec` URL（不輸入 Google Sheet ID、任何真實 LINE token，不傳給 ChatGPT）；點一次按鈕，送固定 `leaveStatus`、固定 `LEAVEV2_TEST_20261110_0001`，和字面上明確無效的假 JWT `TEST-INVALID.JWT-SYNTHETIC.NOT-A-REAL-LINE-TOKEN`。POST 在 GitHub Pages 的 iframe 中等待受信任 Google 網域、符合隨機 40 字元 nonce 的 `postMessage`。不儲存 URL、token 或真實資料。Web App 安全屬性 **`V2HR_READONLY_TEST_ENABLED` 繼續 disabled**。

預期返回 `ok:false`、`code:UNKNOWN`、沒有假單內容；但只要沒有收到正確回覆，應回報「結果未確認」，不能猜測後端安全拒絕。若回傳 `AUTH` 或 `ok:true`，必須停止並查是否設錯 flag 或部署。此測試不能單獨證明屬性值，需搭配使用者的設定確認。

GitHub 靜態頁在模擬 DOM 下完成 9 項基本檢查：未點不發請求、空網址阻擋、非 Google Script 網域阻擋、單次送出、40 位 nonce、虛構無效 Token、未含真實員工資料、拒絕回覆顯示及既有 GPS/正式首頁 blob SHA 未變。**未實際從此頁連到新 GAS 部署；需用使用者手機／電腦網頁進行真實測試。**

## 2026-10-29：匿名 POST 實機拒絕成功，新增獨立 LIFF 登入冒煙測試

使用者 2026-10-29 提供 `leave-status-smoke/` 網頁截圖，顯示正確的**新獨立 TEST001** Web App `/exec` 已收到 `UNKNOWN` 拒絕，且沒有假單內容。這確認匿名 POST 收到已拒絕的 Google Web App 回覆；仍不能僅憑 `UNKNOWN` 證明屬性值，測試期間應保持 `V2HR_READONLY_TEST_ENABLED=disabled`。

已研究 LINE 官方 LIFF 開啟方式（https://developers.line.biz/en/docs/liff/opening-liff-app/ 與 https://developers.line.biz/en/reference/liff/）：`liff.init()` 於原 Endpoint URL 或其**下層路徑**可用。保留原 LIFF ID `2012136707-2dDU0aSJ` 與原 GitHub Pages Endpoint。

新增並隔離測試 `leave-status-line-test/index.html`，測試分支 `feature/v2-leave-status-liff-test-20261029`。頁面只於載入後執行 LIFF SDK 初始化；**`enableStatusQuery:false`**，因此查詢按鈕 disabled，沒有任何 POST；沒有新 Web App URL、Channel Secret、真實 LINE Token 或 Google Sheet ID 寫入原始碼。使用者於手機點開時只會測到「LINE 已登入」等安全提示，不會查詢原假單。

`LeaveStatusLiff_UI.test.js` 離線 16／16 PASS：登入狀態、按鈕停用、防重複、只送固定模擬單號、後端回覆驗證與錯誤回饋。所有非同步 Google 回覆都用合成 token／合成 URL 模擬，沒有實際存取。

已將**同一份仍停用**的靜態頁放進 GitHub `line-punch/attendance-v2-test/main/leave-status-line-test/index.html`，**只新增子資料夾**，沒有改 `main/index.html`。預計對應 `https://liff.line.me/2012136707-2dDU0aSJ/leave-status-line-test/`，實際 LIFF 子路徑是否成功仍待使用者手機開啟核對。GitHub Pages 網站發布可用性尚未由工具直接確認。

下一階段用 TEST001 已允許的 LINE 測試帳號在手機**只驗證 LIFF 登入**。此時不得改 `V2HR_READONLY_TEST_ENABLED` 屬性，也不得開啟前端查詢旗標。成功只證明 LIFF 初始化／登入，不表示已授權查詢。
