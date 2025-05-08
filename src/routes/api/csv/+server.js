import { json } from '@sveltejs/kit';
import { exportToCsv, listCsvBackups, importFromCsv } from '$lib/server/csv-utils';
import path from 'path';
import fs from 'fs';

/**
 * GET handler for listing backup files or downloading a CSV file
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function GET(event) {
  try {
    const filename = event.url.searchParams.get('file');
    
    if (filename) {
      // Handle file download
      const backups = listCsvBackups();
      const backup = backups.find(b => path.basename(b.path) === filename);
      
      if (!backup) {
        return json({ error: 'File not found' }, { status: 404 });
      }
      
      // Read the file and return it as a download
      const file = fs.readFileSync(backup.path);
      
      return new Response(file, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        }
      });
    } else {
      // List available backups
      const backups = listCsvBackups();
      return json(backups);
    }
  } catch (error) {
    console.error('Error in CSV GET endpoint:', error);
    return json({ error: 'Server error processing request' }, { status: 500 });
  }
}

/**
 * POST handler for creating a new export
 */
export async function POST() {
  try {
    const filePath = await exportToCsv();
    const filename = path.basename(filePath);
    
    return json({ 
      success: true, 
      message: 'Export successful',
      file: filename
    });
  } catch (error) {
    console.error('Error creating CSV export:', error);
    return json({ error: 'Server error creating export' }, { status: 500 });
  }
}

/**
 * PUT handler for importing from a CSV file
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function PUT(event) {
  try {
    const data = await event.request.json();
    const filename = data.file;
    
    if (!filename) {
      return json({ error: 'No file specified' }, { status: 400 });
    }
    
    // Get full path from available backups
    const backups = listCsvBackups();
    const backup = backups.find(b => path.basename(b.path) === filename);
    
    if (!backup) {
      return json({ error: 'File not found' }, { status: 404 });
    }
    
    // Import the data
    const count = await importFromCsv(backup.path);
    
    return json({ 
      success: true, 
      message: `Successfully imported ${count} expenses`,
      count
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    return json({ error: 'Server error importing data' }, { status: 500 });
  }
} 