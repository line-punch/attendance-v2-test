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

