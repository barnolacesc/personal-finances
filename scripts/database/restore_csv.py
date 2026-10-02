import os
import csv
import sqlite3
import math
from datetime import datetime


def list_backups():
    """List all available CSV backups."""
    exports_dir = os.path.join(os.path.dirname(__file__), "exports")
    if not os.path.exists(exports_dir):
        print("No backups directory found.")
        return []

    backups = []
    for file in os.listdir(exports_dir):
        if file.startswith("expenses_") and file.endswith(".csv"):
            path = os.path.join(exports_dir, file)
            date = file[9:-4]  # Extract date from filename
            size = os.path.getsize(path) / 1024  # Size in KB
            backups.append((date, path, size))

    return sorted(backups, reverse=True)  # Most recent first


def restore_from_csv(csv_path, target_db_path=None):
    """Restore database from CSV file."""
    # Create a backup of current database first
    db_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../instance"))
    db_path = target_db_path or os.path.join(db_dir, "expenses.db")
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    backup_path = None
    if target_db_path is None and os.path.exists(db_path):
        backup_name = f"expenses_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        backup_path = os.path.join(db_dir, backup_name)
        os.rename(db_path, backup_path)
        print(f"Created backup of current database: {backup_name}")

    # Create new database
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cursor = conn.cursor()

    # Create table
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS expense (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATETIME NOT NULL,
            amount FLOAT NOT NULL,
            category VARCHAR(50) NOT NULL,
            description VARCHAR(50) NOT NULL,
            type VARCHAR(20) DEFAULT 'expense'
        )
    """
    )

    csv_path = os.path.abspath(csv_path)

    # Read CSV and insert data
    try:
        with open(csv_path, "r", newline="", encoding="utf-8") as csv_file:
            csv_reader = csv.reader(csv_file)
            header = next(csv_reader, None)  # Skip header row
            if not header:
                return

            has_id = header and len(header) >= 1 and header[0].strip().lower() == "id"
            has_type = header and (
                (has_id and len(header) >= 6 and header[5].strip().lower() == "type")
                or (
                    not has_id
                    and len(header) >= 5
                    and header[4].strip().lower() == "type"
                )
            )

            rows_to_insert = []
            for row in csv_reader:
                if not row:
                    continue
                if has_id:
                    exp_id = int(row[0].strip())
                    d, amt, cat, desc = row[1], row[2], row[3], row[4]
                    t = (
                        row[5].strip().lower()
                        if (has_type and len(row) >= 6 and row[5].strip())
                        else "expense"
                    )
                else:
                    exp_id = None
                    d, amt, cat, desc = row[0], row[1], row[2], row[3]
                    t = (
                        row[4].strip().lower()
                        if (has_type and len(row) >= 5 and row[4].strip())
                        else "expense"
                    )

                if t not in {"expense", "income", "reimbursement"}:
                    raise ValueError(f"Invalid transaction type: {t}")
                num_amt = float(amt)
                if not math.isfinite(num_amt) or num_amt == 0:
                    raise ValueError("Amount must be finite and greater than zero")
                if num_amt < 0:
                    if t == "expense":
                        t = "reimbursement"
                    amt = str(abs(num_amt))

                if has_id:
                    rows_to_insert.append((exp_id, d, amt, cat, desc, t))
                else:
                    rows_to_insert.append((d, amt, cat, desc, t))

            # Insert all rows
            if has_id:
                sql = (
                    "INSERT INTO expense "
                    "(id, date, amount, category, description, type) "
                    "VALUES (?, ?, ?, ?, ?, ?)"
                )
            else:
                sql = (
                    "INSERT INTO expense (date, amount, category, description, type) "
                    "VALUES (?, ?, ?, ?, ?)"
                )
            cursor.executemany(sql, rows_to_insert)
            expense_count = len(rows_to_insert)

            # Restore reconciliation allocations if companion CSV exists
            base = os.path.basename(csv_path)
            if base.startswith("expenses_"):
                alloc_name = "allocations_" + base[len("expenses_") :]
            else:
                alloc_name = os.path.splitext(base)[0] + "_allocations.csv"
            alloc_path = os.path.join(os.path.dirname(csv_path), alloc_name)

            if os.path.exists(alloc_path):
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS reconciliation_allocation (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        reimbursement_id INTEGER NOT NULL
                            REFERENCES expense(id) ON DELETE RESTRICT,
                        expense_id INTEGER NOT NULL
                            REFERENCES expense(id) ON DELETE RESTRICT,
                        amount REAL NOT NULL,
                        counterparty VARCHAR(100),
                        notes VARCHAR(255),
                        group_id VARCHAR(50),
                        created_at TIMESTAMP,
                        updated_at TIMESTAMP
                    )
                    """
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS ix_reconciliation_reimbursement_id "
                    "ON reconciliation_allocation(reimbursement_id)"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS ix_reconciliation_expense_id "
                    "ON reconciliation_allocation(expense_id)"
                )
                with open(alloc_path, "r", newline="", encoding="utf-8") as alloc_file:
                    alloc_reader = csv.reader(alloc_file)
                    next(alloc_reader, None)  # Skip header
                    alloc_rows = []
                    for arow in alloc_reader:
                        if not arow:
                            continue
                        alloc_rows.append(
                            (
                                int(arow[0]),
                                int(arow[1]),
                                int(arow[2]),
                                float(arow[3]),
                                arow[4] if len(arow) > 4 and arow[4] != "" else None,
                                arow[5] if len(arow) > 5 and arow[5] != "" else None,
                                arow[6] if len(arow) > 6 and arow[6] != "" else None,
                                arow[7] if len(arow) > 7 and arow[7] != "" else None,
                                arow[8] if len(arow) > 8 and arow[8] != "" else None,
                            )
                        )
                    if alloc_rows:
                        alloc_sql = (
                            "INSERT INTO reconciliation_allocation ("
                            "id, reimbursement_id, expense_id, amount, "
                            "counterparty, notes, group_id, created_at, updated_at"
                            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
                        )
                        cursor.executemany(alloc_sql, alloc_rows)
                        print(
                            f"Successfully restored {len(alloc_rows)} "
                            "reconciliation allocations!"
                        )

            conn.commit()
            print(f"Successfully restored {expense_count} expenses from backup!")

    except Exception as e:
        print(f"Error restoring data: {e}")
        conn.rollback()
        # If restore fails, try to recover original database
        if backup_path and os.path.exists(backup_path):
            os.remove(db_path)
            os.rename(backup_path, db_path)
            print("Restored original database due to error")
        raise
    finally:
        conn.close()


def main():
    """Interactive CLI runner for restoring CSV backups."""
    # List available backups
    print("\nAvailable backups:")
    backups = list_backups()

    if not backups:
        print("No backup files found in exports directory.")
        return

    print("\nID  Date        Size")
    print("-" * 25)
    for i, (date, path, size) in enumerate(backups):
        print(f"{i:<3} {date}  {size:.1f}KB")

    # Get user choice
    while True:
        try:
            choice = input("\nEnter backup ID to restore (or 'q' to quit): ")
            if choice.lower() == "q":
                return

            backup_id = int(choice)
            if 0 <= backup_id < len(backups):
                break
            print("Invalid ID. Please try again.")
        except ValueError:
            print("Please enter a valid number.")

    # Confirm restoration
    date, path, size = backups[backup_id]
    print(f"\nYou selected backup from {date} ({size:.1f}KB)")
    confirm = input("This will replace your current database. Continue? (y/N): ")

    if confirm.lower() == "y":
        restore_from_csv(path)
    else:
        print("Restoration cancelled.")


if __name__ == "__main__":
    main()
