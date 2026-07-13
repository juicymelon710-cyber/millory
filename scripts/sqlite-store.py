import json
import sqlite3
import sys
from pathlib import Path

db_path = Path(sys.argv[1])
action = sys.argv[2]
db_path.parent.mkdir(parents=True, exist_ok=True)

conn = sqlite3.connect(db_path)
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS calculator_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """
)

if action == "has":
    row = conn.execute("SELECT 1 FROM calculator_config WHERE id = 1").fetchone()
    print(json.dumps({"exists": bool(row)}))
elif action == "get":
    row = conn.execute("SELECT data FROM calculator_config WHERE id = 1").fetchone()
    print(json.dumps({"data": json.loads(row[0]) if row else None}))
elif action == "save":
    payload = sys.stdin.read()
    data = json.loads(payload)
    conn.execute(
        """
        INSERT INTO calculator_config (id, data, updated_at)
        VALUES (1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
        """,
        (json.dumps(data, ensure_ascii=False),),
    )
    conn.commit()
    print(json.dumps({"ok": True}))
else:
    raise SystemExit(f"Actiune necunoscuta: {action}")
