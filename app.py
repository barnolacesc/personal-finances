from flask import Flask, request, jsonify, send_from_directory, redirect, send_file
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
import os
import logging
from werkzeug.serving import run_simple
from sqlalchemy import extract
from subprocess import run, CalledProcessError
from pathlib import Path
import glob
from apscheduler.schedulers.background import BackgroundScheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create Flask app with explicit instance path
current_dir = os.path.dirname(os.path.abspath(__file__))
instance_path = os.path.join(current_dir, "instance")
app = Flask(__name__, static_folder="static", instance_path=instance_path)

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


class Expense(db.Model):
    __tablename__ = "expense"

    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(50), nullable=False)
    date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "amount": self.amount,
            "category": self.category,
            "description": self.description,
            "date": self.date.isoformat(),
        }


class RecurringExpense(db.Model):
    __tablename__ = "recurring_expense"

    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(50), nullable=False)

    # Recurrence config
    frequency = db.Column(
        db.String(20), nullable=False, default="monthly"
    )  # monthly, weekly, yearly
    day_of_month = db.Column(
        db.Integer, nullable=True
    )  # 1-31 for monthly, 1-7 for weekly (Mon=1)

    # Lifecycle
    start_date = db.Column(db.DateTime, nullable=False)
    end_date = db.Column(db.DateTime, nullable=True)  # NULL = no end
    is_active = db.Column(db.Boolean, default=True)

    # Tracking
    last_applied_date = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "amount": self.amount,
            "category": self.category,
            "description": self.description,
            "frequency": self.frequency,
            "day_of_month": self.day_of_month,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "is_active": self.is_active,
            "last_applied_date": (
                self.last_applied_date.isoformat() if self.last_applied_date else None
            ),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# Initialize database
try:
    with app.app_context():
        db.create_all()
        logger.info("Database initialized successfully")
except Exception as e:
    logger.error(f"Error initializing database: {e}")


# Recurring expense application logic
def apply_due_recurring_expenses():
    """Apply recurring expenses that are due today."""
    with app.app_context():
        try:
            today = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            logger.info(f"Checking for due recurring expenses on {today.date()}")

            # Query active recurring expenses
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
                        # Create new expense
                        expense = Expense(
                            amount=recurring.amount,
                            category=recurring.category,
                            description=recurring.description,
                            date=today,
                        )
                        db.session.add(expense)
                        recurring.last_applied_date = today
                        applied_count += 1
                        logger.info(
                            f"Applied recurring: {recurring.description}"
                        )
                    else:
                        logger.info(
                            f"Skipping duplicate: {recurring.description}"
                        )

            db.session.commit()
            logger.info(f"Applied {applied_count} recurring expenses")
            return applied_count

        except Exception as e:
            logger.error(f"Error applying recurring expenses: {e}")
            db.session.rollback()
            return 0


def is_due_today(recurring, today):
    """Check if a recurring expense is due today."""
    # If never applied, check if start_date is today or earlier
    if recurring.last_applied_date is None:
        return True

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


# Initialize scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(
    apply_due_recurring_expenses, "cron", hour=0, minute=0, id="apply_recurring"
)
scheduler.start()
logger.info("Scheduler started for recurring expenses")


@app.after_request
def add_header(response):
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


@app.route("/api/env")
def get_environment():
    """Return environment info for frontend (e.g., navbar badge)."""
    return jsonify({"is_test": is_test_environment()})


@app.route("/")
def serve_index():
    return send_from_directory("static", "index.html")


@app.route("/add")
def serve_add():
    return redirect("/expenses#add")


@app.route("/expenses")
def serve_expenses():
    return send_from_directory("static", "expenses.html")


@app.route("/recurring")
def serve_recurring():
    return send_from_directory("static", "recurring.html")


@app.route("/styles.css")
def serve_css():
    return send_from_directory("static", "styles.css", mimetype="text/css")


