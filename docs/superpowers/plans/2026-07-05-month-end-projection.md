# Month-End Spending Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the naive client-side month-end spending estimate on the trends page with a recurring-aware, confidence-tagged projection computed server-side.

**Architecture:** `/api/trends` gains a new top-level `projection` object built by a self-contained `_current_month_projection()` helper in `app.py`. The frontend's existing "Projected" stat card (monthly mode only) consumes this value instead of computing its own naive estimate, and gains a one-line annotation showing trend vs. the last 3 months and a confidence tag. Weekly mode is untouched.

**Tech Stack:** Flask + SQLAlchemy (backend), vanilla JS web components (frontend), pytest (backend tests).

## Global Constraints

- Backend change is purely additive to `get_trends()` — do not alter the existing per-period `weekly_data`/`monthly_data` query logic.
- No new UI card and no new CSS block beyond one `.stat-annotation` rule (~10 lines) — do not port the old branch's standalone `.projection-card`.
- Weekly mode must render exactly as it does today — no projection annotation, no behavior change.
- The `upcoming_recurring` field is returned by the API but intentionally has no UI consumer yet.
- PR targets `develop` (this repo's convention: feature branches → `develop` → later release PR → `main`).

---

### Task 1: Backend — month-end projection endpoint field

**Files:**
- Modify: `app.py:620` (insert new function before `get_trends()`), `app.py:681` (change `return jsonify(...)` line)
- Test: `tests/test_api.py` (append after `test_trends_top_expenses_sorted_by_amount`, currently ending at line 250)

**Interfaces:**
- Produces: `_current_month_projection(now: datetime) -> dict` with keys `current_total`, `daily_average`, `pace_projection`, `remaining_recurring`, `projected_total`, `previous_month_total`, `previous_3_month_average`, `delta_vs_average` (float or `None`), `days_elapsed`, `days_remaining`, `month_days`, `confidence` (`"low"|"medium"|"high"`), `upcoming_recurring` (list, max 5), `generated_at` (ISO string).
- `GET /api/trends` response gains a `"projection"` key holding that dict, alongside the existing `"weekly"` and `"monthly"` keys.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api.py` immediately after `test_trends_top_expenses_sorted_by_amount` (after line 250):

```python
def test_trends_api_includes_month_projection(client):
    """GET /api/trends includes a recurring-aware month-end spending projection."""
    with client.application.app_context():
        today = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0)
        db.session.add(
            Expense(
                amount=25.0,
                category="personal",
                description="Test",
                date=today,
            )
        )
        db.session.commit()

    resp = client.get("/api/trends")
    assert resp.status_code == 200
    data = resp.get_json()
    projection = data["projection"]

    assert projection["current_total"] >= 25.0
    assert projection["projected_total"] >= projection["current_total"]
    assert projection["confidence"] in {"low", "medium", "high"}
    assert "previous_3_month_average" in projection
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_api.py::test_trends_api_includes_month_projection -v`
Expected: FAIL with `KeyError: 'projection'`

- [ ] **Step 3: Write the projection helper and wire it into `get_trends()`**

In `app.py`, insert this function directly above the `@app.route("/api/trends", methods=["GET"])` line (currently line 620):

```python
def _current_month_projection(now):
    """Cheap month-end spending projection for the trends page."""
    import calendar
    from sqlalchemy import func

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_days = calendar.monthrange(now.year, now.month)[1]
    month_end = month_start.replace(day=month_days, hour=23, minute=59, second=59)
    days_elapsed = max(now.day, 1)
    days_remaining = max(month_days - now.day, 0)
    current_month = f"{now.year}-{now.month:02d}"

    current_total = (
        db.session.query(func.sum(Expense.amount))
        .filter(func.strftime("%Y-%m", Expense.date) == current_month)
        .scalar()
        or 0.0
    )

    previous_totals = []
    for i in range(1, 4):
        target_month = now.month - i
        target_year = now.year
        while target_month <= 0:
            target_month += 12
            target_year -= 1
        target_month_str = f"{target_year}-{target_month:02d}"
        total = (
            db.session.query(func.sum(Expense.amount))
            .filter(func.strftime("%Y-%m", Expense.date) == target_month_str)
            .scalar()
            or 0.0
        )
        previous_totals.append(float(total))

    daily_average = float(current_total) / days_elapsed
    pace_projection = daily_average * month_days

    remaining_recurring = 0.0
    upcoming_recurring = []
    recurring_expenses = (
        RecurringExpense.query.filter(
            RecurringExpense.is_active.is_(True),
            RecurringExpense.frequency == "monthly",
            RecurringExpense.day_of_month.isnot(None),
            RecurringExpense.start_date <= month_end,
        )
        .filter(
            (RecurringExpense.end_date.is_(None))
            | (RecurringExpense.end_date >= month_start)
        )
        .all()
    )

    for recurring in recurring_expenses:
        due_day = min(recurring.day_of_month, month_days)
        due_date = month_start.replace(day=due_day)
        if due_date.date() <= now.date():
            continue
        existing = Expense.query.filter(
            Expense.amount == recurring.amount,
            Expense.category == recurring.category,
            Expense.description == recurring.description,
            extract("year", Expense.date) == now.year,
            extract("month", Expense.date) == now.month,
            extract("day", Expense.date) == due_day,
        ).first()
        if existing:
            continue
        remaining_recurring += float(recurring.amount)
        upcoming_recurring.append(
            {
                "description": recurring.description,
                "amount": float(recurring.amount),
                "day": due_day,
            }
        )

    projected_total = pace_projection + remaining_recurring
    previous_average = (
        sum(previous_totals) / len(previous_totals) if previous_totals else 0.0
    )
    delta_vs_average = (
        ((projected_total - previous_average) / previous_average) * 100
        if previous_average > 0
        else None
    )

    if days_elapsed < 7:
        confidence = "low"
    elif days_elapsed < 15:
        confidence = "medium"
    else:
        confidence = "high"

    return {
        "current_total": float(current_total),
        "daily_average": float(daily_average),
        "pace_projection": float(pace_projection),
        "remaining_recurring": float(remaining_recurring),
        "projected_total": float(projected_total),
        "previous_month_total": previous_totals[0] if previous_totals else 0.0,
        "previous_3_month_average": float(previous_average),
        "delta_vs_average": delta_vs_average,
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "month_days": month_days,
        "confidence": confidence,
        "upcoming_recurring": upcoming_recurring[:5],
        "generated_at": now.isoformat(),
    }
