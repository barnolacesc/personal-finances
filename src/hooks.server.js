import { json } from '@sveltejs/kit';

/**
 * @type {import('@sveltejs/kit').Handle}
 */
export function handle({ event, resolve }) {
  // Log all requests to help debug
  console.log(`Request: ${event.request.method} ${event.url.pathname}`);
  
  // For all routes, just resolve normally
  return resolve(event);
} 