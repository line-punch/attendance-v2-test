# V2 TEST001｜LINE 假單狀態查詢整合候選與安全門檻（2026-10-29）

> **尚未部署，不能宣稱員工的 LINE 已可查假單**。這是唯一 TEST001 模擬假單（`LEAVEV2_TEST_20261110_0001`）的狀態回查實驗，不允許對真實員工或正式打卡使用。

## 已通過的實機里程碑（使用者回報）

- TEST001 的兩張人資新表 `公司工作日曆` / `特殊出勤事件` 已建立；虛構年度、假日、停班資料寫入並讀回成功。
- 2026-10-29 14:36：TEST001 Apps Script 唯讀規則 `checksPassed=6` PASS，測得虛構假日請假阻擋、停班 480 分鐘照薪而實際工作 0。
- 14:44：TEST001 Apps Script 請假預檢 `leaveCasesPassed=14` PASS，**未產生假單**。
- 14:54：TEST001 的 `V2請假寫入測試` 臨時分頁，固定虛構單號首次寫入成功 `alreadySubmitted=false, writeCount=1`。
- 14:57：再次執行同一單號，回覆 `alreadySubmitted=true, writeCount=0`，沒有重複新增。
- 15:02：獨立唯讀查詢 `present=true, applicationCount=1, approvalStatus=待審核（測試）`。以上尚非 LINE 前端操作。

## 本輪完成的新候選程式（只在 GitHub 隔離分支）

| 檔案 | 用途 | 測試結果 |
|---|---|---|
| `AttendanceV2_LeaveStatus_SecureBridge_PROPOSAL.gs` | TEST001 已驗證 LINE 身分，只能查固定模擬單號。修正 Apps Script 對相同 Sheet 不同物件包裝的比較，改用試算表 ID | 13／13 通過 |
| `AttendanceV2_LeaveStatus_DispatchCandidate_TEST_ONLY.gs` | 內部候選分派：檢查 40 位 nonce、只允許 `leaveStatus`、JSON 僅可有 idToken/requestId，先驗 LINE Token 再查狀態 | 14／14 通過 |
| `AttendanceV2_LeaveStatus_ClientCandidate.js` | 前端查詢狀態控制器：登入檢查、執行中、查到／暫未查到、逾時未確認、防重複點擊。依賴既有登入後 `sandboxCall`，不包含任何憑證、網址或實際網路呼叫 | 12／12 通過 |
| `AttendanceV2_LeaveStatus_E2EMock.test.js` | 模擬手機 UI → 請求 → 後端 LINE 身分驗證 → 單號狀態 → 回覆遺失後再查 | 10／10 通過 |

以上合計 **49／49 項新模擬回歸通過**（包含更新後的 13、14、12、10 項），不等於 LINE／GAS 正式串接實測。

## 嚴格保留的現有功能

- **絕對不改**正式 `line-punch/line-punch` 的 `main/index.html`、正式 Apps Script `打卡系統`，也不改當前 `attendance-v2-test/main/index.html` 的 GPS 打卡、目前 TEST001 的既有資料部署。
- 新程式皆**沒有** `doGet/doPost`，不在 TEST001 既有 `v2dDispatch_` 白名單內，沒有任何已公開可用的 `leaveStatus` 端點。
- 使用者不需要貼／執行本輪候選程式。這輪沒有新增或修改 Google Sheets 的行列，保留原測試假單與原始打卡。
- 舊的 `V2請假寫入測試` 是一次性的臨時技術驗證表，不算正式新增的人資管理工作表；只保留 2 張正式規劃的 HR 管理表。

## 下一步正式開啟 TEST001 查詢前的必要順序

1. 從原 DATA_TEST_ONLY 的 Apps Script **編輯器實際程式**核對當前部署版本、`doPost/v2dDispatch_` 白名單、已使用的 LINE ID Token 驗證與 `v2dTestSheet_` 安全鎖；測試帳號需可存取原有測試 Sheet。
2. 在**隔離測試後端**加入經審查的唯讀 helper，保留原始 `clock`,`clockStatus`,`todayAttendance`,`whoami`,`bind` 的既有分派。不可覆蓋整個正式或 TEST001 已驗證打卡專案，更不能直接加入到正式系統。
3. 先在**未公開的新測試部署**確認 `leaveStatus` 回覆契約，僅查固定虛構單號；模擬其他 LINE 身分、缺少 token、錯誤 requestId、附帶 employeeId/company 等攻擊都必須失敗；不得回傳 GPS、員工個資或 token。
4. 在測試前端獨立候選頁接入 `sandboxCall('leaveStatus',{requestId})`，驗證 LINE 裝置上的 iframe postMessage 確實送回狀態，並且瀏覽器回覆遺失後仍能重新查詢。
5. 測試以上全部通過，才討論**另一階段**：真正的 V2 請假送出、正式主管核准／駁回與通知。唯讀狀態查詢成功不等於寫入功能已準備上線。

