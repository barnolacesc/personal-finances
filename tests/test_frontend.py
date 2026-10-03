"""
Browser-based frontend tests using Playwright.

These tests verify that pages load without JS errors and that key components
render correctly. They catch issues like:
- JS null-reference crashes (e.g. querying a removed element and calling
  addEventListener)
- Components that fail to render at all

Setup (one-time):
    pip install pytest-playwright
    playwright install chromium

Run:
    pytest tests/test_frontend.py -v
"""

import threading
import time
import pytest

# Skip the entire module if playwright is not installed
pytest.importorskip(
    "playwright",
    reason=(
        "playwright not installed — run: "
        "pip install pytest-playwright && playwright install chromium"
    ),
)

from playwright.sync_api import Page, expect  # noqa: E402
from datetime import datetime  # noqa: E402
from urllib.parse import urlencode  # noqa: E402


def test_monthly_summary_pills_show_separate_totals(
    page_with_errors, live_server, client, clean_db
):
    for txn_type, amount in [("expense", 100), ("reimbursement", 25), ("income", 500)]:
        response = client.post(
            "/api/expenses",
            json={
                "amount": amount,
                "type": txn_type,
                "category": "other",
                "description": "Summary test",
                "date": datetime.now().strftime("%Y-%m-%d"),
            },
        )
        assert response.status_code == 201
    page, errors = page_with_errors
    page.goto(live_server + "/expenses")
    summary = page.locator("#monthlySummaryBar")
    expect(summary).to_be_visible()
    for metric, amount in [
        ("gross", "100,00"),
        ("reimbursements", "25,00"),
        ("net", "75,00"),
        ("income", "500,00"),
    ]:
        expect(summary.locator(f".summary-pill.{metric} .pill-value")).to_contain_text(
            amount
        )
    assert errors == []


def test_edit_url_rejects_transaction_type_markup(page_with_errors, live_server):
    page, errors = page_with_errors
    query = urlencode({"edit": "1", "type": '"><img src=x onerror=alert(1)>'})
    page.goto(live_server + "/add?" + query)
    expect(page.locator("#transactionType")).to_have_value("expense")
    assert page.locator('img[src="x"]').count() == 0
    assert errors == []


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def browser_database(_db):
    """Keep the schema and transaction data isolated for every browser test."""
    yield


@pytest.fixture(scope="module")
def live_server(app_instance):
    """Start Flask in a background thread so Playwright can hit it."""
    from werkzeug.serving import make_server

    with app_instance.app_context():
        from app import db

        db.create_all()

    server = make_server("127.0.0.1", 5099, app_instance)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.3)
    yield "http://127.0.0.1:5099"
    server.shutdown()


@pytest.fixture
def page_with_errors(page: Page):
    """Page fixture that collects JS errors for assertion."""
    page.route(
        "https://fonts.googleapis.com/**",
        lambda route: route.fulfill(body="", content_type="text/css"),
    )
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    yield page, errors


# ---------------------------------------------------------------------------
# Home page
# ---------------------------------------------------------------------------


def test_home_no_js_errors(page_with_errors, live_server):
    """Home page must load without any JavaScript exceptions."""
    page, errors = page_with_errors
    page.goto(live_server + "/")
    page.wait_for_load_state("networkidle")
    assert errors == [], f"JS errors on /: {errors}"


@pytest.mark.parametrize("path", ["/", "/add"])
def test_entry_page_is_focused_on_expense_input(page_with_errors, live_server, path):
    """Entry pages show the expense wizard without browsing or API controls."""
    page, errors = page_with_errors
    page.goto(live_server + path)
    page.wait_for_load_state("networkidle")
    assert errors == [], f"JS errors on /: {errors}"
    expect(page.get_by_role("textbox", name="Expense description")).to_be_visible()
    expect(page.locator("#bookBackBtn")).to_be_hidden()
    browsing_controls = page.locator(
        "date-navigation, category-chart, latest-expenses, backup-button, #navApiBtn"
    )
    assert browsing_controls.count() == 0


