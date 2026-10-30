"""Verify and package actual downloaded TEST001 exports; never write to Google."""
import csv
import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = root / "evidence"
snapshot = json.loads((evidence / "qa-latest-records.json").read_text(encoding="utf-8"))
folder = evidence / "operational-export-latest"
tables = {}
for name in ("clock", "leaves", "missing"):
    source = folder / (name + ".csv")
    if not source.read_bytes().startswith(b"\xef\xbb\xbf"):
        raise ValueError("CSV must include UTF-8 BOM: " + name)
    with source.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.reader(stream))
    if not rows or any(len(row) != len(rows[0]) for row in rows):
        raise ValueError("CSV columns do not round-trip: " + name)
    if any(row[1:3] != ["TEST001", "TEST_CO"] for row in rows[1:]):
        raise ValueError("Unexpected employee or company")
    if len({row[0] for row in rows[1:]}) != len(rows) - 1:
        raise ValueError("Repeated original ID in export: " + name)
    tables[name] = rows

latest = {}
for entry in snapshot["ledger"][1:]:
    row = json.loads(entry[3])
    latest[row["requestId"]] = row
expected = {
    "clock": {row[0] for row in snapshot["normal"][1:]},
    "leaves": {key for key, row in latest.items() if row["kind"] == "LEAVE"},
    "missing": {key for key, row in latest.items() if row["kind"] == "MISSING"},
}
for name, ids in expected.items():
    if ids != {row[0] for row in tables[name][1:]}:
        raise ValueError("Original IDs missing or added: " + name)
if expected["clock"] & (expected["leaves"] | expected["missing"]):
    raise ValueError("Normal attendance mixed with applications")

readme = """TEST001／TEST_CO 隔離 QA 匯出候選，非正式員工資料。

QA_CloudRecords_Latest_20261030.xlsx：直接下載的原始備份，保留技術流水與正常打卡。
clock.csv：正常 GPS 打卡，一次打卡一列；不混入補打卡。
leaves.csv：每張假單最新版本一列，跨月仍只有一張原單，保留完整起訖日期。
missing.csv：每張補打卡申請最新版本一列，不回填正常打卡。
manifest.json：來源及 CSV 的 SHA-256、筆數與欄位，供備份核對。

CSV 為 UTF-8 BOM。匯入 Excel 時，原申請編號、員工編號請指定文字格式。
日期為 YYYY-MM-DD；時間為 HH:mm 或 HH:mm:ss；DAY=全天，HOURS=指定時段。
PENDING=待審核，APPROVED=已核准，REJECTED=已退回。
含送件日期及審核欄位；尚未審核的欄位留白，不填入虛構結果。
下載範圍不受員工頁面所選月份限制。技術流水原始備份仍保留各版本。

這是欄位候選，尚未對接使用者既有 Excel 程式；不可直接宣稱已完成薪資匯入或計算。
是否採計補打卡、各假別及薪資計算，沿用使用者線下 Excel 規則。
"""
(folder / "README.txt").write_text(readme, encoding="utf-8")
files = [evidence / "QA_CloudRecords_Latest_20261030.xlsx"] + [folder / (name + ".csv") for name in tables]
manifest = {
    "createdAtUTC": datetime.now(timezone.utc).isoformat(),
    "scope": "TEST001/TEST_CO synthetic QA only",
    "excelSchemaMatched": False,
    "ledgerEntries": len(snapshot["ledger"]) - 1,
    "rows": {name: len(rows) - 1 for name, rows in tables.items()},
    "columns": {name: rows[0] for name, rows in tables.items()},
    "files": {path.name: {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                          "bytes": path.stat().st_size} for path in files},
}
(folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
archive = evidence / "QA_Excel_Handoff_20261030.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as package:
    for path in files + [folder / "README.txt", folder / "manifest.json"]:
        package.write(path, path.name)
with zipfile.ZipFile(archive) as package:
    if package.testzip() is not None:
        raise ValueError("Archive failed integrity check")
    for name, info in manifest["files"].items():
        if hashlib.sha256(package.read(name)).hexdigest() != info["sha256"]:
            raise ValueError("Archive readback mismatch: " + name)
print(json.dumps({"rows": manifest["rows"], "verifiedArchive": str(archive),
                  "excelSchemaMatched": False}, ensure_ascii=False))

