import pytest
from datetime import datetime
from app import Expense


def test_expense_creation(test_expenses):
    """Test expense creation"""
    assert len(test_expenses) == 3
    assert test_expenses[0].amount == 50.0
    assert test_expenses[0].description == "Grocery shopping"
    assert test_expenses[0].category == "Groceries"


def test_expense_to_dict(test_expenses):
    """Test expense to_dict method"""
    expense_dict = test_expenses[0].to_dict()
    assert expense_dict["amount"] == 50.0
    assert expense_dict["category"] == "Groceries"
    assert expense_dict["description"] == "Grocery shopping"
    assert isinstance(expense_dict["date"], str)


def test_expense_persistence(_db, clean_db):
    """Test expense persistence in database"""
    expense = Expense(
        amount=100.0,
        category="Test",
        description="Test expense",
        date=datetime.now(),
    )
    _db.session.add(expense)
    _db.session.commit()

    # Retrieve from database
    saved_expense = Expense.query.first()
    assert saved_expense.amount == 100.0
    assert saved_expense.category == "Test"
    assert saved_expense.description == "Test expense"


def test_expense_validation(_db, clean_db):
    """Test expense validation"""
    # Test required fields: SQLAlchemy only raises on commit
    invalid1 = Expense(amount=None, category="Test", description="Test")
    _db.session.add(invalid1)
    with pytest.raises(Exception):
        _db.session.commit()
    _db.session.rollback()
    invalid2 = Expense(amount=100.0, category=None, description="Test")
    _db.session.add(invalid2)
    with pytest.raises(Exception):
        _db.session.commit()
    _db.session.rollback()
    invalid3 = Expense(amount=100.0, category="Test", description=None)
    _db.session.add(invalid3)
    with pytest.raises(Exception):
        _db.session.commit()
    _db.session.rollback()
