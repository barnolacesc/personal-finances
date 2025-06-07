import pytest
from app import Expense


@pytest.fixture(autouse=True)
def clean_db(_db):
    _db.session.query(Expense).delete()
    _db.session.commit()


def test_expense_pagination(client, test_expenses, clean_db):
    """Test expense pagination"""
    response = client.get("/api/expenses?page=1&per_page=2")
    assert response.status_code == 200
    data = response.get_json()
    assert len(data["expenses"]) == 2
    assert data["page"] == 1
    assert data["per_page"] == 2
    assert data["total"] == len(test_expenses)


def test_empty_month_handling(client, clean_db):
    """Test handling of months with no expenses"""
    response = client.get("/api/expenses?month=1&year=2024")
    assert response.status_code == 200
    data = response.get_json()
    assert len(data["expenses"]) == 0
    assert data["total"] == 0
