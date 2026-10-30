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

## 2026-10-29 18:26｜手機 LIFF 登入實機 PASS；已備好獨立授權查詢入口

使用者提供 iPhone LINE 內建瀏覽器的 `leave-status-line-test` 畫面截圖（約 18:26），標頭顯示 `TEST001｜LINE 假單狀態查詢`，主按鈕 `已登入測試 LINE`，狀態提示 `✅ LINE 已登入。真正的 TEST001 員工綁定仍需由伺服器在查詢時驗證。`。此實機證據代表新子路徑 LIFF **初始化／登入 PASS**，不代表已查過原假單；頁面查詢鈕灰色是預設 flag 禁用的預期。

新建並放在同 repo `main/leave-status-authorized-check/index.html` 的**另一條獨立 LIFF 子路徑**：`https://liff.line.me/2012136707-2dDU0aSJ/leave-status-authorized-check/`。不覆蓋既有 `leave-status-line-test` 登入煙霧頁、TEST001 GPS `main/index.html`，也不碰正式打卡 `line-punch/line-punch`。

此單次測試入口只在使用者明確勾選 `我已確認這是 TEST001 專用唯讀服務，且已由管理者開啟測試` 後開放查詢按鈕，且必須手動填入**新獨立服務** `/exec` URL。無 URL、無勾選、不在 LINE 登入狀態皆不發出 POST。POST 內容限定後端驗證需要的 LINE ID Token 與固定模擬 `requestId=LEAVEV2_TEST_20261110_0001`；採原 iframe `postMessage` 的受信任 Google origin、40 位隨機 nonce 及 iframe source 檢查，遇回覆不明不重新送單。無 localStorage/sessionStorage，不把 URL 或 token 放進公開程式。

離線用假 LINE SDK、假 Google Web App 回覆驗證的 12／12 項 UI 狀態檢查 PASS：登入、勾選、網址限制、無自動 POST、無重複送出、固定範圍、成功/暫未查到/未知拒絕，舊登錄頁與 GPS 正式首頁 SHA 未變。GitHub 靜態頁已建立，但新子路徑是否可從 iPhone LINE 順利開啟還需實機確認。

下一步如擁有人準備做真正唯讀查詢：在**新** `YC_ATTENDANCE_V2_LEAVE_STATUS_READONLY_TEST` 專案確認另外兩項屬性沒有錯誤後，把 `V2HR_READONLY_TEST_ENABLED` 暫時改成 `enabled`；注意**此 Script Property 是專案共用**，任何同專案部署都會受影響。新獨立服務的 Web App 存取目前已用無痕 GET 和匿名 POST 關閉測試通過。然後用 TEST001 已綁定 LINE 帳號開啟新的授權查詢子路徑，貼**新服務所有人 /exec URL**，勾選確認後按一次查詢；預期回覆 `PENDING_REVIEW_TEST`。無論成功與否，當次驗證結束即將 flag 改回 `disabled`，不更動原 GPS 後端、正式請假或薪資。不得把真實 Token 或部署網址貼回對話。

目前為止尚未啟用新 Script Property、未從 LINE 真的呼叫已授權 `doPost`、未在公開 Web App 端驗證綁定身分查詢成功。

## 2026-10-29 18:37｜TEST001 手機唯讀查詢結果未確認，暫停重送

使用者在 iPhone LINE LIFF 的獨立 `/leave-status-authorized-check/` 頁按一次「查詢原模擬假單」，手機截圖時間約 18:37，畫面確認 LINE 已登入、輸入新 Web App `/exec`（未提供完整網址），勾選已確認、查詢按鈕恢復可按，最終顯示：`⚠️ 查詢連線或回覆未完成；結果不明，請保留原單號，勿重新送單。`。

**這不表示假單不存在、不證明 token 無效，更不能宣稱後端資料已成功讀取。** 目前前端 `leave-status-authorized-check/index.html` 在 `catch(error)` 中把 timeout、`UNKNOWN` 與其他錯誤合併為同一提示；只有 `AUTH` 有單獨文案。另 `receive(ev)` 除檢查 origin、bridge 與 nonce，還嚴格要求 `ev.source===iframe.contentWindow`，如 Google Apps Script HTMLService 多層 iframe 導致事件來源不同，可能忽略合法回覆；這只是**待驗證假設**，未確認不是身分/後端問題。

