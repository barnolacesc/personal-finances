import Database from 'better-sqlite3';
import fs from 'fs';
import db, { initSampleData } from './db';

// Path to the old database
const OLD_DB_PATH = './expenses.db';

/**
 * Import data from the old SQLite database
 */
export function importFromOldDb() {
  if (!fs.existsSync(OLD_DB_PATH)) {
    console.log('Old database not found. Using sample data instead.');
    initSampleData();
    return;
  }

  try {
    // Open the old database
    const oldDb = new Database(OLD_DB_PATH, { readonly: true });
    
    // Check if the old database has the expenses table
    const tables = oldDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'").all();
    
    if (tables.length === 0) {
      console.log('No expenses table found in the old database. Using sample data instead.');
      initSampleData();
      oldDb.close();
      return;
    }
    
    // Get all expenses from the old database
    const oldExpenses = oldDb.prepare('SELECT * FROM expenses').all();
    oldDb.close();
    
    if (oldExpenses.length === 0) {
      console.log('No expenses found in the old database. Using sample data instead.');
      initSampleData();
      return;
    }
    
    // Clear the current expenses table
    db.prepare('DELETE FROM expenses').run();
    
    // Insert expenses from the old database
    const stmt = db.prepare(`
      INSERT INTO expenses (id, amount, description, category, date)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    // Use transaction for better performance
    const insertMany = db.transaction((expenses) => {
      for (const expense of expenses) {
        stmt.run(
          expense.id,
          expense.amount,
          expense.description,
          expense.category,
          expense.date
        );
      }
    });
    
    insertMany(oldExpenses);
    console.log(`Imported ${oldExpenses.length} expenses from the old database.`);
  } catch (error) {
    console.error('Error importing from old database:', error);
    console.log('Using sample data instead.');
    initSampleData();
  }
}

// Run the import if this file is executed directly
if (process.argv[1] === import.meta.url) {
  importFromOldDb();
}

export default importFromOldDb; 