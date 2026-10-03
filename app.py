from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone, timedelta

import os
import sys
import json
import logging
import math
import functools
from werkzeug.serving import run_simple
from sqlalchemy import extract, or_, text, func, event
from sqlalchemy.engine import Engine
import sqlite3
from subprocess import run, CalledProcessError
import glob
from collections import defaultdict
from apscheduler.schedulers.background import BackgroundScheduler
from services.nlp_parser import parse_with_optional_llm

# When launched directly (`python app.py`), this module is registered in
# sys.modules only under the name "__main__". Deferred imports elsewhere
# (e.g. services/bank_sync.py does `from app import ...` inside a function,
# to dodge a circular import at load time) then find no "app" entry in
# sys.modules and re-execute this entire file under a second module
# identity — creating a second Flask app, DB engine, and BackgroundScheduler
# that independently fires the same cron jobs, racing the first instance's
# duplicate-expense checks and producing duplicate recurring expenses.
# Aliasing "app" to whichever module object is already running here makes
# later `from app import ...` calls reuse this instance instead.
sys.modules.setdefault("app", sys.modules[__name__])

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create Flask app with explicit instance path
current_dir = os.path.dirname(os.path.abspath(__file__))
instance_path = os.path.join(current_dir, "instance")
app = Flask(__name__, static_folder="static", instance_path=instance_path)

# API Authentication Configuration
API_KEY = os.environ.get("VAULT_API_KEY") or os.environ.get("EXPENSE_API_KEY")


def check_api_auth():
    """Verify API key if configured. Allows same-origin browser calls."""
    if not API_KEY:
        return True

    # Check direct API key headers
    auth_header = request.headers.get("Authorization", "")
    bearer_token = (
        auth_header[7:].strip() if auth_header.startswith("Bearer ") else None
    )
    header_key = request.headers.get("X-API-Key", "").strip() or bearer_token

    if header_key:
        return header_key == API_KEY

    # Check same-origin browser requests
    referer = request.headers.get("Referer", "")
    host = request.headers.get("Host", "")
    sec_site = request.headers.get("Sec-Fetch-Site", "")
    if sec_site in ("same-origin", "same-site") or (host and host in referer):
        return True

    return False


# Ensure instance folder exists
os.makedirs(app.instance_path, exist_ok=True)
db_path = os.path.join(app.instance_path, "expenses.db")
logger.info(f"Configuring database at: {db_path}")

# Use relative path for SQLite as it will be relative to instance_path
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///expenses.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Development settings
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.config["TEMPLATES_AUTO_RELOAD"] = True

