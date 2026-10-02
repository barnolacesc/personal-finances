import os
import sqlite3
import tempfile
import csv
import pytest
from scripts.database.migrate_transaction_types import migrate
from scripts.database.export_csv import export_to_csv
from scripts.database.restore_csv import restore_from_csv


def test_migration_preserves_explicit_transaction_types(tmp_path):
    db_path = tmp_path / "expenses.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE expense (amount REAL, type TEXT)")
        conn.executemany(
            "INSERT INTO expense VALUES (?, ?)",
            [(-20, None), (-30, "expense"), (-100, "income"), (10, "reimbursement")],
        )
    migrate(str(db_path))
    migrate(str(db_path))
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT amount, type FROM expense").fetchall() == [
            (20, "reimbursement"),
            (30, "reimbursement"),
            (-100, "income"),
            (10, "reimbursement"),
        ]


@pytest.mark.parametrize("txn_type", ["refund", "unknown"])
def test_csv_restore_rejects_unknown_type_without_partial_data(tmp_path, txn_type):
    csv_path = tmp_path / "backup.csv"
    csv_path.write_text(
        "Date,Amount,Category,Description,Type\n"
        "2026-05-01,10,other,Valid,expense\n"
        f"2026-05-02,20,other,Invalid,{txn_type}\n"
    )
    db_path = tmp_path / "expenses.db"
    with pytest.raises(ValueError, match="Invalid transaction type"):
        restore_from_csv(str(csv_path), str(db_path))
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM expense").fetchone()[0] == 0


def test_csv_restore_preserves_original_error_without_backup(tmp_path):
    csv_path = tmp_path / "backup.csv"
    csv_path.write_text("Date,Amount,Category,Description\nmalformed\n")
    with pytest.raises(IndexError):
        restore_from_csv(str(csv_path), str(tmp_path / "expenses.db"))


