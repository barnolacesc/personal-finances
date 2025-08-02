import pytest
import tempfile
import os
from datetime import datetime
import sys
from app import app, db, Expense

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))


@pytest.fixture(scope="session")
def app_instance():
    """Create a Flask app instance for testing with a separate test database."""
    # Create a temporary directory for the test database
    temp_dir = tempfile.mkdtemp()
    test_db_path = os.path.join(temp_dir, "test_expenses.db")

    app.config["TESTING"] = True
    db_uri = "sqlite:///" + test_db_path
    app.config["SQLALCHEMY_DATABASE_URI"] = db_uri
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    return app


@pytest.fixture(scope="function")
def _db(app_instance):
    """Create a fresh database for each test."""
    with app_instance.app_context():
        db.create_all()
        yield db
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app_instance):
    """Create a test client."""
    with app_instance.test_client() as client:
        with app_instance.app_context():
            yield client


@pytest.fixture
def test_expenses(_db):
    """Create test expenses."""
    # Use a fixed date in the current month to ensure all expenses are in the same month
    base_date = datetime.now().replace(
        day=15
    )  # Use middle of month to avoid edge cases
    expenses = [
        Expense(
            amount=50.0,
            description="Grocery shopping",
            date=base_date,
            category="Groceries",
        ),
        Expense(
            amount=30.0,
            description="Bus fare",
            date=base_date.replace(day=10),  # Earlier in same month
            category="Transport",
        ),
        Expense(
            amount=25.0,
            description="Movie night",
            date=base_date.replace(day=20),  # Later in same month
            category="Entertainment",
        ),
    ]
    for expense in expenses:
        _db.session.add(expense)
    _db.session.commit()
    return expenses


@pytest.fixture
def clean_db(_db):
    """Clean the database after each test."""
    yield _db
    _db.session.remove()
    _db.drop_all()
    _db.create_all()


@pytest.fixture
def sample_expense():
    """Sample expense data for testing."""
    return {
        "amount": 100.50,
        "category": "Groceries",
        "description": "Weekly groceries",
    }


@pytest.fixture
def sample_expenses():
    """Multiple sample expenses for testing."""
    return [
        {
            "amount": 100.50,
            "category": "Groceries",
            "description": "Weekly groceries",
            "date": datetime(2024, 3, 1),
        },
        {
            "amount": 200.00,
            "category": "Bills",
            "description": "Electricity bill",
            "date": datetime(2024, 3, 3),
        },
        {
            "amount": 150.00,
            "category": "Transport",
            "description": "Bus fare",
            "date": datetime(2024, 3, 5),
        },
    ]
