#!/usr/bin/env node

/**
 * Backup script for personal-finances app
 * This exports the expenses database to a CSV file
 */

import { exportToCsv } from '../src/lib/server/csv-utils.js';

// Execute the backup
try {
  console.log('Starting database backup to CSV...');
  const filePath = await exportToCsv();
  console.log(`Backup completed successfully: ${filePath}`);
} catch (error) {
  console.error('Error during backup:', error);
  process.exit(1);
} 