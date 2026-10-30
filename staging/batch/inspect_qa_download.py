"""Read only the downloaded synthetic QA workbook; do not author an Excel file."""
import datetime
import json
from pathlib import Path
import openpyxl

root = Path(__file__).resolve().parents[2]
source = root / "evidence" / "QA_CloudRecords_20261030.xlsx"
book = openpyxl.load_workbook(source, read_only=True, data_only=False)
def values(name):
    return [list(row) for row in book[name].iter_rows(values_only=True) if any(v is not None for v in row)]
payload = {"ledger": values("V2_交易流水_QA"), "normal": values("V2_正常打卡_QA")}
def typed_value(value):
    if isinstance(value, (datetime.date, datetime.time)):
        return value.isoformat()
    raise TypeError(type(value).__name__)
destination = root / "evidence" / "qa-downloaded-records.json"
destination.write_text(json.dumps(payload, ensure_ascii=False, default=typed_value), encoding="utf-8")
print(json.dumps({"ledger_entries": len(payload["ledger"]) - 1,
                  "normal_punches": len(payload["normal"]) - 1}, ensure_ascii=True))

