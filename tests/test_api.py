import pytest
from datetime import datetime
from app import Expense


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
    assert b"Personal Finance Tracker" in response.data


def test_expenses_endpoint(client):
    """Test expenses page route"""
    response = client.get("/expenses")
    assert response.status_code == 200


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
