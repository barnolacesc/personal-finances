"""
Migration: add bank sync fields to the expense table.
Run once on the target host before deploying new code.
"""

import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "..", "instance", "expenses.db")
db_path = os.path.normpath(db_path)

print(f"Migrating database: {db_path}")
conn = sqlite3.connect(db_path)
c = conn.cursor()

new_columns = [
    "ALTER TABLE expense ADD COLUMN source VARCHAR(20) DEFAULT 'manual'",
    "ALTER TABLE expense ADD COLUMN external_id VARCHAR(100)",
    "ALTER TABLE expense ADD COLUMN merchant VARCHAR(200)",
]

for stmt in new_columns:
    col = stmt.split("ADD COLUMN ")[1].split(" ")[0]
    try:
        c.execute(stmt)
        print(f"  Added column: {col}")
    except sqlite3.OperationalError:
        print(f"  Column already exists (skipped): {col}")

try:
    c.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_expense_external_id "
        "ON expense(external_id)"
    )
    print("  Created unique index on expense.external_id")
except sqlite3.OperationalError as e:
    print(f"  Index already exists (skipped): {e}")

conn.commit()
conn.close()
print("Migration complete.")
