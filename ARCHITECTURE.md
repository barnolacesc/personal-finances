# Personal Finance App - Architecture & Design

## 🏗️ Architecture Overview

Vault is a lightweight, low-resource personal expense tracker designed specifically for dual use cases:
1. **The Expense Uploader** ("I open the app to enter a new expense, I close the app.")
2. **The Expense Viewer** ("I open the app to browse my expenses.")

The application runs efficiently on low-spec hardware (Raspberry Pi / small container pods) with near-zero latency, minimal RAM (< 50MB), and no heavy build tools or Node.js runtimes.

---

## 📁 Directory Structure

```
.
├── app.py                      # Flask server, REST API, SQLite models
├── services/
│   ├── nlp_parser.py           # Natural language parser (< 1ms rule-based + optional LLM)
│   ├── bank_sync.py            # Automated bank sync integration
│   └── enable_banking.py       # Open banking OAuth integration
├── static/
│   ├── components/             # Modular web components
│   │   ├── config.js           # Central configuration, categories, and helpers
│   │   ├── api-service.js      # HTTP API client layer
│   │   ├── event-manager.js    # Decoupled component event bus
│   │   ├── navbar.js           # 4-tab bottom navigation & API shortcuts modal
│   │   ├── toast.js            # Non-blocking notification toasts
│   │   ├── add-expense-form.js # Fast Uploader: smart magic input & 1-tap category grid
│   │   ├── latest-expenses.js  # Expense Viewer: list with inline drawer edit/delete
│   │   ├── category-chart.js   # Interactive category doughnut chart
│   │   ├── date-navigation.js  # Month/week switcher
│   │   ├── recurring-list.js   # Recurring commitments manager
│   │   └── spending-trends.js  # Multi-month trends & projections
│   ├── styles/
│   │   └── vault-theme.css     # OLED-optimized dark theme (Midnight & Electric Orange)
│   ├── index.html              # Dual-mode home screen with immediate fast uploader
│   ├── expenses.html           # Full expense viewer and monthly breakdown
│   ├── recurring.html          # Recurring expense manager
│   ├── trends.html             # Multi-month trends and month-end projections
│   └── site.webmanifest        # PWA manifest with shortcuts
└── tests/                      # Automated test suite
```

---

## ⚡ Core Use Case 1: The Expense Uploader

Designed for frictionless expense entry in under 3 seconds:

- **Smart Natural Language Bar (`#magicInput`)**:
  - Accepts natural inputs: e.g. `"14.50 lunch with team"`, `"coffee 3.50"`, `"45 mercadona yesterday"`.
  - **Live Preview Chips**: Real-time client-side regex parses amount, category, description, and date as the user types.
  - Pressing **Enter** logs the expense instantly via `POST /api/expenses/quick`.
- **Tactile Fast-Pad**:
  - High-visibility amount input with Manrope tabular numbers.
  - **1-Tap Category Grid**: Grid of category chips with icons and colors. One tap selects the category—no scrolling through dropdown menus.
  - Quick date toggle chips (`[Today]`, `[Yesterday]`).
- **Non-Blocking Feedback**:
  - Submits asynchronously, triggers a toast notification, and resets inputs ready for another entry.
  - The newly created expense appears immediately at the top of the Recent Activity list below the form.

---

## 📊 Core Use Case 2: The Expense Viewer

Designed for fast, comprehensive browsing:

- **Monthly Summary & KPI Header**: Total spent, daily burn rate, and recurring-aware month-end projection.
- **Interactive Chart (`<category-chart>`)**: Doughnut visualization with interactive slice selection.
- **Inline Drawer Editor**:
  - Clicking any expense opens a bottom-sheet / modal drawer directly in place.
  - Update amount, category, date, or description, or delete the expense.
  - Never redirects to separate pages or loses your month/scroll position.

---

## 🤖 API & AI/LLM Integration

Vault provides clean, lightweight API functionality ready for external tools, iOS Shortcuts, and AI assistants:

### 1. Quick-Add Endpoint: `POST /api/expenses/quick`
Accepts natural language text or structured JSON:
```bash
curl -X POST "http://localhost:5001/api/expenses/quick" \
  -H "Content-Type: application/json" \
  -d '{"text": "14.50 coffee at Starbucks"}'
```
Returns:
```json
{
  "id": 42,
  "amount": 14.5,
  "category": "food_drink",
  "description": "Coffee at Starbucks",
  "date": "2026-09-30T00:00:00",
  "source": "quick_add"
}
```

### 2. Rule-Based NLP + Optional LLM (`services/nlp_parser.py`)
- **Default (Zero Overhead)**: Runs a comprehensive keyword and regex parser in < 1 millisecond on low-power hardware (Raspberry Pi). Supports English and Spanish common terms.
- **Optional LLM Fallback**: If `GEMINI_API_KEY` or `OPENAI_API_KEY` is present in the environment, ambiguous inputs can optionally be resolved by the LLM.

### 3. API Key Security (Optional)
- Set `VAULT_API_KEY` or `EXPENSE_API_KEY` in environment.
- When configured, external callers authenticate via `X-API-Key: <key>` or `Authorization: Bearer <key>`.
- Same-origin browser UI requests remain seamless.

### 4. Apple iOS Shortcuts & Siri Integration
- Built-in modal accessible from the top navbar ("API") provides copy-paste setup for iOS Shortcuts:
  - Action: *Ask for Text*
  - Action: *Get Contents of URL* (POST to `/api/expenses/quick`)
  - Enables voice logging via *"Hey Siri, Log Expense"*.
