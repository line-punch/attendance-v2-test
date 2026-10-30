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

仍待：下班真實紀錄與手機畫面確認、每日重複限制及定位失敗實機、員工版畫面精簡、Excel 匯入欄位對齊、審核與通知的必要角色驗證。測試期間 QA 主開關及寫入開關為 enabled；不得將此狀態稱為正式上線或全案完成。

