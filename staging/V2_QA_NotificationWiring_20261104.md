# 主管通知與審核接線：2026-11-04

使用者指示先完成接線、稍後再測通知。沿用原通知主管1／2收文字、審核主管收核准／駁回申請卡、審核後通知員工的操作，不另建人資系統。NFC 仍僅訂購一張，未確認到貨。

## 本輪完成的是本機程式接線

- V2_QANotificationPlan.js：只接受 TEST001／TEST_CO。以明確測試收件人白名單建立文字與 LINE Flex 訊息內容；通知主管重複身分只收一份文字，審核主管保留自己的申請卡。同時擔任通知與審核角色者維持兩種用途，不混淆。
- V2_QANotificationBridge.js：已接既有流水驗證與 WorkflowCore。申請流水事件產生卡片規劃；卡片選項轉為原 HR_REVIEW 命令，再由既有 Core 獨立驗證憑證、角色、原單及最新狀態。審核流水事件產生原員工結果訊息規劃。已處理原單不再規劃舊待審卡。
- 每份訊息有固定 deliveryKey，可供後續持久化傳送紀錄；此鍵本身不是傳送成功證明，也尚未提供自動重送機制。
- 回傳 NOT_SENT，沒有傳送 API、憑證或雲端資料變動。新回呼參數以 qa=v2／decision／kind／requestId 與舊 action／type／no 區分，禁止直接送到正式回呼。不能只靠參數把外部事件當成已驗證。
- 6 項通知規劃離線檢查通過；2 項完整本機流程通過（請假核准、補卡駁回），涵蓋員工權限拒絕、同單重複點擊、相反決定衝突與只通知原員工。全部合成身分與記憶體儲存，不是真 LINE、Google、主管或員工收件成功。

## 尚未完成的實際服務接線

尚未部署至 GAS，也未更動現有測試或正式 webhook。實際傳送與回呼仍需：

1. 與 TEST001 不同且由使用者指定的測試審核 LINE 身分，及明確允許的測試通知收件人；目前使用者選擇稍後處理。
2. 專用 QA 傳送與可信事件入口。既有正式回呼直接操作正式表，不能沿用其網址處理 QA。傳送前要確認測試 Messaging API Channel、憑證與 dedicated QA 路由；不能為方便取代仍在使用的 webhook。
3. 可信事件驗證後才能建立 VERIFIED_QA_LINE_EVENT principal；本機字串標記只是內部契約，不是外部事件驗證器。現有 Core 再驗證實際憑證；不能從瀏覽器傳入 reviewer/role 取得權限。
4. 持久化逐收件人傳送狀態與 LINE 冪等／查核機制。傳送回覆不明須保留原 deliveryKey 核對，不盲目重送。
5. 真人收件與點核准／駁回，核對同一 QA 原單的狀態及員工結果通知。未測前保持未驗收。

目前可安全完成的本機接線已保存，實際傳送保持未啟用。下一次有測試帳號時從專用 QA 路由與收件人核對繼續，不要求使用者重述既有主管流程。

## 同日後台實際核對：權限待恢復

實際在 Edge 開啟 LINE Developers，原 Business 工作階段已失效。以既有李思慧 LINE 帳號完成正常登入，未輸入密碼、未增加權限。可見 provider 與「打卡系統V2測試」Channel；頁面明確標示 Tester、LINE Login、Developing，僅有 Basic settings／Roles。這個目前登入身分無法核對 Messaging API Channel 或 webhook／通知傳送設定。不能由目前可見清單推斷帳號內根本不存在 Messaging API，也不能宣稱已查得傳送憑證或完成實際接線。

已請使用者在保留的 Edge 後台切回原管理打卡通知的 Business 管理帳號；不索取密碼、不自行新增角色。這是後台管理權限恢復，與稍後指定測試審核收件帳號不同。

同時唯讀重新核對 QA GAS：Google 帳號仍為詠晨總會計，QA 主開關 enabled、寫入 disabled，只有原六個既有屬性，沒有已設定的 QA HR 身分或通知傳送設定。沒有編輯屬性、部署、發送訊息或更動正式系統。後台權限恢復後，先唯讀辨識實際 Messaging API Channel 與既有 webhook 的用途，再提出獨立 QA 接線；不能直接替換原 webhook。

## 管理者恢復登入後：保留正式 webhook 的接法

使用者回覆已登入後，實際核對 provider 顯示 Admin；可管理三個 Channel：打卡系統V2測試（LINE Login、Developing）、公司打卡（LINE Login、Published）、YC/YT員工系統（Messaging API）。已在 Messaging API 分頁唯讀確認現有 webhook 指向既有 GAS，與獨立 QA 部署不同。沒有點 Verify／Edit／Reissue，沒有複製或發出 Channel token，也沒有改 OA 或 webhook。

因此 QA 卡片新增 reviewMode=LIFF：同樣顯示核准／駁回，但以 uri 開啟獨立 QA LIFF，帶 qaReviewId 與 qaDecision；不將 postback 送入正式服務。不需取代現有正式 webhook。原 postback 仍只是未啟用的本機候選，不可直接傳送。

前端新增 review-entry.js，版本 20261104j。連結不帶身分、權杖或角色；只填原單並打開審核區。必須先按查原審核單，經現有 HR_STATUS 伺服器權限驗證及同 ID／PENDING 核對後，才准送 HR_REVIEW；原服務仍再次驗證 LINE 與角色。開連結不查詢、不取 GPS、不自動送件。重複參數、錯誤原單與待核對的另一筆審核會阻擋。已處理後須重新查核，不能直接再按。

