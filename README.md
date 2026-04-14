# 🔧 RepairShop — IT Repair Management System

A self-hosted web app for managing customers, repairs, invoices, and follow-up reminders.
Runs on TrueNAS SCALE (or any Docker host). Access from any browser on your network.

---

## Quick start on TrueNAS SCALE

### Step 1 — Create a dataset for your data

In TrueNAS SCALE:
1. Go to **Storage → Datasets**
2. Create a new dataset, e.g. `tank/repairshop`
3. Note the full path, e.g. `/mnt/tank/repairshop`

This is where your database and uploaded logos will live. It survives container restarts and updates.

---

### Step 2 — Edit docker-compose.yml

Open `docker-compose.yml` and make two changes:

```yaml
volumes:
  - /mnt/tank/repairshop:/data    # ← change this to your dataset path

environment:
  - JWT_SECRET=change_me_to_something_long_and_random_before_deploying
  #             ↑ change this to any long random string, e.g.:
  #               openssl rand -hex 32
```

---

### Step 3 — Deploy on TrueNAS SCALE

**Option A — via TrueNAS SCALE Apps (Custom App)**

1. Go to **Apps → Discover Apps → Custom App**
2. Paste the contents of `docker-compose.yml`
3. Click **Install**
4. TrueNAS will pull the image, start the container, and restart it on reboot

**Option B — via SSH (command line)**

```bash
# SSH into your TrueNAS box
ssh admin@your-truenas-ip

# Copy your project folder to TrueNAS, then:
cd /path/to/repairshop
docker compose up -d --build
```

---

### Step 4 — Open the app

Open a browser on any device on your network:

```
http://your-truenas-ip:3000
```

**Default login:** `admin` / `admin`
**Change your password immediately** in Settings → Account.

---

## Running locally (Windows or Fedora Linux, without Docker)

### Prerequisites
- Node.js 20+ → https://nodejs.org

### Install and run

```bash
# 1. Install all dependencies
npm run install:all

# 2. Copy env file
cp .env.example .env
# Edit .env and set a real JWT_SECRET and your preferred DB_PATH

# 3. Build the frontend
npm run build

# 4. Start the server
npm start
```

Open http://localhost:3000

### Development mode (hot reload)

```bash
npm run dev
# Frontend: http://localhost:3001
# Backend API: http://localhost:3000
```

---

## Updating the app

```bash
# Pull latest code, then rebuild:
docker compose up -d --build

# Your data in /mnt/tank/repairshop is untouched
```

---

## File locations inside the container

| Path | What's there |
|------|-------------|
| `/data/repairshop.sqlite` | Your database |
| `/data/uploads/` | Uploaded logos |

Both are in your mounted TrueNAS dataset — safe from container rebuilds.

---

## Ports

| Port | Service |
|------|---------|
| 3000 | Web app + API |

To change the port, edit the `ports:` line in `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"   # now access at :8080
```

---

## Accessing from outside your network

Install **Tailscale** on your TrueNAS box and your phone/laptop.
Once connected, use `http://truenas-tailscale-ip:3000` from anywhere.

No port forwarding needed. Free for personal use.
https://tailscale.com

---

## Security notes

- Change the default `admin` password immediately after first login
- Set a strong `JWT_SECRET` in your environment (at least 32 random characters)
- Only expose port 3000 on your local network, not directly to the internet
- For internet access, use Tailscale or put Nginx with HTTPS in front

---

## Default login

| Username | Password |
|----------|----------|
| admin    | admin    |

Change in **Settings → Account → Change password**

## HTTPS / SSL Setup (required for camera/scanner on LAN devices)

Browsers block camera access on plain HTTP from LAN IPs. To enable the scanner on phones and tablets:

**Step 1 — Generate a self-signed certificate on TrueNAS:**
```bash
mkdir -p /mnt/tank/repairshop-data/ssl
openssl req -x509 -newkey rsa:4096 \
  -keyout /mnt/tank/repairshop-data/ssl/key.pem \
  -out /mnt/tank/repairshop-data/ssl/cert.pem \
  -days 3650 -nodes \
  -subj "/CN=YOUR-TRUENAS-IP"
```

**Step 2 — Your docker-compose.yml already has these env vars:**
```yaml
- SSL_CERT=/data/ssl/cert.pem
- SSL_KEY=/data/ssl/key.pem
- HTTPS_PORT=3443
ports:
  - "3443:3443"
```

**Step 3 — Restart:**
```bash
cd /mnt/tank && docker compose up -d
```

**Step 4 — Access via HTTPS:**
```
https://YOUR-TRUENAS-IP:3443
```

Your browser will show a security warning. Click **Advanced → Proceed** (or Accept Risk).
After that the camera will work on any device.

HTTP on port 3000 still works and redirects to HTTPS automatically.
