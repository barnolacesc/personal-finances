import pytest
from datetime import datetime, timezone, timedelta
from app import (
    app,
    db,
    RecurringExpense,
    Expense,
    apply_due_recurring_expenses,
    is_due_today,
)


@pytest.fixture
def client():
    """Create a test client with a fresh database."""
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"

    with app.test_client() as client:
        with app.app_context():
            db.create_all()
            yield client
            db.session.remove()
            db.drop_all()


def test_create_recurring_expense(client):
    """Test creating a recurring expense via API."""
    data = {
        "amount": 50.0,
        "category": "super",
        "description": "Monthly Rent",
        "frequency": "monthly",
        "day_of_month": 1,
        "start_date": datetime.now(timezone.utc).isoformat(),
    }

    response = client.post("/api/recurring", json=data)
    assert response.status_code == 201

    json_data = response.get_json()
    assert json_data["amount"] == 50.0
    assert json_data["category"] == "super"
    assert json_data["description"] == "Monthly Rent"
    assert json_data["frequency"] == "monthly"
    assert json_data["day_of_month"] == 1
    assert json_data["is_active"] is True


def test_get_recurring_expenses(client):
    """Test fetching all recurring expenses."""
    # Create some test data
    with app.app_context():
        recurring1 = RecurringExpense(
            amount=100.0,
            category="super",
            description="Test 1",
            frequency="monthly",
            day_of_month=1,
            start_date=datetime.now(timezone.utc),
        )
        recurring2 = RecurringExpense(
            amount=200.0,
            category="food_drink",
            description="Test 2",
            frequency="weekly",
            day_of_month=1,
            start_date=datetime.now(timezone.utc),
        )
        db.session.add_all([recurring1, recurring2])
        db.session.commit()

    response = client.get("/api/recurring")
    assert response.status_code == 200

    json_data = response.get_json()
    assert len(json_data["recurring_expenses"]) == 2


def test_update_recurring_expense(client):
    """Test updating a recurring expense."""
    with app.app_context():
        recurring = RecurringExpense(
            amount=100.0,
            category="super",
            description="Test",
            frequency="monthly",
            day_of_month=1,
            start_date=datetime.now(timezone.utc),
        )
        db.session.add(recurring)
        db.session.commit()
        recurring_id = recurring.id

    update_data = {
        "amount": 150.0,
        "description": "Updated Test",
    }

    response = client.put(f"/api/recurring/{recurring_id}", json=update_data)
    assert response.status_code == 200

    json_data = response.get_json()
    assert json_data["amount"] == 150.0
    assert json_data["description"] == "Updated Test"


def test_delete_recurring_expense(client):
    """Test deleting a recurring expense."""
    with app.app_context():
        recurring = RecurringExpense(
            amount=100.0,
            category="super",
            description="Test",
            frequency="monthly",
            day_of_month=1,
            start_date=datetime.now(timezone.utc),
        )
        db.session.add(recurring)
        db.session.commit()
        recurring_id = recurring.id

    response = client.delete(f"/api/recurring/{recurring_id}")
    assert response.status_code == 204

    # Verify it's deleted
    response = client.get("/api/recurring")
    json_data = response.get_json()
    assert len(json_data["recurring_expenses"]) == 0


def test_toggle_active(client):
    """Test toggling the active status of a recurring expense."""
    with app.app_context():
        recurring = RecurringExpense(
            amount=100.0,
            category="super",
            description="Test",
            frequency="monthly",
            day_of_month=1,
            start_date=datetime.now(timezone.utc),
            is_active=True,
        )
        db.session.add(recurring)
        db.session.commit()
        recurring_id = recurring.id

    # Deactivate
    response = client.put(f"/api/recurring/{recurring_id}", json={"is_active": False})
    assert response.status_code == 200
    assert response.get_json()["is_active"] is False

    # Reactivate
    response = client.put(f"/api/recurring/{recurring_id}", json={"is_active": True})
    assert response.status_code == 200
    assert response.get_json()["is_active"] is True


def test_is_due_today_monthly():
    """Test monthly frequency due date logic."""
    today = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # Never applied, should be due
    recurring = RecurringExpense(
        amount=100.0,
        category="super",
        description="Test",
        frequency="monthly",
        day_of_month=today.day,
        start_date=today - timedelta(days=30),
        last_applied_date=None,
    )
    assert is_due_today(recurring, today) is True

    # Applied this month, should not be due
    recurring.last_applied_date = today
    assert is_due_today(recurring, today) is False

    # Applied last month, should be due if it's the right day
    recurring.last_applied_date = today - timedelta(days=31)
    assert is_due_today(recurring, today) is True