```

Then in `get_trends()`, replace the current return line (line 681):

```python
        return jsonify({"weekly": weekly_data, "monthly": monthly_data})
```

with:

```python
        projection = _current_month_projection(now)

        return jsonify(
            {"weekly": weekly_data, "monthly": monthly_data, "projection": projection}
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_api.py::test_trends_api_includes_month_projection -v`
Expected: PASS

Also run the full API test file to confirm no regressions:

Run: `pytest tests/test_api.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add app.py tests/test_api.py
git commit -m "feat: add month-end spending projection to /api/trends"
```

---

### Task 2: Frontend — upgrade the "Projected" stat card

**Files:**
- Modify: `static/components/spending-trends.js:118` (projection calculation), `static/components/spending-trends.js:147-148` (stat rendering), `static/components/spending-trends.js:464` (CSS), `static/components/spending-trends.js:601` (template HTML)

**Interfaces:**
- Consumes: `this.serverData.projection` (from Task 1's API response) — specifically `.projected_total` (number), `.delta_vs_average` (number or `null`), `.confidence` (string).
- Produces: no new public interface — internal rendering only.

- [ ] **Step 1: Add the annotation element to the template**

In `static/components/spending-trends.js`, in the `render()` method's stats grid (lines 599-602), change:

```html
                <div class="stat-card">
                    <div class="stat-label">Projected</div>
                    <div class="stat-value" id="projected">${CurrencyHelper.format(0)}</div>
                </div>
```

to:

```html
                <div class="stat-card">
                    <div class="stat-label">Projected</div>
                    <div class="stat-value" id="projected">${CurrencyHelper.format(0)}</div>
                    <div class="stat-annotation" id="projectedAnnotation"></div>
                </div>
```

- [ ] **Step 2: Add the annotation CSS rule**

Immediately after the `.stat-value` rule (ends at line 464), add:

```css
                .stat-annotation {
                    font-size: 0.6875rem;
                    font-weight: 700;
                    margin-top: 0.375rem;
                    color: var(--on-surface-variant);
                }
```

(`.delta-up` / `.delta-down` already exist elsewhere in this file as standalone classes and will be applied alongside `.stat-annotation` in Step 4 — no new color rules needed.)

- [ ] **Step 3: Use the server projection for the monthly "Projected" value**

In `renderTrends()`, replace line 118:

```js
        const projected = dailyAvg * daysInPeriod;
```

with:

```js
        const projection = this.serverData?.projection;
        const projected = (this.mode === 'monthly' && projection)
            ? projection.projected_total
            : dailyAvg * daysInPeriod;
```

- [ ] **Step 4: Render the annotation line**

Immediately after line 148 (`this.querySelector('#projected').textContent = CurrencyHelper.format(projected);`), add:

```js
        // Projection annotation (monthly mode only)
        const annotationEl = this.querySelector('#projectedAnnotation');
        if (this.mode === 'monthly' && projection) {
            const delta = projection.delta_vs_average;
            if (delta === null || delta === undefined) {
                annotationEl.textContent = 'No 3-month baseline yet';
                annotationEl.className = 'stat-annotation';
            } else {
                const sign = delta > 0 ? '+' : '';
                annotationEl.textContent = `${sign}${delta.toFixed(0)}% vs 3-mo avg · ${projection.confidence} confidence`;
                annotationEl.className = `stat-annotation ${delta > 0 ? 'delta-up' : 'delta-down'}`;
            }
        } else {
            annotationEl.textContent = '';
            annotationEl.className = 'stat-annotation';
        }
```

- [ ] **Step 5: Run the existing frontend regression test**

Run: `pytest tests/test_frontend.py::test_trends_no_js_errors -v`
Expected: PASS (confirms the trends page still loads with zero JS errors after this change)

- [ ] **Step 6: Manual verification**

Start the dev server (`python app.py`), open `/trends` in a browser:
- Monthly mode: "Projected" stat shows a value, with a small annotation line beneath it (e.g. `+5% vs 3-mo avg · medium confidence`, or `No 3-month baseline yet` on a fresh DB).
- Weekly mode: "Projected" stat behaves exactly as before, annotation line is empty/invisible.
- No layout shift or visual regression in the stats grid.

- [ ] **Step 7: Commit**

```bash
git add static/components/spending-trends.js
git commit -m "feat: show recurring-aware month-end projection in trends stat card"
```

---

### Task 3: Full verification and PR

**Files:** none (verification + PR only)

- [ ] **Step 1: Run the full test suite**

Run: `pytest -v`
Expected: All PASS

- [ ] **Step 2: Run lint/format checks**

Run: `black --check . && flake8`
Expected: No errors (run `black .` first if formatting issues are reported, then re-check)

- [ ] **Step 3: Push branch and open the PR**

```bash
git push -u origin dy/month-end-projection
gh pr create --base develop --title "feat: month-end spending projection" --body "$(cat <<'EOF'
## Summary
- Adds a recurring-aware, confidence-tagged month-end spending projection to `/api/trends`, replacing the naive client-side estimate in the trends page's "Projected" stat (monthly mode only).
- Re-implements the intent of the stale, never-merged `feat/month-end-projection` branch, adapted to the current `get_trends()` response shape and `spending-trends.js` structure.

## Test plan
- [x] `pytest` — full suite passes, including new `test_trends_api_includes_month_projection`
- [x] `black --check .` / `flake8` — clean
- [ ] Manual check on `/trends`: monthly "Projected" stat shows the new value + annotation; weekly mode unaffected
EOF
)"
```

Report the PR URL back once created.
