import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { parse } from 'csv-parse/sync';
import db from './db';

/**
 * Ensure exports directory exists
 */
const EXPORTS_DIR = path.resolve(process.cwd(), 'exports');
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

/**
 * Export expenses to a CSV file
 * @returns {Promise<string>} Path to the exported CSV file
 */
export async function exportToCsv() {
  try {
    // Get all expenses from the database
    const expenses = db.prepare('SELECT id, amount, description, category, date FROM expenses ORDER BY date DESC').all();
    
    // Create a filename with current date
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const filename = `expenses_${dateStr}.csv`;
    const filePath = path.join(EXPORTS_DIR, filename);
    
    // Set up CSV writer
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'date', title: 'Date' },
        { id: 'amount', title: 'Amount' },
        { id: 'category', title: 'Category' },
        { id: 'description', title: 'Description' }
      ]
    });
    
    // Write data to CSV
    await csvWriter.writeRecords(expenses);
    
    console.log(`Exported ${expenses.length} expenses to ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    throw error;
  }
}

/**
 * Import expenses from a CSV file
 * @param {string} filePath Path to the CSV file
 * @returns {Promise<number>} Number of imported records
 */
export async function importFromCsv(filePath) {
  try {
    // Read the CSV file
    const fileContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
    
    // Parse CSV content
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });
    
    if (records.length === 0) {
      console.log('No records found in CSV file');
      return 0;
    }
    
    // Create a backup of current database
    const now = new Date();
    const dateStr = now.toISOString().replace(/:/g, '-').split('.')[0];
    const dbPath = path.resolve(process.cwd(), 'data/expenses.db');
    const backupPath = path.resolve(process.cwd(), `data/expenses_backup_${dateStr}.db`);
    
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`Created database backup at ${backupPath}`);
    }
    
    // Clear existing expenses table
    db.prepare('DELETE FROM expenses').run();
    
    // Insert records from CSV
    const stmt = db.prepare(`
      INSERT INTO expenses (id, amount, description, category, date)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    // Use transaction for better performance
    const insertMany = db.transaction((expenses) => {
      for (const expense of expenses) {
        // Make sure we have all required fields
        const id = expense.ID || expense.id || null;
        const amount = parseFloat(expense.Amount || expense.amount || 0);
        const description = expense.Description || expense.description || '';
        const category = expense.Category || expense.category || '';
        const date = expense.Date || expense.date || new Date().toISOString().split('T')[0];
        
        stmt.run(id, amount, description, category, date);
      }
    });
    
    // Execute transaction
    insertMany(records);
    
    console.log(`Imported ${records.length} expenses from ${filePath}`);
    return records.length;
  } catch (error) {
    console.error('Error importing from CSV:', error);
    throw error;
  }
}

/**
 * List all available CSV backup files
 * @returns {Array<{date: string, path: string, size: number}>} Array of backup files with metadata
 */
export function listCsvBackups() {
  if (!fs.existsSync(EXPORTS_DIR)) {
    return [];
  }
  
  const backups = [];
  const files = fs.readdirSync(EXPORTS_DIR);
  
  for (const file of files) {
    if (file.startsWith('expenses_') && file.endsWith('.csv')) {
      const filePath = path.join(EXPORTS_DIR, file);
      const stats = fs.statSync(filePath);
      
      // Extract date from filename (expenses_YYYYMMDD.csv)
      const dateMatch = file.match(/expenses_(\d{8})\.csv/);
      const dateStr = dateMatch ? dateMatch[1] : 'unknown';
      
      // Format as YYYY-MM-DD
      const formattedDate = dateStr !== 'unknown'
        ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
        : dateStr;
      
      backups.push({
        date: formattedDate,
        path: filePath,
        size: Math.round(stats.size / 1024 * 10) / 10 // Size in KB with 1 decimal
      });
    }
  }
  
  // Sort by date (newest first)
  return backups.sort((a, b) => b.date.localeCompare(a.date));
} 