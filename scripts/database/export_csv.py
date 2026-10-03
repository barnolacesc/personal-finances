import os
import csv
import sqlite3
from datetime import datetime

# Find the project root (assume this script is in scripts/database/)
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))


def export_to_csv(target_db_path=None, output_path=None):
    """Export expenses table to CSV file with Type column."""
    exports_dir = os.path.join(os.path.dirname(__file__), "exports")
    os.makedirs(exports_dir, exist_ok=True)
    db_path = target_db_path or os.path.join(project_root, "instance", "expenses.db")

    if output_path is None:
        now = datetime.now()
        date_str = now.strftime("%Y%m%d_%H%M%S")
        csv_path = os.path.join(exports_dir, f"expenses_{date_str}.csv")
        alloc_path = os.path.join(exports_dir, f"allocations_{date_str}.csv")
    else:
        csv_path = os.path.abspath(output_path)
        base = os.path.basename(csv_path)
        if base.startswith("expenses_"):
            alloc_name = "allocations_" + base[len("expenses_") :]
        else:
            alloc_name = os.path.splitext(base)[0] + "_allocations.csv"
        alloc_path = os.path.join(os.path.dirname(csv_path), alloc_name)

    # Export data to CSV
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("BEGIN TRANSACTION")
        cursor.execute(
            """
            SELECT id, date, amount, category, description, COALESCE(type, 'expense')
            FROM expense
            ORDER BY date DESC
        """
        )
        expense_rows = cursor.fetchall()

        # Export reconciliation allocations if table exists
        alloc_rows = None
        cursor.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name='reconciliation_allocation'"
        )
        if cursor.fetchone():
            cursor.execute(
                """
                SELECT id, reimbursement_id, expense_id, amount,
                       counterparty, notes, group_id, created_at, updated_at
                FROM reconciliation_allocation
                ORDER BY id ASC
                """
            )
            alloc_rows = cursor.fetchall()
        conn.commit()

        with open(csv_path, "w", newline="", encoding="utf-8") as csv_file:
            csv_writer = csv.writer(csv_file)
            csv_writer.writerow(
                ["Id", "Date", "Amount", "Category", "Description", "Type"]
            )
            csv_writer.writerows(expense_rows)
        print(f"Data exported to: {csv_path}")

        if alloc_rows is not None:
            with open(alloc_path, "w", newline="", encoding="utf-8") as alloc_file:
                alloc_writer = csv.writer(alloc_file)
                alloc_writer.writerow(
                    [
                        "Id",
                        "ReimbursementId",
                        "ExpenseId",
                        "Amount",
                        "Counterparty",
                        "Notes",
                        "GroupId",
                        "CreatedAt",
                        "UpdatedAt",
                    ]
                )
                alloc_writer.writerows(alloc_rows)
            print(f"Allocations exported to: {alloc_path}")

        return csv_path
    except Exception as e:
        print(f"Error exporting data: {e}")
        raise
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


if __name__ == "__main__":
    export_to_csv()