def test_iphone15_wizard_keeps_actions_reachable(page_with_errors, live_server):
    """Phone entry actions fit above navigation and a simulated keyboard."""
    page, errors = page_with_errors
    page.set_viewport_size({"width": 393, "height": 852})
    page.goto(live_server + "/")
    description = page.get_by_role("textbox", name="Expense description")
    description.fill("Coffee")

    # Simulate Safari's visual viewport shrinking while the input is focused.
    page.evaluate(
        """() => {
            Object.defineProperty(window.visualViewport, 'height', {
                configurable: true, value: 480
            });
            window.visualViewport.dispatchEvent(new Event('resize'));
        }"""
    )
    expect(page.locator(".bottom-nav")).to_be_hidden()
    expect(page.locator("#thumbChipsContainer")).to_be_hidden()

    def assert_action_fits(selector, visible_height):
        page.wait_for_function(
            """() => {
                const viewport = document.querySelector('.book-pages-viewport');
                const active = document.querySelector('.book-page.active');
                return Math.abs(viewport.getBoundingClientRect().left
                    - active.getBoundingClientRect().left) < 1;
            }"""
        )
        box = page.locator(selector).bounding_box()
        assert box is not None
        assert box["height"] >= 44
        assert box["y"] + box["height"] <= visible_height
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")

    assert_action_fits("#btnNextToAmount", 480)
    page.locator("#btnNextToAmount").click()
    page.get_by_role("textbox", name="Expense amount").fill("3.50")
    assert_action_fits("#btnNextToCategory", 480)
    page.locator("#btnNextToCategory").click()
    assert page.evaluate("document.activeElement.tagName") != "INPUT"

    # Safari restores the visual viewport after dismissing the keyboard.
    page.evaluate(
        """() => {
            Object.defineProperty(window.visualViewport, 'height', {
                configurable: true, value: 852
            });
            window.visualViewport.dispatchEvent(new Event('resize'));
        }"""
    )
    expect(page.locator(".bottom-nav")).to_be_visible()
    navigation = page.locator(".bottom-nav").bounding_box()
    assert_action_fits("#btnFinalLog", navigation["y"])
    assert errors == [], f"JS errors during phone entry: {errors}"


# ---------------------------------------------------------------------------
# Expenses page (expense-list + category-chart)
# ---------------------------------------------------------------------------


def test_expenses_no_js_errors(page_with_errors, live_server):
    """Expenses page must load without any JavaScript exceptions."""
    page, errors = page_with_errors
    page.goto(live_server + "/expenses")
    page.wait_for_load_state("networkidle")
    assert errors == [], f"JS errors on /expenses: {errors}"


def test_expenses_list_card_renders(page_with_errors, live_server):
    """expense-list component must render its card wrapper."""
    page, errors = page_with_errors
    page.goto(live_server + "/expenses")
    page.wait_for_load_state("networkidle")
    assert errors == [], f"JS errors on /expenses: {errors}"
    expect(page.locator(".modern-card").first).to_be_visible()


def test_category_chart_renders(page_with_errors, live_server):
    """category-chart component must render its chart wrapper."""
    page, errors = page_with_errors
    page.goto(live_server + "/expenses")
    page.wait_for_load_state("networkidle")
    assert errors == [], f"JS errors on /expenses: {errors}"
    expect(page.locator(".chart-wrapper")).to_be_visible()


def test_expense_item_swipe_no_crash(page_with_errors, live_server, client):
    """
    Swipe setup must not crash even when no swipe-hint-btn exists.
    Regression test for:
    TypeError: Cannot read properties of null (reading 'addEventListener')
    """
    # Add a test expense so the list renders actual items
    client.post(
        "/api/expenses",
        json={
            "amount": 42.0,
            "category": "other",
            "description": "Playwright test expense",
        },
    )
    page, errors = page_with_errors
    page.goto(live_server + "/expenses")
    page.wait_for_load_state("networkidle")
    assert errors == [], f"JS crash setting up swipe handlers: {errors}"


# ---------------------------------------------------------------------------
# Add expense page
# ---------------------------------------------------------------------------


def test_add_expense_no_js_errors(page_with_errors, live_server):
    """Add expense page must load without any JavaScript exceptions."""
    page, errors = page_with_errors
    page.goto(live_server + "/add")
    page.wait_for_load_state("networkidle")
    assert errors == [], f"JS errors on /add: {errors}"


# ---------------------------------------------------------------------------
# Trends page
# ---------------------------------------------------------------------------


def test_trends_no_js_errors(page_with_errors, live_server):
    """Trends page must load without any JavaScript exceptions."""
    page, errors = page_with_errors
    page.goto(live_server + "/trends")
    page.wait_for_load_state("networkidle")
    assert errors == [], f"JS errors on /trends: {errors}"