已先向使用者要求立即將**新獨立 Apps Script 專案**的 `V2HR_READONLY_TEST_ENABLED` 改回 `disabled` 並儲存，停止重送，保留既有 GPS 第 2 版及正式系統。

下一步**只讀取執行紀錄**：開啟新專案左側「執行項目」，檢查 18:36–18:38 附近是否有 `doPost`，以及開始時間、執行狀態（完成/失敗）與執行時間。**不要截圖/分享 LINE Token、Script Properties 的值、完整部署 ID 或 Web App URL。**

判讀：若沒有 `doPost`，先查手機 POST 是否送達 Apps Script/是否被 iframe/Google 瀏覽器限制。若 `doPost` 完成，表示請求有進入新服務，但 `doPost` 可能把應用層失敗封裝成 HTML success；需再區分 `UNKNOWN` 拒絕、`AUTH`、已讀回而訊息遺失。若 `doPost` 失敗，依最小化錯誤訊息修正。禁止直接刪除或重建模擬假單。

Google 官方 HTMLService IFRAME 說明：https://developers.google.com/apps-script/guides/html/restrictions 。

## 2026-10-29 18:41｜實機 doPost 已達 GAS，但 LINE iframe 回覆尚不明

使用者提供新的 **獨立** `YC_ATTENDANCE_V2_LEAVE_STATUS_READONLY_TEST` Apps Script「執行項目」截圖，8 筆記錄（過去 7 天），重要項：
- **版本 2 `doPost` 2026/10/29 18:36:09，持續 2.615 秒，狀態「已完成」**，與手機約 18:37 的 LINE 查詢未知結果相符。
- 版本 2 `doPost` 18:11:26，0.564 秒，狀態「已完成」，對應較早匿名安全測試。
- 多筆版本 2 `doGet` 已完成。這些是新唯讀服務，不是原本 GPS DATA_TEST 的第 2 版（兩個專案各自有版本 2）。

由此確認**手機 POST 至少送到了新獨立 Web App 並執行完 doPost**；「已完成」只代表 GAS 對請求處理並回傳，不能證明 LINE token、TEST001 綁定、模擬假單讀取成功，也不能確認手機收到 HTMLService 的 postMessage。由於 GAS `doPost` 對錯誤會封裝成回覆，沒有用戶可安全讀取的詳細查詢結果。

檢查既有 `main/leave-status-authorized-check/index.html` 後，`receive(ev)` 將可信來源限制到 Google HTTPS 後，還要求 `ev.source===iframe.contentWindow`；但 GAS `HtmlService` 有可能透過多層 iframe 的不同 window 送 `window.top.postMessage`。因此這個 `source` 條件可能讓合法回覆被忽略，**仍屬假設，不是已確認根因**。匿名 smoke 頁沒有檢查 `event.source`，先前曾收到 `UNKNOWN`。

已**獨立新增、未覆蓋舊頁** `line-punch/attendance-v2-test/main/leave-status-diagnostic/index.html`，LIFF 子路徑為 `https://liff.line.me/2012136707-2dDU0aSJ/leave-status-diagnostic/`。只接受受信任 HTTPS Google origin、每次 40 位高熵 nonce、原 `YC_V2_STAGING_FORM_V1` bridge；不再要求 iframe source 恆等，並分開顯示後端 `AUTH`、`UNKNOWN`、`REPLY_TIMEOUT`。仍只有固定 TEST001 虛構單號的 `leaveStatus` 唯讀查詢，明確勾選確認才會 POST；網址不持久化、不寫入。

`leave-status-diagnostic/LeaveStatusReplyDiagnostic.test.js` **14／14 項離線驗證通過**，含多層 iframe `source` 不同但可信 origin+nonce 可接收，惡意 origin 忽略、逾時、單次送出、防連點、回覆錯誤區分、未登入/未勾選禁止請求。原 LINE 登入頁、舊授權頁、GPS 主頁、正式打卡系統與 Apps Script 部署均未改動。

