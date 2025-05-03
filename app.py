from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os

app = Flask(__name__, static_folder='static')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///expenses.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
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

@app.route('/')
def serve_index():
    return send_from_directory('static', 'index.html')

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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True) 