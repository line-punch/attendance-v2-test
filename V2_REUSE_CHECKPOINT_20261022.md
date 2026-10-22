# 2026-10-22｜V2 舊系統四頁加速整合檢查點

## 本輪目的
不重做原打卡系統；沿用真正的既有 UI／資料表欄位／假別／歷史格式，只更換不穩定的 JSONP 通訊與較弱的身份／主管審核安全機制。

## 基準來源（已核對）
- 正式前端：`line-punch/line-punch/main/index.html`，SHA `fe86e76285938f0013e8d457c9547866654fb9b6`，既有四頁：正常打卡、補打卡、個人月查詢、請假。
- 既有 GAS：使用者先前提供的 `LINE 打卡系統 完整覆蓋版`，2026-10-20 又曾提供副本，約 1,024 行；兩份內容相同。由此核對：11 欄打卡紀錄、13 欄補打卡申請、12 欄請假申請、審核狀態／人／時間欄位及主管 Flex 核准流程。
- **不能因為以上檔案可讀，就假設 2026-10-22 正式雲端 GAS 部署版本完全一致**；正式上線前仍須唯讀核對目前執行版本、觸發器及備份。

## 已寫入 GitHub（全在開發分支）
### 1. 後端整批檔案
路徑：
`line-punch/line-punch/feature/v2-reuse-existing-forms-20261022/staging/AttendanceV2_IntegratedSandboxDataService.gs`

- SHA `1ade283177483e91c8454790b9b3b7734c19ece7`，**90／90 項離線模擬測試通過**。
- 同一份完整 GAS 檔已整合原來實測過的 LINE 驗證、TEST001 綁定、GPS 打卡、原請求重送、今日打卡查詢。
- 新增可沿用原前端的唯讀 API：`monthQuery`、`missHistory`、`leaveHistory`。
- 新增可沿用原 13／12 欄欄位的隔離資料寫入 API：`submitMiss`、`submitLeave`，同 requestId 不會重複產生申請。由伺服器驗證 LINE 身分，忽略前端自填員工 ID／姓名／公司。
- 新增 `reviewDetails` 與 `review`，審核前比對「審核通知名單」中的**指定老闆 LINE ID**，而非只憑申請單號變更狀態。
- **寫入預設禁止**：`ATTENDANCE_V2_APPLICATION_TEST_WRITES` 與 `ATTENDANCE_V2_REVIEW_TEST_WRITES` 預設未設定；不會允許申請或核准寫入。
- **沒有**從舊 GAS 搬運 LINE access token／署名不明 webhook／JSONP GET 寫入，也**不會**發出真正主管通知。
- 執行身份限定隔離 `YC_ATTENDANCE_V2_TEST_ONLY`；沒有連正式員工 Sheet。

### 2. 前端沿用原四頁
開發分支 `line-punch/attendance-v2-test/feature/production-reuse-integration-plan-20261022`：
- `Legacy4PageReuse.html` SHA `aae940408fad8a6f8d7a0f39b5cfa5f5704a5d6d`，保留四頁原 HTML、原有中文欄位與假別選項。
- `Legacy4PageReuse.js` SHA `ce54f00402aeffc8294a34ee66aa8eb0f4ff2683`，以獨立 LIFF + TOKEN + POST form bridge 取代舊 JSONP 請求；沒有原正式 Web App URL 或正式 LIFF ID。
- 原月份查詢及申請歷史的畫面和呈現函式已映射到新 API，但 `enableLegacyReads:false`，等後端隔離版整批部署再開放。
- `enableClock:false`，防止未完工整合頁誤產生額外打卡；已實測成功的獨立 V2 GPS 測試頁仍可用。
- 補打卡與請假送出按鈕**保持停用**，待審核通知與流程整合完整後再安全開放。
- 既有介面保留、函式/敏感舊網址缺失與防止未授權寫入檢查：**11／11 項模擬測試通過**。
- 本頁面只在 feature 分支，**尚未發布到 GitHub Pages main**。

## 後續最少操作整合路徑
1. 先由程式端完成隔離前端與後端所有四頁的資料契約與回歸檢查；審核通知需要可靠 outbox 再投遞，不可將不驗證來源的原 LINE postback 直接搬入。
2. 將整合 GAS **整份一次更新**到 `YC_ATTENDANCE_V2_DATA_TEST_ONLY`，沿用同一個部署／exec；首輪只讀，測月查詢和申請歷史；確認隔離 TEST001 正確後才開啟兩種安全寫入測試屬性。
3. 再發布四頁整合的隔離測試網址進行 iPhone／Android 回歸；原正式頁面不變。
4. 驗證跨日／雙班／越權／並發／主管批准／通知補償，再經明確授權安排備份、逐步切換與回復。
5. 若原正式 GAS 今日版與 10/20 提供的檔案不同，先將差異記錄與保留，而不是盲目覆蓋。

## 安全與產品結論
- 這不是第二套重新開發的出勤產品，而是原本四頁介面的安全通訊與流程升級。
- 真實系統仍只有原有正式打卡入口在服務員工；此輪測試及寫碼沒有新增/修改/刪除任何正式員工資料。
- 正式 `line-punch/line-punch/main/index.html` SHA `fe86e76285938f0013e8d457c9547866654fb9b6`；V2 隔離測試站 main/index.html SHA `a5a2d414872fd74b17bba7060505729cecb35502`，兩者本輪都未更動。
