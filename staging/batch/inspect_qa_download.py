"""Read only the downloaded synthetic QA workbook; do not author an Excel file."""
import datetime
import json
import sys
from pathlib import Path
import openpyxl

root = Path(__file__).resolve().parents[2]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "evidence" / "QA_CloudRecords_20261030.xlsx"
book = openpyxl.load_workbook(source, read_only=True, data_only=False)
def values(name):
    return [list(row) for row in book[name].iter_rows(values_only=True) if any(v is not None for v in row)]
payload = {"ledger": values("V2_交易流水_QA"), "normal": values("V2_正常打卡_QA")}
for row in payload["normal"][1:]:
    # Sheets exports date cells as native Excel dates; preserve their calendar meaning.
    if isinstance(row[3], datetime.datetime):
        row[3] = row[3].date().isoformat()
    elif isinstance(row[3], datetime.date):
        row[3] = row[3].isoformat()
    if isinstance(row[4], (datetime.datetime, datetime.time)):
        row[4] = row[4].strftime("%H:%M:%S")
def typed_value(value):
    if isinstance(value, (datetime.date, datetime.time)):
        return value.isoformat()
    raise TypeError(type(value).__name__)
destination = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "evidence" / "qa-downloaded-records.json"
destination.write_text(json.dumps(payload, ensure_ascii=False, default=typed_value), encoding="utf-8")
print(json.dumps({"ledger_entries": len(payload["ledger"]) - 1,
                  "normal_punches": len(payload["normal"]) - 1}, ensure_ascii=True))

