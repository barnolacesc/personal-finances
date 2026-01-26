#!/bin/bash
#
# One-time setup script for the test environment on IONOS VPS
# Run this once on your VPS to set up the test environment
#
# Usage: bash setup-test-env.sh
#

set -e

echo "=== Setting up Personal Finances Test Environment ==="

# Configuration
APP_DIR="$HOME/personal-finances-test"
REPO_URL="git@github.com:barnolacesc/personal-finances.git"
SERVICE_NAME="personal-finances-test"

# Install system dependencies
echo "Installing system dependencies..."
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git curl

# Clone the repository if it doesn't exist
if [ ! -d "$APP_DIR" ]; then
    echo "Cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"
else
    echo "Repository already exists, pulling latest..."
    cd "$APP_DIR"
    git fetch origin
    git checkout -f origin/develop
fi

cd "$APP_DIR"

# Create virtual environment
echo "Setting up Python virtual environment..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Create instance directory
mkdir -p instance

# Generate initial test data
echo "Creating test database..."
python scripts/database/create_test_data.py

# Create systemd service file
echo "Creating systemd service..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=Personal Finances Test Environment
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
Environment=FLASK_ENV=development
Environment=FLASK_DEBUG=1
ExecStart=$APP_DIR/venv/bin/python app.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl start ${SERVICE_NAME}

# Check status
echo ""
echo "=== Setup Complete ==="
echo ""
sudo systemctl status ${SERVICE_NAME} --no-pager
echo ""
echo "Test environment is running at: http://$(hostname -I | awk '{print $1}'):5001"
echo ""
echo "Next steps:"
echo "1. Add the following secrets to your GitHub repository:"
echo "   - VPS_HOST: Your VPS IP address"
echo "   - VPS_USER: $USER"
echo "   - VPS_SSH_KEY: Your SSH private key"
echo ""
echo "2. Create a GitHub environment named 'test' at:"
echo "   https://github.com/barnolacesc/personal-finances/settings/environments"
echo ""
echo "3. Open port 5001 in your VPS firewall if needed"
