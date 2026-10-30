# V2 桌面 QA 執行紀錄（2026-10-30）

## 本輪已完成

- GitHub 連接器登入為 line-punch；已讀指定 feature/v2-batch-build-20261030 分支兩份交接檔、同步 GAS 整包、qa-client 與測試。
- Edge Google 帳號與 LINE 測試 Channel 的登記信箱一致；可見獨立 TEST001、原 GPS、V4 與正式專案。未修改正式或 GPS/V4 程式。
- 已在 V4 專案設定實際讀回 V2HR_READONLY_TEST_ENABLED=disabled，來源為指定 TEST001 測試活頁簿。
- TEST001 活頁簿已唯讀目視核對員工資料唯一一筆 TEST001 / TEST_CO / 在職 / TESTSITE，以及公司工作日曆 A:H、J:N 的表頭與合成資料。
- LINE Developers 管理權限已確認：Channel 2012136707「打卡系統V2測試」，Developing。現有 LIFF 指向原 attendance-v2-test 根目錄；沒有修改 Endpoint、scope 或正式 OA。
- 已另建 YC_ATTENDANCE_V2_BATCH_QA_ONLY_20261030 GAS 專案，安裝原同步整包至程式碼.gs；DesktopQA_ReadonlyChecks.gs 僅供管理者關閉狀態與來源表頭預檢，無寫入函式。另新增 DesktopQA_JournalPersistence.gs，僅管理者可在編輯器執行真實 QA 流水測試，不是公開 Web 路由。
- 新 QA 設定 V2_BATCH_QA_ENABLED=disabled、V2_BATCH_QA_WRITE_ENABLED=disabled，Channel 與來源測試表設定已填入；HR 測試身分未設定。
- 已用使用者指定的 Computer Use／Edge 工作流程另建 YC_ATTENDANCE_V2_BATCH_QA_ONLY 活頁簿，與來源簿不同 ID。只有 V2_交易流水_QA 分頁，A1:H1 為精確八個表頭。已將新 ID 存入新 GAS 的 V2_BATCH_QA_BOOK_ID。實測後保留一筆合成資料，兩個開關恢復 disabled。
- QA 前端修正：發送前儲存待核對的 requestId 與操作；重新整理仍鎖定。僅同編號且相符操作的回查可解除鎖定。前端本地驗證失敗不誤鎖。HR 不明結果會保留實際審核單號並鎖住，不自動重送；HR 不明結果的後端恢復介面仍待整合。
- 前端與測試修正已提交至指定 feature 分支（末次提交 3f0cc1e3990a373cdcc67764ddef7e55d721d948），未發布 Pages。

## 本輪驗證與限制

- 本機同步整包離線模擬：13/13 PASS。
- 本機 QA 客戶端 fake DOM/LIFF 模擬：22/22 PASS（原16項，加6項恢復／防誤解鎖案例）。
- 上述35項全部是離線模擬，不是 GAS、Google Sheets、LINE 或 NFC 實機成功。未重跑原全部327項，不能把累計數改稱實機驗收數。
- Google Drive 連接器讀測試簿回覆403，已改用已登入的 Edge，未變更共用權限。
- Google 授權阻礙已由使用者親自處理。2026-10-30 台北時間16:10:33–16:10:34，desktopQaDisabledSmokeTest 實際 GAS 執行 PASS，確認兩開關 disabled、同步 HTML 與 QA banner。不是外部瀏覽器 postMessage 往返測試。
- 16:11:05–16:11:08，desktopQaReadOnlyPreflight 實際讀取 Google Sheets，PASS_SOURCE_READONLY 與 PASS_LEDGER_READONLY，核對 TEST001/TEST_CO、來源日曆表頭及不同 ID 技術簿精確八欄。沒有寫入來源簿。
- 已建立第1版 QA Web App，執行身分為本人、存取範圍「只有我自己」。兩個旗標維持 disabled；未公開給任何人。Edge 導向 script.googleusercontent.com 回傳頁時顯示 ERR_BLOCKED_BY_CLIENT，已請使用者親自處理瀏覽器攔截；未代改安全或隱私設定。
- 16:15:20–16:15:30，desktopQaJournalPersistenceTest 實際 GAS/LockService/Sheets 保存測試通過。新增且保留1筆合成假單流水，原requestId為 QA_DESKTOP_JOURNAL_20261030_A，狀態 PENDING。在真實 append+flush 後用測試包裝器故意拋出回覆遺失，先查原單成功後才做相同原單重送，確認沒有第二筆流水。兩開關在 finally 恢復 disabled。
- 上項身分為管理者測試工具注入的合成 TEST001 身分，沒有實際 LINE ID Token 驗證；回覆遺失由測試包裝器模擬，不是真實手機斷網。Google 持久化與鎖是真的，LINE／手機／通知不是實機通過。
- 已在試算表 UI 唯讀核對 B2 為原requestId。沒有修改來源簿，沒有審核、通知送出、工時、薪資或刪除資料。此筆測試資料不可刪除。

## A～E 驗收現況

| 批次 | 現況 | 下一步 |
|---|---|---|
| A 身分／四格／GPS | 帳號盤點、實際GAS停用測試與兩簿唯讀預檢通過；未重新實測GPS | 解決回傳頁攔截、獨立LIFF、iOS/Android |
| B 請假／日曆 | 真實來源表頭與1筆合成假單持久化通過；尚未由LINE送單 | LINE真身分與各日期情境 |
| C 補卡／HR／通知 | 真實QA日誌原單回查與防重複通過；身分及遺失回覆為合成 | 真測試HR身分、HR不明結果回查、真通知接線 |
| D 月結／薪資／備份 | 未開始實際驗收 | 合成月份計算與備份讀回；薪資規則核對 |
| E 裝置／斷線／NFC | 斷線恢復僅離線；NFC仍不可啟用 | 實機斷線、實體NFC與金鑰、切換前簽收 |

## 後續順序

1. 使用者親自處理 Edge 對 script.googleusercontent.com 的 ERR_BLOCKED_BY_CLIENT，讀回僅本人QA入口。
2. 準備獨立 LIFF QA 入口；公開QA端點或新增登入權限前讓使用者審查具體設定。既有GPS根目錄與LIFF不改。
3. 補齊HR不明審核結果的受保護唯讀回查，才開手機審核測試。
4. 接入真實測試LINE身分，再短暫開QA寫入完成請假／補卡實測。結果不明先回查原requestId；不刪既有與新測試資料。

敏感 Spreadsheet ID、完整部署網址、LINE sub/token、Channel secret 與 NFC 金鑰均不寫入此紀錄。
