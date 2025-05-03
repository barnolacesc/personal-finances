#!/bin/bash

# Make sure we're running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Copy service file to systemd directory
cp personal-finances.service /etc/systemd/system/

# Reload systemd to recognize new service
systemctl daemon-reload

# Enable and start the service
systemctl enable personal-finances
systemctl start personal-finances

echo "Service installed and started!"
echo "You can use these commands to manage the service:"
echo "  sudo systemctl status personal-finances  # Check status"
echo "  sudo systemctl start personal-finances   # Start service"
echo "  sudo systemctl stop personal-finances    # Stop service"
echo "  sudo systemctl restart personal-finances # Restart service"
echo "  sudo journalctl -u personal-finances    # View logs" 