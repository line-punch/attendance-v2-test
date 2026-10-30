# 新 QA LINE 連線與真實送件紀錄（2026-10-30）

## 授權與部署

使用者已明確同意建立獨立 QA LIFF 與開放 QA 後端供 LINE 連線。

- 測試頻道：打卡系統V2測試，2012136707，仍為 Developing。
- 新 LIFF：2012136707-CgGNZAuq；名稱「打卡V2獨立整批QA_20261030」。
- 僅 openid；profile／chat_message.write 未要求；Add friend Off。
- QA 靜態頁使用獨立 attendance-v2-batch-qa 倉庫；原 GPS LIFF 2012136707-2dDU0aSJ 保留。
- 獨立 QA GAS 成功更新第 2 版（18:01）；執行身分為已核對的專案擁有者，網頁應用程式允許外部連線。後端仍核對 LINE ID Token 與隔離員工綁定。
- 使用者親自完成 Edge 新入口的 LINE 登入；未由代理點擊身分確認或代輸認證資訊。
- 前端已固定已核對的 QA 後端，不允許改填其他 Apps Script 網址；檔案版本標記修正舊快取。

## 實際 LINE → GAS → QA 試算表 → 網頁結果

以下是 Edge 真實 LINE 登入及公開 QA Web App 的往返，並非離線模擬，也不是 iPhone 實測。

1. MY_CLOCKS：成功，2026-10，days=[]；正常打卡月表顯示日期與空白上下班時間。
2. MY_LEAVES：送件前 total=0。
3. MY_MISSING：送件前 total=0。
4. 請假日期預檢：2026-10-30，成功，working days=1。
5. 請假實際送件：原單 QA_f64429ca3f784ba4e324ac0345c2872a，事假／2026-10-30／全天，PENDING；回覆 duplicate=false。
6. 用上述原單回查成功；當月請假列表 total=1，顯示待審核。
7. 補打卡實際送件：原單 QA_3ad9c2e0dd081d2c27903bc6f0893687，2026-10-30／上班／08:30，PENDING；回覆 duplicate=false。
8. 用上述原單回查成功；當月補打卡列表 total=1，顯示申請時間 08:30 與待審核。
9. 再查正常打卡月表仍 days=[]，沒有回填補打卡 08:30。

僅 TEST001／TEST_CO 合成資料，兩筆均保留。通知回覆 QUEUED 只代表寫入佇列，尚未驗證真正通知送達。未配置測試人資角色，不聲稱核准實機通過。補打卡核准後仍分開的規則目前有離線驗證，未在此輪以真實 HR 角色核准。

請假與補打卡均未取得 GPS、不限制地點；只有 GPS_CLOCK 正常上下班檢查距離 50 公尺。使用者再次確認此規則，並表示目前在原測試地點、可用 iPhone LINE 實測。已提供新入口並請上班只按一次，尚待核對結果。

## 實際下載核對

已從隔離 QA Google 試算表下載 xlsx（未變更共用權限），保存於 evidence/QA_CloudRecords_20261030.xlsx。

讀取下載檔確認技術流水有原先 QA_DESKTOP_JOURNAL_20261030_A 及上述兩個新 requestId，三筆各為版本 1；未刪除原資料。下載的是技術原始資料，含 ROW_JSON，尚不等於已對接使用者 Excel 匯入格式。

已新增純離線軟體匯出介面 V2_OperationalExport.js，讀取下載快照、驗證原流水雜湊與版本，產出三類分開的 CSV。實際下載快照驗證通過：正常打卡 0 筆、請假 2 筆（包括原先跨月測試單）、補打卡 1 筆，未只取當月而漏掉原資料。匯出採最新申請版本，原 xlsx 仍保留完整版本流水；補打卡不轉成正常打卡。CSV 候選放於 evidence/operational-export-preview/，尚待使用者 Excel 欄位對齊。匯出模組另有 7 項離線檢查，含核准補打卡分離、CSV 字元及公式注入處理。

## 證據及剩餘工作

