#!/bin/sh

# Exit on any error
set -e

echo "Starting Personal Finances App..."

# Ensure database directory exists and has proper permissions
mkdir -p /app/instance
chown -R appuser:appgroup /app/instance 2>/dev/null || true

# Initialize database if it doesn't exist
if [ ! -f "/app/instance/expenses.db" ]; then
    echo "Initializing database..."
    python -c "
from app import app, db
with app.app_context():
    db.create_all()
    print('Database initialized successfully')
"
fi

echo "Database ready. Starting Flask application..."

# Start the Flask application
exec python app.py
