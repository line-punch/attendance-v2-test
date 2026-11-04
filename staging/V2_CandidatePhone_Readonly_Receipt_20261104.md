# 候選手機唯讀接線（第 5 版，獨立部署）

## 已完成與隔離

- 新增 QA_CANDIDATE_READONLY_20261104 部署，第 5 版、獨立新 URL。原 QA 第 4 版部署與根目錄頁面不變，正式、舊 GPS 與 V4 未修改。
- 靜態頁新增 candidate/ 子目錄，原 qa-client 不變；候選使用獨立 sessionStorage 前綴，原單／結果不明狀態不與第四版混用。
- 保留同一測試 LINE Login Channel 與 LIFF 的 openid 範圍，沒有新增 LINE 權限、好友訊息權限或正式帳號。使用官方支援的 LIFF 附加路徑，網址為 https://liff.line.me/2012136707-CgGNZAuq/candidate/ 。
- 參考官方說明：https://developers.line.biz/en/docs/liff/opening-liff-app/ 及 https://developers.line.biz/en/tips/2026/07/16/liff-url-additional-info/ 。LIFF 參數在 init 完成後才解析；外部登入明確指定返回候選路徑，避免跳回舊 QA。
- 公開候選 runtime 只有私人伺服器函式，並未包含前輪管理者合成初始化／寫入測試入口。管理者 runtime 原始碼、編譯檔、回執、備份均保留本機與版本倉庫，但 HEAD 的同名檔已換成候選唯讀 runtime；不能將兩者一起安裝或把管理者版本公開部署。

## 真正 LINE 身分與資料範圍

伺服器沿用既有 LINE token 驗證器，核對發行者、Channel、期限與 sub。每次讀取重新核對現有 TEST001 測試基本表及 QA_HR_TEST 私有審核綁定；token 的 sub 不會被手機自填員工編號取代，也不會在基本表改綁時被換成另一個人的 sub。

只允許原本 TEST001 或指定 QA 審核人進入候選合成副本。私人 LINE sub 只在伺服器記憶體套入權限對應，不寫回合成表、不進前端或 GitHub。全體正式員工仍未接入。

候選服務目前無任何手機寫入 adapter。GPS_CLOCK、LEAVE_REQUEST、MISSING_REQUEST、HR_REVIEW 一律回 DISABLED，與舊 QA 寫入開關無關；前端也停用送件／審核按鈕。不發通知、不取 GPS、不設排程。候選查詢旗標獨立於舊 QA。

## 已實測

1. 候選旗標 disabled 時，在 Edge 真頁面按正常卡查詢，後端確實回 DISABLED。
2. 僅啟用候選查詢後，以既有李思慧 LINE 例行登入，伺服器實際 token 驗證成功。沒有增加 scope。
3. Edge／LINE／GAS／Google Sheets 查詢候選合成副本成功：11/4 正常上班 19:54:05；11/5 合成請假顯示已核准；11/4 下班 17:31 合成補卡顯示已退回。
4. 查詢前後完整下載 xlsx 逐分頁、逐值相等。仍是兩張申請、四筆交易事件、一筆正常卡；舊座標轉型列也保留。沒有送件、審核、通知或資料變動。
5. 靜態頁第二次更新已修正例行登入返回候選路徑，GitHub Pages 部署完成；原根目錄檔案沒有修改。

8 項候選 bridge 模擬檢查與 1 組前端建置契約檢查通過；這些仍是離線模擬，不計為手機實測。候選第 5 版的 iPhone 及 YC-Eddy 真實審核身分唯讀查詢仍待驗收；前輪第四版真人核准／駁回與自動通知實測不拿來替代。

## 結束／交接狀態

V2_CANDIDATE_PHONE_ENABLED=enabled，僅供接下來手機唯讀確認。候選全部寫入在程式中硬性拒絕；舊 QA 寫入 disabled、通知 disabled、多身分管理者測試旗標 disabled、排程未啟用。候選頁顯示管理者合成資料，不能當員工真實出勤。

本機 evidence 保存第五版部署截圖、候選補卡查詢截圖、qa-candidate-phone-browser-verification-20261104.json、完整查詢後備份與 session 交接紀錄；不公開私人設定與 LINE token。

下一步先讓使用者用手機唯讀看三頁，及指定審核人只查合成原單。完成後才整合候選手機寫入／原單恢復／通知，仍限 TEST001／TEST_CO；不得因查詢通過就對全體正式員工開放。

## iPhone LINE 三頁確認

使用者確認「以上三頁正常」。正常卡僅一筆上班，候選合成副本本來未建立下班卡，因此下班欄空白為預期；沒有刪除或修改原 QA 的上下班資料。據此記錄候選第 5 版 iPhone LINE 三頁唯讀查詢通過，不能推定候選送件、審核、通知或 GPS 實機也通過。
