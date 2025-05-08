# Personal Expenses Tracker

A web application to track daily expenses. Originally built with Flask and SQLite, now migrated to SvelteKit while maintaining SQLite for data persistence.

## Features

- Track and categorize expenses
- Filter expenses by month/year
- Visualize expenses by category with a donut chart
- Responsive design for all devices
- SQLite database for data persistence
- CSV import/export functionality
- Systemd service integration for Raspberry Pi

## Technology Stack

- **Frontend**: SvelteKit, TypeScript, Chart.js
- **Backend**: SvelteKit API routes, Node.js
- **Database**: SQLite (using better-sqlite3)
- **Styling**: Bootstrap

## Setup

1. Install Node.js dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Access the application at `http://localhost:3000`

## Building for Production

1. Build the application:
```bash
npm run build
```

2. Run the production version:
```bash
node build
```

## Database Management

The application uses SQLite for data storage:
- The database file is stored in the `data/` directory
- CSV export/import functionality is available via API endpoints
- Automatic migration from the original Flask database (if available)
- Database files are gitignored to prevent accidental commits

## CSV Import/Export

The application supports CSV backup and restore:

- **Export**: Access via API or run the backup script
  ```bash
  node scripts/backup.js
  ```

- **Import**: Upload a previously exported CSV file through the application

## Running on Raspberry Pi

To run this application on your Raspberry Pi:

1. Clone this repository to your Raspberry Pi
2. Install Node.js (if not already installed)
3. Install dependencies with `npm install`
4. Build the application with `npm run build`
5. Install as a service:
```bash
sudo ./scripts/install-service.sh
```
6. Access it from any device on your local network using the Raspberry Pi's IP address

## Development

The application structure:
- `src/routes`: All pages and API routes
- `src/lib/components`: Svelte components
- `src/lib/server`: Server-side code including database access
- `scripts`: Utility scripts for backup and service installation

## API Endpoints

- `GET /api/expenses`: List expenses (filtered by month/year)
- `POST /api/expenses`: Add a new expense
- `DELETE /api/expenses/:id`: Delete an expense
- `GET /api/expenses/summary`: Get expense summary by category
- `GET /api/csv`: List available CSV backups
- `POST /api/csv`: Create a new CSV export
- `PUT /api/csv`: Import from a CSV file

## License

MIT 