"""One local command: preserve a downloaded QA XLSX and export three CSVs.
Never opens a browser, calls Google, writes the source, or deletes existing data.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from zoneinfo import ZoneInfo
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--names', type=Path, required=True,
                        help='Verified QA employee/reviewer ID-to-name JSON')
    parser.add_argument('--output-root', type=Path, required=True)
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    names = args.names.resolve(strict=True)
    if source.suffix.lower() != '.xlsx':
        raise ValueError('Use the complete downloaded QA .xlsx backup')
    here = Path(__file__).resolve().parent
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    # Validate everything before creating deliverables. Temporary files are local.
    with tempfile.TemporaryDirectory(prefix='attendance-qa-export-') as temp:
        snapshot = Path(temp) / 'snapshot.json'
        subprocess.run([sys.executable, str(here / 'inspect_qa_download.py'),
                        str(source), str(snapshot)], check=True, capture_output=True, text=True)
        result = subprocess.run([args.node, str(here / 'export-qa-package.cjs'),
                                 str(snapshot), str(names)], check=True,
                                capture_output=True, text=True, encoding='utf-8')
        package = json.loads(result.stdout)
    if hashlib.sha256(source.read_bytes()).hexdigest() != original_hash:
        raise ValueError('Source changed during validation; export stopped')
    files = package.pop('files')
    # Read back CSV structure and BOM before persisting a result.
    for name, text in files.items():
        if not text.startswith('\ufeff'):
            raise ValueError('Missing CSV BOM: ' + name)
        rows = list(csv.reader(io.StringIO(text.lstrip('\ufeff'), newline='')))
        if not rows or any(len(row) != len(rows[0]) for row in rows):
            raise ValueError('Invalid CSV width: ' + name)
    args.output_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(ZoneInfo('Asia/Taipei')).strftime('%Y%m%d_%H%M%S_%f')
    folder = args.output_root / ('QA_匯出_' + stamp)
    folder.mkdir(exist_ok=False)
    (folder / 'audit').mkdir()
    for name, text in files.items():
        (folder / name).write_bytes(text.encode('utf-8'))
    shutil.copyfile(source, folder / '原始QA備份.xlsx')
    if hashlib.sha256((folder / '原始QA備份.xlsx').read_bytes()).hexdigest() != original_hash:
        raise ValueError('Backup hash mismatch')
    note = ('僅 TEST001／TEST_CO 隔離合成資料，不能供正式員工使用。\n'
            '三個中文 CSV 沿用已核對 Google 表欄序；audit 保留完整匯出欄位。\n'
            '跨月單只取原單最新版本一次；補卡不混入正常打卡。\n'
            '不計算薪資；未驗證使用者 Excel/VBA 匯入。\n'
            '員工編號／申請單號請以文字匯入。不要刪除雲端測試資料。\n'
            + '\n'.join(package['warnings']) + '\n')
    (folder / '使用說明.txt').write_text(note, encoding='utf-8')
    manifest = {**package, 'scope': 'TEST001/TEST_CO only',
                'sourceSHA256': original_hash,
                'files': {str(p.relative_to(folder)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
                          for p in folder.rglob('*') if p.is_file()}}
    (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    archive = folder.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as output:
        for path in folder.rglob('*'):
            if path.is_file():
                output.write(path, path.relative_to(folder))
    with zipfile.ZipFile(archive) as check:
        if check.testzip() is not None:
            raise ValueError('ZIP CRC failed')
        for name, digest in manifest['files'].items():
            if hashlib.sha256(check.read(name)).hexdigest() != digest:
                raise ValueError('ZIP readback hash mismatch: ' + name)
    print(json.dumps({'folder': str(folder.resolve()), 'zip': str(archive.resolve()),
                      'rows': package['rows'], 'verified': True}, ensure_ascii=True))


if __name__ == '__main__':
    main()