- evidence/qa-liff-created.png
- evidence/qa-live-leave-submit.txt、qa-live-leave-readback.txt、qa-live-leave-month-after.txt、qa-live-leave-table.png
- evidence/qa-live-missing-submit.txt、qa-live-missing-readback.txt、qa-live-missing-month-after.txt、qa-live-missing-table.png
- evidence/qa-live-normal-month-after-missing.txt
- evidence/qa-mobile-live-request-ids.json

待完成：iPhone GPS 正常打卡、下班、每日重複限制實測；手機三介面完整驗收；工作日邊界／時數請假等實際案例；供 Excel 使用的平面下載欄位與匯入核對；員工版操作精簡。未改動正式系統、原 GPS 服務或 V4。

目前是進行中的 QA 測試，主開關與寫入曾暫時開啟；收尾須記錄最終開關狀態，不可據此文件推定當下已停用或已驗收完成。

## GPS 上班與額外唯讀案例

正常打卡月表已從真實 QA 後端查到 2026-10-30 上班 18:14:47，下班仍空白。再下載快照 evidence/QA_CloudRecords_AfterGPS_20261030.xlsx，核對正常打卡只有一筆：QA_GPS_12f80e3126d297a2ab270403d230b962／TEST001／TEST_CO／上班／SOURCE=GPS。手機端畫面結果仍待使用者回覆；未自行模擬或偽造定位。已請同一支 iPhone 測下班一次；若原操作結果不明須先核對原請求，不可重按上班。

新快照的日期被 Google 匯出為原生 Excel 日期，讀取程式已按欄位意義轉回 ISO 日期，再產出 CSV；沒有把日期時間字串誤當補打卡。實際候選匯出筆數：正常打卡 1、請假 2、補打卡 1，保存在 evidence/operational-export-after-gps/。最初下載檔及 CSV 也保留。

另以已驗證 LINE 身分實際做唯讀預檢，未新增假單：11/09–11/10 連續工作日成功（days=2）；延至隔離休假日 11/11 回覆 REJECTED；10/30 09:00–11:00 單日時數成功（days=1 是工作日數，非假定薪資時數）；跨日指定時數回覆 REJECTED。當前第 2 版尚未傳出細分拒絕原因，不能由 REJECTED 字樣單獨宣稱後端確切錯誤碼。

本機與開發分支另備妥更清楚的打卡／日期錯誤提示，相關受影響離線測試通過：client 33/33、同步 GAS 18/18、router 17/17；目前尚未替換正在手機實測的第 2 版，需待實測窗口完成再更新。

仍待：每日重複限制及定位失敗實機、員工版畫面精簡、Excel 匯入欄位對齊、審核與通知的必要角色驗證。不得將此狀態稱為正式上線或全案完成。

## 下班核對及按鈕／紀錄畫面更新（本輪最終狀態）

使用者回覆 iPhone 下班已完成；再以真實 LINE 身分查詢 QA 後端確認 2026-10-30 上班 18:14:47、下班 18:28:13。未重送打卡。前述下載快照時間較早，不含下班，不能宣稱該 xlsx 已核對兩筆。

前端版本 20261030c 已發布到獨立 QA Pages（7799c250bc9f4cf5a0b8839d050be8928dd24e80）；來源分支同步 6818c5bae347a4c392657ff8e1f4dc008208c65d。所有按鈕有按下樣式、處理中標籤／轉圈、頂部持續狀態提示；執行期間停用其他按鈕並防重按。未知寫入仍須原 requestId 回查。正常月表僅列有上班或下班資料的日期，空月顯示提示，補打卡不混入。

實際 Edge／LINE／QA GAS 查詢觀察到「處理中…」、按鈕停用及完成恢復；完成月表僅 10/30 一列，時間為 18:14:47／18:28:13。畫面證據 evidence/qa-button-feedback-busy.png、qa-button-feedback-done.png。新版視覺回饋尚未由使用者在 iPhone 重驗；此前手機真實上下班與本輪 Edge 查詢分開計算。client 37/37 為離線測試，不等於手機案例。

