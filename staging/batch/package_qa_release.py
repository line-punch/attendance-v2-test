"""Build a code-only QA handoff package. No credentials, data, or cloud access."""
from pathlib import Path
import hashlib
import json
import zipfile
from datetime import datetime
from zoneinfo import ZoneInfo

root = Path(__file__).resolve().parents[2]
batch = root / 'staging/batch'
files = {
    'apps-script/程式碼.gs': batch / 'V2_BatchQA_SYNC_FULL_BUNDLE_NOT_DEPLOYED.gs',
    'apps-script/DesktopQA_ReadonlyChecks.gs': batch / 'DesktopQA_ReadonlyChecks.gs',
    'apps-script/DesktopQA_JournalPersistence.gs': batch / 'DesktopQA_JournalPersistence.gs',
    'apps-script/V2_QANotificationDispatch.gs': batch / 'V2_QANotificationDispatch.js',
    'apps-script/V2_QANotificationGASPort.gs': batch / 'V2_QANotificationGASPort_NOT_DEPLOYED.gs',
    'apps-script/V2_QANotificationRuntime.gs': batch / 'V2_QANotificationRuntime_GENERATED.gs',
    'final-activation/NotificationSchedule_SETUP_ONLY.gs': batch / 'V2_QANotificationSchedule_SETUP_ONLY.gs',
    '集中驗收清單.md': root / 'staging/V2_FinalAcceptance_Runbook_20261104.md',
    '目前整合紀錄.md': root / 'staging/V2_QA_NotificationWiring_20261104.md',
    'A至E驗收現況.md': root / 'staging/V2_AtoE_Acceptance_20261104.md',
    '正式切換準備.md': root / 'staging/V2_ProductionCutover_Plan_20261104.md',
    '正式候選權限說明_未部署.md': root / 'staging/V2_ProductionCandidate_AccessContract_20261104.md',
    '正式候選資料GPS_未部署.md': root / 'staging/V2_ProductionCandidate_DataGPS_20261104.md',
}
for file in (batch / 'qa-client').iterdir():
    if file.is_file() and file.suffix in ('.js', '.html'):
        files['qa-client/' + file.name] = file
for file in batch.iterdir():
    if file.is_file() and file.suffix in ('.js', '.gs', '.cjs', '.py', '.json'):
        files['source/staging/batch/' + file.name] = file
for file in (batch / 'qa-client').iterdir():
    if file.is_file() and file.suffix in ('.js', '.html'):
        files['source/staging/batch/qa-client/' + file.name] = file
payload = {name: path.read_bytes() for name, path in files.items()}
payload['使用說明.txt'] = '''打卡三介面獨立 QA 整合包

僅供 TEST001／TEST_CO 隔離環境，不可直接覆蓋正式、舊 GPS 或 V4 專案。
apps-script 是目前獨立 QA 的完整程式檔組合；通知設定預設關閉。
qa-client 是已發布的獨立 QA 靜態頁，不含員工或主管憑證。
source 供維護與重建；不可把其所有 gs 重複貼入同一 Apps Script 專案。
final-activation 中的排程安裝程式目前未安裝，最後核對及授權後才使用。

本包只含程式與說明，不含員工資料、LINE token、私有身分或姓名對照。
原始 QA 資料與匯出備份留在 evidence，沒有被本包取代或刪除。
本機下載轉換需 Node 及具備 openpyxl 的 Python，本工作環境已具備。
在 source/staging/batch 可執行 test:mobile、test:notifications；主 test 指令仍是歷史完整清單，部分原始檔不在此本機副本。

QA 私有審核人及通知設定已完成，不包含於本包。手動 LINE 通知及卡片審核已有實測，詳見 A至E驗收現況。
QA 寫入與通知在測試後關閉，自動排程尚未啟用；正式切換、Android、真實斷線及實體 NFC 尚未驗收。
人資查詢維持建置中，NFC 延後；蝦皮只訂購一張，尚未確認到貨與型號。
'''.encode('utf-8')
manifest = {'kind': 'QA code-only handoff', 'scope': 'TEST001/TEST_CO',
            'frontendVersion': '20261104l', 'includesPrivateData': False,
            'liveAcceptanceCompleted': False,
            'sha256': {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}}
payload['manifest.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
folder = root / 'deliverables'
folder.mkdir(exist_ok=True)
stamp = datetime.now(ZoneInfo('Asia/Taipei')).strftime('%Y%m%d_%H%M%S_%f')
archive = folder / ('打卡系統_QA整合程式_' + stamp + '.zip')
with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as output:
    for name, data in payload.items():
        output.writestr(name, data)
with zipfile.ZipFile(archive) as check:
    if check.testzip() is not None or set(check.namelist()) != set(payload):
        raise ValueError('Package verification failed')
    for name, digest in manifest['sha256'].items():
        if hashlib.sha256(check.read(name)).hexdigest() != digest:
            raise ValueError('Hash mismatch: ' + name)
print(json.dumps({'archive': str(archive.resolve()), 'files': len(payload), 'verified': True}, ensure_ascii=True))

