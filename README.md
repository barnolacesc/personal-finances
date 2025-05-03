# Personal Expenses Tracker

A simple web application to track daily expenses. Built with Flask and SQLite, designed to run on a Raspberry Pi.

## Features

- Simple expense input
- Real-time expense tracking
- Responsive design
- SQLite database for data persistence

## Setup

1. Create and activate a virtual environment:
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Linux/Mac:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Run the application:
```bash
python app.py
```

4. Access the application at `http://localhost:5000` or `http://<your-raspberry-pi-ip>:5000`

## Usage

1. Enter an amount in the input field
2. Click "Add Expense" to record the expense
3. View your recent expenses in the list below

## Running on Raspberry Pi

To run this application on your Raspberry Pi Zero 2W:

1. Clone this repository to your Raspberry Pi
2. Create and activate virtual environment as shown in Setup step 1
3. Install the requirements as shown in Setup step 2
4. Run the application
5. Access it from any device on your local network using the Raspberry Pi's IP address

Note: Make sure you have Python and venv installed on your Raspberry Pi:
```bash
sudo apt-get update
sudo apt-get install python3-venv
```

## Development

The application consists of:
- `app.py`: Flask backend with SQLite database
- `static/index.html`: Frontend interface
- `static/styles.css`: Styling

## License

MIT 