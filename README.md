# 打卡系統 V2.0 — LINE 登入隔離測試

此儲存庫僅用於**隔離測試**，與員工正式使用的 `line-punch/line-punch` 打卡頁面分開。**請勿提供此入口給員工使用。**

## 測試階段 1：LIFF 登入相容性

- 網頁檔案：[`index.html`](./index.html)
- 測試 LIFF ID：`2012136707-2dDU0aSJ`
- 對應 LINE Login Channel：`2012136707`，維持 Developing。
- 預定 GitHub Pages 位址：`https://line-punch.github.io/attendance-v2-test/`，尚需啟用 Pages 並核對實際發布。
- **目前僅測試 LINE LIFF 在頂層 HTTPS 頁面的登入流程；不會呼叫後端、寫入 Google Sheet、打卡或請假。**
- `CONFIG.enableServerVerification=false` 是刻意關閉的安全閘。即使使用者成功登入 LINE，也**不表示後端已驗證身分**。

## 安全與正式環境隔離

- 不更動既有 `line-punch/line-punch` 倉庫或其 GitHub Pages 設定。
- 不更動原正式打卡 Channel 或正式 LIFF Endpoint。
- 不儲存 LINE ID Token、Channel secret、使用者資料或 Google 私密設定於本 repo。
- 第二階段與 GAS 連線前，須完成後端 POST 通道的整合與安全測試；不得直接沿用正式 JSONP 端點。
- LIFF Endpoint 必須設定為此儲存庫的**實際已啟用** GitHub Pages HTTPS 首頁，而非 Apps Script HTMLService iframe 頁。
- 測試 Channel 及 LIFF 尚未完成 iPhone/Android 實測。

## 目前已驗證

`index.html` 已由 ChatGPT 自 GitHub 隔離開發分支複製，並經 JavaScript 語法檢查。GitHub Pages 是否啟用、LINE 實際登入是否成功，仍須另外驗證。
