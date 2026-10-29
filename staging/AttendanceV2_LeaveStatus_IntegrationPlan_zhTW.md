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
