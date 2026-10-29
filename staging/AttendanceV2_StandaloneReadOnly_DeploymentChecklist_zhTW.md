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
