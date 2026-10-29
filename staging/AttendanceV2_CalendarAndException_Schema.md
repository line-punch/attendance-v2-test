# LINE 打卡 V2｜精簡人資日曆與停班資料（2026-10-29）

> **適用現況**：目前只有一間公司實際打卡，員工住同縣市、生活圈接近公司。程式原有兩間公司、兩個打卡點設定保留，但不為尚未啟用的公司建審核流程。本文件與程式都在 V2 隔離 GitHub 分支，尚未建立或更改正式試算表、Apps Script 或 Excel。

## 確定只新增兩張工作表

### 1. 公司工作日曆（平常只記例外日期）

平日原則週一至週五上班、週六日休息。由人資**每年核對一次年度休假安排**，如有國定假日、補班日、公司另行休假則在 A:H 記錄。遇年度調整再次核對，不用逐月簽名。

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| 日期 | 公司 | 指定地點（通常留空） | 上班／休假 | 原因 | 核對依據 | 備註 | 確認紀錄 |

- H 欄測試格式：`確認人|日期時間`（正式版後續由受權限控管的後端產生，不開放員工輸入）。
- **同一張表**的 J:N 是年度核對區：`年度｜公司｜已確認／待確認｜確認人｜確認時間`。不需要「工作日曆月份核定」工作表。
- 跨週末或核定休假日的連續假單須阻擋、要求拆單；政府公布的補班日，經公司核定為工作日後可請假。
- 未核對年度或核對紀錄衝突時，**正式請假須暫停送出，交人資確認**，不能單憑「平日」猜測。

### 2. 特殊出勤事件（颱風停班通常全公司只登記一筆）

| 欄 | 欄名 | 常見輸入方式 |
|---|---|---|
| A | 事件單號 | 由後端產生 |
| B | 日期 | 停班日期 |
| C | 類型 | 颱風／天然災害 |
| D | 適用範圍 | **預設：全公司**，僅必要時可選「指定打卡地點」 |
| E | 指定打卡地點代碼 | 全公司時留空；僅指定地點事件才填 |
| F | 全日／部分 | 通常全日 |
| G | 照常給薪／另行核對 | 依公司政策選擇 |
| H | 官方公告／公司佐證 | 人資確認資料 |
| I | 已確認／待確認 | 確認後生效 |
| J | 確認人 | 內部 |
| K | 確認時間 | 內部 |
| L | 經核對的停班分鐘數 | **部分停班才填**；不能直接假設 8 小時 |
| M | 備註 | 特殊狀況 |

**普通情況**：人資確認公告及適用情形後，建立一筆「全公司、全日、照常給薪」事件即可。不必對約10名員工逐人打勾。若只是某個工作地點適用，可選「指定打卡地點」，但**不提供「指定員工」選單、員工 ID 清單或逐人審核流程**。對極少數居住地、通勤路線或其他特殊情形，交人資人工核對並於既有出缺勤／計薪流程註記；不會因未打卡而自動記曠職。

- 員工正常四格不增加颱風假按鈕，也不要求員工自己請假。
- 原始打卡維持真實時間、空白仍空白；照常給薪是**計薪認定**，不是虛構員工工作時數。
- 全天停班未出勤：曠職 0、全勤不扣、依政策照薪；若仍實際上班或只停半天，要另外核對。
- 已核准特休與後來停班重疊：由人資處理，不得程式自動撤銷。
- 工作地／居住地／通勤必經地若有少見差異，留人資人工特例處理；員工法定權益不因省略「指定員工」功能而消失。

## 技術實作（僅隔離測試分支）

