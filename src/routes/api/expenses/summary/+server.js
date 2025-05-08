import { json } from '@sveltejs/kit';
import { getExpenseSummary } from '$lib/server/db';

/**
 * GET handler for expense summary
 * @param {Object} params
 * @param {URL} params.url - URL object
 */
export async function GET({ url }) {
  const year = url.searchParams.get('year') || new Date().getFullYear();
  const month = url.searchParams.get('month') || (new Date().getMonth() + 1);
  
  const summary = getExpenseSummary(year, month);
  return json(summary);
} 