# ---------------------------------------------------------------------------
# End-to-End User Journeys
# ---------------------------------------------------------------------------


def test_e2e_add_and_verify_expense(page_with_errors, live_server):
    """Add an expense through the wizard, then view it on Browse."""
    page, errors = page_with_errors

    # 1. Navigate to Add page
    page.goto(live_server + "/add")
    page.wait_for_load_state("networkidle")

    # 2. Fill out the form
    page.get_by_role("textbox", name="Expense description").fill("E2E Playwright Test")
    page.locator("#btnNextToAmount").click()
    page.get_by_role("textbox", name="Expense amount").fill("99.99")
    page.locator("#btnNextToCategory").click()
    page.locator('.mini-category-chip[data-category="transport"]').click()

    # 3. Submit
    with page.expect_response(
        lambda response: response.url.endswith("/api/expenses")
        and response.request.method == "POST"
    ) as saved:
        page.locator("#btnFinalLog").click()
    assert saved.value.status == 201

    # 4. The form resets for another entry.
    expect(page.get_by_role("textbox", name="Expense description")).to_have_value("")

    # 5. Navigate to Browse.
    page.goto(live_server + "/expenses")
    page.wait_for_load_state("networkidle")

    # 6. Verify the new expense is in the recent list
    expect(page.locator("text=E2E Playwright Test").first).to_be_visible()
    expect(page.locator("text=99,99").first).to_be_visible()
    assert errors == [], f"JS errors during expense entry: {errors}"


def test_e2e_add_and_verify_reimbursement(page_with_errors, live_server):
    """Simulate a user selecting reimbursement type, adding it,
    and verifying signed display on Browse."""
    page, errors = page_with_errors

    # 1. Navigate to Add page
    page.goto(live_server + "/add")
    page.wait_for_load_state("networkidle")

    # 2. Select Reimbursement type and enter description
    page.locator('.type-btn[data-type="reimbursement"]').click()
    page.get_by_role("textbox", name="Expense description").fill("Train Refund")
    page.locator("#btnNextToAmount").click()

    # 3. Enter amount
    page.get_by_role("textbox", name="Expense amount").fill("35.00")
    page.locator("#btnNextToCategory").click()

    # 4. Select category
    page.locator('.mini-category-chip[data-category="transport"]').click()

    # 5. Submit
    with page.expect_response(
        lambda response: response.url.endswith("/api/expenses")
        and response.request.method == "POST"
    ) as saved:
        page.locator("#btnFinalLog").click()
    assert saved.value.status == 201

    # 6. Navigate to Browse Page
    page.goto(live_server + "/expenses")
    page.wait_for_load_state("networkidle")

    # 7. Verify reimbursement badge and -35,00 display
    expect(page.locator("text=Train Refund").first).to_be_visible()
    expect(page.locator(".amount-reimbursement").first).to_be_visible()
    expect(page.locator(".type-badge.reimbursement").first).to_be_visible()
    assert errors == []


def test_e2e_add_and_verify_income(page_with_errors, live_server):
    """Simulate a user selecting income type, adding it,
    and verifying signed display on Browse."""
    page, errors = page_with_errors

    # 1. Navigate to Add page
    page.goto(live_server + "/add")
    page.wait_for_load_state("networkidle")

    # 2. Select Income type and enter description
    page.locator('.type-btn[data-type="income"]').click()
    page.get_by_role("textbox", name="Expense description").fill("Freelance Gig")
    page.locator("#btnNextToAmount").click()

    # 3. Enter amount
    page.get_by_role("textbox", name="Expense amount").fill("500.00")
    page.locator("#btnNextToCategory").click()

    # 4. Select category
    page.locator('.mini-category-chip[data-category="other"]').click()

    # 5. Submit
    with page.expect_response(
        lambda response: response.url.endswith("/api/expenses")
        and response.request.method == "POST"
    ) as saved:
        page.locator("#btnFinalLog").click()
    assert saved.value.status == 201

    # 6. Navigate to Browse Page
    page.goto(live_server + "/expenses")
    page.wait_for_load_state("networkidle")

    # 7. Verify income badge and +500,00 display
    expect(page.locator("text=Freelance Gig").first).to_be_visible()
    expect(page.locator(".amount-income").first).to_be_visible()
    expect(page.locator(".type-badge.income").first).to_be_visible()
    assert errors == []
