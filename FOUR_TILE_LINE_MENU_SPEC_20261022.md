# V2 正式 LINE 四格選單保留策略（2026-10-22）

使用者已明確確認，原本四個按鈕是**LINE 官方帳號聊天畫面下方 Rich Menu**，不是進入網頁後顯示的首頁選單。不得用新做的七格網頁首頁取代原始操作習慣。

## 官方 LINE Rich Menu 維持四個主入口
1. 正常打卡 → 開啟原正常打卡 LIFF 頁面，後端改以 V2 安全寫入與當日查詢為核心。
2. 補打卡 → 開啟原補打卡申請頁；驗證身分、申請、歷史結果、主管審核流程依舊規則。
3. 個人出勤查詢 → 開啟原最近三個月查詢，並在**此頁內**額外放置「特休查詢（建置中）」「薪資查詢（建置中）」「歷史紀錄（建置中）」三個子入口。
4. 請假申請 → 開啟原六種假別的請假表單及本人申請歷史。

新增三個人資查詢項目**不佔 LINE Rich Menu 其餘格數**，以免不同版本造成現場使用習慣混亂；日後使用者若希望把按鈕調整為 6 格或多頁 Rich Menu，需先另外討論。

## 現有程式分層
- 正式 LINE Rich Menu：**此輪完全沒有改**；其配置在 LINE Official Account Manager，不在 GitHub。
- 正式打卡網站 `line-punch/line-punch/main/index.html`：完全沒有改。原有按鈕導向與員工工作不受影響。
- 既有 V2 真實 iPhone 打卡測試首頁：沒有改。
- 可公開瀏覽的純畫面預覽 `line-punch/attendance-v2-test/main/employee-center-preview/`：已改為四格模擬主選單，其他三個模組藏在「個人出勤查詢」，**無 LINE 登入、無任何 API、禁止網路連線**，僅用來檢查樣式。
- 未發布的 LINE LIFF 真正整合候選檔：`Legacy4PageReuse.html`＋`Legacy4PageReuse.js`，在 `feature/line-rich-menu-four-original-pages-20261022`，同樣四個主入口＋查詢內三個子頁，17/17 項模擬測試通過。補卡／請假仍未開放實際送出，不能宣告已完成。

## 後續實際切換
真正由 LINE 四格選單點進各頁，必須檢查原 Rich Menu 每格的既有 LIFF URL、`?page=clock|miss|query|leave` 參數與 LINE channel/endpoint 設定，並在隔離的測試 LINE 環境完成跳轉測試。只有當 V2 安全後端與全頁面驗證通過，且使用者批准切換後，才更新正式 Rich Menu URL 或 LIFF endpoint。不得用純預覽 URL 或測試後端當正式網頁。
