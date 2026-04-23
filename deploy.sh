#!/bin/bash

# RepairShop - Automated Deployment & Migration Script
# This script sets up the environment and restores your data.

echo "🔧 Starting RepairShop Deployment..."

# 1. Configuration
read -p "Enter the IP address of THIS machine: " SERVER_IP
read -p "Enter the filename of your backup zip (or press enter to skip): " BACKUP_FILE

PROJECT_DIR="repairshop"
DATA_DIR="$PROJECT_DIR/repairshop-data"

# 2. Create Directory Structure
echo "📁 Creating project directories..."
mkdir -p "$DATA_DIR/uploads"
mkdir -p "$DATA_DIR/print-queue"
mkdir -p "$DATA_DIR/ssl"

# 3. Restore Backup if provided
if [ -f "$BACKUP_FILE" ]; then
    echo "📦 Restoring backup from $BACKUP_FILE..."
    if command -v unzip >/dev/null; then
        unzip -o "$BACKUP_FILE" -d "$DATA_DIR"
        # Move files to correct structure if backup was flat
        [ -f "$DATA_DIR/repairshop.sqlite" ] && echo "✅ Database restored."
    else
        echo "❌ Error: 'unzip' is not installed. Please install it or extract manually."
        exit 1
    fi
else
    echo "ℹ️ No backup found or provided. Starting with a fresh database."
fi

# 4. Generate docker-compose.yml
echo "📝 Generating docker-compose.yml with IP: $SERVER_IP..."
cat <<EOF > "$PROJECT_DIR/docker-compose.yml"
services:
  repairshop:
    image: fam1152/repairshop:latest
    container_name: repairshop
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "3443:3443"
    volumes:
      - ./repairshop-data:/data
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - PORT=3000
      - NODE_ENV=production
      - DB_PATH=/data/repairshop.sqlite
      - UPLOADS_PATH=/data/uploads
      - PRINT_QUEUE_PATH=/data/print-queue
      - JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "default_secret_please_change")
      - GOOGLE_CLIENT_ID=
      - GOOGLE_CLIENT_SECRET=
      - GOOGLE_REDIRECT_URI=http://$SERVER_IP:3000/api/appointments/google/callback
      - DOCKER_IMAGE=fam1152/repairshop:latest
      - SSL_CERT=/data/ssl/cert.pem
      - SSL_KEY=/data/ssl/key.pem
      - HTTPS_PORT=3443
      - OLLAMA_URL=http://localhost:11434
      - OLLAMA_MODEL=llama3.2
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
EOF

# 5. Launch
echo "🚀 Launching RepairShop..."
cd "$PROJECT_DIR"

if command -v podman-compose >/dev/null; then
    podman-compose up -d
elif command -v docker-compose >/dev/null; then
    docker-compose up -d
elif command -v docker >/dev/null && docker compose version >/dev/null; then
    docker compose up -d
else
    echo "❌ Error: Neither podman-compose nor docker-compose found."
    echo "Please install one of them and then run: cd $PROJECT_DIR && podman-compose up -d"
    exit 1
fi

echo "✅ Deployment Complete!"
echo "🌐 Access your RepairShop at: http://$SERVER_IP:3000"
echo "🔒 Note: If using camera/scanner, ensure you place SSL certs in $DATA_DIR/ssl/"
