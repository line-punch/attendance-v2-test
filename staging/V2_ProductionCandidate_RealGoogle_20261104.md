# 候選資料層：實際 Google 合成副本驗收

## 範圍與隔離

新建 YC_ATTENDANCE_V2_MULTIUSER_QA_ONLY，名稱雖含 multiuser，雲端仍只有 TEST001／TEST_CO 合成員工及其資料；其他身分只在管理者程式記憶體模擬。未擴大原有雲端員工資料範圍，未連正式清冊。私人活頁簿 ID 存既有 QA 私有屬性與本機 evidence，不放公開程式。

既有獨立 QA 專案 HEAD 新增 V2_ProductionQA_Runtime.gs，僅供管理者編輯器執行；沒有新增公開入口、LINE 呼叫或觸發器，未重新部署 Web App，手機 QA 仍第 4 版。交付包將此檔放 admin-only-not-for-webapp，不能併入公開 Web App。

## 實際執行

- 初始化曾發現 Google 將合成 GPS 字串 25,121 轉成數字 25121，核對失敗後停止。原分頁與原值均保留；改建「上班地點_候選文字」，明確文字格式及雙小數座標。沒有覆寫或刪除失敗資料，完整下載也保留該列。
- 19:52:25～19:52:31 初始化成功；僅一列 TEST001 員工、純合成地點與主管對應。預設工作表也保留。
- 19:53:32～19:54:09 實際 GAS／SpreadsheetApp／LockService 測試完成，21 項管理者檢查通過，包含保存、本人／其他身分讀取、指定審核、重複決定與相反決定拒絕、原單恢復。
- 請假原單核准、補卡原單駁回：共兩張原單、四筆有完整 hash 鏈與 outbox 的交易流水。每張只有版本 1、2；另有一筆獨立正常卡。
- 正常卡實際 append＋flush＋readback 後，由測試程式刻意拋出回覆遺失。得到 UNKNOWN／persisted=null 後先查原 ID，確認找到才測相同原 ID 回原結果；沒有第二筆正常卡。

## 證據與界線

完整 xlsx 下載後重新驗證交易 hash 鏈、原單數、狀態、版本與正常表。三類匯出為正常 1、請假 1、補卡 1，原 xlsx、稽核 CSV 及 ZIP 已保存，欄序沿用既有 11／12／13 欄。合成審核名單與前面的 YC-Eddy 真人 QA 不混用。

這次 Google 寫入／鎖／讀回是真的；身分驗證器、日曆、GPS 座標及回覆遺失是管理者合成注入。不是新的 LINE 登入、手機 GPS、真斷線或多位正式員工驗收；不能以 21 項取代這些未測項目。既有第四版手機 LINE 自動通知實測另有紀錄。

本機同步 runtime 另有 5 項模擬檢查，連同多員工權限 15 項與表格／GPS 13 項，候選套件共 33 項離線檢查；與 21 項實際 GAS 管理者檢查分列。

本機證據：QA_MultiUser_Persistence_20261104.xlsx、qa-multiuser-gas-result-20261104.json/png、qa-multiuser-closed-flags-20261104.json、QA_MultiUser_Export_20261104.zip，均在 evidence，不公開帳號或憑證。

## 結束狀態與下一步

已重新載入私有設定確認候選副本 enabled=disabled、手機寫入 disabled、通知 disabled、排程未啟用；既有手機 Web App 第 4 版與正式／原 GPS／V4 入口和資料不變。沒有刪除任何測試資料。

下一步為候選服務的真正 LINE 驗證與獨立手機路徑，以及已確認公司日曆和下載介面的整合。正式接入仍需切換方案的資料／主管對應及批准；目前這個 admin harness 不可作為正式登入服務。