db = SQLAlchemy(app)


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign key constraints for SQLite connections."""
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


VALID_TRANSACTION_TYPES = {"expense", "income", "reimbursement"}


class Expense(db.Model):
    """Represents a financial transaction: expense, reimbursement, or income."""

    __tablename__ = "expense"

    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    type = db.Column(
        db.String(20),
        nullable=False,
        default="expense",
        server_default="expense",
        index=True,
    )
    # Bank sync fields (added via migration script on existing DBs)
    source = db.Column(db.String(20), default="manual")
    external_id = db.Column(db.String(100), nullable=True, unique=True)
    merchant = db.Column(db.String(200), nullable=True)

    def __init__(self, **kwargs):
        """Initialize expense, defaulting type to 'expense' if omitted or None."""
        if "type" not in kwargs or kwargs["type"] is None:
            kwargs["type"] = "expense"
        super().__init__(**kwargs)

    @property
    def net_spending_contribution(self):
        """Return the signed contribution to net expenses:
        expense -> +amount
        reimbursement -> -amount
        income -> 0.0 (income is tracked separately, never reduces spending)
        """
        txn_type = self.type or "expense"
        if txn_type == "reimbursement":
            return -self.amount
        elif txn_type == "expense":
            return self.amount
        return 0.0

    @property
    def reimbursed_amount(self):
        """Sum of all reimbursement amounts allocated to this expense."""
        allocs = self.allocations_to.all()
        return round(sum(a.amount for a in allocs), 2)

    @property
    def remaining_share(self):
        """Gross cost minus reimbursed amount (net share)."""
        return max(0.0, round(self.amount - self.reimbursed_amount, 2))

    @property
    def allocated_amount(self):
        """Sum of all allocations made from this reimbursement."""
        allocs = self.allocations_from.all()
        return round(sum(a.amount for a in allocs), 2)

    @property
    def unallocated_amount(self):
        """Available reimbursement capacity not yet linked to expenses."""
        return max(0.0, round(self.amount - self.allocated_amount, 2))

    def to_dict(self, include_reconciliation=True, precomputed=None):
        """Serialize expense to dictionary with optional reconciliation fields."""
        tx_type = self.type or "expense"
        result = {
            "id": self.id,
            "amount": self.amount,
            "category": self.category,
            "description": self.description,
            "date": self.date.isoformat() if self.date else None,
            "type": tx_type,
            "source": self.source,
            "external_id": self.external_id,
            "merchant": self.merchant,
        }
        if include_reconciliation:
            if precomputed:
                reimbursed = precomputed.get("reimbursed", {}).get(self.id, 0.0)
                allocated = precomputed.get("allocated", {}).get(self.id, 0.0)
            else:
                reimbursed = self.reimbursed_amount
                allocated = self.allocated_amount

            if tx_type == "reimbursement":
                result["allocated_amount"] = round(allocated, 2)
                result["unallocated_amount"] = max(
                    0.0, round(self.amount - allocated, 2)
                )
                result["is_fully_allocated"] = (self.amount - allocated) <= 0.001
            else:
                result["gross_cost"] = self.amount
                result["reimbursed_amount"] = round(reimbursed, 2)
                result["remaining_share"] = max(0.0, round(self.amount - reimbursed, 2))
                result["is_fully_reimbursed"] = (self.amount - reimbursed) <= 0.001
        return result


class ReconciliationAllocation(db.Model):
    """Represents a financial link allocating a reimbursement to an expense."""

    __tablename__ = "reconciliation_allocation"

    id = db.Column(db.Integer, primary_key=True)
    reimbursement_id = db.Column(
        db.Integer, db.ForeignKey("expense.id", ondelete="RESTRICT"), nullable=False
    )
    expense_id = db.Column(
        db.Integer, db.ForeignKey("expense.id", ondelete="RESTRICT"), nullable=False
    )
    amount = db.Column(db.Float, nullable=False)
    counterparty = db.Column(db.String(100), nullable=True)
    notes = db.Column(db.String(255), nullable=True)
    group_id = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    reimbursement = db.relationship(
        "Expense",
        foreign_keys=[reimbursement_id],
        backref=db.backref("allocations_from", lazy="dynamic"),
    )
    expense = db.relationship(
        "Expense",
        foreign_keys=[expense_id],
        backref=db.backref("allocations_to", lazy="dynamic"),
    )

    def to_dict(self):
        """Serialize allocation with linked reimbursement and expense details."""
        return {
            "id": self.id,
            "reimbursement_id": self.reimbursement_id,
            "expense_id": self.expense_id,
            "amount": round(self.amount, 2),
            "counterparty": self.counterparty,
            "notes": self.notes,
            "group_id": self.group_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "reimbursement": (
                {
                    "id": self.reimbursement.id,
                    "amount": self.reimbursement.amount,
                    "description": self.reimbursement.description,
                    "date": (
                        self.reimbursement.date.isoformat()
                        if self.reimbursement and self.reimbursement.date
                        else None
                    ),
                    "allocated_amount": (
                        self.reimbursement.allocated_amount
                        if self.reimbursement
                        else 0.0
                    ),
                    "unallocated_amount": (
                        self.reimbursement.unallocated_amount
                        if self.reimbursement
                        else 0.0
                    ),
                }
                if self.reimbursement
                else None
            ),
            "expense": (
                {
                    "id": self.expense.id,
                    "amount": self.expense.amount,
                    "gross_cost": self.expense.amount,
                    "description": self.expense.description,
                    "category": self.expense.category,
                    "date": (
                        self.expense.date.isoformat()
                        if self.expense and self.expense.date
                        else None
                    ),
                    "reimbursed_amount": (
                        self.expense.reimbursed_amount if self.expense else 0.0
                    ),
                    "remaining_share": (
                        self.expense.remaining_share if self.expense else 0.0
                    ),
                }
                if self.expense
                else None
            ),
        }


def parse_expense_date(value):
    """Parse optional API date input.

    Accepts YYYY-MM-DD or ISO datetime strings. Returns None when no date was
    provided so existing default timestamp behaviour stays unchanged.
    """
    if not value:
        return None
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            try:
                parsed_date = datetime.strptime(raw, "%Y-%m-%d").date()
                return datetime.combine(
                    parsed_date, datetime.min.time(), tzinfo=timezone.utc
                )
            except ValueError:
                pass
    raise ValueError("Invalid date format. Expected YYYY-MM-DD or ISO datetime string")


class RecurringExpense(db.Model):
    """Represents a scheduled recurring transaction rule."""

    __tablename__ = "recurring_expense"

    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    frequency = db.Column(db.String(20), nullable=False)  # monthly, weekly, yearly
    day_of_month = db.Column(
        db.Integer, nullable=True
    )  # 1-31 for monthly, 1-7 for weekly (1=Mon)
    start_date = db.Column(db.DateTime, nullable=False)
    end_date = db.Column(db.DateTime, nullable=True)  # Optional end date
    last_applied_date = db.Column(
        db.DateTime, nullable=True
    )  # Track when last expense was created
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        """Serialize recurring expense rule to dictionary."""
        return {
            "id": self.id,
            "amount": self.amount,
            "category": self.category,
            "description": self.description,
            "frequency": self.frequency,
            "day_of_month": self.day_of_month,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "last_applied_date": (
                self.last_applied_date.isoformat() if self.last_applied_date else None
            ),
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
        }


class MerchantMapping(db.Model):
    """Keyword pattern to match against bank transaction descriptions.

    When bank sync encounters a merchant string containing `pattern`
    (case-insensitive), it automatically assigns `category` and uses
    `description` instead of the raw merchant name.
    """

    __tablename__ = "merchant_mapping"

    id = db.Column(db.Integer, primary_key=True)
    pattern = db.Column(db.String(100), nullable=False, unique=True)
    category = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        """Serialize merchant mapping to dictionary."""
        return {
            "id": self.id,
            "pattern": self.pattern,
            "category": self.category,
            "description": self.description,
            "created_at": self.created_at.isoformat(),
        }


class AppToken(db.Model):
    """Key-value store for app-level secrets like OAuth tokens."""

    __tablename__ = "app_token"

    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.Text, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class SyncLog(db.Model):
    """Audit log of each bank sync run."""

    __tablename__ = "sync_log"

    id = db.Column(db.Integer, primary_key=True)
    ran_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    status = db.Column(db.String(20), nullable=False)  # "ok", "error", "no_token"
    transactions_fetched = db.Column(db.Integer, default=0)
    transactions_inserted = db.Column(db.Integer, default=0)
    error_message = db.Column(db.Text, nullable=True)

    def to_dict(self):
        """Serialize sync log entry to dictionary."""
        return {
            "id": self.id,
            "ran_at": self.ran_at.isoformat(),
            "status": self.status,
            "transactions_fetched": self.transactions_fetched,
            "transactions_inserted": self.transactions_inserted,
            "error_message": self.error_message,
        }


def _auto_migrate_db():
    """Ensure columns like type exist and normalize negative expenses."""
    try:
        with db.engine.connect() as conn:
            table_check = conn.execute(
                text(
                    "SELECT name FROM sqlite_master "
                    "WHERE type='table' AND name='expense'"
                )
            ).fetchone()
            if table_check:
                columns = [
                    row[1]
                    for row in conn.execute(
                        text("PRAGMA table_info(expense)")
                    ).fetchall()
                ]
                if "type" not in columns:
                    conn.execute(
                        text(
                            "ALTER TABLE expense "
                            "ADD COLUMN type VARCHAR(20) DEFAULT 'expense'"
                        )
                    )
                    conn.commit()
                conn.execute(
                    text("UPDATE expense SET type = 'expense' WHERE type IS NULL")
                )
                conn.execute(
                    text(
                        "UPDATE expense SET type = 'reimbursement', "
                        "amount = ABS(amount) WHERE amount < 0 "
                        "AND (type = 'expense' OR type IS NULL)"
                    )
                )
                conn.execute(
                    text("CREATE INDEX IF NOT EXISTS ix_expense_type ON expense(type)")
                )
                conn.commit()
    except Exception as e:
        logger.warning(f"Auto-migration check note: {e}")


# Initialize database
try:
    with app.app_context():
        db.create_all()
        _auto_migrate_db()
        logger.info("Database initialized successfully")
except Exception as e:
    logger.error(f"Error initializing database: {e}")


# Function to apply due recurring expenses
def apply_due_recurring_expenses():
    """Apply recurring expenses that are due today without duplicates."""
    with app.app_context():
        try:
            today = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )

            recurring_expenses = (
                RecurringExpense.query.filter(
                    RecurringExpense.is_active.is_(True),
                    RecurringExpense.start_date <= today,
                )
                .filter(
                    (RecurringExpense.end_date.is_(None))
                    | (RecurringExpense.end_date >= today)
                )
                .all()
            )

            applied_count = 0
            for recurring in recurring_expenses:
                if is_due_today(recurring, today):
                    # Date-range dedup: reliable with SQLite naive datetime strings
                    next_day = today + timedelta(days=1)
                    existing = Expense.query.filter(
                        Expense.amount == recurring.amount,
                        Expense.category == recurring.category,
                        Expense.description == recurring.description,
                        Expense.date >= today,
                        Expense.date < next_day,
                    ).first()

                    if not existing:
                        # Create new expense
                        expense = Expense(
                            amount=recurring.amount,
                            category=recurring.category,
                            description=recurring.description,
                            date=today,
                            type="expense",
                        )
                        db.session.add(expense)
                        recurring.last_applied_date = today
                        applied_count += 1
                        logger.info(f"Applied recurring: {recurring.description}")
                    else:
                        logger.info(f"Skipping duplicate: {recurring.description}")

            db.session.commit()
            logger.info(f"Applied {applied_count} recurring expenses")
            return applied_count

        except Exception as e:
            logger.error(f"Error applying recurring expenses: {e}")
            db.session.rollback()
            return 0


def is_due_today(recurring, today):
    """Check if a recurring expense is due today.

    `today` must be a naive datetime with time zeroed to midnight.
    """
    if recurring.last_applied_date is None:
        # Far-past sentinel: let the frequency checks decide based on due day,
        # instead of firing unconditionally on first boot.
        last_applied = today.replace(year=2000, month=1, day=1)
    else:
        last_applied = recurring.last_applied_date.replace(
            hour=0, minute=0, second=0, microsecond=0
        )

    if recurring.frequency == "monthly":
        # Due if it's the specified day of month and not applied this month
        if recurring.day_of_month and today.day == recurring.day_of_month:
            return last_applied.year != today.year or last_applied.month != today.month
        return False

    elif recurring.frequency == "weekly":
        # Due if it's the specified day of week and not applied this week
        if recurring.day_of_month:  # Using day_of_month for weekday (1=Monday)
            if today.isoweekday() == recurring.day_of_month:
                days_since_last = (today - last_applied).days
                return days_since_last >= 7
        return False

    elif recurring.frequency == "yearly":
        # Due if it's the same day and month, and not applied this year
        if recurring.day_of_month and today.day == recurring.day_of_month:
            start_month = recurring.start_date.month
            if today.month == start_month:
                return last_applied.year != today.year
        return False

    return False


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def require_internal_key(f):
    """Decorator: require X-Internal-Key header matching INTERNAL_API_KEY env var."""

    @functools.wraps(f)
    def decorated(*args, **kwargs):
        """Verify internal API key header before executing endpoint."""
        expected = os.environ.get("INTERNAL_API_KEY", "")
        if not expected:
            logger.warning("INTERNAL_API_KEY not set — endpoint is unprotected!")
        provided = request.headers.get("X-Internal-Key", "")
        if expected and provided != expected:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)

    return decorated


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------


def _run_bank_sync():
    """Wrapper so APScheduler can call bank_sync without import-time circular deps."""
    try:
        from services.bank_sync import sync_transactions

        sync_transactions()
    except Exception as e:
        logger.error(f"Scheduler bank_sync error: {e}", exc_info=True)


def _should_start_scheduler():
    """Decide whether this process should run the background scheduler.

    In non-production mode, run_dev_server() enables Werkzeug's reloader,
    which re-executes this entire module in a child "worker" process while
    the original process becomes a file-watching monitor. Both processes run
    this module-level code, so without this guard each gets its own
    BackgroundScheduler with the same midnight cron job — two schedulers
    racing to apply the same due recurring expense past the (non-atomic)
    duplicate check in apply_due_recurring_expenses(), producing duplicate
    Expense rows. Werkzeug sets WERKZEUG_RUN_MAIN=true only in the worker
    process, so only that process (or a reloader-free production run) starts
    the scheduler.
    """
    return (
        os.environ.get("FLASK_ENV") == "production"
        or os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    )


scheduler = BackgroundScheduler()
scheduler.add_job(
    apply_due_recurring_expenses, "cron", hour=0, minute=0, id="apply_recurring"
)
scheduler.add_job(_run_bank_sync, "interval", hours=6, id="bank_sync")
if _should_start_scheduler():
    scheduler.start()
    logger.info("Scheduler started (recurring @ midnight, bank_sync every 6h)")
else:
    logger.info("Skipping scheduler start in reloader monitor process")


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------


@app.after_request
def add_header(response):
    """Add cache control headers to outgoing HTTP responses."""
    # Cache static assets for 1 day, but disable caching for API responses
    if request.path.startswith("/static"):
        response.headers["Cache-Control"] = "public, max-age=86400"
        response.headers["Expires"] = (
            datetime.now(timezone.utc).replace(microsecond=0)
        ).strftime("%a, %d %b %Y %H:%M:%S GMT")
    else:
        response.headers["Cache-Control"] = (
            "no-store, no-cache, must-revalidate, max-age=0"
        )
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


def is_test_environment():
    """Check if running in test/development environment."""
    return (
        os.environ.get("FLASK_ENV") == "development"
        or os.environ.get("FLASK_DEBUG") == "1"
        or app.debug
    )


def _get_git_version():
    """Get current git commit hash."""
    try:
        result = run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            cwd=current_dir,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


APP_VERSION = _get_git_version()


@app.route("/api/env")
def get_environment():
    """Return environment info for frontend (e.g., navbar badge)."""
    return jsonify({"is_test": is_test_environment(), "version": APP_VERSION})


def calculate_monthly_summary(year, month):
    """Calculate gross, reimbursement, net spending, and income for a given month."""
    month_filter = (extract("year", Expense.date) == year) & (
        extract("month", Expense.date) == month
    )
    all_month_expenses = Expense.query.filter(month_filter).all()

    gross_expenses = sum(
        e.amount for e in all_month_expenses if (e.type or "expense") == "expense"
    )
    reimbursements = sum(
        e.amount for e in all_month_expenses if e.type == "reimbursement"
    )
    net_expenses = gross_expenses - reimbursements
    income = sum(e.amount for e in all_month_expenses if e.type == "income")

    return {
        "gross_expenses": round(float(gross_expenses), 2),
        "reimbursements": round(float(reimbursements), 2),
        "net_expenses": round(float(net_expenses), 2),
        "income": round(float(income), 2),
    }


# Static file serving
@app.route("/")
def index():
    """Serve the main application dashboard."""
    return send_from_directory("static", "index.html")


@app.route("/expenses")
def serve_expenses():
    """Serve the full expenses table view."""
    return send_from_directory("static", "expenses.html")


@app.route("/add")
def serve_add():
    """Serve the transaction entry form."""
    return send_from_directory("static", "add-expense.html")


@app.route("/recurring")
def serve_recurring():
    """Serve the recurring expenses management page."""
    return send_from_directory("static", "recurring.html")


@app.route("/bank")
def serve_bank():
    """Serve bank sync page (currently disabled)."""
    return "Bank Sync is currently disabled", 404


@app.route("/trends")
def serve_trends():
    """Serve the historical trends and projection view."""
    return send_from_directory("static", "trends.html")


@app.route("/reconcile")
def serve_reconcile():
    """Serve the reimbursement reconciliation page."""
    return send_from_directory("static", "reconciliation.html")


@app.route("/styles.css")
def serve_styles():
    """Serve the core CSS bundle."""
    return send_from_directory("static/styles", "vault-theme.css", mimetype="text/css")


# ---------------------------------------------------------------------------
# API Documentation & Info
# ---------------------------------------------------------------------------


@app.route("/api/info", methods=["GET"])
def get_api_info():
    """Return API capabilities, categories, and authentication status."""
    return jsonify(
        {
            "version": APP_VERSION,
            "auth_configured": bool(API_KEY),
            "categories": CATEGORIES,
            "endpoints": {
                "quick_add": {
                    "path": "/api/expenses/quick",
                    "method": "POST",
                    "description": (
                        "Log an expense via natural language ('14.50 coffee') or JSON"
                    ),
                },
                "expenses": {
                    "path": "/api/expenses",
                    "methods": ["GET", "POST"],
                    "description": "List or create standard expenses",
                },
                "categories": {
                    "path": "/api/categories",
                    "method": "GET",
                    "description": "List all expense categories",
                },
                "months": {
                    "path": "/api/months",
                    "method": "GET",
                    "description": "List available expense months",
                },
                "trends": {
                    "path": "/api/trends",
                    "method": "GET",
                    "description": "Spending trends and month-end projections",
                },
                "reconciliation": {
                    "path": "/api/allocations",
                    "methods": ["GET", "POST"],
                    "description": "Reimbursement-to-expense allocations",
                },
            },
        }
    )


@app.route("/script.js")
def serve_script():
    """Serve legacy application JS script."""
    return send_from_directory("static", "script.js")


@app.route("/manifest.json")
def serve_manifest():
    """Serve the PWA manifest."""
    return send_from_directory("static", "manifest.json")


@app.route("/favicon.ico")
def serve_favicon():
    """Serve application favicon."""
    return send_from_directory("static", "favicon.ico")


# ---------------------------------------------------------------------------
# Expense API endpoints
# ---------------------------------------------------------------------------


@app.route("/api/expenses/quick", methods=["POST"])
def quick_add_expense():
    """Quick-add an expense using natural language text or structured fields.

    Accepts:
      {"text": "14.50 coffee at Starbucks", "parse_only": false}
      or {"amount": 14.50, "category": "food_drink", "description": "Coffee"}
    """
    if not check_api_auth():
        return (
            jsonify({"error": "Unauthorized. Provide valid X-API-Key or Bearer token"}),
            401,
        )

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data received"}), 400

        parse_only = bool(data.get("parse_only", False))
        text = str(data.get("text", "")).strip()

        if text:
            parsed = parse_with_optional_llm(text, CATEGORIES)
            amount = parsed.get("amount")
            category = data.get("category") or parsed.get("category") or "other"
            description = data.get("description") or parsed.get("description") or text
            date_val = data.get("date") or parsed.get("date")
        else:
            amount = data.get("amount")
            category = data.get("category", "other")
            description = data.get("description", "")
            date_val = data.get("date")

        if amount is None:
            return jsonify({"error": "Could not determine expense amount"}), 400

        try:
            amount = float(amount)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid amount value"}), 400

        if not category:
            category = "other"
        if not description:
            description = CATEGORIES.get(category, {}).get("label", "Expense")

        if parse_only:
            return (
                jsonify(
                    {
                        "amount": amount,
                        "category": category,
                        "description": description,
                        "date": date_val
                        or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    }
                ),
                200,
            )

        try:
            expense_date = parse_expense_date(date_val)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        expense = Expense(
            amount=amount,
            category=category,
            description=description,
            source="quick_add",
        )
        if expense_date is not None:
            expense.date = expense_date

        db.session.add(expense)
        db.session.commit()
        logger.info(f"Quick-added expense: ${amount:.2f} ({category}) - {description}")
        return jsonify(expense.to_dict()), 201

    except Exception as e:
        logger.error(f"Error in quick_add_expense: {e}", exc_info=True)
        db.session.rollback()
        return jsonify({"error": "Server error processing quick expense"}), 500


@app.route("/api/expenses", methods=["GET", "POST"])
def handle_expenses():
    """Handle expense collection: GET with filtering/pagination, POST to create."""
    if request.method == "POST":
        if not check_api_auth():
            return jsonify({"error": "Unauthorized"}), 401
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "No JSON data received"}), 400

            required_fields = ["amount", "category", "description"]
            for field in required_fields:
                if field not in data:
                    return jsonify({"error": f"{field} is required"}), 400

            try:
                amount = float(data["amount"])
            except (ValueError, TypeError):
                logger.error(f"Invalid amount value: {data.get('amount')}")
                return jsonify({"error": "Invalid amount value"}), 400

            if not math.isfinite(amount) or amount <= 0:
                return jsonify({"error": "Amount must be greater than zero"}), 400

            category = data["category"].strip()
            description = data["description"].strip()

            if not category or not description:
                return (
                    jsonify({"error": "Category and description cannot be empty"}),
                    400,
                )

            txn_type = data.get("type", "expense")
            if not isinstance(txn_type, str):
                return jsonify({"error": "Invalid transaction type"}), 400
            txn_type = txn_type.strip().lower()
            if txn_type not in VALID_TRANSACTION_TYPES:
                valid_types_str = ", ".join(sorted(VALID_TRANSACTION_TYPES))
                err_msg = (
                    f"Invalid transaction type '{txn_type}'. "
                    f"Must be one of: {valid_types_str}"
                )
                return jsonify({"error": err_msg}), 400

            try:
                expense_date = parse_expense_date(data.get("date"))
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400

            expense = Expense(
                amount=amount,
                category=category,
                description=description,
                type=txn_type,
            )
            if expense_date is not None:
                expense.date = expense_date
            db.session.add(expense)
            db.session.commit()
            logger.info(f"Added new {txn_type}: ${amount:.2f} ({category})")
            return jsonify(expense.to_dict()), 201

        except Exception as e:
            logger.error(f"Error processing POST request: {e}")
            db.session.rollback()
            return jsonify({"error": "Server error processing request"}), 500

    # GET request
    try:
        now = datetime.now(timezone.utc)
        month = int(request.args.get("month", now.month))
        year = int(request.args.get("year", now.year))
        page = request.args.get("page")
        per_page = request.args.get("per_page")
        type_filter = request.args.get("type")
        if type_filter is not None:
            type_filter = type_filter.strip().lower()
            if type_filter not in VALID_TRANSACTION_TYPES:
                return jsonify({"error": "Invalid transaction type"}), 400

        # Monthly summary for the entire month
        month_filter = (extract("year", Expense.date) == year) & (
            extract("month", Expense.date) == month
        )
        summary_data = calculate_monthly_summary(year, month)

        query = Expense.query.filter(month_filter).order_by(
            Expense.date.desc(), Expense.id.desc()
        )

        if type_filter == "expense":
            query = query.filter((Expense.type == "expense") | Expense.type.is_(None))
        elif type_filter:
            query = query.filter(Expense.type == type_filter)

        if page and per_page:
            page = int(page)
            per_page = int(per_page)
            total = query.count()
            expenses = query.offset((page - 1) * per_page).limit(per_page).all()
        else:
            expenses = query.all()
            total = len(expenses)

        # Batch load allocations for efficient serialization
        precomputed = {"reimbursed": {}, "allocated": {}}
        if expenses:
            expense_ids = [e.id for e in expenses]
            allocations = ReconciliationAllocation.query.filter(
                or_(
                    ReconciliationAllocation.expense_id.in_(expense_ids),
                    ReconciliationAllocation.reimbursement_id.in_(expense_ids),
                )
            ).all()
            reimbursed_map = defaultdict(float)
            allocated_map = defaultdict(float)
            for a in allocations:
                reimbursed_map[a.expense_id] += a.amount
                allocated_map[a.reimbursement_id] += a.amount
            precomputed["reimbursed"] = reimbursed_map
            precomputed["allocated"] = allocated_map

        return jsonify(
            {
                "expenses": [
                    expense.to_dict(precomputed=precomputed) for expense in expenses
                ],
                "month": month,
                "year": year,
                "page": int(page) if page else None,
                "per_page": int(per_page) if per_page else None,
                "total": total,
                "summary": summary_data,
                **summary_data,
            }
        )
    except Exception as e:
        logger.error(f"Error processing GET request: {e}")
        return jsonify({"error": "Server error fetching expenses"}), 500


@app.route("/api/expenses/unclassified", methods=["GET"])
def get_unclassified_expenses():
    """Expenses imported from bank sync that could not be mapped to a category."""
    try:
        expenses = (
            Expense.query.filter_by(source="bank_sync", category="other")
            .order_by(Expense.date.desc())
            .all()
        )
        return jsonify({"expenses": [e.to_dict() for e in expenses]})
    except Exception as e:
        logger.error(f"Error fetching unclassified expenses: {e}")
        return jsonify({"error": "Server error"}), 500


# Application Configuration
CATEGORIES = {
    "super": {"label": "Super", "color": "#3b82f6", "icon": "shopping_cart"},
    "xofa": {"label": "Xofa", "color": "#8b5cf6", "icon": "home"},
    "food_drink": {"label": "Food & Drink", "color": "#10b981", "icon": "restaurant"},
    "save_inv": {"label": "Save & Invest", "color": "#06b6d4", "icon": "savings"},
    "recurrent": {"label": "Recurrent", "color": "#f59e0b", "icon": "repeat"},
    "clothing": {"label": "Clothing", "color": "#ec4899", "icon": "checkroom"},
    "personal": {"label": "Personal", "color": "#a855f7", "icon": "person"},
    "taxes": {"label": "Taxes", "color": "#ef4444", "icon": "receipt_long"},
    "transport": {"label": "Transport", "color": "#6366f1", "icon": "directions_car"},
    "car": {"label": "Car", "color": "#64748b", "icon": "directions_car"},
    "health": {"label": "Health", "color": "#14b8a6", "icon": "favorite"},
    "cobeetrans": {
        "label": "Cobee Trans",
        "color": "#7c3aed",
        "icon": "directions_bus",
    },
    "cobeefood": {"label": "Cobee Food", "color": "#f97316", "icon": "local_cafe"},
    "other": {"label": "Other", "color": "#94a3b8", "icon": "more_horiz"},
}


@app.route("/api/categories", methods=["GET"])
def get_categories():
    """Return all available expense categories and their metadata."""
    return jsonify(CATEGORIES)


def _current_month_projection(now):
    """Month-end spending projection based on net spending."""
    import calendar

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_days = calendar.monthrange(now.year, now.month)[1]
    month_end = month_start.replace(day=month_days, hour=23, minute=59, second=59)
    days_elapsed = max(now.day, 1)
    days_remaining = max(month_days - now.day, 0)
    current_month = f"{now.year}-{now.month:02d}"

    def get_month_net_spending(month_str):
        """Compute gross, reimbursement, and net expenses for a YYYY-MM string."""
        gross = (
            db.session.query(func.sum(Expense.amount))
            .filter(func.strftime("%Y-%m", Expense.date) == month_str)
            .filter((Expense.type == "expense") | (Expense.type.is_(None)))
            .scalar()
            or 0.0
        )
        reimb = (
            db.session.query(func.sum(Expense.amount))
            .filter(func.strftime("%Y-%m", Expense.date) == month_str)
            .filter(Expense.type == "reimbursement")
            .scalar()
            or 0.0
        )
        return float(gross), float(reimb), float(gross - reimb)

    current_gross, current_reimb, current_net = get_month_net_spending(current_month)
    current_total = current_net

    previous_totals = []
    for i in range(1, 4):
        target_month = now.month - i
        target_year = now.year
        while target_month <= 0:
            target_month += 12
            target_year -= 1
        target_month_str = f"{target_year}-{target_month:02d}"
        _, _, prev_net = get_month_net_spending(target_month_str)
        previous_totals.append(prev_net)

    daily_average = float(current_total) / days_elapsed
    pace_projection = daily_average * month_days

    remaining_recurring = 0.0
    upcoming_recurring = []
    recurring_expenses = (
        RecurringExpense.query.filter(
            RecurringExpense.is_active.is_(True),
            RecurringExpense.frequency == "monthly",
            RecurringExpense.day_of_month.isnot(None),
            RecurringExpense.start_date <= month_end,
        )
        .filter(
            (RecurringExpense.end_date.is_(None))
            | (RecurringExpense.end_date >= month_start)
        )
        .all()
    )

    for recurring in recurring_expenses:
        due_day = min(recurring.day_of_month, month_days)
        due_date = month_start.replace(day=due_day)
        if due_date.date() <= now.date():
            continue
        existing = Expense.query.filter(
            Expense.amount == recurring.amount,
            Expense.category == recurring.category,
            Expense.description == recurring.description,
            extract("year", Expense.date) == now.year,
            extract("month", Expense.date) == now.month,
            extract("day", Expense.date) == due_day,
        ).first()
        if existing:
            continue
        remaining_recurring += float(recurring.amount)
        upcoming_recurring.append(
            {
                "description": recurring.description,
                "amount": float(recurring.amount),
                "day": due_day,
            }
        )

    projected_total = pace_projection + remaining_recurring
    previous_average = (
        sum(previous_totals) / len(previous_totals) if previous_totals else 0.0
    )
    delta_vs_average = (
        ((projected_total - previous_average) / previous_average) * 100
        if previous_average > 0
        else None
    )

    if days_elapsed < 7:
        confidence = "low"
    elif days_elapsed < 15:
        confidence = "medium"
    else:
        confidence = "high"

    return {
        "metric": "net_spending",
        "metric_label": "Net Spending",
        "current_total": float(current_total),
        "gross_expenses": float(current_gross),
        "reimbursements": float(current_reimb),
        "net_expenses": float(current_net),
        "daily_average": float(daily_average),
        "pace_projection": float(pace_projection),
        "remaining_recurring": float(remaining_recurring),
        "projected_total": float(projected_total),
        "previous_month_total": previous_totals[0] if previous_totals else 0.0,
        "previous_3_month_average": float(previous_average),
        "delta_vs_average": delta_vs_average,
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "month_days": month_days,
        "confidence": confidence,
        "upcoming_recurring": upcoming_recurring[:5],
        "generated_at": now.isoformat(),
    }


@app.route("/api/trends", methods=["GET"])
def get_trends():
    """Return weekly/monthly spending trends and month-end projection."""
    try:
        import calendar

        now = datetime.now()

        def period_data(start, end, include_top=False):
            """Aggregate spending by category and net spending for a date window."""
            # Expense by category
            expense_rows = (
                db.session.query(Expense.category, func.sum(Expense.amount))
                .filter(Expense.date >= start, Expense.date <= end)
                .filter((Expense.type == "expense") | (Expense.type.is_(None)))
                .group_by(Expense.category)
                .all()
            )
            cat_expenses = {cat: float(total) for cat, total in expense_rows}
            gross_expenses = sum(cat_expenses.values())

            # Reimbursements by category
            reimb_rows = (
                db.session.query(Expense.category, func.sum(Expense.amount))
                .filter(Expense.date >= start, Expense.date <= end)
                .filter(Expense.type == "reimbursement")
                .group_by(Expense.category)
                .all()
            )
            cat_reimbs = {cat: float(total) for cat, total in reimb_rows}
            reimbursements = sum(cat_reimbs.values())

            # Income in period (tracked separately, never reduces category spending)
            income_total = (
                db.session.query(func.sum(Expense.amount))
                .filter(Expense.date >= start, Expense.date <= end)
                .filter(Expense.type == "income")
                .scalar()
                or 0.0
            )
            income = float(income_total)

            net_expenses = gross_expenses - reimbursements

            # Net categories: reimbursements reduce category spending;
            # income never reduces category spending
            categories = {}
            all_cats = set(cat_expenses.keys()) | set(cat_reimbs.keys())
            for cat in all_cats:
                net_cat = cat_expenses.get(cat, 0.0) - cat_reimbs.get(cat, 0.0)
                if net_cat != 0:
                    categories[cat] = round(float(net_cat), 2)

            result = {
                "total": round(float(net_expenses), 2),
                "net_expenses": round(float(net_expenses), 2),
                "gross_expenses": round(float(gross_expenses), 2),
                "reimbursements": round(float(reimbursements), 2),
                "income": round(float(income), 2),
                "categories": categories,
            }
            if include_top:
                top = (
                    db.session.query(Expense)
                    .filter(Expense.date >= start, Expense.date <= end)
                    .filter((Expense.type == "expense") | (Expense.type.is_(None)))
                    .order_by(Expense.amount.desc())
                    .limit(5)
                    .all()
                )
                result["top_expenses"] = [
                    {
                        "amount": float(e.amount),
                        "category": e.category,
                        "description": e.description,
                        "date": e.date.strftime("%Y-%m-%d"),
                        "type": e.type or "expense",
                    }
                    for e in top
                ]
            return result

        monthly_data = []
        for i in range(4):
            target_month = now.month - i
            target_year = now.year
            if target_month <= 0:
                target_month += 12
                target_year -= 1
            label = f"{target_month:02d}/{str(target_year)[-2:]}"
            last_day = calendar.monthrange(target_year, target_month)[1]
            start_str = f"{target_year}-{target_month:02d}-01 00:00:00"
            end_str = f"{target_year}-{target_month:02d}-{last_day:02d} 23:59:59"
            data = period_data(start_str, end_str, include_top=(i == 0))
            monthly_data.insert(0, {"label": label, **data})

        weekly_data = []
        labels = ["This Week", "Last Week", "2 Weeks Ago", "3 Weeks Ago"]
        for i in range(4):
            end_date = now - timedelta(days=i * 7)
            start_date = end_date - timedelta(days=6)
            start_str = start_date.strftime("%Y-%m-%d 00:00:00")
            end_str = end_date.strftime("%Y-%m-%d 23:59:59")
            data = period_data(start_str, end_str, include_top=(i == 0))
            weekly_data.insert(0, {"label": labels[i], **data})

        projection = _current_month_projection(now)

        return jsonify(
            {"weekly": weekly_data, "monthly": monthly_data, "projection": projection}
        )
    except Exception as e:
        logger.error(f"Error fetching trends: {e}")
        return jsonify({"error": "Server error fetching trends"}), 500


@app.route("/api/months", methods=["GET"])
def get_months():
    """Return distinct year and month combinations that contain transactions."""
    try:
        results = (
            db.session.query(
                extract("year", Expense.date).label("year"),
                extract("month", Expense.date).label("month"),
            )
            .distinct()
            .order_by(text("year DESC"), text("month DESC"))
            .all()
        )

        months = [
            {"year": int(r.year), "month": int(r.month)}
            for r in results
            if r.year and r.month
        ]

        return jsonify(months)
    except Exception as e:
        logger.error(f"Error fetching months: {e}")
        return jsonify({"error": "Server error fetching months"}), 500


@app.route("/api/expenses/<int:expense_id>", methods=["GET", "PUT", "DELETE"])
def handle_single_expense(expense_id):
    """Handle single expense operations: GET, PUT, DELETE with reconciliation safety."""
    if request.method in ("PUT", "DELETE") and not check_api_auth():
        return jsonify({"error": "Unauthorized"}), 401
    expense = Expense.query.get_or_404(expense_id)

    if request.method == "GET":
        return jsonify(expense.to_dict())

    elif request.method == "DELETE":
        try:
            from_count = expense.allocations_from.count()
            to_count = expense.allocations_to.count()
            total_allocations = from_count + to_count
            force = request.args.get("force", "false").lower() == "true"

            if total_allocations > 0 and not force:
                role = "reimbursement" if from_count > 0 else "expense"
                return (
                    jsonify(
                        {
                            "error": (
                                f"Cannot delete {role} #{expense_id}: "
                                f"it has {total_allocations} active reconciliation "
                                "allocation(s). Please remove all allocations first "
                                "or use ?force=true."
                            ),
                            "requiresForce": True,
                        }
                    ),
                    400,
                )

            if total_allocations > 0 and force:
                for a in expense.allocations_from.all():
                    db.session.delete(a)
                for a in expense.allocations_to.all():
                    db.session.delete(a)

            db.session.delete(expense)
            db.session.commit()
            logger.info(f"Deleted expense {expense_id}")
            return "", 204

        except Exception as e:
            logger.error(f"Error deleting expense {expense_id}: {e}")
            db.session.rollback()
            return jsonify({"error": "Server error deleting expense"}), 500

    elif request.method == "PUT":
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "No JSON data received"}), 400

            try:
                amount = float(data["amount"])
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid amount value"}), 400

            if not math.isfinite(amount) or amount <= 0:
                return jsonify({"error": "Amount must be greater than zero"}), 400

            category = data["category"].strip()
            description = data["description"].strip()

            if not category or not description:
                return (
                    jsonify({"error": "Category and description cannot be empty"}),
                    400,
                )

            # Safety checks for amount reduction
            if expense.type == "reimbursement":
                total_allocated = sum(a.amount for a in expense.allocations_from.all())
                if round(amount, 2) < round(total_allocated, 2) - 0.001:
                    return (
                        jsonify(
                            {
                                "error": (
                                    f"Cannot reduce reimbursement amount to "
                                    f"{amount:.2f}: total allocated amount "
                                    f"is {total_allocated:.2f}."
                                )
                            }
                        ),
                        400,
                    )
            else:
                total_reimbursed = sum(a.amount for a in expense.allocations_to.all())
                if round(amount, 2) < round(total_reimbursed, 2) - 0.001:
                    return (
                        jsonify(
                            {
                                "error": (
                                    f"Cannot reduce expense amount to {amount:.2f}: "
                                    f"already received {total_reimbursed:.2f} "
                                    "in reimbursements."
                                )
                            }
                        ),
                        400,
                    )

            # Safety checks for type change
            if "type" in data:
                txn_type = data["type"]
                if not isinstance(txn_type, str):
                    return jsonify({"error": "Invalid transaction type"}), 400
                new_type = txn_type.strip().lower()
                if new_type not in VALID_TRANSACTION_TYPES:
                    valid_types_str = ", ".join(sorted(VALID_TRANSACTION_TYPES))
                    return (
                        jsonify(
                            {
                                "error": (
                                    f"Invalid transaction type '{new_type}'. "
                                    f"Must be one of: {valid_types_str}"
                                )
                            }
                        ),
                        400,
                    )
                if (
                    expense.type == "reimbursement"
                    and new_type != "reimbursement"
                    and expense.allocations_from.count() > 0
                ):
                    return (
                        jsonify(
                            {
                                "error": (
                                    "Cannot change transaction type while it has "
                                    "active allocations as a reimbursement."
                                )
                            }
                        ),
                        400,
                    )
                if (
                    expense.type == "expense"
                    and new_type != "expense"
                    and expense.allocations_to.count() > 0
                ):
                    return (
                        jsonify(
                            {
                                "error": (
                                    "Cannot change transaction type while it has "
                                    "active reimbursements linked to it."
                                )
                            }
                        ),
                        400,
                    )
                expense.type = new_type

            expense.amount = amount
            expense.category = category
            expense.description = description
            if "date" in data:
                try:
                    expense_date = parse_expense_date(data.get("date"))
                except ValueError as exc:
                    return jsonify({"error": str(exc)}), 400
                if expense_date is not None:
                    expense.date = expense_date

            db.session.commit()
            logger.info(f"Updated expense {expense_id}: ${amount:.2f} ({category})")
            return jsonify(expense.to_dict())

        except Exception as e:
            logger.error(f"Error updating expense {expense_id}: {e}")
            db.session.rollback()
            return jsonify({"error": "Server error updating expense"}), 500


# ---------------------------------------------------------------------------
# Reconciliation Allocations API
# ---------------------------------------------------------------------------


@app.route("/api/allocations", methods=["GET", "POST"])
@app.route("/api/reconciliations", methods=["GET", "POST"])
def handle_allocations():
    """Handle reconciliation allocations: GET list with filters, POST to create link."""
    if request.method == "POST":
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "No JSON data received"}), 400

            reimbursement_id = data.get("reimbursement_id")
            expense_id = data.get("expense_id")
            raw_amount = data.get("amount")
            counterparty = (data.get("counterparty") or "").strip() or None
            notes = (data.get("notes") or "").strip() or None
            group_id = (data.get("group_id") or "").strip() or None

            if reimbursement_id is None or expense_id is None or raw_amount is None:
                return (
                    jsonify(
                        {
                            "error": (
                                "reimbursement_id, expense_id, and amount "
                                "are required"
                            )
                        }
                    ),
                    400,
                )

            try:
                reimbursement_id = int(reimbursement_id)
                expense_id = int(expense_id)
                amount = round(float(raw_amount), 2)
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid IDs or amount"}), 400

            if not math.isfinite(amount) or amount <= 0:
                return (
                    jsonify({"error": "Allocation amount must be greater than zero"}),
                    400,
                )

            if reimbursement_id == expense_id:
                return (
                    jsonify({"error": "Cannot allocate a transaction to itself"}),
                    400,
                )

            reimbursement = db.session.get(Expense, reimbursement_id)
            if not reimbursement:
                return (
                    jsonify(
                        {
                            "error": (
                                f"Reimbursement transaction {reimbursement_id} "
                                "not found"
                            )
                        }
                    ),
                    404,
                )

            expense = db.session.get(Expense, expense_id)
            if not expense:
                return (
                    jsonify({"error": f"Expense transaction {expense_id} not found"}),
                    404,
                )

            if (expense.type or "expense") != "expense":
                return jsonify({"error": "Allocation target must be an expense"}), 400
            if expense.allocations_from.count() > 0:
                return (
                    jsonify(
                        {
                            "error": (
                                "A reimbursement transaction cannot be "
                                "allocated as an expense"
                            )
                        }
                    ),
                    400,
                )
            if reimbursement.type != "reimbursement":
                return (
                    jsonify({"error": "Allocation source must be a reimbursement"}),
                    400,
                )
            if reimbursement.allocations_to.count() > 0:
                return (
                    jsonify(
                        {"error": "A reimbursed expense cannot act as a reimbursement"}
                    ),
                    400,
                )

            # Check reimbursement capacity
            current_allocated = sum(
                a.amount for a in reimbursement.allocations_from.all()
            )
            available_reimbursement = round(reimbursement.amount - current_allocated, 2)
            if (
                round(current_allocated + amount, 2)
                > round(reimbursement.amount, 2) + 0.001
            ):
                return (
                    jsonify(
                        {
                            "error": (
                                f"Allocation amount ({amount:.2f}) exceeds "
                                f"available reimbursement capacity "
                                f"({available_reimbursement:.2f}). Total allocations "
                                f"cannot exceed reimbursement amount "
                                f"({reimbursement.amount:.2f})."
                            )
                        }
                    ),
                    400,
                )

            # Check expense capacity
            current_reimbursed = sum(a.amount for a in expense.allocations_to.all())
            remaining_expense_share = round(expense.amount - current_reimbursed, 2)
            if round(current_reimbursed + amount, 2) > round(expense.amount, 2) + 0.001:
                return (
                    jsonify(
                        {
                            "error": (
                                f"Allocation amount ({amount:.2f}) exceeds expense "
                                f"remaining share ({remaining_expense_share:.2f}). "
                                f"Total reimbursements cannot exceed expense amount "
                                f"({expense.amount:.2f})."
                            )
                        }
                    ),
                    400,
                )

            allocation = ReconciliationAllocation(
                reimbursement_id=reimbursement_id,
                expense_id=expense_id,
                amount=amount,
                counterparty=counterparty,
                notes=notes,
                group_id=group_id,
            )
            db.session.add(allocation)
            db.session.commit()
            logger.info(
                f"Created allocation #{allocation.id}: ${amount:.2f} "
                f"from #{reimbursement_id} to #{expense_id}"
            )
            return jsonify(allocation.to_dict()), 201

        except Exception as e:
            logger.error(f"Error creating allocation: {e}")
            db.session.rollback()
            return jsonify({"error": "Server error creating allocation"}), 500

    # GET request
    try:
        reimbursement_id = request.args.get("reimbursement_id")
        expense_id = request.args.get("expense_id")
        group_id = request.args.get("group_id")
        month = request.args.get("month")
        year = request.args.get("year")

        query = ReconciliationAllocation.query.order_by(
            ReconciliationAllocation.created_at.desc()
        )

        if reimbursement_id:
            query = query.filter(
                ReconciliationAllocation.reimbursement_id == int(reimbursement_id)
            )
        if expense_id:
            query = query.filter(ReconciliationAllocation.expense_id == int(expense_id))
        if group_id:
            query = query.filter(ReconciliationAllocation.group_id == group_id)

        if month and year:
            m = int(month)
            y = int(year)
            query = query.join(
                Expense, ReconciliationAllocation.expense_id == Expense.id
            ).filter(
                extract("month", Expense.date) == m,
                extract("year", Expense.date) == y,
            )

        allocations = query.all()
        return jsonify(
            {
                "allocations": [a.to_dict() for a in allocations],
                "total": len(allocations),
            }
        )
    except Exception as e:
        logger.error(f"Error fetching allocations: {e}")
        return jsonify({"error": "Server error fetching allocations"}), 500


@app.route("/api/allocations/<int:allocation_id>", methods=["GET", "PUT", "DELETE"])
@app.route("/api/reconciliations/<int:allocation_id>", methods=["GET", "PUT", "DELETE"])
def handle_single_allocation(allocation_id):
    """Handle single allocation: GET details, PUT update, DELETE link."""
    allocation = ReconciliationAllocation.query.get_or_404(allocation_id)
    try:
        if request.method == "GET":
            return jsonify(allocation.to_dict())

        elif request.method == "DELETE":
            db.session.delete(allocation)
            db.session.commit()
            logger.info(f"Deleted allocation {allocation_id}")
            return "", 204

        elif request.method == "PUT":
            data = request.get_json()
            if not data:
                return jsonify({"error": "No JSON data received"}), 400

            if "amount" in data:
                try:
                    new_amount = round(float(data["amount"]), 2)
                except (ValueError, TypeError):
                    return jsonify({"error": "Invalid amount value"}), 400

                if not math.isfinite(new_amount) or new_amount <= 0:
                    return (
                        jsonify(
                            {"error": "Allocation amount must be greater than zero"}
                        ),
                        400,
                    )

                # Check reimbursement capacity
                other_allocated = sum(
                    a.amount
                    for a in allocation.reimbursement.allocations_from.all()
                    if a.id != allocation.id
                )
                avail_reimb = round(
                    allocation.reimbursement.amount - other_allocated, 2
                )
                if (
                    round(other_allocated + new_amount, 2)
                    > round(allocation.reimbursement.amount, 2) + 0.001
                ):
                    return (
                        jsonify(
                            {
                                "error": (
                                    f"Allocation amount ({new_amount:.2f}) exceeds "
                                    f"available reimbursement capacity "
                                    f"({avail_reimb:.2f}). Total allocations cannot "
                                    f"exceed reimbursement amount "
                                    f"({allocation.reimbursement.amount:.2f})."
                                )
                            }
                        ),
                        400,
                    )

                # Check expense capacity
                other_reimbursed = sum(
                    a.amount
                    for a in allocation.expense.allocations_to.all()
                    if a.id != allocation.id
                )
                rem_share = round(allocation.expense.amount - other_reimbursed, 2)
                if (
                    round(other_reimbursed + new_amount, 2)
                    > round(allocation.expense.amount, 2) + 0.001
                ):
                    return (
                        jsonify(
                            {
                                "error": (
                                    f"Allocation amount ({new_amount:.2f}) exceeds "
                                    f"expense remaining share ({rem_share:.2f}). "
                                    f"Total reimbursements cannot exceed expense "
                                    f"amount ({allocation.expense.amount:.2f})."
                                )
                            }
                        ),
                        400,
                    )

                allocation.amount = new_amount

            if "counterparty" in data:
                allocation.counterparty = (data["counterparty"] or "").strip() or None
            if "notes" in data:
                allocation.notes = (data["notes"] or "").strip() or None
            if "group_id" in data:
                allocation.group_id = (data["group_id"] or "").strip() or None

            allocation.updated_at = datetime.now(timezone.utc)
            db.session.commit()
            logger.info(f"Updated allocation {allocation_id}")
            return jsonify(allocation.to_dict())

    except Exception as e:
        logger.error(f"Error handling allocation {allocation_id}: {e}")
        db.session.rollback()
        return jsonify({"error": "Server error processing allocation"}), 500


@app.route("/api/expenses/<int:expense_id>/reconciliation", methods=["GET"])
def get_expense_reconciliation(expense_id):
    """Return reconciliation details and links for a specific transaction."""
    expense = Expense.query.get_or_404(expense_id)
    try:
        if expense.type == "reimbursement":
            allocations = [a.to_dict() for a in expense.allocations_from.all()]
            return jsonify(
                {
                    "transaction": expense.to_dict(),
                    "allocated_amount": expense.allocated_amount,
                    "unallocated_amount": expense.unallocated_amount,
                    "allocations": allocations,
                }
            )
        else:
            allocations = [a.to_dict() for a in expense.allocations_to.all()]
            return jsonify(
                {
                    "transaction": expense.to_dict(),
                    "gross_cost": expense.amount,
                    "reimbursed_amount": expense.reimbursed_amount,
                    "remaining_share": expense.remaining_share,
                    "allocations": allocations,
                }
            )
    except Exception as e:
        logger.error(f"Error fetching reconciliation for expense {expense_id}: {e}")
        return jsonify({"error": "Server error"}), 500


@app.route("/api/reconciliation/summary", methods=["GET"])
@app.route("/api/reconciliations/summary", methods=["GET"])
@app.route("/api/allocations/summary", methods=["GET"])
def get_reconciliation_summary():
    """Return reconciliation summary with unmatched reimbursements and suggestions."""
    try:
        month = request.args.get("month")
        year = request.args.get("year")

        # Unmatched reimbursements (capacity > 0)
        reimbursements = (
            Expense.query.filter(Expense.type == "reimbursement")
            .order_by(Expense.date.desc())
            .all()
        )
        unmatched_reimbursements = []
        for r in reimbursements:
            unalloc = r.unallocated_amount
            if unalloc > 0.001:
                r_dict = r.to_dict()
                r_dict["allocations"] = [a.to_dict() for a in r.allocations_from.all()]
                unmatched_reimbursements.append(r_dict)

        # Expenses
        expenses_query = Expense.query.filter(Expense.type == "expense")
        if year and month:
            expenses_query = expenses_query.filter(
                extract("year", Expense.date) == int(year),
                extract("month", Expense.date) == int(month),
            )
        expenses = expenses_query.order_by(Expense.date.desc()).all()

        # Batch load allocations for expenses
        expense_ids = [e.id for e in expenses]
        allocations = (
            ReconciliationAllocation.query.filter(
                ReconciliationAllocation.expense_id.in_(expense_ids)
            ).all()
            if expense_ids
            else []
        )
        reimbursed_map = defaultdict(float)
        allocations_to_map = defaultdict(list)
        for a in allocations:
            reimbursed_map[a.expense_id] += a.amount
            allocations_to_map[a.expense_id].append(a.to_dict())

        partially_reimbursed = []
        unreimbursed = []
        expense_cache = {}
        for e in expenses:
            reimbursed = round(reimbursed_map[e.id], 2)
            rem = max(0.0, round(e.amount - reimbursed, 2))
            e_dict = e.to_dict(
                precomputed={"reimbursed": reimbursed_map, "allocated": {}}
            )
            expense_cache[e.id] = (e_dict, rem)
            if reimbursed > 0.001 and rem > 0.001:
                e_copy = dict(e_dict)
                e_copy["allocations"] = allocations_to_map[e.id]
                partially_reimbursed.append(e_copy)
            elif reimbursed <= 0.001:
                unreimbursed.append(e_dict)

        # Smart suggestions
        suggestions = []
        for r in unmatched_reimbursements:
            r_unalloc = r["unallocated_amount"]
            r_date = datetime.fromisoformat(r["date"]) if r.get("date") else None
            r_desc = r["description"].lower()

            for e in expenses:
                e_dict, rem_share = expense_cache[e.id]
                if rem_share <= 0.001 or e.id == r["id"]:
                    continue

                score = 0
                reasons = []
                suggested_amount = min(r_unalloc, rem_share)

                # 1. Exact amount match
                if abs(rem_share - r_unalloc) < 0.01:
                    score += 50
                    reasons.append(f"Exact amount match (€{r_unalloc:.2f})")
                # 2. 50/50 split of gross expense
                elif abs(e.amount * 0.5 - r_unalloc) < 0.01:
                    score += 40
                    reasons.append(f"50% split of €{e.amount:.2f}")
                elif r_unalloc <= rem_share:
                    score += 15

                # 3. Date proximity
                if r_date and e.date:
                    r_naive = r_date.replace(tzinfo=None)
                    e_naive = e.date.replace(tzinfo=None)
                    day_diff = abs((r_naive - e_naive).days)
                    if day_diff <= 3:
                        score += 30
                        reasons.append(f"Within {day_diff} day(s)")
                    elif day_diff <= 14:
                        score += 15
                        reasons.append(f"Within {day_diff} days")

                # 4. Text keyword matching
                e_desc = e.description.lower()
                common_words = set(w for w in r_desc.split() if len(w) > 3) & set(
                    w for w in e_desc.split() if len(w) > 3
                )
                if common_words:
                    score += 25
                    kw_str = ", ".join(sorted(common_words))
                    reasons.append(f"Shared keywords: {kw_str}")

                if score >= 30:
                    suggestions.append(
                        {
                            "reimbursement_id": r["id"],
                            "reimbursement": r,
                            "expense_id": e.id,
                            "expense": e_dict,
                            "suggested_amount": round(suggested_amount, 2),
                            "score": score,
                            "confidence": "high" if score >= 60 else "medium",
                            "reasons": reasons,
                        }
                    )

        suggestions.sort(key=lambda s: s["score"], reverse=True)

        return jsonify(
            {
                "unmatched_reimbursements": unmatched_reimbursements,
                "partially_reimbursed_expenses": partially_reimbursed,
                "unreimbursed_expenses": unreimbursed[:30],
                "suggestions": suggestions[:15],
                "total_unallocated_reimbursements": round(
                    sum(r["unallocated_amount"] for r in unmatched_reimbursements), 2
                ),
                "total_partially_reimbursed_remaining": round(
                    sum(e["remaining_share"] for e in partially_reimbursed), 2
                ),
            }
        )
    except Exception as e:
        logger.error(f"Error fetching reconciliation summary: {e}", exc_info=True)
        return jsonify({"error": "Server error fetching summary"}), 500


@app.route("/api/summary", methods=["GET"])
@app.route("/api/expenses/summary", methods=["GET"])
def get_monthly_summary():
    """Monthly summary exposing gross, reimbursements, net, and income."""
    try:
        now = datetime.now(timezone.utc)
        month = int(request.args.get("month", now.month))
        year = int(request.args.get("year", now.year))

        summary_data = calculate_monthly_summary(year, month)

        return jsonify(
            {
                "month": month,
                "year": year,
                "gross_expenses": summary_data["gross_expenses"],
                "reimbursements": summary_data["reimbursements"],
                "net_expenses": summary_data["net_expenses"],
                "income": summary_data["income"],
            }
        )
    except Exception as e:
        logger.error(f"Error fetching monthly summary: {e}")
        return jsonify({"error": "Server error fetching summary"}), 500


# ---------------------------------------------------------------------------
# Backup API
# ---------------------------------------------------------------------------


@app.route("/api/backup", methods=["POST"])
def backup_database():
    """Trigger CSV database export backup."""
    try:
        result = run(
            ["python3", "scripts/database/export_csv.py"],
            capture_output=True,
            text=True,
            check=True,
        )
        return jsonify({"success": True, "message": result.stdout.strip()}), 200
    except CalledProcessError as e:
        return jsonify({"success": False, "error": e.stderr.strip() or str(e)}), 500


@app.route("/api/backup/download", methods=["GET"])
def download_backup():
    """Generate and stream latest database CSV export."""
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(current_dir, "scripts", "database", "export_csv.py")

        run(
            ["python3", script_path],
            cwd=current_dir,
            capture_output=True,
            text=True,
            check=True,
        )
    except CalledProcessError as e:
        return jsonify({"success": False, "error": e.stderr.strip() or str(e)}), 500

    export_dir = os.path.join(current_dir, "scripts", "database", "exports")
    files = sorted(
        glob.glob(os.path.join(export_dir, "expenses_*.csv")),
        key=lambda x: os.path.getmtime(x),
        reverse=True,
    )

    if not files:
        return jsonify({"success": False, "error": "No backup file found."}), 500

    latest_file = files[0]
    filename = os.path.basename(latest_file)

    return send_file(
        latest_file, as_attachment=True, download_name=filename, mimetype="text/csv"
    )


# Recurring expense API endpoints
@app.route("/api/recurring", methods=["GET", "POST"])
def handle_recurring_expenses():
    """Handle recurring expense templates: GET all, POST to create."""
    if request.method == "POST":
        try:
            data = request.get_json()
            if data is None:
                return jsonify({"error": "No JSON data received"}), 400

            # Validate required fields
            required_fields = [
                "amount",
                "category",
                "description",
                "frequency",
                "start_date",
            ]
            for field in required_fields:
                if field not in data:
                    return (
                        jsonify({"error": f"{field.capitalize()} field is required"}),
                        400,
                    )

            # Validate amount
            try:
                amount = float(data["amount"])
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid amount value"}), 400

            # Validate frequency
            valid_frequencies = ["monthly", "weekly", "yearly"]
            if data["frequency"] not in valid_frequencies:
                return jsonify({"error": "Invalid frequency"}), 400

            # Parse dates
            try:
                start_date = datetime.fromisoformat(
                    data["start_date"].replace("Z", "+00:00")
                )
            except (ValueError, AttributeError):
                return jsonify({"error": "Invalid start_date format"}), 400

            end_date = None
            if data.get("end_date"):
                try:
                    end_date = datetime.fromisoformat(
                        data["end_date"].replace("Z", "+00:00")
                    )
                except (ValueError, AttributeError):
                    return jsonify({"error": "Invalid end_date format"}), 400

            # Create recurring expense
            recurring = RecurringExpense(
                amount=amount,
                category=data["category"].strip(),
                description=data["description"].strip(),
                frequency=data["frequency"],
                day_of_month=data.get("day_of_month"),
                start_date=start_date,
                end_date=end_date,
                is_active=data.get("is_active", True),
            )

            db.session.add(recurring)
            db.session.commit()
            logger.info(
                f"Created recurring expense: {recurring.description} (${amount})"
            )
            return jsonify(recurring.to_dict()), 201

        except Exception as e:
            logger.error(f"Error creating recurring expense: {e}")
            db.session.rollback()
            return jsonify({"error": "Server error creating recurring expense"}), 500

    # GET request
    try:
        recurring_expenses = RecurringExpense.query.order_by(
            RecurringExpense.created_at.desc()
        ).all()
        return jsonify(
            {"recurring_expenses": [r.to_dict() for r in recurring_expenses]}
        )
    except Exception as e:
        logger.error(f"Error fetching recurring expenses: {e}")
        return jsonify({"error": "Server error fetching recurring expenses"}), 500


@app.route("/api/recurring/<int:recurring_id>", methods=["GET", "PUT", "DELETE"])
def handle_recurring_expense(recurring_id):
    """Handle single recurring expense: GET, PUT update, DELETE."""
    try:
        recurring = RecurringExpense.query.get_or_404(recurring_id)

        if request.method == "GET":
            return jsonify(recurring.to_dict())

        elif request.method == "DELETE":
            db.session.delete(recurring)
            db.session.commit()
            logger.info(f"Deleted recurring expense {recurring_id}")
            return "", 204

        elif request.method == "PUT":
            data = request.get_json()
            if data is None:
                return jsonify({"error": "No JSON data received"}), 400

            # Update fields if provided
            if "amount" in data:
                try:
                    recurring.amount = float(data["amount"])
                except (ValueError, TypeError):
                    return jsonify({"error": "Invalid amount value"}), 400

            if "category" in data:
                recurring.category = data["category"].strip()

            if "description" in data:
                recurring.description = data["description"].strip()

            if "frequency" in data:
                if data["frequency"] not in ["monthly", "weekly", "yearly"]:
                    return jsonify({"error": "Invalid frequency"}), 400
                recurring.frequency = data["frequency"]

            if "day_of_month" in data:
                recurring.day_of_month = data["day_of_month"]

            if "start_date" in data:
                try:
                    recurring.start_date = datetime.fromisoformat(
                        data["start_date"].replace("Z", "+00:00")
                    )
                except (ValueError, AttributeError):
                    return jsonify({"error": "Invalid start_date format"}), 400

            if "end_date" in data:
                if data["end_date"]:
                    try:
                        recurring.end_date = datetime.fromisoformat(
                            data["end_date"].replace("Z", "+00:00")
                        )
                    except (ValueError, AttributeError):
                        return jsonify({"error": "Invalid end_date format"}), 400
                else:
                    recurring.end_date = None

            if "is_active" in data:
                recurring.is_active = bool(data["is_active"])

            db.session.commit()
            logger.info(f"Updated recurring expense {recurring_id}")
            return jsonify(recurring.to_dict())

    except Exception as e:
        logger.error(f"Error handling recurring expense {recurring_id}: {e}")
        db.session.rollback()
        return jsonify({"error": "Server error"}), 500


@app.route("/api/recurring/apply", methods=["POST"])
def manually_apply_recurring():
    """Manually trigger application of due recurring expenses."""
    try:
        count = apply_due_recurring_expenses()
        return jsonify({"success": True, "applied": count})
    except Exception as e:
        logger.error(f"Error manually applying recurring expenses: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/recurring/pending", methods=["GET"])
def get_pending_recurring():
    """Preview which recurring expenses would be applied today."""
    try:
        today = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        recurring_expenses = (
            RecurringExpense.query.filter(
                RecurringExpense.is_active.is_(True),
                RecurringExpense.start_date <= today,
            )
            .filter(
                (RecurringExpense.end_date.is_(None))
                | (RecurringExpense.end_date >= today)
            )
            .all()
        )

        pending = []
        for recurring in recurring_expenses:
            if is_due_today(recurring, today):
                # Check for duplicate
                existing = Expense.query.filter(
                    Expense.amount == recurring.amount,
                    Expense.category == recurring.category,
                    Expense.description == recurring.description,
                    extract("year", Expense.date) == today.year,
                    extract("month", Expense.date) == today.month,
                    extract("day", Expense.date) == today.day,
                ).first()

                if not existing:
                    pending.append(recurring.to_dict())

        return jsonify({"pending": pending})
    except Exception as e:
        logger.error(f"Error getting pending recurring expenses: {e}")
        return jsonify({"error": "Server error"}), 500


# ---------------------------------------------------------------------------
# Bank OAuth + sync API
# ---------------------------------------------------------------------------


@app.route("/api/bank/auth-url", methods=["GET"])
def bank_auth_url():
    """Generate and return the Enable Banking OAuth authorization URL."""
    try:
        from services.enable_banking import get_auth_url

        url = get_auth_url()
        return jsonify({"url": url})
    except Exception as e:
        logger.error(f"Error generating bank auth URL: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/bank/callback", methods=["GET", "POST"])
def bank_callback():
    """Receive OAuth code — either direct GET (VPS/sandbox) or POST relay (Pi/prod)."""
    if request.method == "POST":
        # Called by cluster-api relay — requires internal key
        expected = os.environ.get("INTERNAL_API_KEY", "")
        provided = request.headers.get("X-Internal-Key", "")
        if expected and provided != expected:
            return jsonify({"error": "Unauthorized"}), 401
        data = request.get_json()
        code = data.get("code") if data else None
    else:
        # Direct OAuth redirect from Enable Banking (sandbox / VPS)
        code = request.args.get("code")

    if not code:
        return jsonify({"error": "Missing code"}), 400

    try:
        from services.enable_banking import exchange_code

        tokens = exchange_code(code)
        tokens["last_sync_at"] = None

        record = AppToken.query.get("enable_banking")
        if record:
            record.value = json.dumps(tokens)
            record.updated_at = datetime.now(timezone.utc)
        else:
            record = AppToken(key="enable_banking", value=json.dumps(tokens))
            db.session.add(record)

        db.session.commit()
        logger.info("bank_callback: tokens stored successfully")
        if request.method == "GET":
            return "<h2>Authorization complete. You can close this tab.</h2>", 200
        return jsonify({"status": "ok"})
    except Exception as e:
        logger.error(f"bank_callback error: {e}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/api/bank/sync", methods=["POST"])
def bank_sync_now():
    """Manually trigger a bank transaction sync."""
    try:
        from services.bank_sync import sync_transactions

        sync_transactions()
        last_log = SyncLog.query.order_by(SyncLog.ran_at.desc()).first()
        return jsonify(last_log.to_dict() if last_log else {"status": "ok"})
    except Exception as e:
        logger.error(f"bank_sync_now error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/bank/status", methods=["GET"])
def bank_status():
    """Return current token info and last sync time."""
    try:
        record = AppToken.query.get("enable_banking")
        if not record:
            return jsonify({"connected": False})
        token_data = json.loads(record.value)
        last_log = SyncLog.query.order_by(SyncLog.ran_at.desc()).first()
        return jsonify(
            {
                "connected": True,
                "expires_at": token_data.get("expires_at"),
                "last_sync_at": token_data.get("last_sync_at"),
                "updated_at": (
                    record.updated_at.isoformat() if record.updated_at else None
                ),
                "last_log": last_log.to_dict() if last_log else None,
            }
        )
    except Exception as e:
        logger.error(f"bank_status error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/bank/logs", methods=["GET"])
def bank_logs():
    """Return last 20 SyncLog entries, newest first."""
    try:
        logs = SyncLog.query.order_by(SyncLog.ran_at.desc()).limit(20).all()
        return jsonify({"logs": [log.to_dict() for log in logs]})
    except Exception as e:
        logger.error(f"bank_logs error: {e}")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Merchant mappings API
# ---------------------------------------------------------------------------


@app.route("/api/merchants", methods=["GET", "POST"])
def handle_merchants():
    """Handle merchant mapping patterns: GET all, POST to create or update."""
    if request.method == "POST":
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "No JSON data received"}), 400
            for field in ("pattern", "category", "description"):
                if not data.get(field):
                    return jsonify({"error": f"{field} is required"}), 400

            pattern = data["pattern"].strip().upper()
            existing = MerchantMapping.query.filter_by(pattern=pattern).first()
            if existing:
                existing.category = data["category"].strip()
                existing.description = data["description"].strip()
            else:
                existing = MerchantMapping(
                    pattern=pattern,
                    category=data["category"].strip(),
                    description=data["description"].strip(),
                )
                db.session.add(existing)

            db.session.commit()
            return jsonify(existing.to_dict()), 201
        except Exception as e:
            logger.error(f"Error creating merchant mapping: {e}")
            db.session.rollback()
            return jsonify({"error": str(e)}), 500

    # GET
    try:
        mappings = MerchantMapping.query.order_by(MerchantMapping.pattern).all()
        return jsonify({"mappings": [m.to_dict() for m in mappings]})
    except Exception as e:
        logger.error(f"Error fetching merchant mappings: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/merchants/<int:mapping_id>", methods=["DELETE"])
def delete_merchant(mapping_id):
    """Delete a merchant mapping pattern."""
    try:
        mapping = MerchantMapping.query.get_or_404(mapping_id)
        db.session.delete(mapping)
        db.session.commit()
        return "", 204
    except Exception as e:
        logger.error(f"Error deleting merchant mapping {mapping_id}: {e}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Dev server
# ---------------------------------------------------------------------------


def run_dev_server():
    """Run development server using Werkzeug run_simple with reload support."""
    extra_files = []
    for root, dirs, files in os.walk("static"):
        for file in files:
            extra_files.append(os.path.join(root, file))

    port = int(os.environ.get("PORT") or os.environ.get("APP_PORT") or 5001)
    run_simple(
        "0.0.0.0",
        port,
        app,
        use_reloader=True,
        use_debugger=True,
        extra_files=extra_files,
        threaded=True,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT") or os.environ.get("APP_PORT") or 5001)
    if os.environ.get("FLASK_ENV") == "production":
        app.run(host="0.0.0.0", port=port)
    else:
        run_dev_server()
