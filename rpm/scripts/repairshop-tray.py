#!/usr/bin/env python3
import os
import subprocess
import threading
import time
import webbrowser
import psutil
from PIL import Image, ImageDraw
from pystray import Icon, Menu, MenuItem

# Configuration
APP_NAME = "RepairShop"
APP_URL = "http://localhost:3000"
SERVICE_NAME = "repairshop.service"
ICON_PATH = "/usr/share/icons/hicolor/scalable/apps/repairshop.svg"

def get_service_status():
    try:
        res = subprocess.run(["systemctl", "is-active", SERVICE_NAME], capture_output=True, text=True)
        return res.stdout.strip() == "active"
    except:
        return False

def run_command(cmd):
    subprocess.run(["sudo", "systemctl", cmd, SERVICE_NAME])

def get_stats():
    cpu = psutil.cpu_percent()
    ram = psutil.virtual_memory().percent
    gpu_info = "GPU: N/A"
    
    # Try to get Nvidia GPU info
    try:
        res = subprocess.run(['nvidia-smi', '--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], capture_output=True, text=True)
        if res.returncode == 0:
            p = res.stdout.strip().split(', ')
            gpu_info = f"GPU: {p[0]}% | VRAM: {p[1]}MB/{p[2]}MB"
    except:
        pass
        
    return f"CPU: {cpu}% | RAM: {ram}% | {gpu_info}"

def create_image():
    # Generate a simple dynamic icon or load the static one
    try:
        # If we have the SVG, we could render it, but for a tray icon 
        # we'll use a simple colored circle for status + the letter R
        image = Image.new('RGB', (64, 64), (37, 99, 235)) # Accent color
        dc = ImageDraw.Draw(image)
        status_color = (22, 163, 74) if get_service_status() else (220, 38, 38)
        dc.ellipse((40, 40, 60, 60), fill=status_color)
        return image
    except:
        return Image.new('RGB', (64, 64), (37, 99, 235))

class RepairShopTray:
    def __init__(self):
        self.icon = Icon(APP_NAME, create_image(), menu=self.create_menu())
        self.running = True

    def create_menu(self):
        return Menu(
            MenuItem(lambda text: f"Status: {'Running' if get_service_status() else 'Stopped'}", lambda: None, enabled=False),
            MenuItem(lambda text: get_stats(), lambda: None, enabled=False),
            Menu.SEPARATOR,
            MenuItem("Open RepairShop", lambda: webbrowser.open(APP_URL)),
            Menu.SEPARATOR,
            MenuItem("Start Service", lambda: run_command("start")),
            MenuItem("Stop Service", lambda: run_command("stop")),
            MenuItem("Restart Service", lambda: run_command("restart")),
            Menu.SEPARATOR,
            MenuItem("Quit Tray", self.stop)
        )

    def update_loop(self):
        while self.running:
            self.icon.menu = self.create_menu()
            self.icon.icon = create_image()
            time.sleep(5)

    def stop(self):
        self.running = False
        self.icon.stop()

    def run(self):
        threading.Thread(target=self.update_loop, daemon=True).start()
        self.icon.run()

if __name__ == "__main__":
    tray = RepairShopTray()
    tray.run()
