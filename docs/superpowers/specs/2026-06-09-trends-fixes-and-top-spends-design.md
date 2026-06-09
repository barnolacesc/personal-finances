# Trends Page: Bug Fixes + Top Spends Feature

## Overview

Fix three broken features on the trends page (category velocity, smart alert, weekly daily-avg) and add a new Top Spends section showing the biggest individual expenses in the current period.

## Backend: Extended `/api/trends` Response

**File:** `app.py` — `get_trends()` function

### New response shape

Each period object gains a `categories` dict. The current period (last element, index 3) also gets a `top_expenses` list.

```json
{
  "weekly": [
    {
      "label": "3 Weeks Ago",
      "total": 620.37,
      "categories": {"food_drink": 120.0, "transport": 45.0}
    },
    { "label": "2 Weeks Ago", "total": 800.08, "categories": {...} },
    { "label": "Last Week",   "total": 588.21, "categories": {...} },
    {
      "label": "This Week",
      "total": 2154.04,
      "categories": {...},
      "top_expenses": [
        {"amount": 200.0, "category": "shopping", "description": "IKEA", "date": "2026-06-07"},
        {"amount": 150.0, "category": "health",   "description": "Gym", "date": "2026-06-05"}
      ]
    }
  ],
  "monthly": [ ...same structure... ]
}
```

### Implementation

For each period (weekly and monthly):
- Replace the scalar `func.sum()` query with a `GROUP BY category` query to build the `categories` dict.
- Keep computing `total` as the sum of all category values.

For the current period only (i=0 in each loop, which ends up at index 3 after `insert(0, ...)`):
- Run an additional `ORDER BY amount DESC LIMIT 5` query to get `top_expenses`.
- Each top expense includes: `amount` (float), `category` (str), `description` (str), `date` (YYYY-MM-DD string).

Total queries: 4 (weekly) + 4 (monthly) period queries + 2 top-expense queries = 10. Acceptable for SQLite on a personal app.

## Frontend: Bug Fixes

**File:** `static/components/spending-trends.js`

### Fix 1 — Category Velocity

`computeWeekly()` and `computeMonthly()` currently set `expenses: []` on each period. Replace this with `categories: period.categories || {}` from the server data.

`computeCategoryVelocity()` currently iterates `current.expenses` and `prev.expenses` arrays (always empty). Replace with direct access to `current.categories` and `prev.categories` dicts:

```js
const cur = current.categories[cat] || 0;
const pre = prev.categories[cat] || 0;
```

### Fix 2 — Smart Alert

`renderSmartAlert()` guards on `this.expenses.length < 5` — `this.expenses` is a class property initialized to `[]` and never populated. Replace the guard with a check on actual period data:

```js
if (this.periods.length < 2 || this.periods[this.periods.length - 1].total === 0) {
    alertEl.style.display = 'none';
    return;
}
```

### Fix 3 — Weekly Daily Avg

The backend "current week" is a rolling 7-day window ending today. `daysSoFar` uses `new Date().getDay()` (calendar weekday since Sunday), which is wrong for a rolling window.

Fix: in weekly mode, `daysSoFar = 7` and `daysInPeriod = 7`. This gives an accurate daily average over the 7-day rolling window, and a meaningful projected total.

## Frontend: New Top Spends Section

**File:** `static/components/spending-trends.js`

### Placement

New section added to the HTML template below `#categoryVelocity`, before `#smartAlert`.

### Data source

Reads `this.serverData.weekly[3].top_expenses` or `this.serverData.monthly[3].top_expenses` depending on `this.mode`. No extra API call — data is embedded in the existing trends response.

Re-renders automatically when the weekly/monthly toggle switches (called from `renderTrends()`).

### Layout

Section title: "Top Spends" (same uppercase small-caps style as "Category Velocity").

Each row (`#topSpends` container):
- Left: category icon circle (colored, matching existing category palette via `CategoryHelper`)
- Center: description (truncated ~30 chars) + date formatted as "Jun 7"
- Right: amount (right-aligned, prominent Manrope font)

Reuses `.velocity-card` and `.velocity-left/.velocity-right` CSS classes for visual consistency.

Fallback: if `top_expenses` is empty or missing, show the same "Not enough data" placeholder used by Category Velocity.

### New method

`renderTopSpends()` — reads the top expenses for the current mode, builds the HTML, injects into `#topSpends`. Called at the end of `renderTrends()`.

## Error Handling

No change to existing error handling. The `top_expenses` field defaults to `[]` if the query returns nothing. Frontend guards against missing/empty arrays with the fallback placeholder.

## Testing

- Seed DB with expenses across multiple months/weeks, verify category velocity cards render with correct delta %
- Verify smart alert appears when spending difference > 5% or > 10%
- Verify weekly daily avg = (current week total) / 7 on any day of the week
- Verify top spends list shows correct 5 entries, sorted by amount descending, updating on toggle
