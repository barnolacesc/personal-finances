import os
import csv
import sqlite3
from datetime import datetime

# Find the project root (assume this script is in scripts/database/)
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))

# Paths
exports_dir = os.path.join(os.path.dirname(__file__), 'exports')
os.makedirs(exports_dir, exist_ok=True)
db_path = os.path.join(project_root, 'instance', 'expenses.db')

# Get current date and time for filename
now = datetime.now()
date_str = now.strftime('%Y%m%d_%H%M%S')
csv_path = os.path.join(exports_dir, f'expenses_{date_str}.csv')

# Export data to CSV
try:
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Get all expenses
    cursor.execute('''
        SELECT date, amount, category, description 
        FROM expense 
        ORDER BY date DESC
    ''')
    # Write to CSV
    with open(csv_path, 'w', newline='') as csv_file:
        csv_writer = csv.writer(csv_file)
        # Write header
        csv_writer.writerow(['Date', 'Amount', 'Category', 'Description'])
        # Write data
        csv_writer.writerows(cursor.fetchall())
    print(f"Data exported to: {csv_path}")
except Exception as e:
    print(f"Error exporting data: {e}")
finally:
    try:
        conn.close()
    except:
        pass 