def test_is_due_today_weekly():
    """Test weekly frequency due date logic."""
    today = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # Never applied, should be due on the right weekday
    recurring = RecurringExpense(
        amount=100.0,
        category="super",
        description="Test",
        frequency="weekly",
        day_of_month=today.isoweekday(),  # Today's weekday
        start_date=today - timedelta(days=7),
        last_applied_date=None,
    )
    assert is_due_today(recurring, today) is True

    # Applied today, should not be due
    recurring.last_applied_date = today
    assert is_due_today(recurring, today) is False

    # Applied last week, should be due
    recurring.last_applied_date = today - timedelta(days=7)
    assert is_due_today(recurring, today) is True


def test_apply_due_recurring_expenses(client):
    """Test applying due recurring expenses."""
    with app.app_context():
        today = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        # Create a due recurring expense
        recurring = RecurringExpense(
            amount=100.0,
            category="super",
            description="Monthly Rent",
            frequency="monthly",
            day_of_month=today.day,
            start_date=today - timedelta(days=30),
            is_active=True,
            last_applied_date=None,
        )
        db.session.add(recurring)
        db.session.commit()

        # Apply recurring expenses
        count = apply_due_recurring_expenses()
        assert count == 1

        # Check that an expense was created
        expense = Expense.query.filter_by(description="Monthly Rent").first()
        assert expense is not None
        assert expense.amount == 100.0
        assert expense.category == "super"


def test_no_duplicate_expenses(client):
    """Test that duplicate expenses are not created."""
    with app.app_context():
        today = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        # Create a recurring expense
        recurring = RecurringExpense(
            amount=100.0,
            category="super",
            description="Monthly Rent",
            frequency="monthly",
            day_of_month=today.day,
            start_date=today - timedelta(days=30),
            is_active=True,
            last_applied_date=None,
        )
        db.session.add(recurring)
        db.session.commit()

        # Apply once
        count = apply_due_recurring_expenses()
        assert count == 1

        # Try to apply again - should not create duplicate
        count = apply_due_recurring_expenses()
        assert count == 0

        # Verify only one expense exists
        expenses = Expense.query.filter_by(description="Monthly Rent").all()
        assert len(expenses) == 1


def test_inactive_recurring_not_applied(client):
    """Test that inactive recurring expenses are not applied."""
    with app.app_context():
        today = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        # Create an inactive recurring expense
        recurring = RecurringExpense(
            amount=100.0,
            category="super",
            description="Inactive",
            frequency="monthly",
            day_of_month=today.day,
            start_date=today - timedelta(days=30),
            is_active=False,
            last_applied_date=None,
        )
        db.session.add(recurring)
        db.session.commit()

        # Apply recurring expenses
        count = apply_due_recurring_expenses()
        assert count == 0

        # Verify no expense was created
        expense = Expense.query.filter_by(description="Inactive").first()
        assert expense is None


def test_manual_apply_endpoint(client):
    """Test the manual apply endpoint."""
    with app.app_context():
        today = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        # Create a due recurring expense
        recurring = RecurringExpense(
            amount=100.0,
            category="super",
            description="Test",
            frequency="monthly",
            day_of_month=today.day,
            start_date=today - timedelta(days=30),
            is_active=True,
            last_applied_date=None,
        )
        db.session.add(recurring)
        db.session.commit()

    response = client.post("/api/recurring/apply")
    assert response.status_code == 200

    json_data = response.get_json()
    assert json_data["success"] is True
    assert json_data["applied"] == 1


def test_pending_recurring_endpoint(client):
    """Test the pending recurring expenses endpoint."""
    with app.app_context():
        today = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        # Create a due recurring expense
        recurring = RecurringExpense(
            amount=100.0,
            category="super",
            description="Test",
            frequency="monthly",
            day_of_month=today.day,
            start_date=today - timedelta(days=30),
            is_active=True,
            last_applied_date=None,
        )
        db.session.add(recurring)
        db.session.commit()

    response = client.get("/api/recurring/pending")
    assert response.status_code == 200

    json_data = response.get_json()
    assert len(json_data["pending"]) == 1
    assert json_data["pending"][0]["description"] == "Test"
