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
    assert data["summary"]["gross_expenses"] == 0.0
    assert data["summary"]["reimbursements"] == 0.0
    assert data["summary"]["net_expenses"] == 0.0
    assert data["summary"]["income"] == 0.0


def test_monthly_summary_aggregation(client, clean_db):
    """
    Test that:
    - Monthly summary exposes gross_expenses, reimbursements, net_expenses,
      and income separately
    - Reimbursements reduce net expenses but never appear as income
    - Income never reduces net expenses or category spending
    """
    date_str = "2026-05-15"

    # Expenses: 120 + 35 + 50 = 205 gross
    client.post(
        "/api/expenses",
        json={
            "amount": 120.0,
            "category": "groceries",
            "description": "Weekly grocery",
            "type": "expense",
            "date": date_str,
        },
    )
    client.post(
        "/api/expenses",
        json={
            "amount": 35.0,
            "category": "transport",
            "description": "Metro card",
            "type": "expense",
            "date": date_str,
        },
    )
    client.post(
        "/api/expenses",
        json={
            "amount": 50.0,
            "category": "entertainment",
            "description": "Concert",
            "type": "expense",
            "date": date_str,
        },
    )

    # Reimbursements: 20 + 15 = 35 reimbursements
    client.post(
        "/api/expenses",
        json={
            "amount": 20.0,
            "category": "groceries",
            "description": "Grocery split refund",
            "type": "reimbursement",
            "date": date_str,
        },
    )
    client.post(
        "/api/expenses",
        json={
            "amount": 15.0,
            "category": "entertainment",
            "description": "Ticket split refund",
            "type": "reimbursement",
            "date": date_str,
        },
    )

    # Income: 2500
    client.post(
        "/api/expenses",
        json={
            "amount": 2500.0,
            "category": "salary",
            "description": "May Salary",
            "type": "income",
            "date": date_str,
        },
    )

    res = client.get("/api/expenses?month=5&year=2026")
    assert res.status_code == 200
    data = res.get_json()

    summary = data["summary"]
    assert summary["gross_expenses"] == 205.0
    assert summary["reimbursements"] == 35.0
    assert summary["net_expenses"] == 170.0
    assert summary["income"] == 2500.0

    # Dedicated /api/summary endpoint
    res_summary = client.get("/api/summary?month=5&year=2026")
    assert res_summary.status_code == 200
    s_data = res_summary.get_json()
    assert s_data["gross_expenses"] == 205.0
    assert s_data["reimbursements"] == 35.0
    assert s_data["net_expenses"] == 170.0
    assert s_data["income"] == 2500.0


def test_zero_spending_month_with_income_and_reimbursement(client, clean_db):
    """Test monthly summary when there are only income and reimbursements."""
    date_str = "2026-06-10"
    client.post(
        "/api/expenses",
        json={
            "amount": 1500.0,
            "category": "freelance",
            "description": "Client work",
            "type": "income",
            "date": date_str,
        },
    )
    client.post(
        "/api/expenses",
        json={
            "amount": 45.0,
            "category": "groceries",
            "description": "Late refund",
            "type": "reimbursement",
            "date": date_str,
        },
    )

    res = client.get("/api/summary?month=6&year=2026")
    assert res.status_code == 200
    data = res.get_json()
    assert data["gross_expenses"] == 0.0
    assert data["reimbursements"] == 45.0
    assert data["net_expenses"] == -45.0
    assert data["income"] == 1500.0
