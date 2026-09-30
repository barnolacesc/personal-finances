import pytest
from app import Expense, ReconciliationAllocation


@pytest.fixture(autouse=True)
def clean_database(_db):
    """Ensure database is clean before each test."""
    _db.session.query(ReconciliationAllocation).delete()
    _db.session.query(Expense).delete()
    _db.session.commit()


def test_50_50_split(client):
    """Test 50/50 split of an expense with a reimbursement."""
    # Create expense of 100 EUR (e.g., race registration)
    exp_res = client.post(
        "/api/expenses",
        json={
            "amount": 100.0,
            "category": "personal",
            "description": "Race registration",
            "type": "expense",
            "date": "2026-05-10",
        },
    )
    assert exp_res.status_code == 201
    expense = exp_res.get_json()

    # Create reimbursement of 50 EUR (50% share from friend)
    reimb_res = client.post(
        "/api/expenses",
        json={
            "amount": 50.0,
            "category": "personal",
            "description": "Bizum for race",
            "type": "reimbursement",
            "date": "2026-05-11",
        },
    )
    assert reimb_res.status_code == 201
    reimbursement = reimb_res.get_json()

    # Allocate 50 EUR from reimbursement to expense
    alloc_res = client.post(
        "/api/allocations",
        json={
            "reimbursement_id": reimbursement["id"],
            "expense_id": expense["id"],
            "amount": 50.0,
            "counterparty": "Alice",
            "notes": "50/50 split on race registration",
        },
    )
    assert alloc_res.status_code == 201
    alloc_data = alloc_res.get_json()
    assert alloc_data["amount"] == 50.0
    assert alloc_data["counterparty"] == "Alice"
    assert alloc_data["notes"] == "50/50 split on race registration"

    # Verify expense computed figures
    exp_check = client.get(f"/api/expenses/{expense['id']}/reconciliation")
    assert exp_check.status_code == 200
    exp_recon = exp_check.get_json()
    assert exp_recon["gross_cost"] == 100.0
    assert exp_recon["reimbursed_amount"] == 50.0
    assert exp_recon["remaining_share"] == 50.0
    assert len(exp_recon["allocations"]) == 1

    # Verify reimbursement computed figures
    reimb_check = client.get(f"/api/expenses/{reimbursement['id']}/reconciliation")
    assert reimb_check.status_code == 200
    reimb_recon = reimb_check.get_json()
    assert reimb_recon["allocated_amount"] == 50.0
    assert reimb_recon["unallocated_amount"] == 0.0


def test_one_to_many_reimbursement(client):
    """Test one reimbursement allocated across multiple expenses."""
    # Transfer covering a device purchase (60€) and shared dinner (40€)
    reimb_res = client.post(
        "/api/expenses",
        json={
            "amount": 100.0,
            "category": "personal",
            "description": "Transfer from Bob",
            "type": "reimbursement",
        },
    )
    assert reimb_res.status_code == 201
    reimbursement = reimb_res.get_json()

    exp1_res = client.post(
        "/api/expenses",
        json={
            "amount": 60.0,
            "category": "personal",
            "description": "Device purchase",
            "type": "expense",
        },
    )
    expense1 = exp1_res.get_json()

    exp2_res = client.post(
        "/api/expenses",
        json={
            "amount": 80.0,
            "category": "food_drink",
            "description": "Shared dinner",
            "type": "expense",
        },
    )
    expense2 = exp2_res.get_json()

    # Allocate 60 to expense1
    res1 = client.post(
        "/api/allocations",
        json={
            "reimbursement_id": reimbursement["id"],
            "expense_id": expense1["id"],
            "amount": 60.0,
            "counterparty": "Bob",
        },
    )
    assert res1.status_code == 201

    # Allocate 40 to expense2
    res2 = client.post(
        "/api/allocations",
        json={
            "reimbursement_id": reimbursement["id"],
            "expense_id": expense2["id"],
            "amount": 40.0,
            "counterparty": "Bob",
        },
    )
    assert res2.status_code == 201

    # Check reimbursement is fully allocated
    reimb_check = client.get(f"/api/expenses/{reimbursement['id']}/reconciliation")
    r_data = reimb_check.get_json()
    assert r_data["allocated_amount"] == 100.0
    assert r_data["unallocated_amount"] == 0.0
    assert len(r_data["allocations"]) == 2

    # Check Expense 1 is fully reimbursed (0 remaining)
    e1_check = client.get(f"/api/expenses/{expense1['id']}/reconciliation")
    e1_data = e1_check.get_json()
    assert e1_data["gross_cost"] == 60.0
    assert e1_data["reimbursed_amount"] == 60.0
    assert e1_data["remaining_share"] == 0.0

    # Check Expense 2 has 40 remaining
    e2_check = client.get(f"/api/expenses/{expense2['id']}/reconciliation")
    e2_data = e2_check.get_json()
    assert e2_data["gross_cost"] == 80.0
    assert e2_data["reimbursed_amount"] == 40.0
    assert e2_data["remaining_share"] == 40.0


