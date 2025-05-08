import { json } from '@sveltejs/kit';
import importFromOldDb from '$lib/server/import-old-db';

// Try to import data from the old database when the server starts
importFromOldDb();

/**
 * @type {import('@sveltejs/kit').Handle}
 */
export function handle({ event, resolve }) {
  // Log all requests to help debug
  console.log(`Request: ${event.request.method} ${event.url.pathname}`);
  
  // For all routes, just resolve normally
  return resolve(event);
} 