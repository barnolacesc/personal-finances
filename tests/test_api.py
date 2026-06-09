import pytest
from datetime import datetime
from app import Expense, db


@pytest.fixture(autouse=True)
def clean_db(_db):
    _db.session.query(Expense).delete()
    _db.session.commit()


def test_add_expense(client, sample_expense):
    """Test adding a new expense"""
    response = client.post("/api/expenses", json=sample_expense)
    assert response.status_code == 201
    data = response.get_json()
    assert data["amount"] == sample_expense["amount"]
    assert data["category"] == sample_expense["category"]
    assert data["description"] == sample_expense["description"]
    assert "id" in data
    assert "date" in data


def test_add_expense_with_date(client, sample_expense):
    """Test adding a new expense with an explicit date."""
    payload = {**sample_expense, "date": "2026-04-30"}
    response = client.post("/api/expenses", json=payload)
    assert response.status_code == 201
    data = response.get_json()
    assert data["date"].startswith("2026-04-30")


def test_add_expense_validation(client):
    """Test expense validation"""
    # Test missing required fields
    response = client.post("/api/expenses", json={})
    assert response.status_code == 400
    assert "error" in response.get_json()

    # Test invalid amount
    response = client.post(
        "/api/expenses",
        json={"amount": "invalid", "category": "Test", "description": "Test"},
    )
    assert response.status_code == 400
    assert "error" in response.get_json()

    # Test empty category and description
    response = client.post(
        "/api/expenses", json={"amount": 100, "category": "", "description": ""}
    )
    assert response.status_code == 400
    assert "error" in response.get_json()


def test_get_expenses(client, test_expenses, clean_db):
    """Test getting expenses"""
    response = client.get("/api/expenses")
    assert response.status_code == 200
    data = response.get_json()
    assert len(data["expenses"]) == len(test_expenses)

    # Test filtering by month and year
    current_date = datetime.now()
    url = (
        "/api/expenses?month="
        + str(current_date.month)
        + "&year="
        + str(current_date.year)
    )
    response = client.get(url)
    assert response.status_code == 200
    data = response.get_json()
    assert len(data["expenses"]) == len(test_expenses)


def test_update_expense(client, test_expenses, clean_db):
    """Test updating an expense"""
    expense = test_expenses[0]
    update_data = {
        "amount": 75.0,
        "category": "Updated Category",
        "description": "Updated Description",
    }
    response = client.put(f"/api/expenses/{expense.id}", json=update_data)
    assert response.status_code == 200
    data = response.get_json()
    assert data["amount"] == update_data["amount"]
    assert data["category"] == update_data["category"]
    assert data["description"] == update_data["description"]


def test_update_expense_with_date(client, test_expenses, clean_db):
    """Test updating an expense date."""
    expense = test_expenses[0]
    update_data = {
        "amount": 75.0,
        "category": "Updated Category",
        "description": "Updated Description",
        "date": "2026-04-30",
    }
    response = client.put(f"/api/expenses/{expense.id}", json=update_data)
    assert response.status_code == 200
    data = response.get_json()
    assert data["date"].startswith("2026-04-30")


def test_delete_expense(client, test_expenses, clean_db):
    """Test deleting an expense"""
    expense = test_expenses[0]
    response = client.delete(f"/api/expenses/{expense.id}")
    assert response.status_code == 204


def test_get_months(client, test_expenses, clean_db):
    """Test getting available months"""
    response = client.get("/api/months")
    assert response.status_code == 200
    data = response.get_json()
    assert len(data) > 0
    assert all(isinstance(month["year"], int) for month in data)
    assert all(isinstance(month["month"], int) for month in data)


def test_home_page(client):
    """Test home page route"""
    response = client.get("/")
    assert response.status_code == 200
    assert b"Vault" in response.data


def test_expenses_endpoint(client):
    """Test expenses page route"""
    response = client.get("/expenses")
    assert response.status_code == 200


def test_add_expense_page(client):
    """Test /add serves the add-expense form page"""
    response = client.get("/add")
    assert response.status_code == 200
    assert b"Vault" in response.data


def test_trends_page(client):
    """Test /trends serves the trends page"""
    response = client.get("/trends")
    assert response.status_code == 200
    assert b"Vault" in response.data


def test_recurring_page(client):
    """Test /recurring page route"""
    response = client.get("/recurring")
    assert response.status_code == 200


def test_bank_page(client):
    """Test /bank page route (currently disabled)"""
    response = client.get("/bank")
    assert response.status_code == 404


def test_expenses_pagination(client, test_expenses, clean_db):
    """Test expense pagination"""
    response = client.get("/api/expenses?page=1&per_page=2")
    assert response.status_code == 200
    data = response.get_json()
    assert len(data["expenses"]) == 2
    assert data["page"] == 1
    assert data["per_page"] == 2
    assert data["total"] == len(test_expenses)


def test_expense_creation(client):
    new_expense = {
        "amount": 75.0,
        "description": "New expense",
        "category": "Groceries",
    }
    response = client.post("/api/expenses", json=new_expense)
    assert response.status_code == 201
    data = response.get_json()
    assert data["amount"] == 75.0
    assert data["description"] == "New expense"


def test_expense_validation(client):
    invalid_expense = {
        "amount": -50.0,  # Invalid amount
        "description": "",
        "category": "",
    }
    response = client.post("/api/expenses", json=invalid_expense)
    assert response.status_code == 400


def test_trends_includes_categories(client):
    """GET /api/trends includes per-category totals for each period."""
    with client.application.app_context():
        today = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0)
        db.session.add(
            Expense(
                amount=50.0,
                category="food_drink",
                description="test",
                date=today,
            )
        )
        db.session.commit()

    resp = client.get("/api/trends")
    assert resp.status_code == 200
    data = resp.get_json()

    for period in data["weekly"]:
        assert "categories" in period
        assert isinstance(period["categories"], dict)
    for period in data["monthly"]:
        assert "categories" in period

    assert "top_expenses" in data["weekly"][3]
    assert isinstance(data["weekly"][3]["top_expenses"], list)
    assert "top_expenses" in data["monthly"][3]


def test_trends_top_expenses_sorted_by_amount(client):
    """Current period top_expenses are ordered by amount descending, max 5."""
    with client.application.app_context():
        today = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0)
        for amount in [10.0, 50.0, 30.0, 80.0, 20.0, 60.0]:
            db.session.add(
                Expense(
                    amount=amount,
                    category="food_drink",
                    description=f"expense {amount}",
                    date=today,
                )
            )
        db.session.commit()

    resp = client.get("/api/trends")
    data = resp.get_json()
    top = data["weekly"][3]["top_expenses"]

    assert len(top) <= 5
    amounts = [e["amount"] for e in top]
    assert amounts == sorted(amounts, reverse=True)
    assert top[0]["amount"] == 80.0
