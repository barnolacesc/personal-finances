# Personal Expenses Tracker

A simple, modular web application to track daily expenses. Built with Flask backend and modern JavaScript frontend components, designed to run both locally and on a Raspberry Pi.

## Features

- **Bank Sync via Open Banking**: Automatic transaction import from BBVA using [Enable Banking](https://enablebanking.com/) (PSD2)
- **Unclassified Transactions**: Review and categorize bank-imported expenses
- **Recurring Expenses**: Track and manage recurring payments
- **Modular Architecture**: Clean separation of concerns with reusable components
- **Dark/Light Theme**: Full theme support with automatic system preference detection
- **Real-time Expense Tracking**: Add, edit, and delete expenses with instant feedback
- **Interactive Charts**: Category-based expense visualization with clickable charts
- **Mobile-First Design**: Responsive design optimized for mobile and desktop
- **Category Management**: Predefined categories with color coding
- **Data Export**: CSV export functionality for backup and analysis
- **Service Deployment**: Ready for Raspberry Pi deployment with systemd

## Quick Start

1. **Clone and Setup**:
```bash
git clone https://github.com/your-username/personal-finances.git
cd personal-finances

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

2. **Initialize Database**:
```bash
# Create database (optional sample data)
python scripts/database/create_sample_db.py
```

3. **Run Application**:
```bash
python app.py
```

4. **Access**: Navigate to `http://localhost:5001` or `http://<your-ip>:5001`

## Bank Sync Architecture

The app integrates with BBVA (and potentially other banks) through Enable Banking's PSD2 open banking API:

```
┌──────────┐     OAuth      ┌──────────────────────┐     Relay     ┌─────────────┐
│  Enable   │ ──redirect──→ │  api.barnola.net      │ ──────────→  │ Raspberry Pi │
│  Banking  │               │  (K8s cluster relay)   │              │ :5001        │
└──────────┘               └──────────────────────┘              └─────────────┘
      │                                                                  │
      │  PSD2 API                                              Store token &
      │  (transactions)                                        sync transactions
      ▼                                                                  ▼
┌──────────┐                                                   ┌─────────────┐
│   BBVA   │                                                   │  SQLite DB  │
└──────────┘                                                   └─────────────┘
```

1. User initiates OAuth flow from the `/bank` page
2. Enable Banking redirects to `api.barnola.net/finances/oauth/callback` (public endpoint)
3. The cluster relays the callback to the Pi's internal API
4. Transactions are fetched and stored, ready for categorization

## Project Structure

```
├── app.py                      # Flask backend application
├── services/                   # Business logic services
│   ├── enable_banking.py      # Enable Banking API client (JWT/RS256)
│   └── bank_sync.py           # Transaction sync and categorization
├── data/                       # Database and exports
│   └── expenses.db            # SQLite database
├── static/                     # Frontend assets
│   ├── components/            # Modular JavaScript components
│   │   ├── config.js         # Centralized configuration
│   │   ├── api-service.js    # HTTP service layer
│   │   ├── event-manager.js  # Event system
│   │   ├── expense-form.js   # Expense creation form
│   │   ├── expense-list.js   # Expense listing/editing
│   │   ├── category-chart.js # Interactive charts
│   │   ├── bank-status.js    # Bank sync dashboard
│   │   ├── unclassified-list.js # Unclassified expense review
│   │   ├── date-navigation.js # Date/week navigation
│   │   ├── navbar.js         # Navigation component
│   │   └── toast.js          # Notification system
│   ├── styles/
│   │   └── theme.css         # Centralized styling & themes
│   ├── index.html            # Home page
│   ├── expenses.html         # Main application
│   ├── bank.html             # Bank sync dashboard
│   ├── unclassified.html     # Unclassified expenses review
│   └── pficon.png           # App icon
├── scripts/                   # Organized utility scripts
│   ├── database/             # Database management
│   │   ├── init_db.py       # Database initialization
│   │   ├── create_sample_db.py # Sample data generator
│   │   ├── migrate_bank_fields.py # Bank sync DB migration
│   │   ├── restore_csv.py   # CSV import utility
│   │   └── export_csv.py    # CSV export utility
│   └── deployment/           # Deployment utilities
│       ├── install_service.sh # Service installation
│       ├── personal-finances.service # Systemd service
│       └── backup.sh        # Database backup script
├── ARCHITECTURE.md           # Detailed architecture documentation
├── requirements.txt          # Python dependencies
└── README.md                # This file
```

## Architecture

This application uses a **modular architecture** for improved maintainability:

- **Backend**: Flask with SQLite database
- **Frontend**: Vanilla JavaScript with Web Components
- **Configuration**: Centralized config management
- **API Layer**: Structured HTTP service layer
- **Event System**: Component communication via custom events
- **Styling**: CSS variables for theming, external stylesheets

For detailed architecture information, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Database Management

### Daily Usage
- **Automatic Backups**: Export to CSV via the web interface
- **Data Location**: `data/expenses.db` (SQLite)
- **Manual Export**: `python scripts/database/export_csv.py`

### Development
- **Sample Data**: `python scripts/database/create_sample_db.py`
- **Database Reset**: Delete `data/expenses.db` and restart app
- **Import Data**: `python scripts/database/restore_csv.py <file.csv>`

## Deployment

### 🐳 Docker (Recommended)
```bash
# Quick start with Docker Compose
docker compose up -d

# Access at http://localhost:5001
# Database persisted in ./data/ directory
```

For detailed Docker deployment instructions, see [DOCKER.md](DOCKER.md).

### Local Development
```bash
python app.py  # Runs on http://localhost:5001
```

### Raspberry Pi (Systemd Service)
```bash
# Install as system service
sudo scripts/deployment/install_service.sh

# Manual control
sudo systemctl start personal-finances
sudo systemctl enable personal-finances  # Auto-start on boot
sudo systemctl status personal-finances  # Check status
```

### Manual Deployment
1. Clone repository to target server
2. Setup Python virtual environment
3. Install dependencies
4. Configure service or run manually
5. Access via server IP on port 5001

## Configuration

### Bank Sync (Enable Banking)

To enable automatic bank transaction import:

1. Register an application at [enablebanking.com](https://enablebanking.com/)
2. Generate RSA keys: `openssl genrsa -out private.key 4096`
3. Set environment variables (via systemd or `.env`):
   - `ENABLE_BANKING_APPLICATION_ID` — your app ID from Enable Banking
   - `ENABLE_BANKING_PRIVATE_KEY_PATH` — path to the RSA private key file
   - `ENABLE_BANKING_REDIRECT_URI` — OAuth callback URL
   - `ENABLE_BANKING_ACCOUNT_ID` — your bank account UUID (shown after OAuth)
   - `ENABLE_BANKING_SANDBOX` — `true` for testing, `false` for production
   - `INTERNAL_API_KEY` — shared secret for the OAuth relay
4. Authorize your bank from the `/bank` page
5. Transactions sync automatically or on demand via "Sync Now"

### Adding Categories
1. Edit `static/components/config.js` - add to `CONFIG.CATEGORIES`
2. Add CSS styling to `static/styles/theme.css`
3. Categories automatically appear in dropdowns

### Theme Customization
- Modify CSS variables in `static/styles/theme.css`
- Both light and dark themes supported
- Automatic system preference detection

### API Endpoints
- Configure in `static/components/config.js`
- All HTTP requests centralized in `api-service.js`

## Development

### Adding Features
1. Follow the modular architecture patterns
2. Use the centralized configuration system
3. Implement proper error handling
4. Add both light/dark theme support

### Component Development
```javascript
import { BaseComponent, EventManager } from './event-manager.js';
import { CONFIG, CategoryHelper } from './config.js';

class MyComponent extends BaseComponent {
    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.listenToGlobalEvent('expenseadded', this.handleUpdate.bind(this));
    }
}
```

## Contributing

1. Follow the established modular architecture
2. Update both light and dark theme styles
3. Add proper error handling
4. Update documentation for new features
5. Test on both desktop and mobile

## License

MIT License - See [LICENSE](LICENSE) file for details.

<!-- Test CI/CD workflow -->
