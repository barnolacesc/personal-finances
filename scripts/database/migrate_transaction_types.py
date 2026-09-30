"""
Migration: add transaction type to the expense table.
Normalizes existing records:
  - Defaults missing/null types to 'expense'
  - Converts legacy negative expenses into positive reimbursements

Run once on the target host before or during deploying new code.
"""

import sqlite3
import os
import sys


def migrate(db_path=None):
    if db_path is None:
        db_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "instance", "expenses.db"
        )
    db_path = os.path.normpath(os.path.abspath(db_path))

    if not os.path.exists(db_path):
        print(f"Database not found at: {db_path} (nothing to migrate)")
        return

    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Check if table exists
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='expense'")
    if not c.fetchone():
        print("  Table 'expense' does not exist yet. Skipping.")
        conn.close()
        return

    # Check existing columns
    c.execute("PRAGMA table_info(expense)")
    columns = [row[1] for row in c.fetchall()]

    if "type" not in columns:
        try:
            c.execute(
                "ALTER TABLE expense ADD COLUMN type VARCHAR(20) DEFAULT 'expense'"
            )
            print("  Added column: type (default 'expense')")
        except sqlite3.OperationalError as e:
            print(f"  Column add note: {e}")
    else:
        print("  Column 'type' already exists.")

    # 1. Normalize NULL types to 'expense'
    c.execute("UPDATE expense SET type = 'expense' WHERE type IS NULL")
    null_count = c.rowcount
    if null_count > 0:
        print(f"  Normalized {null_count} rows with NULL type to 'expense'")

    # 2. Normalize legacy negative expenses to reimbursements with positive amount
    c.execute("SELECT COUNT(*) FROM expense WHERE amount < 0")
    neg_count = c.fetchone()[0]
    if neg_count > 0:
        c.execute(
            "UPDATE expense SET type = 'reimbursement', amount = ABS(amount) "
            "WHERE amount < 0"
        )
        print(
            f"  Normalized {neg_count} legacy negative expenses to "
            "reimbursements with positive amount"
        )
    else:
        print("  No legacy negative expenses found.")

    # 3. Create index on type
    try:
        c.execute("CREATE INDEX IF NOT EXISTS ix_expense_type ON expense(type)")
        print("  Created index on expense.type")
    except sqlite3.OperationalError as e:
        print(f"  Index note: {e}")

    conn.commit()
    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    migrate(target)