注意：`NOT_FOUND_YET` 或逾時**不是已確認失敗**；不要建立新 requestId 或讓員工盲目重新送單。現階段的 query helper 僅支援 `TEST001` + 固定假單，不具備一般員工多筆請假查詢能力。

## 2026-10-29 16:12 後續整合檢查（尚未部署）

1. 已讀取 GitHub 上既有 TEST001 後端參考版本 `line-punch/line-punch` 的 `staging/AttendanceV2_SandboxDataService.gs`（分支 `feature/v2-gps-boundary-regression-20261022`，SHA `784b1ad143f38f9622f8b6a086d7b8a00b3d9247`）。它保留五個操作：`whoami`、`bind`、`clock`、`clockStatus`、`todayAttendance`。這是**參考原始碼**，不保證與 Google Apps Script 編輯器目前的草稿或實際部署版本相同。
2. 新增 `staging/AttendanceV2_LeaveStatus_RouterAdapter_CANDIDATE.gs`：只對 `leaveStatus` 導向新候選查詢，其餘操作委派給原 `v2dDispatch_`；沒有新增 `doPost/doGet`。此模組已跑 **13／13 項模擬測試通過**，含原五項操作未改動、舊版未授權拒絕、異常請求拒絕等。
3. 另從**目前已通過 GPS 手機測試的 `attendance-v2-test/main/index.html`** 分出 `feature/v2-leave-status-ui-disabled-20261029`。只在該分支增加一個 TEST001 假單查詢區，並設 `enableLeaveStatus:false`（隱藏且不送請求）；**沒有修改或發布 main**。
4. `staging/AttendanceV2_LeaveStatus_UIFlag.test.js`：前端 **13／13 離線測試通過**，且 `postForm`、上/下班打卡、原 requestId 查詢與重送函式均與目前 main 相同。這不是 LINE 端手機實測。

**重要順序**：需先取得原 Google Apps Script 編輯器實際版的確認與安全備份，才可以考慮在 TEST001 專案加入候選唯讀路由；後端測過並單獨部署後，才考慮打開新測試 UI flag。不可把候選檔直接貼到正式「打卡系統」，不可因為 GitHub 測試通過就認定現在 LINE 可以查假單。

## 2026-10-29：後端預設關閉與實際編輯器唯讀檢查

已更新 `staging/AttendanceV2_LeaveStatus_RouterAdapter_CANDIDATE.gs`：新增 Script Properties 安全門檻 `ATTENDANCE_V2_LEAVE_QUERY_TEST=enabled`。**沒有這個屬性或其值非 enabled，候選 `leaveStatus` 路由就拒絕處理**，但既有 `whoami`、`bind`、`clock`、`clockStatus`、`todayAttendance` 直接交回原 `v2dDispatch_`。無法單憑複製候選程式開放新操作。

已更新候選路由測試，**14／14 PASS**，涵蓋開關缺省關閉、明確開啟後允許候選、新功能不影響舊操作等。**沒有在任何真實 Apps Script 專案設定新屬性**。

已新增 `staging/AttendanceV2_EditorRoutingPreflight_TEST_ONLY.gs`，只提供由測試專案擁有人在編輯器執行的 `v2hrInspectTestRouting_TEST_ONLY`。它先呼叫已驗證的 `v2hrGuardTestSheet_()`，檢查 `v2dDispatch_`、`doPost`、LINE claims、回覆和已公開的五項路由仍存在，且尚未在既有分派中出現 `leaveStatus`；另外檢查新的假單查詢屬性尚未開啟。僅輸出安全摘要，不記錄程式原始碼、Token、Sheet ID 或網址，**不修改任何資料**。

它的 `deployedRevisionVerified:false` 是刻意保留：**無論編輯器檢查結果多好，都不能推論 `/exec` 的已部署版本相同**。讀取部署設定與在手機查詢前，仍必須確認原獨立測試 Web App 的版本和發布方式。

對應模擬測試 `AttendanceV2_EditorRoutingPreflight_TEST_ONLY.test.js` **14／14 PASS**。本輪兩組安全測試共 **28／28 PASS**，但尚未在使用者的 GAS 編輯器實際執行預檢。

**下一個安全步驟**：如使用者願意，在原 `YC_ATTENDANCE_V2_DATA_TEST_ONLY` 新增上面唯讀預檢 `.gs` 檔，**只執行** `v2hrInspectTestRouting_TEST_ONLY`，回傳 `ok:true`、`editorSourceChecked:true`、`deployedRevisionVerified:false`、`existingOperations` 五個操作、`leaveStatusFeatureEnabled:false`。不要改 `doPost`、不設定 `ATTENDANCE_V2_LEAVE_QUERY_TEST`、不要部署或修改正式 LINE 打卡。

## 2026-10-29 16:44：TEST001 編輯器安全預檢實機 PASS

使用者在原 `YC_ATTENDANCE_V2_DATA_TEST_ONLY` Apps Script 編輯器執行 `v2hrInspectTestRouting_TEST_ONLY`。16:44:00 開始，16:44:02 記錄：

