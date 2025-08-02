# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Testing
```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_api.py

# Run specific test
pytest tests/test_api.py::test_add_expense

# Run with coverage
pytest --cov
```

### Code Quality
```bash
# Format code with Black
black .

# Lint with Flake8
flake8

# Run pre-commit hooks
pre-commit run --all-files
```

### Application
```bash
# Run development server
python app.py

# Initialize database with sample data
python scripts/database/create_sample_db.py

# Export data to CSV
python scripts/database/export_csv.py

# Import data from CSV
python scripts/database/restore_csv.py <file.csv>
```

### Docker
```bash
# Start with Docker Compose
docker compose up -d

# View logs
docker compose logs -f
```

## Architecture Overview

This is a **modular Flask expense tracking application** with a clean separation between backend and frontend:

### Backend (Flask + SQLite)
- **Main app**: `app.py` - Flask server with SQLAlchemy models
- **Database**: SQLite at `instance/expenses.db`
- **Models**: Single `Expense` model with fields: id, amount, category, description, date
- **API**: RESTful endpoints at `/api/expenses` and `/api/months`

### Frontend (Vanilla JS + Web Components)
- **Modular architecture** using ES6 modules and custom elements
- **Core modules** in `static/components/`:
  - `config.js` - Centralized configuration (categories, API endpoints, currency)
  - `api-service.js` - HTTP service layer with standardized error handling
  - `event-manager.js` - Custom event system with BaseComponent class
  - Component files: `expense-form.js`, `expense-list.js`, `category-chart.js`, etc.

### Key Architectural Patterns
- **Event-driven communication**: Components communicate via custom events through EventManager
- **Centralized configuration**: All categories, colors, and settings in `config.js`
- **BaseComponent pattern**: Components extend BaseComponent for automatic event cleanup
- **Consistent styling**: CSS variables in `theme.css` for dark/light themes

## Category Management

Categories are defined in `static/components/config.js` in the `CONFIG.CATEGORIES` object:

```javascript
CATEGORIES: {
    category_key: {
        label: 'Display Name',
        color: '#hexcolor',
        icon: 'bootstrap-icon-class'
    }
}
```

After adding a new category, add corresponding CSS styling in `static/styles/theme.css`:
```css
.badge.category-newcategory { background-color: var(--category-newcategory-color) !important; }
:root { --category-newcategory-color: #hexcolor; }
```

## Database Management

- **Location**: `instance/expenses.db` (SQLite)
- **Test DB**: Separate isolated database for testing
- **Schema**: Simple expense tracking with automatic timestamps
- **Backup**: Use web interface or `scripts/database/export_csv.py`

## Component Development Patterns

When creating new components:

1. **Extend BaseComponent** for automatic event management:
```javascript
import { BaseComponent, EventManager } from './event-manager.js';

class MyComponent extends BaseComponent {
    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Auto-cleanup when component disconnects
        this.listenToGlobalEvent('expenseadded', this.handleUpdate.bind(this));
    }
}
```

2. **Use centralized configuration**:
```javascript
import { CONFIG, CategoryHelper } from './config.js';
const categoryColor = CategoryHelper.getCategoryColor('food_drink');
```

3. **Follow consistent API patterns**:
```javascript
import { ApiService } from './api-service.js';
const expenses = await ApiService.getExpenses(month, year);
```

## Project Context

This is a **personal finance tracking application** designed for:
- Daily expense entry and categorization
- Monthly expense visualization with charts
- CSV data export/import for backup
- Deployment on Raspberry Pi as a systemd service
- Mobile-first responsive design with dark/light themes

The codebase emphasizes **maintainability and modularity** over complex frameworks, making it easy to extend with new categories or features.