本輪收尾已在正確隔離 GAS 設定儲存並回讀：V2_BATCH_QA_ENABLED=enabled、V2_BATCH_QA_WRITE_ENABLED=disabled。保留查詢，暫停新增 QA 寫入；未刪除任何資料，未改正式、原 GPS 或 V4 服務。GAS 仍為第 2 版，尚未部署來源中新增的細分錯誤原因。

## 員工畫面精簡與切頁自動查詢（20261030d）

已將固定 QA 連線網址、申請編號及原始 JSON 回覆收進可展開區域；保留明確 TEST001 隔離標示和 QA 確認限制。按鈕與主要提示使用員工能理解的文字。請假／補打卡表單明示不限地點、不需定位；人資維持建置中。

切換正常打卡、請假、補打卡畫面時自動查詢本人當月紀錄；進人資畫面不呼叫後端，初始載入亦不自動送出任何請求。進階查詢月份不會意外影響回到員工畫面的本月查詢。離線 client 38/38 通過，包含切頁操作對應唯讀 API，以及未確認 QA 不傳送。

QA Pages 提交 5741886fc7598afde1fce0e2ac8badec763a51c6，來源 feature 提交 0722ee2ef851aaaf5b013e2b05e0168d30cede31；GitHub Pages build/deploy 成功。實際 Edge 已登入 LINE 切頁：請假自動列出 10/30 事假全天待審核；補打卡自動列出 10/30 上班 08:30 待審核。此輪僅唯讀查詢，沒有取得 GPS、重送打卡或新增假單。

證據 evidence/qa-month-on-entry-leave.png、qa-month-on-entry-missing.png。新版尚需 iPhone 畫面重驗。QA 主開關 enabled、寫入 disabled 維持不變。當月請假目前依請假日期，已向使用者釐清跨月單應歸送件月或請假月；未收到答案前維持現有規則，不宣稱該語意已驗收。

正常打卡切頁自動查詢亦已實際成功：僅 2026-10-30 一列，上班 18:14:47／下班 18:28:13，沒有補打卡 08:30。證據 evidence/qa-month-on-entry-clock.png。

## 使用者同意的月份規則實作與實際跨月驗證

後端 QA 成功更新第 3 版（18:55），沿用相同 QA 部署 ID、擁有者及既有存取範圍。月份查詢保留前兩個月歷史下限，開放未來月份；原日期交集篩選使跨月單在涵蓋月份顯示同一 requestId，沒有拆單寫入。summary 新增伺服器 submittedAt，不洩漏請假原因。前端可選請假／補打卡月份、顯示送件日期與申請編號，成功送件顯示業務日期和查看該月按鈕。窄螢幕列表以逐筆欄位呈現。

真實 Edge LINE → QA GAS → QA 試算表案例：
- 單次送件 QA_145bd0c4413423adec068832ecdc2a93，TEST001／TEST_CO，事假全天 2026-11-30～2026-12-01，PENDING，送件日期 2026-10-30。
- 唯讀日期預檢成功後只按一次送出，成功提示完整起訖日期並出現「查看 2026-11 紀錄」。
- 按成功提示按鈕查 11 月，含原有 11/9～11/10 測試單及新跨月單；改選 12 月後僅新跨月單。兩邊 requestId 相同。
- 此輪未改正常打卡或補打卡。新合成假單保留，不刪除。
- 最終設定已儲存回讀：QA 主開關 enabled、寫入 disabled。
- 證據 evidence/qa-month-backend-v3.png、qa-cross-month-submit.txt、qa-cross-month-nov.txt、qa-cross-month-dec.txt。

離線 test:mobile 六套通過：核心 40、router 17、同步 GAS 19、client 39、正常打卡 11、匯出 7。這些是離線案例，不是手機或實機次數；跨月真實往返另如上述。新版手機排版仍須 iPhone 重驗。下載匯出模組已保留完整日期、送件日期及狀態，未用畫面查詢月份截斷原資料；使用者 Excel 欄位仍待對齊。

