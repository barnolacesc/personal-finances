# Docker Deployment Guide

This guide covers running the Personal Finance Tracker in Docker containers for easy deployment and portability.

## Quick Start

### Using Docker Compose (Recommended)

1. **Build and Start**:
```bash
docker compose up -d
```

2. **Access**: Navigate to `http://localhost:5001`

3. **Stop**:
```bash
docker compose down
```

### Using Docker Commands

1. **Build Image**:
```bash
docker build -t personal-finances .
```

2. **Run Container**:
```bash
# Create data directory for database persistence
mkdir -p ./data

# Run container with volume mount
docker run -d \
  --name personal-finances-app \
  -p 5001:5001 \
  -v ./data:/app/instance \
  --restart unless-stopped \
  personal-finances
```

3. **Access**: Navigate to `http://localhost:5001`

## Container Features

### Lightweight & Secure
- **Base Image**: Alpine Linux with Python 3.11 (~50MB base)
- **Non-root User**: Runs as `appuser` for security
- **Health Checks**: Built-in health monitoring
- **Auto-restart**: Container restarts automatically on failure

### Data Persistence
- **SQLite Database**: Stored in mounted volume `./data/expenses.db`
- **Backup-friendly**: Easy to backup the `./data` directory
- **Portable**: Move data between environments easily

## Container Management

### Check Status
```bash
# Using docker compose
docker compose ps
docker compose logs -f

# Using docker commands
docker ps
docker logs personal-finances-app -f
```

### Update Application
```bash
# Rebuild and restart
docker compose down
docker compose up -d --build

# Or manually
docker stop personal-finances-app
docker rm personal-finances-app
docker build -t personal-finances .
docker run -d --name personal-finances-app -p 5001:5001 -v ./data:/app/instance personal-finances
```

### Database Management
```bash
# Access SQLite database directly
docker exec -it personal-finances-app sqlite3 /app/instance/expenses.db

# Backup database
cp ./data/expenses.db ./backup-$(date +%Y%m%d).db

# Restore database
cp ./backup-20240101.db ./data/expenses.db
docker compose restart
```

## Production Deployment

### Environment Variables
```yaml
# compose.yml
environment:
  - FLASK_ENV=production
  - TZ=Europe/Madrid  # Set your timezone
```

### Resource Limits
```yaml
# compose.yml
deploy:
  resources:
    limits:
      memory: 128M
      cpus: '0.25'
    reservations:
      memory: 64M
      cpus: '0.1'
```

### Reverse Proxy (Nginx)
```nginx
# nginx.conf
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Raspberry Pi Deployment

### Docker Installation on Raspberry Pi
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin
```

### Optimized for ARM
```bash
# The Alpine-based image works on ARM architecture
docker compose up -d

# Check architecture
docker run --rm personal-finances uname -m
```

## Troubleshooting

### Common Issues

**Port Already in Use**:
```bash
# Check what's using port 5001
sudo lsof -i :5001

# Change port in compose.yml
ports:
  - "5002:5001"  # Use port 5002 instead
```

**Permission Issues**:
```bash
# Fix data directory permissions
sudo chown -R 1001:1001 ./data
```

**Database Corruption**:
```bash
# Remove corrupted database (will be recreated)
rm ./data/expenses.db
docker compose restart
```

### Logs and Debugging
```bash
# View application logs
docker compose logs -f personal-finances

# Access container shell
docker exec -it personal-finances-app sh

# Check health status
docker inspect --format='{{.State.Health.Status}}' personal-finances-app
```

## Security Considerations

1. **Non-root User**: Container runs as user ID 1001
2. **Read-only Filesystem**: Only `/app/instance` is writable
3. **Minimal Attack Surface**: Alpine Linux with minimal packages
4. **No SSH/Shell Access**: Production container has no shell access
5. **Health Monitoring**: Built-in health checks for monitoring

## Container Specifications

- **Base Image**: `python:3.11-alpine`
- **Final Size**: ~80-100MB
- **Memory Usage**: ~50-80MB at runtime
- **CPU Usage**: Minimal (suitable for Raspberry Pi)
- **Architecture**: Multi-arch (x86_64, ARM64, ARMv7) 