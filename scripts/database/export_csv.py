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
    else:
        csv_path = output_path

    # Export data to CSV
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT date, amount, category, description, COALESCE(type, 'expense')
            FROM expense
            ORDER BY date DESC
        """
        )
        with open(csv_path, "w", newline="") as csv_file:
            csv_writer = csv.writer(csv_file)
            csv_writer.writerow(["Date", "Amount", "Category", "Description", "Type"])
            csv_writer.writerows(cursor.fetchall())
        print(f"Data exported to: {csv_path}")
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
