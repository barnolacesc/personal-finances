import os
import csv
import sqlite3
from datetime import datetime


def list_backups():
    """List all available CSV backups"""
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


def restore_from_csv(csv_path):
    """Restore database from CSV file"""
    # Create a backup of current database first
    db_dir = os.path.join(os.path.dirname(__file__), "instance")
    db_path = os.path.join(db_dir, "expenses.db")
    if os.path.exists(db_path):
        backup_name = f"expenses_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        backup_path = os.path.join(db_dir, backup_name)
        os.rename(db_path, backup_path)
        print(f"Created backup of current database: {backup_name}")

    # Create new database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create table
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS expense (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATETIME NOT NULL,
            amount FLOAT NOT NULL,
            category VARCHAR(50) NOT NULL,
            description VARCHAR(50) NOT NULL
        )
    """
    )

    # Read CSV and insert data
    try:
        with open(csv_path, "r", newline="") as csv_file:
            csv_reader = csv.reader(csv_file)
            next(csv_reader)  # Skip header row

            # Insert all rows
            sql = "INSERT INTO expense (date, amount, category, description) "
            sql += "VALUES (?, ?, ?, ?)"
            cursor.executemany(sql, csv_reader)

            conn.commit()
            rows = cursor.rowcount
            print(f"Successfully restored {rows} expenses from backup!")

    except Exception as e:
        print(f"Error restoring data: {e}")
        conn.rollback()
        # If restore fails, try to recover original database
        if os.path.exists(backup_path):
            os.remove(db_path)
            os.rename(backup_path, db_path)
            print("Restored original database due to error")
    finally:
        conn.close()


def main():
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
