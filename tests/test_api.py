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


@pytest.mark.parametrize("amount", ["NaN", "Infinity", "-Infinity"])
def test_nonfinite_transaction_amount_rejected(client, sample_expense, amount):
    response = client.post("/api/expenses", json=sample_expense)
    expense_id = response.get_json()["id"]
    invalid = {**sample_expense, "amount": amount}
    assert client.post("/api/expenses", json=invalid).status_code == 400
    assert client.put(f"/api/expenses/{expense_id}", json=invalid).status_code == 400
    assert client.get("/api/expenses").get_json()["gross_expenses"] == 100.5


@pytest.mark.parametrize("txn_type", [None, "", 0, False, [], {}])
def test_explicit_invalid_type_rejected(client, sample_expense, txn_type):
    assert (
        client.post(
            "/api/expenses", json={**sample_expense, "type": txn_type}
        ).status_code
        == 400
    )


def test_type_filter_is_normalized_and_validated(client, sample_expense):
    client.post("/api/expenses", json=sample_expense)
    client.post("/api/expenses", json={**sample_expense, "type": "income"})
    result = client.get("/api/expenses?type=%20Income%20").get_json()
    assert result["total"] == 1
    assert result["expenses"][0]["type"] == "income"
    assert client.get("/api/expenses?type=refund").status_code == 400


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


def test_reconcile_page(client):
    """Test /reconcile serves the reconciliation page"""
    response = client.get("/reconcile")
    assert response.status_code == 200
    assert b"Vault" in response.data


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


def test_trends_api_includes_month_projection(client):
    """GET /api/trends includes a recurring-aware month-end spending projection."""
    with client.application.app_context():
        today = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0)
        db.session.add(
            Expense(
                amount=25.0,
                category="personal",
                description="Test",
                date=today,
            )
        )
        db.session.commit()

    resp = client.get("/api/trends")
    assert resp.status_code == 200
    data = resp.get_json()
    projection = data["projection"]

    assert projection["current_total"] >= 25.0
    assert projection["projected_total"] >= projection["current_total"]
    assert projection["confidence"] in {"low", "medium", "high"}
    assert "previous_3_month_average" in projection


def test_add_transaction_types(client):
    """Test adding expense, income, reimbursement, and defaulting missing type."""
    # 1. Explicit expense
    res = client.post(
        "/api/expenses",
        json={
            "amount": 45.0,
            "category": "food",
            "description": "Lunch",
            "type": "expense",
        },
    )
    assert res.status_code == 201
    assert res.get_json()["type"] == "expense"

    # 2. Explicit income
    res = client.post(
        "/api/expenses",
        json={
            "amount": 2500.0,
            "category": "salary",
            "description": "Paycheck",
            "type": "income",
        },
    )
    assert res.status_code == 201
    assert res.get_json()["type"] == "income"

    # 3. Explicit reimbursement
    res = client.post(
        "/api/expenses",
        json={
            "amount": 15.0,
            "category": "food",
            "description": "Lunch split refund",
            "type": "reimbursement",
        },
    )
    assert res.status_code == 201
    assert res.get_json()["type"] == "reimbursement"

    # 4. Default missing type to expense (backwards compatibility)
    res = client.post(
        "/api/expenses",
        json={"amount": 10.0, "category": "other", "description": "Coffee"},
    )
    assert res.status_code == 201
    assert res.get_json()["type"] == "expense"


def test_transaction_type_and_amount_validations(client):
    """Test validation errors for invalid type or non-positive amount."""
    # Invalid type
    res = client.post(
        "/api/expenses",
        json={
            "amount": 50.0,
            "category": "food",
            "description": "Meal",
            "type": "invalid_type",
        },
    )
    assert res.status_code == 400
    assert "Invalid transaction type" in res.get_json()["error"]

    # Negative amount
    res = client.post(
        "/api/expenses",
        json={
            "amount": -20.0,
            "category": "food",
            "description": "Meal",
            "type": "expense",
        },
    )
    assert res.status_code == 400
    assert "greater than zero" in res.get_json()["error"]

    # Zero amount
    res = client.post(
        "/api/expenses",
        json={
            "amount": 0.0,
            "category": "food",
            "description": "Meal",
            "type": "reimbursement",
        },
    )
    assert res.status_code == 400
    assert "greater than zero" in res.get_json()["error"]


def test_update_transaction_type_and_validations(client):
    """Test updating transaction type and validation on PUT."""
    res = client.post(
        "/api/expenses",
        json={
            "amount": 40.0,
            "category": "personal",
            "description": "Item",
            "type": "expense",
        },
    )
    assert res.status_code == 201
    item_id = res.get_json()["id"]

    # Update to reimbursement
    put_res = client.put(
        f"/api/expenses/{item_id}",
        json={
            "amount": 40.0,
            "category": "personal",
            "description": "Item",
            "type": "reimbursement",
        },
    )
    assert put_res.status_code == 200
    assert put_res.get_json()["type"] == "reimbursement"

    # Update with invalid type
    put_inv = client.put(
        f"/api/expenses/{item_id}",
        json={
            "amount": 40.0,
            "category": "personal",
            "description": "Item",
            "type": "bad_type",
        },
    )
    assert put_inv.status_code == 400
    assert "Invalid transaction type" in put_inv.get_json()["error"]

    # Update with non-positive amount
    put_zero = client.put(
        f"/api/expenses/{item_id}",
        json={
            "amount": 0,
            "category": "personal",
            "description": "Item",
            "type": "reimbursement",
        },
    )
    assert put_zero.status_code == 400
    assert "greater than zero" in put_zero.get_json()["error"]


