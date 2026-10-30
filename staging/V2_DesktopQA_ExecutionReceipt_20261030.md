# V2 桌面 QA 執行紀錄（2026-10-30）

## 本輪已完成

- GitHub 連接器登入為 line-punch；已讀指定 feature/v2-batch-build-20261030 分支兩份交接檔、同步 GAS 整包、qa-client 與測試。
- Edge Google 帳號與 LINE 測試 Channel 的登記信箱一致；可見獨立 TEST001、原 GPS、V4 與正式專案。未修改正式或 GPS/V4 程式。
- 已在 V4 專案設定實際讀回 V2HR_READONLY_TEST_ENABLED=disabled，來源為指定 TEST001 測試活頁簿。
- TEST001 活頁簿已唯讀目視核對員工資料唯一一筆 TEST001 / TEST_CO / 在職 / TESTSITE，以及公司工作日曆 A:H、J:N 的表頭與合成資料。
- LINE Developers 管理權限已確認：Channel 2012136707「打卡系統V2測試」，Developing。現有 LIFF 指向原 attendance-v2-test 根目錄；沒有修改 Endpoint、scope 或正式 OA。
- 已另建 YC_ATTENDANCE_V2_BATCH_QA_ONLY_20261030 GAS 專案，安裝原同步整包至程式碼.gs；新建 DesktopQA_ReadonlyChecks.gs，僅供管理者關閉狀態與來源表頭預檢，無寫入函式。
- 新 QA 設定 V2_BATCH_QA_ENABLED=disabled、V2_BATCH_QA_WRITE_ENABLED=disabled，Channel 與來源測試表設定已填入；HR 測試身分未設定。
- 已用使用者指定的 Computer Use／Edge 工作流程另建 YC_ATTENDANCE_V2_BATCH_QA_ONLY 活頁簿，與來源簿不同 ID。只有 V2_交易流水_QA 分頁，A1:H1 為精確八個表頭，無業務資料。尚未將新 ID 設定到 GAS，仍待 Google 首次執行授權確認。
- QA 前端修正：發送前儲存待核對的 requestId 與操作；重新整理仍鎖定。僅同編號且相符操作的回查可解除鎖定。前端本地驗證失敗不誤鎖。HR 不明結果會保留實際審核單號並鎖住，不自動重送；HR 不明結果的後端恢復介面仍待整合。
- 前端與測試修正已提交至指定 feature 分支（末次提交 3f0cc1e3990a373cdcc67764ddef7e55d721d948），未發布 Pages。

## 本輪驗證與限制

- 本機同步整包離線模擬：13/13 PASS。
- 本機 QA 客戶端 fake DOM/LIFF 模擬：22/22 PASS（原16項，加6項恢復／防誤解鎖案例）。
- 上述35項全部是離線模擬，不是 GAS、Google Sheets、LINE 或 NFC 實機成功。未重跑原全部327項，不能把累計數改稱實機驗收數。
- Google Drive 連接器讀測試簿回覆403，已改用已登入的 Edge，未變更共用權限。
- 新 GAS 首次執行停在「需要授權」；使用者回覆已授權，但重新讀取後執行歷史仍0筆，再次啟動唯讀檢核仍顯示「需要授權」。已請使用者檢查後續權限畫面。desktopQaDisabledSmokeTest 尚未完成執行，無實測 PASS 記錄。
- 本輪沒有新增申請／審核／通知／工時／薪資資料，沒有刪資料；沒有結果不明的業務寫入可重試。

## A～E 驗收現況

| 批次 | 現況 | 下一步 |
|---|---|---|
| A 身分／四格／GPS | 帳號與既有 LIFF 唯讀盤點；未重新實測 GPS | 新 QA 授權、獨立 LIFF、iOS/Android |
| B 請假／日曆 | 來源表目視核對，離線規則通過；未真送單 | 獨立 QA 活頁簿、GAS唯讀預檢後才開寫入 |
| C 補卡／HR／通知 | 離線防重複與重整鎖修正；未實測 | 真測試HR身分、HR不明結果回查、真通知接線 |
| D 月結／薪資／備份 | 未開始實際驗收 | 合成月份計算與備份讀回；薪資規則核對 |
| E 裝置／斷線／NFC | 斷線恢復僅離線；NFC仍不可啟用 | 實機斷線、實體NFC與金鑰、切換前簽收 |

## 後續順序

1. 使用者親自完成新 QA Google 授權；若安全警告則停下核對。
2. 讀回 GAS 停用煙霧測試結果，再跑來源唯讀預檢。
3. 將已建立的獨立 QA 技術簿 ID 設定到新 GAS，透過唯讀預檢再次核對不同ID與表頭，不碰來源表資料。
4. 準備獨立 LIFF QA 入口，新增登入權限／公開部署前讓使用者審查具體設定。
5. 確認後短暫開測試寫入，以原requestId回查、確認單列日誌及通知事件，保留全部測試資料。

敏感 Spreadsheet ID、完整部署網址、LINE sub/token、Channel secret 與 NFC 金鑰均不寫入此紀錄。