@app.route("/api/expenses", methods=["GET", "POST"])
def handle_expenses():
    if request.method == "POST":
        try:
            data = request.get_json()
            if data is None:
                logger.error("No JSON data received")
                return jsonify({"error": "No JSON data received"}), 400

            # Validate required fields
            required_fields = ["amount", "category", "description"]
            for field in required_fields:
                if field not in data:
                    logger.error(f"Missing required field: {field}")
                    return (
                        jsonify({"error": f"{field.capitalize()} field is required"}),
                        400,
                    )

            try:
                amount = float(data["amount"])
            except (ValueError, TypeError):
                logger.error(f"Invalid amount value: {data.get('amount')}")
                return jsonify({"error": "Invalid amount value"}), 400

            category = data["category"].strip()
            description = data["description"].strip()

            if not category or not description:
                return (
                    jsonify({"error": "Category and description cannot be empty"}),
                    400,
                )

            expense = Expense(amount=amount, category=category, description=description)
            db.session.add(expense)
            db.session.commit()
            logger.info(f"Added new expense: ${amount:.2f} ({category})")
            return jsonify(expense.to_dict()), 201

        except Exception as e:
            logger.error(f"Error processing POST request: {e}")
            db.session.rollback()
            return jsonify({"error": "Server error processing request"}), 500

    # GET request
    try:
        # Get month and year from query parameters, default to current month
        now = datetime.now(timezone.utc)
        month = int(request.args.get("month", now.month))
        year = int(request.args.get("year", now.year))
        page = request.args.get("page")
        per_page = request.args.get("per_page")

        query = (
            Expense.query.filter(extract("year", Expense.date) == year)
            .filter(extract("month", Expense.date) == month)
            .order_by(Expense.date.desc())
        )

        if page and per_page:
            page = int(page)
            per_page = int(per_page)
            total = query.count()
            expenses = query.offset((page - 1) * per_page).limit(per_page).all()
        else:
            expenses = query.all()
            total = len(expenses)

        return jsonify(
            {
                "expenses": [expense.to_dict() for expense in expenses],
                "month": month,
                "year": year,
                "page": int(page) if page else None,
                "per_page": int(per_page) if per_page else None,
                "total": total,
            }
        )
    except Exception as e:
        logger.error(f"Error processing GET request: {e}")
        return jsonify({"error": "Server error fetching expenses"}), 500


@app.route("/api/months", methods=["GET"])
def get_months():
    try:
        # Get distinct months and years from expenses
        results = (
            db.session.query(
                extract("year", Expense.date).label("year"),
                extract("month", Expense.date).label("month"),
            )
            .distinct()
            .order_by("year", "month")
            .all()
        )

        # Format results
        months = [{"year": int(r.year), "month": int(r.month)} for r in results]

        return jsonify(months)
    except Exception as e:
        logger.error(f"Error fetching months: {e}")
        return jsonify({"error": "Server error fetching months"}), 500


@app.route("/api/expenses/<int:expense_id>", methods=["DELETE"])
def delete_expense(expense_id):
    try:
        expense = Expense.query.get_or_404(expense_id)
        db.session.delete(expense)
        db.session.commit()
        logger.info(f"Deleted expense {expense_id}")
        return "", 204
    except Exception as e:
        logger.error(f"Error deleting expense {expense_id}: {e}")
        db.session.rollback()
        return jsonify({"error": "Server error deleting expense"}), 500


@app.route("/api/expenses/<int:expense_id>", methods=["PUT"])
def update_expense(expense_id):
    try:
        expense = Expense.query.get_or_404(expense_id)
        data = request.get_json()

        if data is None:
            return jsonify({"error": "No JSON data received"}), 400

        # Validate required fields
        required_fields = ["amount", "category", "description"]
        for field in required_fields:
            if field not in data:
                return (
                    jsonify({"error": f"{field.capitalize()} field is required"}),
                    400,
                )

        try:
            amount = float(data["amount"])
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid amount value"}), 400

        category = data["category"].strip()
        description = data["description"].strip()

        if not category or not description:
            return jsonify({"error": "Category and description cannot be empty"}), 400

        # Update expense
        expense.amount = amount
        expense.category = category
        expense.description = description

        db.session.commit()
        logger.info(f"Updated expense {expense_id}: ${amount:.2f} ({category})")
        return jsonify(expense.to_dict())

    except Exception as e:
        logger.error(f"Error updating expense {expense_id}: {e}")
        db.session.rollback()
        return jsonify({"error": "Server error updating expense"}), 500


@app.route("/api/backup", methods=["POST"])
def backup_database():
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
    # Run the export script
    try:
        run(
            ["python3", "scripts/database/export_csv.py"],
            capture_output=True,
            text=True,
            check=True,
        )
    except CalledProcessError as e:
        return jsonify({"success": False, "error": e.stderr.strip() or str(e)}), 500
    # Find the most recent CSV file
    export_dir = Path("scripts/database/exports")
    files = sorted(
        glob.glob(str(export_dir / "expenses_*.csv")),
        key=lambda x: Path(x).stat().st_mtime,
        reverse=True,
    )
    if not files:
        return jsonify({"success": False, "error": "No backup file found."}), 500
    latest_file = files[0]
    return send_file(
        latest_file,
        as_attachment=True,
        download_name=Path(latest_file).name,
        mimetype="text/csv",
    )


# Recurring expense API endpoints
@app.route("/api/recurring", methods=["GET", "POST"])
def handle_recurring_expenses():
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


def run_dev_server():
    extra_files = []
    # Watch static directory for changes
    for root, dirs, files in os.walk("static"):
        for file in files:
            extra_files.append(os.path.join(root, file))

    run_simple(
        "0.0.0.0",
        5001,
        app,
        use_reloader=True,
        use_debugger=True,
        extra_files=extra_files,
        threaded=True,
    )


if __name__ == "__main__":
    if os.environ.get("FLASK_ENV") == "production":
        app.run(host="0.0.0.0", port=5001)
    else:
        run_dev_server()
