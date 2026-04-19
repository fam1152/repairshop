#!/bin/bash
# RepairShop GUI Launcher

# Get Port from config or default to 3000
PORT=$(grep '^PORT=' /etc/repairshop/repairshop.conf | cut -d= -f2 | tr -d '"' | tr -d "'" || echo "3000")
[ -z "$PORT" ] && PORT="3000"

# Get IP Address
IP_ADDR=$(hostname -I | awk '{print $1}' || echo "localhost")

ACTION=$(zenity --list --title="RepairShop Manager" \
  --column="Action" --column="Description" \
  "Open Dashboard" "Open the web interface in your browser" \
  "Start Server" "Start the RepairShop background service" \
  "Stop Server" "Stop the RepairShop background service" \
  "Restart Server" "Restart the service to apply changes" \
  --width=450 --height=300 --hide-header)

case "$ACTION" in
    "Open Dashboard")
        xdg-open "http://localhost:$PORT"
        ;;
    "Start Server")
        if pkexec systemctl start repairshop; then
            zenity --info --title="Server Started" --text="RepairShop is now running!\n\nLocal: http://localhost:$PORT\nNetwork: http://$IP_ADDR:$PORT" --width=350
        fi
        ;;
    "Stop Server")
        if pkexec systemctl stop repairshop; then
            zenity --info --text="RepairShop service stopped." --timeout=3
        fi
        ;;
    "Restart Server")
        if pkexec systemctl restart repairshop; then
             zenity --info --title="Server Restarted" --text="RepairShop has been restarted.\n\nLocal: http://localhost:$PORT\nNetwork: http://$IP_ADDR:$PORT" --width=350
        fi
        ;;
    *)
        exit 0
        ;;
esac
