from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
from werkzeug.serving import run_simple

app = Flask(__name__, static_folder='static')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///expenses.db'
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

with app.app_context():
    db.create_all()

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
        data = request.get_json()
        try:
            amount = float(data['amount'])
            expense = Expense(amount=amount)
            db.session.add(expense)
            db.session.commit()
            return jsonify(expense.to_dict()), 201
        except (ValueError, KeyError):
            return jsonify({'error': 'Invalid amount'}), 400
    
    # GET request
    expenses = Expense.query.order_by(Expense.date.desc()).all()
    return jsonify([expense.to_dict() for expense in expenses])

@app.route('/api/expenses/<int:expense_id>', methods=['DELETE'])
def delete_expense(expense_id):
    expense = Expense.query.get_or_404(expense_id)
    db.session.delete(expense)
    db.session.commit()
    return '', 204

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