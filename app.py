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


# Initialize database
try:
    with app.app_context():
        db.create_all()
        logger.info("Database initialized successfully")
except Exception as e:
    logger.error(f"Error initializing database: {e}")


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