def test_many_to_one_reimbursement(client):
    """Test one expense receiving multiple partial reimbursements (e.g. group meal)."""
    # 90€ group meal paid by Cesc
    exp_res = client.post(
        "/api/expenses",
        json={
            "amount": 90.0,
            "category": "food_drink",
            "description": "Group meal",
            "type": "expense",
        },
    )
    expense = exp_res.get_json()

    # Bizum 1: 30€ from Friend A
    r1_res = client.post(
        "/api/expenses",
        json={
            "amount": 30.0,
            "category": "food_drink",
            "description": "Bizum Friend A",
            "type": "reimbursement",
        },
    )
    r1 = r1_res.get_json()

    # Bizum 2: 30€ from Friend B
    r2_res = client.post(
        "/api/expenses",
        json={
            "amount": 30.0,
            "category": "food_drink",
            "description": "Bizum Friend B",
            "type": "reimbursement",
        },
    )
    r2 = r2_res.get_json()

    # Allocate from r1
    res1 = client.post(
        "/api/allocations",
        json={
            "reimbursement_id": r1["id"],
            "expense_id": expense["id"],
            "amount": 30.0,
            "counterparty": "Friend A",
        },
    )
    assert res1.status_code == 201

    # Allocate from r2
    res2 = client.post(
        "/api/allocations",
        json={
            "reimbursement_id": r2["id"],
            "expense_id": expense["id"],
            "amount": 30.0,
            "counterparty": "Friend B",
        },
    )
    assert res2.status_code == 201

    # Check expense status: gross 90, reimbursed 60, remaining 30 (Cesc's share)
    e_check = client.get(f"/api/expenses/{expense['id']}/reconciliation")
    e_data = e_check.get_json()
    assert e_data["gross_cost"] == 90.0
    assert e_data["reimbursed_amount"] == 60.0
    assert e_data["remaining_share"] == 30.0
    assert len(e_data["allocations"]) == 2


def test_over_allocation_reimbursement(client):
    """Test that allocations cannot exceed source reimbursement amount."""
    reimb_res = client.post(
        "/api/expenses",
        json={
            "amount": 50.0,
            "category": "personal",
            "description": "Partial refund",
            "type": "reimbursement",
        },
    )
    reimbursement = reimb_res.get_json()

    exp_res = client.post(
        "/api/expenses",
        json={
            "amount": 100.0,
            "category": "personal",
            "description": "Expensive purchase",
            "type": "expense",
        },
    )
    expense = exp_res.get_json()

    # Attempt to allocate 60€ from a 50€ reimbursement -> Must fail with 400
    res_invalid = client.post(
        "/api/allocations",
        json={
            "reimbursement_id": reimbursement["id"],
            "expense_id": expense["id"],
            "amount": 60.0,
        },
    )
    assert res_invalid.status_code == 400
    assert "exceeds available reimbursement capacity" in res_invalid.get_json()["error"]

    # Allocate 40€ -> Succeeds
    res_valid = client.post(
        "/api/allocations",
        json={
            "reimbursement_id": reimbursement["id"],
            "expense_id": expense["id"],
            "amount": 40.0,
        },
    )
    assert res_valid.status_code == 201

    # Now available capacity is 10€. Attempting to allocate 15€ must fail with 400
    res_second_invalid = client.post(
        "/api/allocations",
        json={
            "reimbursement_id": reimbursement["id"],
            "expense_id": expense["id"],
            "amount": 15.0,
        },
    )
    assert res_second_invalid.status_code == 400

    # Allocating remaining 10€ succeeds
    res_second_valid = client.post(
        "/api/allocations",
        json={
            "reimbursement_id": reimbursement["id"],
            "expense_id": expense["id"],
            "amount": 10.0,
        },
    )
    assert res_second_valid.status_code == 201


