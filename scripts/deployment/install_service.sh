#!/bin/bash

# Make sure we're running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Stop the service if it's already running
systemctl stop personal-finances 2>/dev/null

# Copy service file to systemd directory
cp "$(dirname "$0")/personal-finances.service" /etc/systemd/system/

# Reload systemd to recognize new service
systemctl daemon-reload

# Enable and start the service
systemctl enable personal-finances
systemctl start personal-finances

# Wait a moment for the service to start
sleep 2

# Check the service status
echo "Service installation complete. Current status:"
systemctl status personal-finances

echo -e "\nYou can use these commands to manage the service:"
echo "  sudo systemctl status personal-finances  # Check status"
echo "  sudo systemctl start personal-finances   # Start service"
echo "  sudo systemctl stop personal-finances    # Stop service"
echo "  sudo systemctl restart personal-finances # Restart service"
echo "  sudo journalctl -u personal-finances    # View logs"
echo -e "\nTo see detailed logs in real-time, use:"
echo "  sudo journalctl -u personal-finances -f"
