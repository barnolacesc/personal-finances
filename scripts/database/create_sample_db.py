import os
import sqlite3
from datetime import datetime, timedelta
import random

# Sample categories and descriptions
categories = [
    "Groceries",
    "Transportation",
    "Entertainment",
    "Utilities",
    "Dining Out",
    "Shopping",
]
descriptions = {
    "Groceries": ["Supermarket", "Local Market", "Bulk Store"],
    "Transportation": ["Gas", "Public Transport", "Ride Share"],
    "Entertainment": ["Movies", "Concert", "Books"],
    "Utilities": ["Electricity", "Water", "Internet"],
    "Dining Out": ["Restaurant", "Cafe", "Fast Food"],
    "Shopping": ["Clothes", "Electronics", "Home Goods"],
}

# Amount ranges for each category
amount_ranges = {
    "Groceries": (20, 150),
    "Transportation": (10, 100),
    "Entertainment": (15, 200),
    "Utilities": (30, 300),
    "Dining Out": (15, 100),
    "Shopping": (25, 500),
}


def create_sample_db():
    # Ensure instance directory exists
    instance_dir = os.path.join(os.path.dirname(__file__), "instance")
    os.makedirs(instance_dir, exist_ok=True)

    # Database path
    db_path = os.path.join(instance_dir, "expenses.db")

    # Remove existing database if it exists
    if os.path.exists(db_path):
        os.remove(db_path)

    # Create new database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create expenses table
    cursor.execute(
        """
        CREATE TABLE expense (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """
    )

    # Generate sample data for the last 3 months
    end_date = datetime.now()
    start_date = end_date - timedelta(days=90)

    current_date = start_date
    while current_date <= end_date:
        # Generate 1-3 expenses per day
        num_expenses = random.randint(1, 3)
        for _ in range(num_expenses):
            category = random.choice(categories)
            description = random.choice(descriptions[category])
            min_amount, max_amount = amount_ranges[category]
            amount = round(random.uniform(min_amount, max_amount), 2)

            cursor.execute(
                """
                INSERT INTO expense (amount, category, description, date)
                VALUES (?, ?, ?, ?)
            """,
                (amount, category, description, current_date),
            )

        current_date += timedelta(days=1)

    # Commit and close
    conn.commit()
    conn.close()

    print(f"Sample database created at: {db_path}")


if __name__ == "__main__":
    create_sample_db()