def test_over_allocation_expense(client):
    """Test that allocations cannot exceed the target expense remaining share."""
    reimb_res = client.post(
        "/api/expenses",
        json={
            "amount": 100.0,
            "category": "personal",
            "description": "Large refund",
            "type": "reimbursement",
        },
    )
    reimbursement = reimb_res.get_json()

    exp_res = client.post(
        "/api/expenses",
        json={
            "amount": 40.0,
            "category": "personal",
            "description": "Small purchase",
            "type": "expense",
        },
    )
    expense = exp_res.get_json()

    # Attempting to allocate 50€ to a 40€ expense must fail
    res = client.post(
        "/api/allocations",
        json={
            "reimbursement_id": reimbursement["id"],
            "expense_id": expense["id"],
            "amount": 50.0,
        },
    )
    assert res.status_code == 400
    assert "exceeds expense remaining share" in res.get_json()["error"]


def test_update_and_delete_allocation(client):
    """Test updating and deleting allocations."""
    r_res = client.post(
        "/api/expenses",
        json={
            "amount": 100.0,
            "category": "other",
            "description": "Refund",
            "type": "reimbursement",
        },
    )
    r = r_res.get_json()

    e_res = client.post(
        "/api/expenses",
        json={
            "amount": 100.0,
            "category": "other",
            "description": "Item",
            "type": "expense",
        },
    )
    e = e_res.get_json()

    # Create allocation of 40€
    a_res = client.post(
        "/api/allocations",
        json={"reimbursement_id": r["id"], "expense_id": e["id"], "amount": 40.0},
    )
    assert a_res.status_code == 201
    allocation = a_res.get_json()

    # Update allocation to 70€
    up_res = client.put(
        f"/api/allocations/{allocation['id']}",
        json={
            "amount": 70.0,
            "counterparty": "Updated Counterparty",
            "notes": "Updated note",
        },
    )
    assert up_res.status_code == 200
    up_data = up_res.get_json()
    assert up_data["amount"] == 70.0
    assert up_data["counterparty"] == "Updated Counterparty"
    assert up_data["notes"] == "Updated note"

    # Attempt to update allocation to 120€ (exceeds capacity) -> must fail
    fail_res = client.put(
        f"/api/allocations/{allocation['id']}", json={"amount": 120.0}
    )
    assert fail_res.status_code == 400

    # Delete allocation
    del_res = client.delete(f"/api/allocations/{allocation['id']}")
    assert del_res.status_code == 204

    # Verify reconciliation capacity is restored
    recon = client.get(f"/api/expenses/{e['id']}/reconciliation").get_json()
    assert recon["reimbursed_amount"] == 0.0
    assert recon["remaining_share"] == 100.0


