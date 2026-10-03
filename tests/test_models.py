import pytest
from datetime import datetime
from app import Expense
from sqlalchemy import inspect


def test_new_database_indexes_transaction_types(_db):
    indexes = inspect(_db.engine).get_indexes("expense")
    assert any(index["column_names"] == ["type"] for index in indexes)


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


def test_expense_type_default_and_to_dict():
    """Test that expense type defaults to 'expense' and is present in to_dict()"""
    expense = Expense(
        amount=50.0,
        category="Groceries",
        description="Grocery shopping",
        date=datetime.now(),
    )
    assert expense.type == "expense"
    d = expense.to_dict()
    assert d["type"] == "expense"


def test_expense_net_spending_contribution():
    """Test net_spending_contribution property for expense, reimbursement, and income"""
    exp = Expense(amount=50.0, category="Groceries", description="Food", type="expense")
    assert exp.net_spending_contribution == 50.0

    reimb = Expense(
        amount=20.0, category="Groceries", description="Refund", type="reimbursement"
    )
    assert reimb.net_spending_contribution == -20.0

    inc = Expense(amount=1000.0, category="Salary", description="Pay", type="income")
    assert inc.net_spending_contribution == 0.0


def test_expense_persistence_with_types(_db, clean_db):
    """Test persisting expenses with explicit transaction types"""
    exp = Expense(
        amount=60.0,
        category="Groceries",
        description="Supermarket",
        date=datetime.now(),
        type="expense",
    )
    reimb = Expense(
        amount=15.0,
        category="Groceries",
        description="Item return",
        date=datetime.now(),
        type="reimbursement",
    )
    inc = Expense(
        amount=3000.0,
        category="Salary",
        description="Monthly salary",
        date=datetime.now(),
        type="income",
    )
    _db.session.add_all([exp, reimb, inc])
    _db.session.commit()

    all_txns = Expense.query.order_by(Expense.amount.asc()).all()
    assert len(all_txns) == 3
    assert all_txns[0].type == "reimbursement"
    assert all_txns[0].amount == 15.0
    assert all_txns[0].net_spending_contribution == -15.0

    assert all_txns[1].type == "expense"
    assert all_txns[1].amount == 60.0
    assert all_txns[1].net_spending_contribution == 60.0

    assert all_txns[2].type == "income"
    assert all_txns[2].amount == 3000.0
    assert all_txns[2].net_spending_contribution == 0.0
