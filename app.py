from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
import logging
from werkzeug.serving import run_simple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Get the absolute path for the database
current_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(current_dir, 'expenses.db')
logger.info(f"Configuring database at: {db_path}")

app = Flask(__name__, static_folder='static')
# SQLite URLs are relative to the app's root path by default
# Using /// for absolute path, // for relative path
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:////' + db_path
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Development settings
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['TEMPLATES_AUTO_RELOAD'] = True

db = SQLAlchemy(app)

class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    date = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'amount': self.amount,
            'date': self.date.isoformat()
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
    # Disable caching for all responses
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/')
def serve_index():
    return send_from_directory('static', 'index.html')

@app.route('/styles.css')
def serve_css():
    return send_from_directory('static', 'styles.css', mimetype='text/css')

@app.route('/api/expenses', methods=['GET', 'POST'])
def handle_expenses():
    if request.method == 'POST':
        try:
            data = request.get_json()
            if data is None:
                logger.error("No JSON data received")
                return jsonify({'error': 'No JSON data received'}), 400
            
            if 'amount' not in data:
                logger.error("No amount field in JSON data")
                return jsonify({'error': 'Amount field is required'}), 400
            
            try:
                amount = float(data['amount'])
            except (ValueError, TypeError):
                logger.error(f"Invalid amount value: {data.get('amount')}")
                return jsonify({'error': 'Invalid amount value'}), 400
            
            expense = Expense(amount=amount)
            db.session.add(expense)
            db.session.commit()
            logger.info(f"Added new expense: ${amount:.2f}")
            return jsonify(expense.to_dict()), 201
            
        except Exception as e:
            logger.error(f"Error processing POST request: {e}")
            db.session.rollback()
            return jsonify({'error': 'Server error processing request'}), 500
    
    # GET request
    try:
        expenses = Expense.query.order_by(Expense.date.desc()).all()
        return jsonify([expense.to_dict() for expense in expenses])
    except Exception as e:
        logger.error(f"Error processing GET request: {e}")
        return jsonify({'error': 'Server error fetching expenses'}), 500

@app.route('/api/expenses/<int:expense_id>', methods=['DELETE'])
def delete_expense(expense_id):
    try:
        expense = Expense.query.get_or_404(expense_id)
        db.session.delete(expense)
        db.session.commit()
        logger.info(f"Deleted expense {expense_id}")
        return '', 204
    except Exception as e:
        logger.error(f"Error deleting expense {expense_id}: {e}")
        db.session.rollback()
        return jsonify({'error': 'Server error deleting expense'}), 500

def run_dev_server():
    extra_files = []
    # Watch static directory for changes
    for root, dirs, files in os.walk('static'):
        for file in files:
            extra_files.append(os.path.join(root, file))

    run_simple(
        '0.0.0.0', 
        5001, 
        app,
        use_reloader=True,
        use_debugger=True,
        extra_files=extra_files,
        threaded=True
    )

if __name__ == '__main__':
    if os.environ.get('FLASK_ENV') == 'production':
        app.run(host='0.0.0.0', port=5001)
    else:
        run_dev_server() 