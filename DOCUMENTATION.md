# RepairShop — IT Repair Management System (CRM)

## What is CRM?
**Customer Relationship Management (CRM)** is a technology for managing all your company's relationships and interactions with customers and potential customers. The goal is simple: Improve business relationships. A CRM system helps companies stay connected to customers, streamline processes, and improve profitability.

## Software Description
**RepairShop** is a specialized self-hosted CRM and technical management suite designed specifically for IT repair businesses. It streamlines the entire lifecycle of a repair—from intake and diagnostics to invoicing and follow-up. Unlike generic CRMs, it includes built-in AI technical assistance, schematic management, and hardware monitoring specifically for repair technicians.

### Key Capabilities:
- **Intelligent Intake:** Record device details, serial numbers, and problem descriptions with integrated Speech-to-Text.
- **AI Technician Assistant:** Proactive AI research that generates repair guides, flowcharts, and expands technical shorthand.
- **Technical Knowledge Base:** A persistent library for service manuals, PDFs, and schematics with full OCR search.
- **Financial Suite:** Manage invoices, estimates, and track shop revenue with multi-currency support.
- **Kiosk Display:** A live, dual-panel shop floor dashboard showing active workflow and AI technical focus.
- **Dedicated Print Queue:** A managed folder for printable documents (.pdf, .txt, .jpg) with a one-click "Print All" function.
- **File Browser:** Integrated explorer to view and download all data files directly from the web interface.
- **Taskbar Integration:** A Linux tray monitor with status indicator colors and real-time system monitoring.
- **Automated Communication:** Integrated email support for sending invoices and photo documentation.

---

## Build Instructions

### Building the Docker Image
RepairShop is optimized for Docker environments.

**Execution:**
```bash
docker build -t repairshop:latest .
```

**Deployment (Docker Compose):**
```yaml
services:
  repairshop:
    image: repairshop:latest
    ports:
      - "3000:3000"
      - "3443:3443"
    volumes:
      - /path/to/data:/var/lib/repairshop
    restart: unless-stopped
```

---

## Usage Guide

### Initial Setup
1.  **Login:** Access `http://localhost:3000`. Default credentials are `admin` / `admin123`.
2.  **Configuration:** Navigate to **Settings → Company** to set your shop name, phone, and logo.
3.  **AI Setup:** Go to **Settings → AI**. Ensure Ollama is running and download the `llama3.2` and `llama3.2-vision` models.

### Managing Repairs
- Click **+ New Repair** on the Repairs tab.
- Use the **🎤 Microphone** to speak symptoms.
- Click **💡 Get AI Guide** for a diagnostic flowchart.
- Use the **"Kiosk"** radio button to focus a device on the shop floor screen.

### Tray Icon Status
The taskbar icon provides real-time status of the RepairShop server:
- 🟢 **Green:** Everything is up and running correctly.
- 🟡 **Yellow:** Server is starting up (service active, but web server not yet ready).
- 🔴 **Red:** Server is stopped or the service is not active.
- 🟠 **Orange:** Error state (server responded with an error or is unreachable).

---

## Version History & Changelog

### v1.0.0-Beta-Build-04-20-2026 (Current)
- **Consolidated Interface:** Simplified Settings into logical groups (Shop, User, Operations, Intelligence, System, About).
- **AI Core Overhaul:**
    - Added **AI Auto-Research**: Periodically downloads repair guides for documented devices.
    - Added **OCR & PDF Learning**: AI can now read and learn from uploaded service manuals.
    - Added **Custom LLM Support**: Ability to upload and use your own `.GGUF` model files.
    - **Persistent State**: AI chat history and input drafts are saved across tab changes and refreshes.
- **Operations & Printing:**
    - **Dedicated Print Queue**: Added a managed folder for printable documents with a one-click "Print All" button (Settings -> Operations).
    - **File Browser**: New integrated file explorer in Settings to see and download all software-generated files.
- **System Tray Monitor:**
    - Enhanced taskbar icon with **color-coded status logic** (Green/Yellow/Red/Orange).
    - Improved reliability and HTTP health checks.
- **UI Scaling:** Added a slider in Settings to scale the UI from 0.8x to 2.0x for monitors and TVs.
- **Data Safety:** Emergency automatic backup to user **Documents** folders during uninstallation.
- **Email Integration:** Support for Resend/SendGrid to email invoices and technical photos.
- **Refinement:** Fixed theme persistence (no light-flash on refresh) and added automatic phone number formatting.

### v10.1.9
- Added AI Playground chat box for testing training context.
- Improved shop name and system context injection into AI prompts.

### v10.1.8
- Added graceful shutdown handlers for database integrity.
- Optimized persistent database path logic.

### v10.1.0
- Initial implementation of the Kiosk Dashboard.
- Added support for Google Calendar and Contacts synchronization.

### v9.0.0
- Migration to SQLite for all data storage.
- Added inventory tracking and low-stock notification system.

---
*Disclaimer: This software is provided as is and with no warranty. Any repair performed is the responsibility of the person or shop involved. Double check your research. "Measure twice, cut once."*
