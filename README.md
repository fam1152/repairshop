# 🔧 RepairShop — IT Repair Management System

A self-hosted web app for managing customers, repairs, invoices, and follow-up reminders.
Runs on any Docker host. Access from any browser on your network.

---

## ✨ Features
- **AI Technician Assistant:** Local AI (via Ollama) helps diagnose repairs, format notes, and draft customer messages.
- **Full CRM:** Track customer history, call logs, and document uploads.
- **Repair Workflow:** Manage status from intake to pickup with automated reminders.
- **Inventory & Parts:** Track stock levels, suppliers, and barcodes.
- **Invoicing & Estimates:** Generate branded PDFs, track balances, and record payments.
- **Live Kiosk:** Dedicated dashboard for shop displays.
- **Self-Hosted:** You own your data. Runs entirely on your local network.

---

## 🚀 Quick Start (Docker)

The easiest way to run RepairShop is using Docker Compose.

### Step 1 — Create a data directory
```bash
mkdir -p ./repairshop-data
```

### Step 2 — Create docker-compose.yml
Copy the following into a `docker-compose.yml` file:

```yaml
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
      - DOCKER_IMAGE=fam1152/repairshop:latest
      - JWT_SECRET=generate_a_random_string_here
      # Optional: Ollama URL if running on a different machine
      - OLLAMA_URL=http://your-ai-pc-ip:11434
```

### Step 3 — Launch
```bash
docker compose up -d
```

Access the app at `http://your-server-ip:3000`

Default credentials: **admin / admin** (Change immediately in Settings).

---

## 🔒 Security & SSL
To enable the camera for scanning barcodes/QR codes on mobile devices, you **must** use HTTPS.

1. Place your `cert.pem` and `key.pem` in your mounted data folder under `/ssl/`.
2. Add these environment variables:
   - `SSL_CERT=/data/ssl/cert.pem`
   - `SSL_KEY=/data/ssl/key.pem`
3. Restart the container.

---

## 🛠 Development
To run locally for development:
1. `npm install` (Root)
2. `cd client && npm install`
3. `npm run dev` (Runs concurrently)

Built with Node.js, Express, React, and SQLite.
