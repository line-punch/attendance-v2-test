"""Integration checks against an existing downloaded synthetic QA workbook."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

here = Path(__file__).resolve().parent
root = here.parents[1]
source = root / 'evidence/QA_CloudRecords_AfterGuards_20261030.xlsx'
names = root / 'evidence/qa-verified-export-names.json'
before = hashlib.sha256(source.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='qa-export-check-') as temp:
    work = Path(temp)
    command = [sys.executable, str(here / 'export_qa_download.py'), str(source),
               '--names', str(names), '--output-root', str(work / 'outputs')]
    first = json.loads(subprocess.check_output(command, text=True, encoding='utf-8'))
    first_zip = Path(first['zip'])
    first_hash = hashlib.sha256(first_zip.read_bytes()).hexdigest()
    second = json.loads(subprocess.check_output(command, text=True, encoding='utf-8'))
    assert first['zip'] != second['zip']
    assert hashlib.sha256(first_zip.read_bytes()).hexdigest() == first_hash
    assert first['rows'] == second['rows'] == {'clock': 2, 'leaves': 3, 'missing': 2}
    print('PASS repeated export preserves original source and earlier package')
    snapshot = work / 'snapshot.json'
    subprocess.run([sys.executable, str(here / 'inspect_qa_download.py'), str(source), str(snapshot)],
                   check=True, capture_output=True)
    data = json.loads(snapshot.read_text(encoding='utf-8'))
    data['normal'][1][1] = 'OTHER_EMPLOYEE'
    snapshot.write_text(json.dumps(data), encoding='utf-8')
    rejected = subprocess.run(['node', str(here / 'export-qa-package.cjs'), str(snapshot), str(names)],
                              capture_output=True, text=True, encoding='utf-8')
    assert rejected.returncode != 0 and 'QA_EXPORT_NORMAL_ROW_INVALID' in rejected.stderr
    assert rejected.stdout == ''
    print('PASS another employee is rejected without emitting CSV data')
    invalid_names = work / 'names.json'
    invalid_names.write_text('{}', encoding='utf-8')
    blocked_root = work / 'blocked-output'
    rejected = subprocess.run([sys.executable, str(here / 'export_qa_download.py'), str(source),
                               '--names', str(invalid_names), '--output-root', str(blocked_root)],
                              capture_output=True)
    assert rejected.returncode != 0 and not blocked_root.exists()
    print('PASS unverified employee name creates no deliverable')
assert hashlib.sha256(source.read_bytes()).hexdigest() == before
print('3/3 integration checks passed; downloaded QA data only, no cloud calls')

