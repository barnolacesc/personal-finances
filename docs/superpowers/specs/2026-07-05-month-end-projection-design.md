# Trends Page: Month-End Spending Projection

## Overview

Add a recurring-aware, confidence-tagged month-end spending projection to the trends page, replacing the existing naive `dailyAvg * daysInPeriod` estimate shown in monthly mode. This re-implements the intent of the stale `feat/month-end-projection` branch (single commit, never merged, 19 commits behind `develop`) adapted to the current `get_trends()` response shape and current `spending-trends.js` structure (both reworked since that branch diverged).

## Backend: Extended `/api/trends` Response

**File:** `app.py` — new `_current_month_projection(now)` helper, called from `get_trends()`

### New response field

```json
{
  "weekly": [ ... ],
  "monthly": [ ... ],
  "projection": {
    "current_total": 812.40,
    "daily_average": 58.03,
    "pace_projection": 1748.90,
    "remaining_recurring": 45.00,
    "projected_total": 1793.90,
    "previous_month_total": 1620.10,
    "previous_3_month_average": 1701.55,
    "delta_vs_average": 5.4,
    "days_elapsed": 14,
    "days_remaining": 17,
    "month_days": 31,
    "confidence": "medium",
    "upcoming_recurring": [ {"description": "Rent", "amount": 900.0, "day": 28} ],
    "generated_at": "2026-07-14T10:00:00"
  }
}
```

### Implementation

Ported from the old branch's `_current_month_projection()` with no logic changes:
- `pace_projection` = (current month total so far / days elapsed) × days in month.
- `remaining_recurring` = sum of active monthly `RecurringExpense` rows whose `day_of_month` is still in the future this month and that don't already have a matching posted `Expense` (avoids double-counting one that already fired).
- `projected_total` = `pace_projection + remaining_recurring`.
- `previous_3_month_average` / `delta_vs_average` = compare against the trailing 3 calendar months.
- `confidence` = `"low"` (<7 days elapsed), `"medium"` (<15 days), else `"high"`.

This is purely additive to `get_trends()` — no changes to the existing per-period (`weekly`/`monthly`) query logic, so it doesn't conflict with the categories/top_expenses work already on `develop`.

## Frontend: Upgrade Existing "Projected" Stat (Monthly Mode Only)

**File:** `static/components/spending-trends.js`

No new card, no new CSS block — this replaces the value and adds one annotation line to the existing `.stat-card` (id `#projected`) in the stats grid.

### `renderTrends()` changes

- When `this.mode === 'monthly'` and `this.serverData.projection` is present: use `projection.projected_total` for the `#projected` stat value instead of the locally computed `dailyAvg * daysInPeriod`.
- When `this.mode === 'weekly'`: unchanged, keeps the existing client-side `dailyAvg * 7` calculation — a month-end projection isn't meaningful for a 7-day window.

### New annotation line

Below the `#projected` stat value (monthly mode only), add a small text line, e.g.:

```
+5% vs 3-mo avg · medium confidence
```

- Reuses the existing `.delta-up` / `.delta-down` color classes (red/green) for the percentage, keyed off `delta_vs_average` sign.
- If `delta_vs_average` is `null` (no prior-month data yet), show `"No 3-month baseline yet"` instead.
- Confidence rendered as plain text, not a separate badge/pill, to avoid new CSS surface area.
- Hidden entirely in weekly mode.

### Not carried over from the old branch

- The standalone `.projection-card` block and its ~80 lines of dedicated CSS — dropped, per the "upgrade don't duplicate" decision.
- The `upcoming_recurring` list UI — the field still comes back from the API (used internally to compute `projected_total`), but nothing renders it. Can be added later if wanted.

## Error Handling

No new failure modes. `_current_month_projection()` reuses the same try/except wrapper already around `get_trends()`. If `projection` is missing from the response for any reason, the frontend falls back to the existing naive calculation (defensive `this.serverData.projection?.projected_total ?? (dailyAvg * daysInPeriod)`).

## Testing

- Port `test_trends_api_includes_month_projection` from the old branch into `tests/test_api.py`, matching the style of the neighboring `test_trends_includes_categories` test: seed an expense, hit `/api/trends`, assert `projection.current_total >= seeded amount`, `projection.confidence` is one of the three tiers, `projection.projected_total >= projection.current_total`.
- Manual check: confirm monthly-mode "Projected" stat shows the recurring-aware number and the annotation line, weekly mode is unaffected.