- `ok:true, synthetic:true, readOnly:true, editorSourceChecked:true`。
- `existingOperations:[whoami,bind,clock,clockStatus,todayAttendance]`，五項原功能仍在。
- `leaveStatusRouteInExistingDispatch:false`、`leaveStatusFeatureEnabled:false`，新功能尚未開放。
- `lineClaimsFunctionPresent:true`、`testSheetNameVerified:true`。
- `deployedRevisionVerified:false` 是刻意的：**這只核對 Apps Script 編輯器目前草稿，不能證明測試 Web App /exec 已部署版本的程式內容或版本號**。
- 使用者回報 16:44:02 執行完畢；此步無寫入、不部署、不更動任何 GPS 或請假資料。

**下一步只查不改**：請使用者在相同測試 Apps Script 專案右上角按「部署 → 管理部署」，截圖包含部署名稱、版本、更新時間與 Web app 設定的畫面（可遮蔽部署 ID、網域或識別資料）。不要點鉛筆、不要建立新部署、不要修改存取權限或執行部署。記錄此測試部署狀態後才規劃額外唯讀候選路由和獨立測試版本。

## 2026-10-29 16:46：DATA_TEST_ONLY 現有部署管理畫面核對

使用者提供 `YC_ATTENDANCE_V2_DATA_TEST_ONLY` 的 Google Apps Script「管理部署作業」截圖：左側「進行中」有一筆「未命名」部署，右側版本顯示 **第 2 版（2026 年 10 月 22 日下午 4:05）**，類型顯示「網頁應用程式」；另有一筆「已封存」未命名部署。截圖中的日期時間是**版本下拉欄旁顯示的標記時間**，未必代表部署最後更新時間。

目前畫面下方的「執行身分」、「誰可以存取」等設定被視窗截斷，**尚未得到證據**，不能假設 Web App 存取設定。部署 URL／ID 不需使用者提供全文或分享。

重要安全區別：今天使用者在 GAS 編輯器新增並成功執行工作日曆、天災、模擬假單程式，屬於編輯器草稿執行；**已部署的固定第 2 版不會因 Ctrl+S 或執行新草稿而自動更新**。因此暫時不能說已部署第 2 版有新 `leaveStatus` 功能；原始 GPS 打卡版本不修改。

下一步只做唯讀人工檢查：在同一「管理部署作業」視窗右側區域向下捲動，截出「執行身分」「誰可以存取」與 URL 類型，不要點右上鉛筆編輯、不要按部署、不要改權限。下個階段才規劃隔離唯讀查詢新部署；需要另外核對 Apps Script 當前編輯器版與第 2 版差異。

## 2026-10-29：TEST001 第 2 版 Web App 的存取權限已確認

使用者從 Google Apps Script `YC_ATTENDANCE_V2_DATA_TEST_ONLY` 之「管理部署作業」確認：
- 正在使用的 Web App 版本為 **第 2 版**，版本顯示日期 **2026/10/22 下午 4:05**（該時間是版本顯示時間，不保證是最後部署時間）。
- **執行身分：我**，代表請求執行時使用部署者的 Google 身分與授權，需防止後端被利用來存取任意資料。
- **誰可以存取：所有人**，代表外部請求可以到達端點，不等於登入/授權通過；必須在每次業務操作後端驗證 LINE ID Token、TEST001 綁定身分、指定隔離試算表與允許的操作。
- 本次只查閱部署管理設定，沒有修改任何現有部署。

**公開端點附加安全門檻（必須先完成才可考慮新部署）：**
1. `doPost` 的原始五項操作保持不變，新 `leaveStatus` 默認停用（Script Property `ATTENDANCE_V2_LEAVE_QUERY_TEST` 不是 `enabled` 就拒絕）；功能開關屬於同個專案，若未來開啟，應確認是否影響任何舊部署行為。
2. 新唯讀路由只接受已向 LINE 伺服器驗證過的 token 身分，並由 `v2dEmployee_` 對應到唯一測試員工 TEST001；手機不可信，不能由前端傳入 employeeId、公司、Sheet ID、LINE userId 來擴大權限。
3. 固定 TEST001 隔離試算表／固定測試假單，禁止調用寫入測試函式或存取正式員工、正式請假與薪資資料。
4. 新功能沒有主管通知、修改或送出假單的能力；錯誤回應不能包含 token、Google Sheet ID、個人身分、原始程式或堆疊。
5. 此類 `所有人`＋`以我身分執行` 的外部端點也存在濫用與資源消耗風險；實際公開前要確認操作白名單、錯誤限制，以及 Google 配額／記錄監控的安排。
6. 不要修改原 **第 2 版** 既有部署或目前 GitHub Pages `main`；若要實測，必須由擁有人建立並確認**獨立測試部署**，只在候選頁測試。取得新部署前不得宣稱 LINE 已能查詢假單。

**下一步**：不再要求使用者貼版本、部署 ID 或權限截圖；先完成針對公開端點安全面的候選整合回歸，然後在 TEST001 的原 Apps Script 編輯器建立可回滾的測試版，再由擁有人決定是否另建部署。不要把目前 `V2請假寫入測試` 模組暴露為任何新 API。