- `staging/AttendanceV2_CalendarAndEventService.js`：**已改成兩表模式**，不再需要每月核定或獨立的個別員工核定表。
- `staging/AttendanceV2_TwoSheetAdapter.js`：將上述 A:H、J:N 與事件 A:M 的**虛構測試資料**轉成規則判斷所需格式。
- `staging/AttendanceV2_PayrollExceptionRules.js`：區分實際工作、受保護停班、公司照薪、半日待核對。
- 測試：`AttendanceV2_CalendarAndEventService.test.js`、`AttendanceV2_TwoSheetAdapter.test.js`、`AttendanceV2_WorkdayAndPayroll.test.js`。

**本輪隔離測試結果**：取消「指定員工」自動適用後重新測試，工作日曆與事件判斷 **39／39**、兩張表轉換 **12／12**、既有天災計薪 **15／15**，合計 **66／66 通過**。包含防止舊格式個別員工 ID 被誤套為全公司停班的防呆。以上均屬純程式模擬，並非 Google Sheets、Apps Script 或手機端驗證。

本階段**純 JavaScript 規則與資料對應**，尚無正式或測試 GAS 網頁 API 讀寫。真正串接時需要：受驗證 LINE 身分、唯讀查詢／後端重驗請假、核對年度日曆、核准事件、操作紀錄、防重複送單與公司隱私保護。Apps Script `getValues()` 的 Date 值需要先按 `Asia/Taipei` 轉成日期字串再交給對應程式。

## 暫時不做

- 不新增「每月工作日曆核定」或「個別員工逐人確認」工作表。
- 不增添員工端颱風假功能。
- 不修改正式資料表欄位、正式 GitHub、GPS 50 公尺測試首頁或 Excel 薪資表。
- NFC 424 DNA 兩張待到貨後另行測試。


## 2026-10-29：獨立 DATA TEST Apps Script 讀取模組

已在同一隔離分支新增：

- `staging/AttendanceV2_TwoSheet_GAS_ReadOnly.gs`：僅供未來手動加入 **YC_ATTENDANCE_V2_DATA_TEST_ONLY** 的測試後端。先呼叫既有 `v2dTestSheet_()` 驗證獨立測試資料庫 ID、名稱、腳本屬性及模擬員工，再進行任何動作；另要求員工為 `TEST001`、公司為 `TEST_CO`。不得加入正式「打卡系統」Apps Script。
- `staging/AttendanceV2_TwoSheet_GAS_ReadOnly.test.js`：以假試算表與假身分執行 **15／15 PASS**，包括無損建立空白分頁、已有分頁不覆蓋、錯誤資料表拒絕、非 TEST001 拒絕、唯讀不寫入、年度核對區 J:N 有效讀取、假日很多列不會干擾年度核對、殘缺資料拒絕等。

設計規則：
1. **只准明確的測試安全鎖**。缺少 `v2dTestSheet_()`、專屬測試 ID 或模擬公司 `TEST_CO` 時直接中止。
2. 安裝函式 `v2hrInstallEmptyTestTabs()` 是**由測試專案擁有人在編輯器明確執行的選用初始化**；不透過外部 Web App 路由呼叫、不新增已存在的分頁、不清除資料，也不自動核准年度或停班事件。
3. **只有唯讀快照**：`v2hrReadVerifiedTestSnapshot_(lineUserId)` 的 `lineUserId` 必須由現有 DATA TEST 後端先以 `v2dLineClaims_(idToken)` 驗證取得，不能相信瀏覽器自行填入。此函式目前**尚未加入 `v2dDispatch_` 白名單**，也不會傳送員工個資或 GPS。
4. 已完成的純 JS 工作日曆、天災給薪規則仍是隔離邏輯；**尚未連上真正 Google Sheet 或假單寫入流程**。舊的測試「工作日曆」保留不動，新表名為「公司工作日曆」。
5. 目前連接的 Google Drive 搜尋不到 `YC_ATTENDANCE_V2_TEST_ONLY`；不要用其他帳號建立替代同名試算表，也不要要求將正式資料分享給不相關帳號。實際部署需先確認能存取原隔離測試表的正確 Google 帳號與 Apps Script 編輯器。