def test_migration_adds_column_and_normalizes_data():
    """
    Test migrating a legacy database without 'type' column:
    - Verifies 'type' column and index are created
    - Verifies existing positive records default to 'expense'
    - Verifies legacy negative amounts (< 0) are converted to positive 'reimbursement'
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute(
            """
            CREATE TABLE expense (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount FLOAT NOT NULL,
                category VARCHAR(50) NOT NULL,
                description VARCHAR(200) NOT NULL,
                date DATETIME NOT NULL
            )
        """
        )
        # Insert a normal positive expense
        c.execute(
            "INSERT INTO expense (amount, category, description, date) "
            "VALUES (?, ?, ?, ?)",
            (55.50, "groceries", "Supermarket run", "2026-03-01 10:00:00"),
        )
        # Insert a legacy negative expense (representing a reimbursement)
        c.execute(
            "INSERT INTO expense (amount, category, description, date) "
            "VALUES (?, ?, ?, ?)",
            (-22.30, "groceries", "Return item refund", "2026-03-02 11:00:00"),
        )
        conn.commit()
        conn.close()

        # Run migration
        migrate(db_path)

        # Inspect database
        conn = sqlite3.connect(db_path)
        c = conn.cursor()

        # Check columns
        c.execute("PRAGMA table_info(expense)")
        cols = {row[1]: row for row in c.fetchall()}
        assert "type" in cols

        # Check rows
        c.execute(
            "SELECT amount, category, description, type FROM expense ORDER BY id ASC"
        )
        rows = c.fetchall()
        assert len(rows) == 2

        # Positive row stayed positive and has type 'expense'
        assert rows[0][0] == 55.50
        assert rows[0][3] == "expense"

        # Negative row became positive and has type 'reimbursement'
        assert rows[1][0] == 22.30
        assert rows[1][3] == "reimbursement"

        # Check index
        c.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='index' AND name='ix_expense_type'"
        )
        assert c.fetchone() is not None

        conn.close()

        # Idempotence: running migrate again shouldn't fail or alter amounts
        migrate(db_path)
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT amount, type FROM expense ORDER BY id ASC")
        rows_again = c.fetchall()
        assert rows_again[0] == (55.50, "expense")
        assert rows_again[1] == (22.30, "reimbursement")
        conn.close()

    finally:
        if os.path.exists(db_path):
            os.remove(db_path)


def test_migration_on_nonexistent_or_empty_database():
    """Migrate handles nonexistent files or databases without expense table."""
    # Should not raise exception
    migrate("/tmp/nonexistent_finances_db_12345.db")

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        # DB exists but empty (no expense table)
        migrate(db_path)
    finally:
        if os.path.exists(db_path):
            os.remove(db_path)


def test_csv_export_and_restore_cycle():
    """
    Test exporting database with transaction types and restoring it.
    Also tests legacy 4-column CSV backwards compatibility.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f_db:
        db_path = f_db.name
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f_csv:
        csv_path = f_csv.name
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f_restored:
        restored_db_path = f_restored.name

    try:
        # Populate test db
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute(
            """
            CREATE TABLE expense (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATETIME NOT NULL,
                amount FLOAT NOT NULL,
                category VARCHAR(50) NOT NULL,
                description VARCHAR(50) NOT NULL,
                type VARCHAR(20) DEFAULT 'expense'
            )
        """
        )
        sql_insert = (
            "INSERT INTO expense (date, amount, category, description, type) "
            "VALUES (?, ?, ?, ?, ?)"
        )
        c.execute(
            sql_insert,
            ("2026-03-01 12:00:00", 100.0, "groceries", "Store", "expense"),
        )
        c.execute(
            sql_insert,
            ("2026-03-02 12:00:00", 25.0, "groceries", "Refund", "reimbursement"),
        )
        c.execute(
            sql_insert,
            ("2026-03-03 12:00:00", 2500.0, "salary", "Paycheck", "income"),
        )
        conn.commit()
        conn.close()

        # Export to CSV
        export_to_csv(target_db_path=db_path, output_path=csv_path)

        # Verify CSV has Type header and rows
        with open(csv_path, "r") as f:
            reader = csv.reader(f)
            header = next(reader)
            assert header == ["Date", "Amount", "Category", "Description", "Type"]
            rows = list(reader)
            assert len(rows) == 3
            types = {r[3]: r[4] for r in rows}
            assert types["Store"] == "expense"
            assert types["Refund"] == "reimbursement"
            assert types["Paycheck"] == "income"

        # Restore into empty db
        restore_from_csv(csv_path, target_db_path=restored_db_path)

        conn_r = sqlite3.connect(restored_db_path)
        cr = conn_r.cursor()
        cr.execute(
            "SELECT amount, category, description, type FROM expense ORDER BY date ASC"
        )
        restored_rows = cr.fetchall()
        assert len(restored_rows) == 3
        assert restored_rows[0] == (100.0, "groceries", "Store", "expense")
        assert restored_rows[1] == (25.0, "groceries", "Refund", "reimbursement")
        assert restored_rows[2] == (2500.0, "salary", "Paycheck", "income")
        conn_r.close()

        # Now test legacy 4-column CSV restore with negative amount
        with tempfile.NamedTemporaryFile(
            suffix=".csv", mode="w", delete=False
        ) as f_leg:
            writer = csv.writer(f_leg)
            writer.writerow(["Date", "Amount", "Category", "Description"])
            writer.writerow(["2026-03-10 12:00:00", "50.0", "groceries", "Old item"])
            writer.writerow(
                ["2026-03-11 12:00:00", "-15.0", "groceries", "Old negative"]
            )
            legacy_csv_path = f_leg.name

        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f_leg_db:
            legacy_restored_db = f_leg_db.name

        restore_from_csv(legacy_csv_path, target_db_path=legacy_restored_db)
        conn_l = sqlite3.connect(legacy_restored_db)
        cl = conn_l.cursor()
        cl.execute(
            "SELECT amount, category, description, type FROM expense ORDER BY id ASC"
        )
        leg_rows = cl.fetchall()
        assert len(leg_rows) == 2
        assert leg_rows[0] == (50.0, "groceries", "Old item", "expense")
        # Negative legacy amount normalized to positive reimbursement:
        assert leg_rows[1] == (15.0, "groceries", "Old negative", "reimbursement")
        conn_l.close()

        if os.path.exists(legacy_csv_path):
            os.remove(legacy_csv_path)
        if os.path.exists(legacy_restored_db):
            os.remove(legacy_restored_db)

    finally:
        for p in [db_path, csv_path, restored_db_path]:
            if os.path.exists(p):
                os.remove(p)