47 項前端離線檢查及 7 項通知規劃離線檢查通過，包含新連結不自動寫入、先查原單與員工被拒不能解鎖。仍未指定 QA 審核帳號、未配置傳送器、未發任何 LINE 訊息、未實測卡片轉跳或審核；不能宣稱整套已啟用。使用者已指示稍後再測通知。

### QA 前端發布與瀏覽器核對

QA 靜態頁 20261104j 已提交並由 Pages 成功發布（3627558bfd70c140e98b0e1634c9275742e1573a）。實際 Edge 開啟 QA 帶原單連結，核對 script 版本、審核區展開、原單只讀及明確「不會自動審核」提示。未登入也未查原單時，點核准由前端擋下，提示先查原審核單；沒有送出審核。畫面保存 evidence/qa-review-link-guard-20261104.png。

這是直接瀏覽器連結及前端防護實測，不是 LINE 卡片實際送達／LIFF 轉跳／審核成功。GAS 未重新部署，QA 寫入未開啟；正式 Messaging API/webhook/名單未修改，沒有傳送任何通知。

## 通知持久化與 GAS 停用檢查

新增 V2_QANotificationDispatch.js：先將原通知 deliveryKey、收件人、內容、UUID retryKey 保存並讀回，才可呼叫傳送。已 ACCEPTED 不再送；逾時、5xx 或程序在 SENDING 後中斷，保留原資料並回 UNKNOWN，禁止直接重送或另造新 key。相同 deliveryKey 改內容會拒絕。409 只有附原 accepted request ID 才記受理，HTTP 受理不代表員工已收到。

依據 LINE 官方文件 https://developers.line.biz/en/docs/messaging-api/retrying-api-request/ ：首送即帶 X-Line-Retry-Key；同一 key 必須保留相同收件人與內容，有效期 24 小時。此候選程式沒有自動重送功能，UNKNOWN 需另行人工查核，不會在超過有效期後新造 key 重送。

新增 V2_QANotificationGASPort_NOT_DEPLOYED.gs：只接受不同 ID 的原 QA 來源與目的簿、明確測試收件人白名單、與員工不同的 QA 審核人；三個開關必須明確 enabled。要求專用通知流水分頁及精確表頭，不自動建表。傳送器啟用時先核對 Bot basic ID，再用既有 LINE push API；沒有公開 Web 路由、觸發器或權杖硬編碼。

通知測試套件共 21 項離線檢查通過（規劃 7、流程 2、傳送 8、GAS 關閉防護 4）。仍不是 LINE 通知或 Google 真實資料寫入通過。

已在獨立 QA Apps Script 編輯器新增 V2_QANotificationDispatch.gs 與 V2_QANotificationGASPort.gs，儲存成功；未重新發布 Web App，既有第 3 版未更換，未設定 token／收件人／新開關或新增資料分頁。實際在 GAS 執行 desktopQaNotificationDisabledCheck：2026-11-04 台北時間 14:07:37 開始，印出 PASS_QA_NOTIFY_DISABLED_NO_SHEETS_NO_LINE，14:07:38 正常完成。此函式只讀 Script Properties 並確認 DISABLED，沒有讀寫 Google 試算表、沒有呼叫 LINE。

證據：evidence/qa-notify-disabled-gas-20261104.png。正式專案、原 GPS/V4、主管名單、Messaging API webhook 均未改動。下一步仍是使用者方便時指定測試審核帳號，再準備專用通知流水與明確測試收件人後做真實送達驗收；暫不發送通知。

## 改為先完成整合、最後集中驗收

使用者指示先把整個做起來再測；不再逐項要求手機、帳號或收件測試。維持原三介面範圍，實際通知與正式啟用仍不提前執行。

已新增並安裝 V2_QANotificationRuntime.gs（由 build-qa-notification-runtime.cjs 產生）：將現有持久化申請事件接至通知規劃、處理器及管理者佇列盤點。處理器每輪最多五次新傳送，已受理紀錄跳過；遇不明或拒絕停下查原通知。送出器在獨占鎖內重新讀最新原單與當下收件設定，原單狀態或內容改變就拒絕舊計畫。沒有公開新端點，也未掛自動排程。

2026-11-04 台北 14:17:05～14:17:12，於獨立 QA 執行初始化，成功新增僅表頭的 V2_通知流水_QA，回 QA_NOTIFY_LEDGER_READY_NO_MESSAGES_SENT。沒有新增、刪除或修改員工申請／正常打卡資料。14:18:01～14:18:03 管理者唯讀盤點實際回：pendingApplications=5、reviewedApplications=0、journalEntries=5、notificationEnabled=false、writeEnabled=false、reviewerConfigured=false、recipientListConfigured=false、notificationLedgerPresent=true。

整合通知檢查現為 26 項離線（7＋2＋8＋4＋5）；前端 47 項保持通過。新增主管頁顯示日期／類型／狀態的文字說明與確認核准／確認駁回，不把 JSON 當主管介面；版本 20261104k。這些本機檢查不是使用者最終實機驗收。

V2_QANotificationSchedule_SETUP_ONLY.gs 已備妥但未安裝，避免現在增加 ScriptApp 觸發器權限或發通知；最終同意啟用及 Google 授權後才安裝排程。具體集中驗收清單見 V2_FinalAcceptance_Runbook_20261104.md。仍未取得 QA 審核身分、私有收件／Bot 設定與通知實測，所以不能宣稱全系統或正式上線已完成。

主管頁後續補強為 20261104l：不明審核回查只見 PENDING 時仍保留原單鎖，不能因原單存在就誤解為已完成並再送。只有回查同原單已核准／駁回才能解除此審核不明狀態。前端檢查為 48 項離線通過。主管原單以人可讀的日期／類型／狀態分行顯示，沒有自動送件。