**截至目前的總測試**：精簡規則 66／66 PASS，加上 GAS 試算表模擬讀取與建立測試 15／15 PASS。測試項目屬不同層次，不能因此宣稱已經完成真正 Google Apps Script／Google Sheet 實機串接。

### 下一個可操作里程碑（尚未執行）

在**原本的 TEST001 隔離 DATA TEST Apps Script** 中核對目前部署與原程式後，再以安全新增模組方式加入讀取函式；由測試專案擁有人確認並手動執行 `v2hrInstallEmptyTestTabs`，只在原隔離 Sheet 新增兩張**空白**工作表；最後將已驗證 LINE 登入的唯讀查詢加入測試 API 白名單，進行真實 Google Sheet 讀回核對。這步不動正式打卡專案，也不改 GPS 寫入與請假通知。

## 2026-10-29：測試分頁已由使用者建立，準備寫入虛構測試資料

使用者已在原本 YC_ATTENDANCE_V2_DATA_TEST_ONLY 的 Apps Script 新增唯讀檔案，手動執行 v2hrInstallEmptyTestTabs，並確認試算表有新分頁「公司工作日曆」、「特殊出勤事件」。這僅表示表格存在，尚不能視為真實資料讀寫整合通過。

下一個測試程式：staging/AttendanceV2_InstallSyntheticFixture_TEST_ONLY.gs，手動執行函式 v2hrInstallSyntheticFixture_TEST_ONLY。測試者只需新增一個獨立 .gs 檔案，不修改原本的程式碼.gs。

- 先驗證 TEST001、TEST_CO、YC_ATTENDANCE_V2_TEST_ONLY 與兩張新工作表及標題。
- 要求兩張表的資料區都完全空白，否則拒絕，不清除或覆寫任何既有資料。
- 在「公司工作日曆」A2:H2、J2:N2 寫入虛構 2026 年度確認與 2026-11-11 休假，在「特殊出勤事件」A2:M2 寫入虛構 2026-11-12 全公司停班。全部以 SYNTHETIC_TEST_ONLY 或 MOCK-STOP-20261112 明確標註，不代表任何真實官方停班公告。
- 寫完後立即透過原已建的唯讀模組讀回，Logger 記錄 ok、synthetic、annualYears、calendarOverrides、companyStopEvents（不顯示 LINE Token、員工真實資料或 GPS）。
- 只能在 Apps Script 編輯器由擁有者手動執行，不能加入公開 Web App 路由，不新增排程觸發條件，完全不碰正式打卡與薪資表。

純程式模擬測試：AttendanceV2_InstallSyntheticFixture_TEST_ONLY.test.js 已通過 9／9 項。這不是 Apps Script 真實寫入成功的聲明；待使用者手動執行後再核對。

## 2026-10-29 14:20 後續：兩張新表的虛構資料已由使用者實機寫入、讀回

使用者提供 Apps Script 執行紀錄：開始 14:20:23、紀錄輸出 ok=true, synthetic=true, company=TEST_CO, employeeId=TEST001, annualYears=[2026], calendarOverrides=1, companyStopEvents=1，14:20:26 顯示執行完畢。這是測試表的寫入及讀回成功，**不是**正式請假流程或 payroll 寫入驗證。

已新增 `staging/AttendanceV2_ProbeSyntheticRules_TEST_ONLY.gs`，可供使用者另開一個 .gs 檔案貼到同一獨立 DATA_TEST_ONLY 專案。提供 `v2hrVerifySyntheticRules_TEST_ONLY` 單一編輯器執行函式，使用已上傳的唯讀模組與 *同一批虛構資料*，只讀取，不寫入：

- 2026-11-11 MOCK 公司休假 -> 當天請假阻擋。
- 2026-11-12 MOCK 正常上班日但有已確認公司停班 -> 新假單需人資核對。
- MOCK 480 分鐘排定工時、0 分鐘實際工作、480 分鐘照薪、0 分鐘曠職。
- 模擬資料完整性（年度核對、假日及停班事件唯一性、來源 SYNTHETIC_TEST_ONLY 等）若不符即停止；不得將測試規則套用真實員工。