使用者需保持新獨立專案 `V2HR_READONLY_TEST_ENABLED=disabled`，若之後要再做一次診斷，**僅短暫**將其改為 `enabled` 並從新診斷頁按一次「查詢原模擬假單」，完成即改回 disabled；不得貼完整 Web App URL、LINE token、Sheet ID 或員工個資到聊天。回報只需結果區的短文字。

## 2026-10-29 18:51｜手機截圖顯示舊版授權頁，診斷版尚未真正測到

使用者於 18:51 上傳 LINE 手機畫面，畫面仍出現**舊授權頁**的文案 `先核對新獨立 Apps Script 的三項安全設定`、`我已確認這是 TEST001 專用唯讀服務，且已由管理者開啟測試`、`⚠️ 查詢連線或回覆未完成；結果不明...`。這些確實存在於 `main/leave-status-authorized-check/index.html`（SHA `fed0242e75b3b1315c99c8e629d727abfa6b5ec0`），**並不存在**於新 `main/leave-status-diagnostic/index.html`（SHA `6f7c043150357ef1caffaef90741a9c3291265dd`），新頁預期標題 `TEST001｜假單查詢回覆診斷` 並區分 AUTH、UNKNOWN、45 秒逾時。因此此次手機實際操作無法視為新診斷頁通過或失敗。

使用者已明確確認完成後把新專案 `V2HR_READONLY_TEST_ENABLED` 改回 `disabled`；先保持此狀態，**不要再送任何 POST 或重新部署**。

先從手機 LINE 關閉舊視窗，使用完整 LIFF 新深層連結 `https://liff.line.me/2012136707-2dDU0aSJ/leave-status-diagnostic/?v=20261029diag2` 開新頁，只核對**頂部標題是否為 `TEST001｜假單查詢回覆診斷`**，不按查詢、不改屬性。若依然出現舊版，調查 LINE LIFF WebView 快取／深層路由，不能再把舊頁結果當新診斷。

LINE 官方文件支援 LIFF URL 的下層路徑及 query parameter；實際是否成功仍應以手機顯示的**頁面標題**驗證，而非僅看 LINE WebView 的短網址標籤。https://developers.line.biz/en/docs/liff/opening-liff-app/

## 2026-10-29 18:54：新版診斷頁確認收到後端 UNKNOWN

使用者先後上傳兩張 18:54 iPhone LINE 截圖，實際標題為 `TEST001｜假單查詢回覆診斷`（本次確定不是舊授權頁），查詢結果顯示：`⚠️ 後端已回覆 UNKNOWN：查詢未確認（可能是權限、設定或資料檢查問題）。沒有回傳假單；請勿重新送單。`。使用者確認已將新獨立 GAS 的 `V2HR_READONLY_TEST_ENABLED` 改回 `disabled` 並儲存。

**可證明**：新 LIFF 子路徑已正常載入、LINE 在客戶端已登入；新獨立 GAS `doPost` 的跨網站 HTMLService 回覆已可被手機接收並解析（bridge、origin、nonce 均通過），明確回覆 `UNKNOWN`。因此這一輪主要排查點從跨網站回覆移轉至後端拒絕原因；**不能證明** LINE token 綁定 TEST001、成功讀到模擬假單或已完成後端正式授權。

程式碼中的 `v2hrOnlyPublicError_` 將部分內部設定/權限/資料不符統一為 `UNKNOWN`（安全起見不對外曝露細節）。可能類別包括旗標未開啟、試算表 ID／權限／名稱不符、TEST001 員工公司或 LINE 綁定不符、臨時假單表格／資料不符。以上均是待核對可能性，不可直接斷定。

為避免更多手機 POST 與在公開端點揭露敏感資訊，新增**只由專案擁有人在 Apps Script 編輯器手動執行**的 `staging/AttendanceV2_StandaloneOwnerDiagnostics_READONLY_TEST.gs`。函式 `v2hrAuditStandaloneOwner_TEST_ONLY` 以 `V2HR_READONLY_TEST_ENABLED=disabled` 做前提，只檢查新獨立專案的三個 Script Properties、TEST001 隔離試算表的可存取性／名稱、單一測試員工資料／LINE 綁定格式、固定虛構假單表頭與 12 欄資料。只 Logger.log 布林值、錯誤代碼及不一致欄位字母，**不輸出 ID、Token、個資或實際試算表欄位值**，不寫入、不新增任何 doPost/doGet，也不部署。

