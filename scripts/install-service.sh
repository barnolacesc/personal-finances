#!/bin/bash

# Make sure we're running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Get the current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# Make sure the application is built
echo "Building the application..."
cd "$APP_DIR"
npm run build

# Stop the service if it's already running
systemctl stop personal-finances-sveltekit 2>/dev/null

# Copy service file to systemd directory
cp "$APP_DIR/personal-finances-sveltekit.service" /etc/systemd/system/

# Update the WorkingDirectory in the service file
sed -i "s|WorkingDirectory=.*|WorkingDirectory=$APP_DIR|g" /etc/systemd/system/personal-finances-sveltekit.service

# Make the data directory and set permissions
mkdir -p "$APP_DIR/data"
chown -R $(whoami) "$APP_DIR/data"
chmod -R 755 "$APP_DIR/data"

# Create exports directory
mkdir -p "$APP_DIR/exports"
chown -R $(whoami) "$APP_DIR/exports"
chmod -R 755 "$APP_DIR/exports"

# Reload systemd to recognize new service
systemctl daemon-reload

# Enable and start the service
systemctl enable personal-finances-sveltekit
systemctl start personal-finances-sveltekit

# Wait a moment for the service to start
sleep 2

# Check the service status
echo "Service installation complete. Current status:"
systemctl status personal-finances-sveltekit

echo -e "\nYou can use these commands to manage the service:"
echo "  sudo systemctl status personal-finances-sveltekit  # Check status"
echo "  sudo systemctl start personal-finances-sveltekit   # Start service"
echo "  sudo systemctl stop personal-finances-sveltekit    # Stop service"
echo "  sudo systemctl restart personal-finances-sveltekit # Restart service"
echo "  sudo journalctl -u personal-finances-sveltekit    # View logs"
echo -e "\nTo see detailed logs in real-time, use:"
echo "  sudo journalctl -u personal-finances-sveltekit -f" 