已執行 `AttendanceV2_ProbeSyntheticRules_TEST_ONLY.test.js`：**11／11 PASS**，包含未授權、資料缺漏、無效確認、意外額外事件與無寫入呼叫檢查。尚未在 Google Apps Script 真實執行本規則檢查；實機結果要等使用者在獨立專案手動執行後核對。原有 GPS 與正式打卡不受影響。

## 2026-10-29 14:36：實機唯讀規則測試成功

使用者回報 Apps Script 執行紀錄：14:36:32 開始、14:36:33 輸出 {ok:true, synthetic:true, readOnly:true, checksPassed:6, leaveOnMockHoliday:BLOCKED, scheduledStormDay:WORKDAY_WITH_APPROVED_STOP, newLeaveOnStorm:HR_REVIEW_REQUIRED, mockActualWorkedMinutes:0, mockPaidStopMinutes:480, mockAbsenceMinutes:0, payrollStatus:DISASTER_NO_WORK}、14:36:34 執行完畢。這是獨立 TEST001 試算表的**實際唯讀規則測試**，不代表請假送單、主管通知或 Excel 計薪已整合。

已新增未部署的 `staging/AttendanceV2_LeaveDryRun_TEST_ONLY.gs`：在原 TEST001 後端呼叫已安裝的唯讀資料讀取及規則函式，進行 12 個表單案例，加上未設定假別與偽造員工 ID 兩個防呆，共 14 個虛構請假預檢。使用單一編輯器函式 `v2hrRunLeaveDryRun_TEST_ONLY`，不新增 doPost、doGet，也不寫入「請假申請」。包括 2026-11-11 虛構休假阻擋、2026-11-12 虛構停班需人工核對、跨週末阻擋、指定時段跨日拒絕、時段倒置拒絕、2027 尚未核對的日曆拒絕。

測試檔 `staging/AttendanceV2_LeaveDryRun_TEST_ONLY.test.js`：14／14 項 Node 等效隔離模擬測試通過，含身分欄位不得由前端傳入及完全無寫入操作。

**待辦**：使用者手動將新檔貼到原 DATA_TEST_ONLY Apps Script 後，以 `v2hrRunLeaveDryRun_TEST_ONLY` 實際執行並回報 Logger。此步仍只有讀取及規則驗證，未實際寫入請假單、未建立新端點、未串接主管通知。

## 2026-10-29 14:44：請假預檢實機通過，進入獨立暫存假單寫入測試

使用者回報在原 TEST001 Apps Script 編輯器執行 `v2hrRunLeaveDryRun_TEST_ONLY`：14:44:21 開始、14:44:22 規則預檢 checksPassed=6、14:44:23 請假測試 leaveCasesPassed=14 且 ok=true / readOnly=true、14:44:23 完畢。假日阻擋、跨週末、虛構颱風日需人資確認、指定時段及錯誤日期等均有明確回傳。此階段尚未產生請假表資料。

本輪已新增 `staging/AttendanceV2_LeaveWrite_TEMP_TEST_ONLY.gs`，僅供原 `YC_ATTENDANCE_V2_DATA_TEST_ONLY` 專案手動執行：

