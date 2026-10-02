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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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
