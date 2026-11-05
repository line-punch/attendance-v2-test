"""Archive the exact basic staff release with an explicit public-source allowlist."""
from pathlib import Path
import hashlib
import json
import zipfile
from datetime import datetime
from zoneinfo import ZoneInfo

root = Path(__file__).resolve().parents[2]
batch = root / 'staging/batch'
files = {'webapp/程式碼.gs': batch / 'V2_StaffLive_Runtime_GENERATED.gs'}
for name in ('index.html', 'app.js', 'config.js', 'review-entry.js'):
    files['staff/' + name] = batch / 'staff-client' / name
for name in ('V2_Staff_FormalActivation_Review_20261105.md', 'V2_AtoE_Acceptance_20261104.md'):
    files['records/' + name] = root / 'staging' / name
for name in ('build-staff-live.cjs', 'build-staff-client.cjs', 'V2_LegacyCutover_Guard.cjs',
             'V2_StaffLive_Port.gs', 'V2_StaffLive_Notify.gs', 'V2_StaffLegacyClocks.js',
             'V2_StaffLive_Runtime.test.js', 'V2_StaffClient.test.js'):
    files['reference/' + name] = batch / name
payload = {name: p.read_bytes() for name, p in files.items()}
payload['說明.txt'] = '''YC/YT員工系統 基本三功能部署快照 2026/11/05
這是維護備份，不要直接覆蓋現有 Apps Script 或重建部署。
webapp 是新獨立正式服務第1版來源，staff 是已發布的四個前端檔。
私有設定與員工資料不在此包；程式預設關閉，實際啟用狀態由 Google 私有設定控制。
原服務第60版只加入可回復 GET 開關，原 LINE webhook 與六張舊待審卡保留。
reference 是參考來源，不可整批貼入公開專案，也不是完整重建環境。
已完成正式部署與選單切換；首筆正式寫入、通知、下載及 Excel 套算未驗證。
候選版手機通過與本機測試不能當成正式新單驗收。
回復順序：先關新寫入及通知，再回復舊四連結及舊入口開關；保留所有新資料。
不要刪資料、重播通知或用新的 requestId 重送結果不明的原單。
NFC、Android、真實斷線及人資查詢未因此完成。
'''.encode('utf-8')
manifest = {'kind': 'staff basic release code snapshot', 'privateDataIncluded': False,
            'formalEntrySwitched': True, 'formalRealTransactionVerified': False,
            'sha256': {n: hashlib.sha256(v).hexdigest() for n, v in payload.items()}}
payload['manifest.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
outdir = root / 'deliverables'
outdir.mkdir(exist_ok=True)
stamp = datetime.now(ZoneInfo('Asia/Taipei')).strftime('%Y%m%d_%H%M%S_%f')
archive = outdir / ('YC_YT基本三功能部署備份_' + stamp + '.zip')
with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as z:
    for n, v in payload.items():
        z.writestr(n, v)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None and set(z.namelist()) == set(payload)
    for n, h in manifest['sha256'].items():
        assert hashlib.sha256(z.read(n)).hexdigest() == h
print(json.dumps({'archive': str(archive), 'verified': True, 'files': len(payload)}, ensure_ascii=True))