def test_expenses_summary_and_type_filtering(client):
    """Test GET /api/expenses returns summary with gross, reimb, net, income
    and supports ?type= filter."""
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")

    # Add 2 expenses (100 + 50 = 150 gross)
    client.post(
        "/api/expenses",
        json={
            "amount": 100.0,
            "category": "groceries",
            "description": "Store A",
            "type": "expense",
            "date": date_str,
        },
    )
    client.post(
        "/api/expenses",
        json={
            "amount": 50.0,
            "category": "transport",
            "description": "Gas",
            "type": "expense",
            "date": date_str,
        },
    )
    # Add 1 reimbursement (30)
    client.post(
        "/api/expenses",
        json={
            "amount": 30.0,
            "category": "groceries",
            "description": "Return",
            "type": "reimbursement",
            "date": date_str,
        },
    )
    # Add 1 income (2000)
    client.post(
        "/api/expenses",
        json={
            "amount": 2000.0,
            "category": "salary",
            "description": "Paycheck",
            "type": "income",
            "date": date_str,
        },
    )

    # Fetch all for the month
    res = client.get(f"/api/expenses?month={now.month}&year={now.year}")
    assert res.status_code == 200
    data = res.get_json()

    assert data["total"] == 4
    assert data["summary"]["gross_expenses"] == 150.0
    assert data["summary"]["reimbursements"] == 30.0
    assert data["summary"]["net_expenses"] == 120.0
    assert data["summary"]["income"] == 2000.0

    # Top-level backward-compatible keys
    assert data["gross_expenses"] == 150.0
    assert data["reimbursements"] == 30.0
    assert data["net_expenses"] == 120.0
    assert data["income"] == 2000.0

    # Filter by ?type=reimbursement
    res_reimb = client.get(
        f"/api/expenses?type=reimbursement&month={now.month}&year={now.year}"
    )
    assert res_reimb.status_code == 200
    reimb_data = res_reimb.get_json()
    assert len(reimb_data["expenses"]) == 1
    assert reimb_data["expenses"][0]["type"] == "reimbursement"

    # Filter by ?type=income
    res_inc = client.get(f"/api/expenses?type=income&month={now.month}&year={now.year}")
    assert res_inc.status_code == 200
    inc_data = res_inc.get_json()
    assert len(inc_data["expenses"]) == 1
    assert inc_data["expenses"][0]["type"] == "income"


def test_dedicated_summary_endpoints(client):
    """Test GET /api/summary and GET /api/expenses/summary."""
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")

    client.post(
        "/api/expenses",
        json={
            "amount": 200.0,
            "category": "rent",
            "description": "Rent",
            "type": "expense",
            "date": date_str,
        },
    )
    client.post(
        "/api/expenses",
        json={
            "amount": 50.0,
            "category": "rent",
            "description": "Discount refund",
            "type": "reimbursement",
            "date": date_str,
        },
    )
    client.post(
        "/api/expenses",
        json={
            "amount": 1000.0,
            "category": "salary",
            "description": "Stipend",
            "type": "income",
            "date": date_str,
        },
    )

    for endpoint in ["/api/summary", "/api/expenses/summary"]:
        res = client.get(f"{endpoint}?month={now.month}&year={now.year}")
        assert res.status_code == 200
        data = res.get_json()
        assert data["month"] == now.month
        assert data["year"] == now.year
        assert data["gross_expenses"] == 200.0
        assert data["reimbursements"] == 50.0
        assert data["net_expenses"] == 150.0
        assert data["income"] == 1000.0


def test_trends_net_spending_and_projections(client):
    """Test trends API uses net spending and labels metric properly."""
    today = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0)
    with client.application.app_context():
        # Expense: 100
        db.session.add(
            Expense(
                amount=100.0,
                category="food_drink",
                description="Meal",
                type="expense",
                date=today,
            )
        )
        # Reimbursement: 30
        db.session.add(
            Expense(
                amount=30.0,
                category="food_drink",
                description="Split refund",
                type="reimbursement",
                date=today,
            )
        )
        # Income: 500 (must NOT reduce spending)
        db.session.add(
            Expense(
                amount=500.0,
                category="income_cat",
                description="Bonus",
                type="income",
                date=today,
            )
        )
        db.session.commit()

    resp = client.get("/api/trends")
    assert resp.status_code == 200
    data = resp.get_json()

    current_month_trend = data["monthly"][3]
    # Net spending = 100 - 30 = 70.0
    assert current_month_trend["total"] == 70.0
    assert current_month_trend["categories"]["food_drink"] == 70.0
    assert "income_cat" not in current_month_trend["categories"]

    # Month projection
    projection = data["projection"]
    assert projection["metric"] == "net_spending"
    assert projection["metric_label"] == "Net Spending"
    assert projection["current_total"] == 70.0


def test_trends_preserves_negative_net_categories(client):
    """
    Ensure categories with net reimbursements (> expenses) are preserved in
    trends.
    """
    today = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0)
    with client.application.app_context():
        db.session.add(
            Expense(
                amount=20.0,
                category="electronics",
                description="Cable",
                type="expense",
                date=today,
            )
        )
        db.session.add(
            Expense(
                amount=50.0,
                category="electronics",
                description="Returned gadget",
                type="reimbursement",
                date=today,
            )
        )
        db.session.commit()

    resp = client.get("/api/trends")
    assert resp.status_code == 200
    data = resp.get_json()
    current_month_trend = data["monthly"][3]
    assert current_month_trend["total"] == -30.0
    assert current_month_trend["categories"]["electronics"] == -30.0
