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

## 員工送件操作與登入恢復（20261030h）

- 請假／補打卡不再要求員工先手動產生申請編號。新草稿自動產生，切換流程不套用舊流程的編號。送出成功後顯示原單收據、停用同表單再次送出；「新增申請」明確準備下一筆。確認過的原單編號保存在本頁工作階段，重載後不會再次送出同筆；不儲存原因或 LINE Token。
- 成功送件後自動唯讀更新業務日期所屬月份。列表刷新失敗不會把已確認成功的送件改成結果不明，也不會重送。原本未知寫入仍必須原 requestId 回查。
- 全天請假隱藏及停用時間欄位，指定時數模式才顯示；不呼叫 GPS。
- 實際 Edge 本輪切補打卡時，後端回覆 AUTH。此輪尚未按送出，沒有新增合成單。QA 寫入暫開後已重新 disabled 並回讀，主開關維持 enabled。
- 補上伺服器 AUTH 回覆後的重新登入提示；外部瀏覽器明確重新登入時清除舊 LIFF 登入狀態再開啟正常 LINE 登入；LIFF 內提示關閉重開。沒有自動重送申請。依 LINE 官方 API 文件 https://developers.line.biz/en/reference/liff/#logout 與 #login。
- Client 45/45 離線流程檢查通過，含成功後列表查詢失敗、重載防重送、草稿隔離及登入狀態恢復；不能稱為這輪真實送件通過。真實成功送件／自動刷新仍待 LINE 登入恢復後驗證。後端維持第 3 版，正式、原 GPS、V4 均未變更。

### 本輪真實送件與登入恢復已完成（後續結果）

已用先前由使用者確認的同一個 LINE 測試帳號（李思慧），在相同 channel／LIFF／openid 範圍完成例行重新登入，沒有新增權限；重新查詢成功。前述 AUTH 阻礙已解除。

新版 Pages aa333c73e3b06b5fe8d77a76231ed366ddb7ed84 成功發布。真實 Edge LINE → 第 3 版 QA GAS → QA 試算表：沒有點「新增編號」，直接送出合成補打卡 2026-10-29／下班／17:31，系統自動產生 QA_185e998a2db31b260bf5b937d76484fa；成功 PENDING、duplicate=false。送件後程式自動唯讀刷新 2026-10 補打卡列表，顯示原 10/30 上班單及新 10/29 下班單，沒有手動按查詢。

頁面原送出按鈕已停用並顯示「已送出（請查看紀錄）」，收據保留原 ID；重新開同頁後 isEnabled=false，未再送出原單。另以實際 UI 切換 HOURS 顯示時間欄位，切 DAY 後 hourFields 不可見且 fromTime 停用；此操作沒有新請假寫入。

本輪僅新增上述一筆 TEST001／TEST_CO 合成補打卡，保留不刪除，沒有正常打卡寫入。最後 QA 主開關 enabled、寫入 disabled 已儲存回讀。證據 evidence/qa-auto-submit-request-id.txt、qa-auto-submit-success.txt、qa-auto-submit-success.png。45 項為離線檢查，以上真實送件是另列的 Edge 實測，尚未把新送件 UX 稱為 iPhone 驗收。

新增合成補打卡後，再以真實 QA 查詢 MY_CLOCKS，正常月表仍僅 10/30／18:14:47／18:28:13；沒有 10/29 的 17:31 補打卡。證據 evidence/qa-normal-after-auto-missing.txt。

## 最新真實 QA 下載、平面匯出與備份讀回

已從正確隔離 QA 工作簿重新直接下載 evidence/QA_CloudRecords_Latest_20261030.xlsx，未更動共用權限。唯讀讀取確認技術流水 5 列、正常 GPS 打卡 2 列。以既有匯出模組驗證流水雜湊與版本後，產出 evidence/operational-export-latest/clock.csv（2）、leaves.csv（3）、missing.csv（2）。跨月假單是同一原單，匯出不重複；補打卡原單沒有進入正常打卡。

package_qa_export.py 再驗證 CSV BOM、欄數、TEST001／TEST_CO 隔離、各原 ID 與下載快照完整對上、無重複 ID，將來源 xlsx／三 CSV／README／SHA-256 manifest 打包為 evidence/QA_Excel_Handoff_20261030.zip。ZIP CRC 檢查及內部各檔解壓讀回雜湊均通過。不是雲端還原測試、不是使用者既有 Excel 匯入成功。

已向使用者索取三類 Excel 匯入欄位名稱與順序（不需員工資料）；尚未收到之前保留候選欄位，不改既有 Excel、不推定薪資公式。另已提供新版 iPhone 唯讀驗收步驟：三頁與 11／12 月，不要求再打卡或送件。A～E 表已更新並保留 HR 真角色／通知／Android／斷線及實體 NFC 未完成狀態。本輪沒有新增雲端資料，QA 寫入仍 disabled。

## 從現有打卡系統 Google 試算表取得欄位對接依據

依使用者指示唯讀打開 Apps Script「打卡系統」總覽，確認容器為「LINE打卡系統」Google 試算表。Drive 連接器無權讀取（403），改用已登入正確 Google 帳號的 Edge。只選取三張表第 1 列取得表頭，沒有下載正式員工資料、沒有編輯或執行正式程式；編輯器儲存按鈕仍 disabled。

實際表頭與順序：
- 打卡紀錄 11 欄：時間戳記、日期、時間、員工ID、姓名、類型、地點代碼、地點名稱、GPS、備註、來源。
- 請假申請 12 欄：申請單號、員工ID、姓名、假別、開始日期、結束日期、天數/時數、原因、狀態、申請時間、審核人、審核時間。
- 補打卡申請 13 欄：申請單號、員工ID、姓名、日期、公司、班別、時間、原因、狀態、申請時間、審核人、審核時間、核定打卡時間。

另在原程式以搜尋／選取唯讀核對 appendRow 與審核欄位：時數存 HH:mm-HH:mm 字串，全天 1天；狀態為待審核／核准／駁回；補卡班別為上班／下班，只有核准才填第 13 欄核定打卡時間，不屬正常打卡。

已新增純本機 QA 對照匯出 V2_ExistingSheetLayoutExport.js。姓名只讀隔離 TEST001 來源員工資料 B2 的「模擬員工甲」；時間取 QA 流水實際 UTC 時刻轉台北，跨月單只匯一次，不計薪資時數。依上述表頭產出 evidence/existing-sheet-layout-qa/ 三 CSV（正常 2、請假 3、補卡 2），逐欄與瀏覽器實讀表頭完全一致。封裝 evidence/QA_ExistingSheetLayout_20261030.zip，CSV 讀回、ZIP CRC 與內容雜湊均核對通過。

已明列真實差異：QA 正常打卡未保留原始 GPS 座標，GPS 欄留白而非造資料；來源保留實際 GPS（原正式程式寫 LINE）。原完整 QA 稽核匯出與備份保留。5 項新匯出規則離線檢查與原 7 項匯出檢查通過；這不是既有 Excel/VBA 匯入或薪資計算成功。使用者不必再貼表頭，剩餘是線下 Excel 程式的實際匯入驗證。此輪沒有任何雲端資料寫入。

