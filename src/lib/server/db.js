import Database from 'better-sqlite3';
import { dev } from '$app/environment';
import fs from 'fs';
import path from 'path';

// Database file path
const DB_PATH = dev 
  ? 'data/expenses.db'     // Development
  : '/var/lib/personal-finances/expenses.db'; // Production

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database connection
const db = new Database(DB_PATH);

// Enable foreign keys and WAL mode for better performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL
  )
`);

/**
 * Get expenses filtered by year and month
 * @param {string|number} year 
 * @param {string|number} month 
 * @returns {Array} Expenses for the specified month and year
 */
export function getExpensesForMonth(year, month) {
  const query = `
    SELECT * FROM expenses 
    WHERE strftime('%Y', date) = ? 
    AND strftime('%m', date) = ? 
    ORDER BY date DESC
  `;
  
  // Ensure month is padded with a leading zero if needed
  const paddedMonth = String(month).padStart(2, '0');
  
  return db.prepare(query).all(String(year), paddedMonth);
}

/**
 * Get expense summary by category for a month
 * @param {string|number} year 
 * @param {string|number} month 
 * @returns {Array} Summary of expenses by category
 */
export function getExpenseSummary(year, month) {
  const query = `
    SELECT category, SUM(amount) as amount
    FROM expenses 
    WHERE strftime('%Y', date) = ? 
    AND strftime('%m', date) = ? 
    GROUP BY category
    ORDER BY amount DESC
  `;
  
  // Ensure month is padded with a leading zero if needed
  const paddedMonth = String(month).padStart(2, '0');
  
  return db.prepare(query).all(String(year), paddedMonth);
}

/**
 * Add a new expense
 * @param {Object} expense Expense data object
 * @returns {Object} Added expense with ID
 */
export function addExpense(expense) {
  const { amount, description, category, date } = expense;
  
  const stmt = db.prepare(`
    INSERT INTO expenses (amount, description, category, date)
    VALUES (?, ?, ?, ?)
  `);
  
  const info = stmt.run(amount, description, category, date);
  
  return {
    id: info.lastInsertRowid,
    amount,
    description,
    category,
    date
  };
}

/**
 * Delete an expense by ID
 * @param {number} id Expense ID
 * @returns {boolean} Success or failure
 */
export function deleteExpense(id) {
  const stmt = db.prepare('DELETE FROM expenses WHERE id = ?');
  const info = stmt.run(id);
  
  return info.changes > 0;
}

/**
 * Insert sample data if the database is empty
 */
export function initSampleData() {
  const count = db.prepare('SELECT COUNT(*) as count FROM expenses').get();
  
  if (count.count === 0) {
    const sampleData = [
      {
        amount: 42.99,
        description: 'Groceries',
        category: 'super',
        date: '2025-05-05'
      },
      {
        amount: 12.50,
        description: 'Lunch',
        category: 'food_drink',
        date: '2025-05-07'
      },
      {
        amount: 85.00,
        description: 'Electricity bill',
        category: 'recurrent',
        date: '2025-05-10'
      }
    ];
    
    const stmt = db.prepare(`
      INSERT INTO expenses (amount, description, category, date)
      VALUES (?, ?, ?, ?)
    `);
    
    // Use transaction for better performance
    const insertMany = db.transaction((expenses) => {
      for (const expense of expenses) {
        stmt.run(
          expense.amount,
          expense.description,
          expense.category,
          expense.date
        );
      }
    });
    
    insertMany(sampleData);
    console.log('Sample data inserted.');
  }
}

// Initialize sample data
initSampleData();

export default db; 