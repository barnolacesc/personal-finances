#!/usr/bin/env python3
"""
Create test database with sample data using the app's actual categories.
This script is used by the test environment to populate mock data.
"""

import os
import sys
from datetime import datetime, timedelta
import random

# Add project root to path for imports
project_root = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
sys.path.insert(0, project_root)

# Categories matching config.js
CATEGORIES = {
    "super": {
        "descriptions": ["Mercadona", "Lidl", "Carrefour", "Aldi", "Consum", "Eroski"],
        "amount_range": (15, 120),
        "frequency": 0.20,  # Higher frequency
    },
    "xofa": {
        "descriptions": ["Alquiler", "Comunidad", "Seguro hogar", "Reparaciones"],
        "amount_range": (50, 800),
        "frequency": 0.05,
    },
    "food_drink": {
        "descriptions": [
            "Restaurante",
            "Cafeteria",
            "Bar",
            "Takeaway",
            "Brunch",
            "Cena fuera",
        ],
        "amount_range": (8, 60),
        "frequency": 0.15,
    },
    "save_inv": {
        "descriptions": ["Transferencia ahorro", "ETF", "Fondo indexado", "Deposito"],
        "amount_range": (100, 500),
        "frequency": 0.03,
    },
    "recurrent": {
        "descriptions": [
            "Netflix",
            "Spotify",
            "Gimnasio",
            "Telefono",
            "Internet",
            "Luz",
            "Gas",
            "Agua",
        ],
        "amount_range": (10, 80),
        "frequency": 0.08,
    },
    "clothing": {
        "descriptions": ["Zara", "H&M", "Decathlon", "Zapatos", "Camiseta", "Pantalon"],
        "amount_range": (20, 150),
        "frequency": 0.05,
    },
    "personal": {
        "descriptions": ["Peluqueria", "Farmacia", "Productos higiene", "Cosmeticos"],
        "amount_range": (10, 60),
        "frequency": 0.06,
    },
    "taxes": {
        "descriptions": ["IRPF", "IBI", "Multa", "Tasas"],
        "amount_range": (50, 500),
        "frequency": 0.02,
    },
    "transport": {
        "descriptions": ["Metro", "Bus", "Renfe", "BlaBlaCar", "Taxi", "Cabify"],
        "amount_range": (5, 50),
        "frequency": 0.10,
    },
    "car": {
        "descriptions": [
            "Gasolina",
            "Parking",
            "Revision",
            "ITV",
            "Seguro coche",
            "Peaje",
        ],
        "amount_range": (15, 200),
        "frequency": 0.06,
    },
    "health": {
        "descriptions": ["Medico", "Dentista", "Fisio", "Medicamentos", "Analisis"],
        "amount_range": (20, 150),
        "frequency": 0.04,
    },
    "cobeetrans": {
        "descriptions": ["Cobee transporte"],
        "amount_range": (30, 100),
        "frequency": 0.03,
    },
    "cobeefood": {
        "descriptions": ["Cobee comida"],
        "amount_range": (8, 15),
        "frequency": 0.08,
    },
    "other": {
        "descriptions": ["Regalo", "Amazon", "Varios", "Imprevistos"],
        "amount_range": (10, 100),
        "frequency": 0.05,
    },
}


def create_test_data():
    """Create test database with sample expenses."""
    from app import app, db, Expense

    # Use the app's instance folder
    instance_path = os.path.join(project_root, "instance")
    os.makedirs(instance_path, exist_ok=True)

    with app.app_context():
        # Drop and recreate tables
        db.drop_all()
        db.create_all()

        # Generate expenses for the last 4 months
        end_date = datetime.now()
        start_date = end_date - timedelta(days=120)

        expenses = []
        current_date = start_date

        while current_date <= end_date:
            # Generate expenses for this day based on category frequencies
            for category, config in CATEGORIES.items():
                if random.random() < config["frequency"]:
                    description = random.choice(config["descriptions"])
                    min_amt, max_amt = config["amount_range"]
                    amount = round(random.uniform(min_amt, max_amt), 2)

                    # Add some time variation within the day
                    hour = random.randint(8, 22)
                    minute = random.randint(0, 59)
                    expense_datetime = current_date.replace(hour=hour, minute=minute)

                    expense = Expense(
                        amount=amount,
                        category=category,
                        description=description,
                        date=expense_datetime,
                    )
                    expenses.append(expense)

            current_date += timedelta(days=1)

        # Bulk insert
        db.session.add_all(expenses)
        db.session.commit()

        print(f"Created {len(expenses)} sample expenses")
        print(f"Database location: {app.config['SQLALCHEMY_DATABASE_URI']}")


if __name__ == "__main__":
    create_test_data()
