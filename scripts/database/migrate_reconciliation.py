"""
Migration: add type column to expense table and create reconciliation_allocation table.
Run once on the target host before deploying new code.
"""

import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "..", "instance", "expenses.db")
db_path = os.path.normpath(db_path)

print(f"Migrating database: {db_path}")
if not os.path.exists(os.path.dirname(db_path)):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

conn = sqlite3.connect(db_path)
c = conn.cursor()

# 1. Add type column to expense table
try:
    c.execute("ALTER TABLE expense ADD COLUMN type VARCHAR(20) DEFAULT 'expense'")
    print("  Added column: type to expense table")
except sqlite3.OperationalError as e:
    print(f"  Column 'type' already exists or skipped: {e}")

# 2. Create reconciliation_allocation table
create_table_sql = """
CREATE TABLE IF NOT EXISTS reconciliation_allocation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reimbursement_id INTEGER NOT NULL REFERENCES expense(id) ON DELETE RESTRICT,
    expense_id INTEGER NOT NULL REFERENCES expense(id) ON DELETE RESTRICT,
    amount REAL NOT NULL,
    counterparty VARCHAR(100),
    notes VARCHAR(255),
    group_id VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
"""
c.execute(create_table_sql)
print("  Created table reconciliation_allocation if not exists")

# 3. Create indices
c.execute(
    "CREATE INDEX IF NOT EXISTS ix_reconciliation_reimbursement_id "
    "ON reconciliation_allocation(reimbursement_id)"
)
c.execute(
    "CREATE INDEX IF NOT EXISTS ix_reconciliation_expense_id "
    "ON reconciliation_allocation(expense_id)"
)
print("  Created indices on reconciliation_allocation")

conn.commit()
conn.close()
print("Migration complete.")
