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


def test_home_expense_list_renders(page_with_errors, live_server):
    """latest-expenses component must be present and not error-state."""
    page, errors = page_with_errors
    page.goto(live_server + "/")
    page.wait_for_load_state("networkidle")
    assert errors == [], f"JS errors on /: {errors}"
    # The web component must exist in the DOM
    assert page.locator("latest-expenses").count() > 0


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
    expect(page.locator(".expense-list-card")).to_be_visible()


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
    page.goto(live_server + "/")
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