def test_deletion_and_edit_behavior_on_linked_transactions(client):
    """Test that editing or deleting linked transactions preserves consistency."""
    r_res = client.post(
        "/api/expenses",
        json={
            "amount": 100.0,
            "category": "other",
            "description": "Reimbursement",
            "type": "reimbursement",
        },
    )
    r = r_res.get_json()

    e_res = client.post(
        "/api/expenses",
        json={
            "amount": 100.0,
            "category": "other",
            "description": "Expense",
            "type": "expense",
        },
    )
    e = e_res.get_json()

    # Link 60€
    client.post(
        "/api/allocations",
        json={"reimbursement_id": r["id"], "expense_id": e["id"], "amount": 60.0},
    )

    # 1. Attempt to delete expense with active allocations -> blocked with 400
    del_exp = client.delete(f"/api/expenses/{e['id']}")
    assert del_exp.status_code == 400
    assert "active reconciliation allocation" in del_exp.get_json()["error"]

    # 2. Attempt to delete reimbursement with active allocations -> blocked with 400
    del_reimb = client.delete(f"/api/expenses/{r['id']}")
    assert del_reimb.status_code == 400
    assert "active reconciliation allocation" in del_reimb.get_json()["error"]

    # 3. Attempt to reduce reimbursement amount below 60€ -> blocked with 400
    up_r_fail = client.put(
        f"/api/expenses/{r['id']}",
        json={"amount": 50.0, "category": "other", "description": "Reimbursement"},
    )
    assert up_r_fail.status_code == 400
    assert "Cannot reduce reimbursement amount" in up_r_fail.get_json()["error"]

    # 4. Attempt to reduce expense amount below 60€ -> blocked with 400
    up_e_fail = client.put(
        f"/api/expenses/{e['id']}",
        json={"amount": 50.0, "category": "other", "description": "Expense"},
    )
    assert up_e_fail.status_code == 400
    assert "Cannot reduce expense amount" in up_e_fail.get_json()["error"]

    # 5. Increasing amounts succeeds
    up_r_ok = client.put(
        f"/api/expenses/{r['id']}",
        json={"amount": 120.0, "category": "other", "description": "Reimbursement"},
    )
    assert up_r_ok.status_code == 200
    assert up_r_ok.get_json()["amount"] == 120.0

    # 6. Force deletion clears allocations and deletes transaction
    del_force = client.delete(f"/api/expenses/{e['id']}?force=true")
    assert del_force.status_code == 204

    # Now reimbursement has 0 allocations and can be deleted cleanly
    del_r_clean = client.delete(f"/api/expenses/{r['id']}")
    assert del_r_clean.status_code == 204


def test_reconciliation_summary_and_suggestions(client):
    """Test the summary endpoint and smart suggestion algorithm."""
    # Create an expense of 100€ on 2026-05-15
    e_res = client.post(
        "/api/expenses",
        json={
            "amount": 100.0,
            "category": "food_drink",
            "description": "Dinner at Luigi's",
            "type": "expense",
            "date": "2026-05-15",
        },
    )
    expense = e_res.get_json()

    # Create a 50€ reimbursement on 2026-05-16 with matching keyword "Dinner"
    r_res = client.post(
        "/api/expenses",
        json={
            "amount": 50.0,
            "category": "food_drink",
            "description": "Dinner Bizum payment",
            "type": "reimbursement",
            "date": "2026-05-16",
        },
    )
    reimbursement = r_res.get_json()

    # Fetch summary
    summary_res = client.get("/api/reconciliations/summary")
    assert summary_res.status_code == 200
    summary = summary_res.get_json()

    assert len(summary["unmatched_reimbursements"]) == 1
    assert summary["unmatched_reimbursements"][0]["id"] == reimbursement["id"]
    assert len(summary["suggestions"]) > 0

    top_suggestion = summary["suggestions"][0]
    assert top_suggestion["reimbursement_id"] == reimbursement["id"]
    assert top_suggestion["expense_id"] == expense["id"]
    assert top_suggestion["suggested_amount"] == 50.0
    assert top_suggestion["confidence"] == "high"


def test_expense_api_serialization_fields(client):
    """Test that GET /api/expenses includes gross, reimbursed, and remaining."""
    e_res = client.post(
        "/api/expenses",
        json={
            "amount": 80.0,
            "category": "super",
            "description": "Supermarket groceries",
            "type": "expense",
        },
    )
    e = e_res.get_json()

    r_res = client.post(
        "/api/expenses",
        json={
            "amount": 30.0,
            "category": "super",
            "description": "Roommate share",
            "type": "reimbursement",
        },
    )
    r = r_res.get_json()

    client.post(
        "/api/allocations",
        json={"reimbursement_id": r["id"], "expense_id": e["id"], "amount": 30.0},
    )

    # Fetch list
    list_res = client.get("/api/expenses")
    assert list_res.status_code == 200
    items = {item["id"]: item for item in list_res.get_json()["expenses"]}

    exp_item = items[e["id"]]
    assert exp_item["gross_cost"] == 80.0
    assert exp_item["reimbursed_amount"] == 30.0
    assert exp_item["remaining_share"] == 50.0

    r_item = items[r["id"]]
    assert r_item["allocated_amount"] == 30.0
    assert r_item["unallocated_amount"] == 0.0