對應 `AttendanceV2_StandaloneOwnerDiagnostics_READONLY_TEST.test.js` **14／14 離線模擬 PASS**。此診斷只核對編輯器草稿與測試 Sheet，**不能核對已部署 Web App 版本**，也無法以沒有 LINE token 的方式證明目前手機 LINE 身分與試算表的綁定 ID 一致。

下一步使用者只要將 `.gs` 檔貼到**新**專案 `YC_ATTENDANCE_V2_LEAVE_STATUS_READONLY_TEST` 的新 Script 檔，保持安全旗標 `disabled`，選 `v2hrAuditStandaloneOwner_TEST_ONLY` 執行一次，把 JSON Logger 結果貼回。不得修改原 TEST001 GPS DATA_TEST_ONLY 專案、正式打卡、或新部署；如果診斷顯示 `ok:true` 但手機曾回 `UNKNOWN`，後續再隔離辨識部署版／LINE 身分差異。

## 2026-10-30｜獨立唯讀後端 V3 安全階段記錄

昨晚擁有人在新的 `YC_ATTENDANCE_V2_LEAVE_STATUS_READONLY_TEST` 執行編輯器唯讀檢查，結果 `ok:true`，安全旗標 `disabled`，TEST001 測試 Sheet 的設定、員工綁定欄位**格式**、固定假單 12 欄等皆通過，`mismatchedColumns:[]`，`deployedRevisionVerified:false`。LINE 手機曾從新的獨立 Web App 收到 `UNKNOWN`，原因仍不明。

為縮小 UNKNOWN 的原因，在 GitHub 測試分支新增 `staging/AttendanceV2_StandaloneLeaveStatus_DIAGNOSTIC_V3.gs`。這是**完整覆蓋候選程式**，僅供新的獨立唯讀 Apps Script `程式碼.gs` 安裝，不可貼進原 TEST001 GPS 後端或正式打卡專案。它在後端 Logger 中只記錄白名單代碼：`INPUT`、`SETTINGS`、`LINE_VERIFY`、`IDENTITY`、`IDENTITY_BOUND_ACCOUNT_DENIED`、`MOCK_LEAVE`、`MOCK_FOUND` 等。即使後端發生錯誤，對外回覆仍維持原本安全的 `AUTH` 或 `UNKNOWN`，不提供原始例外內容。

V3 原模擬回歸及新增安全記錄驗證 `AttendanceV2_StandaloneLeaveStatus_DIAGNOSTIC_V3.test.js` **32／32 PASS**，原有只讀、失敗拒絕、不輸出敏感內容、匿名拒絕等行為保持不變。

**建議分階段部署**：
1. 使用者在新獨立專案確認 `V2HR_READONLY_TEST_ENABLED=disabled`，將 `程式碼.gs` 的 V2 內容替換為 V3 完整程式，按 Ctrl+S；原已部署第 2 版不變。
2. 先在編輯器核對原本管理者唯讀檢查仍正常；不需要再次匯入固定測試假單，也不能執行任何送單寫入函式。
3. 只有確認新程式安全後，在新獨立專案**新增一筆 Web App 部署**（不要編輯既有第 2 版部署），開始時仍保持 `disabled`。新部署與原版本的 Script Properties 是同一專案共用。
4. 若要手機實際診斷，才短暫設 `enabled`，用新部署網址在已成功的 TEST001 LIFF 診斷頁查詢**一次**；之後立即恢復 `disabled`。回到 Apps Script「執行項目」找到新版本 `doPost` 之安全記錄 `V2HR_DIAGNOSTIC=...`，只回報代碼即可；不分享 LINE token、完整 URL/部署 ID 或 Sheet ID。

**請勿誤判**：V3 是候選程式與模擬測試，目前還沒有在真實新專案安裝、部署或手機測試。已部署的原第 2 版與正式打卡保持不動。