- 指定函式 `v2hrRunSyntheticLeaveWrite_TEST_ONLY`，固定虛構單號 `LEAVEV2_TEST_20261110_0001`、TEST001、2026-11-10 事假一日、原因「純測試：正常上班日事假」。
- 對測試 Sheet 與現有日曆資料重新核對，通過後只在**臨時** `V2請假寫入測試` 分頁寫一筆 12 欄資料；正式的 `請假申請` / `打卡紀錄` 都不讀寫。
- 使用 LockService 並在鎖內重驗。首筆寫入再讀回，回傳 `ok:true,synthetic:true,alreadySubmitted:false,writeCount:1`；同一單號再次執行回傳 `alreadySubmitted:true,writeCount:0`，不新增第二筆。
- 同單號異內容、額外列欄或不一致標題都拒絕覆寫。若出現未確認結果，應用另支純讀取函式 `v2hrReadSyntheticLeaveStatus_TEST_ONLY` 查詢，不要清空表或強制重跑。
- 此臨時分頁只是隔離技術驗證，不是正式系統增加的第三張人資管理表；不會自動清除。完成核對後再由管理者決定清理方式。

模擬測試 `staging/AttendanceV2_LeaveWrite_TEMP_TEST_ONLY.test.js` **15／15 PASS**，尚未在真實 Apps Script 執行。請勿新增 doGet/doPost、修改部署或正式工作表。

## 2026-10-29 14:54：TEST001 臨時假單實際寫入及讀回成功

使用者回報獨立 Apps Script 專案執行 `v2hrRunSyntheticLeaveWrite_TEST_ONLY`，執行記錄如下：
- 14:54:19 開始，14:54:20 及 14:54:21 完成兩次合規模擬資料的唯讀預檢（均 `ok:true`、`checksPassed:6`）。
- 14:54:24 回傳 `ok:true`、`synthetic:true`、`alreadySubmitted:false`、`requestId:"LEAVEV2_TEST_20261110_0001"`、`writeCount:1`、`status:"待審核（測試）"`。
- 14:54:24 執行完畢。根據程式的固定資料寫入與讀回流程，可確認臨時測試分頁 `V2請假寫入測試` 的第一筆虛構假單建立成功；未操作正式的 `請假申請`。

**尚未完成**：同一單號第二次執行的防重複實機測試（預期 `alreadySubmitted:true`、`writeCount:0`），以及狀態函式 `v2hrReadSyntheticLeaveStatus_TEST_ONLY` 的獨立唯讀核對。請勿重跑虛構日曆資料安裝函式，請勿刪除測試分頁。

此結果不代表 LINE 員工前端真正送出假單、主管通知、正式員工權限及 Excel 薪資整合已完成。正式打卡系統與既有 GPS 測試首頁仍維持隔離。

## 2026-10-29 14:57：臨時假單重複送單實機防呆成功

使用者提供原 DATA_TEST_ONLY Apps Script 實際執行記錄：14:57:27 開始、14:57:29 與 14:57:30 的六項唯讀規則檢查通過；14:57:31 假單寫入測試回傳 `ok:true,synthetic:true,alreadySubmitted:true,requestId:LEAVEV2_TEST_20261110_0001,writeCount:0`，14:57:32 結束。由此確認相同單號第二次執行被辨識並未再寫入；實機獨立唯讀「查詢既有假單」仍待執行。

為了避免選擇原本 `v2hrReadSyntheticLeaveStatus_TEST_ONLY` 只有回傳物件而不產生 Logger 訊息，已新增極小型純讀取包裝：
`staging/AttendanceV2_LeaveStatusAudit_TEST_ONLY.gs`；編輯器手動執行 `v2hrAuditSyntheticLeaveStatus_TEST_ONLY`。它會再次確認原 TEST001 環境，只讀取臨時測試分頁，核對固定單號、只有一筆資料、12 欄完整、測試待審核狀態；以 Logger 輸出 `ok,true/readOnly,true/present,true/applicationCount,1`，完全不寫入。配套 `staging/AttendanceV2_LeaveStatusAudit_TEST_ONLY.test.js` **10／10 純模擬測試通過**。此檔尚未由使用者貼到 Apps Script 或實際執行。

本階段不修改正式打卡、原始請假、主管 LINE 通知、Google Apps Script 部署或薪資 Excel。仍需避免直接將臨時固定測試單號的程式接入公開 Web App；正式送單前須另行建置權限、冪等送單與核准通知。
