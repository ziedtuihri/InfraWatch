#!/bin/bash
set -e
 
# --- HARDCODED CONFIG (same pattern as the working node_exporter task) ---
MORPH_URL="https://projet1-virtual-machine"
AUTH_TOKEN="ea3c4b6b-4b64-47f5-9954-89e184ec3039"
FILE_ID="229"
 
WORKDIR="/tmp/vm_test"
DATADIR="/var/lib/victoria_metrics_data"
VM_PORT="8428"
RETENTION="30d"
INSTALL_DIR="/opt/victoria_metrics"
SCRAPE_CONFIG="/opt/victoria_metrics/scrape.yml"
SERVICE_FILE="/etc/systemd/system/victoria_metrics.service"
 
# MYIP from Morpheus so we can seed a valid node target (so VM scrapes
# immediately AND the config is never empty/invalid at startup).
MYIP="<%=customOptions.MYIP%>"
if [ -z "$MYIP" ] || [ "$MYIP" = "null" ]; then
  MYIP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
[ -z "$MYIP" ] && MYIP="localhost"
 
echo "=============================="
echo " VictoriaMetrics INSTALL"
echo " seed scrape target: ${MYIP}:9100"
echo "=============================="
 
# 1. Clean temp + ensure dirs
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
sudo mkdir -p "$DATADIR" "$INSTALL_DIR"
 
# 2. Download
echo "[+] Downloading from ${MORPH_URL}..."
curl -k -L "${MORPH_URL}/api/virtual-images/${FILE_ID}/download" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -o "$WORKDIR/package.zip"
 
# 3. Extract ZIP — interpreter-agnostic (RHEL fix: python3/python/unzip/jar)
echo "[+] Extracting ZIP..."
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then PYTHON_BIN="python"; fi
 
if [ -n "$PYTHON_BIN" ]; then
  echo "    using ${PYTHON_BIN}"
  "$PYTHON_BIN" - "$WORKDIR" <<'EOF'
import sys, zipfile
workdir = sys.argv[1]
path = workdir + "/package.zip"
if not zipfile.is_zipfile(path):
    raise SystemExit("ERROR: Invalid ZIP")
with zipfile.ZipFile(path) as z:
    z.extractall(workdir)
EOF
elif command -v unzip >/dev/null 2>&1; then
  echo "    using unzip"; unzip -o "$WORKDIR/package.zip" -d "$WORKDIR"
elif command -v jar >/dev/null 2>&1; then
  echo "    using jar"; ( cd "$WORKDIR" && jar xf package.zip )
else
  echo "ERROR: no python3/python/unzip/jar to extract"; exit 1
fi
 
# 4. Nested tar.gz
TAR_FILE=$(find "$WORKDIR" -name "*.tar.gz" | head -n 1)
if [ -n "$TAR_FILE" ]; then
  echo "[+] Extracting tar.gz..."; tar -xzf "$TAR_FILE" -C "$WORKDIR"
fi
 
# 5. Locate binary + install to permanent path
VM_BIN=$(find "$WORKDIR" -name "victoria-metrics-prod" -type f | head -n 1)
if [ -z "$VM_BIN" ]; then
  echo "ERROR: victoria-metrics-prod not found"; ls -R "$WORKDIR"; exit 1
fi
echo "[+] Found: $VM_BIN"
 
# Stop any running instance FIRST — otherwise `cp` fails with "text file busy"
# because the running service holds the binary open (this is what made task 6
# fail right after "Found:" and never create the service).
sudo systemctl stop victoria_metrics 2>/dev/null || true
sudo pkill -f victoria-metrics-prod 2>/dev/null || true
sleep 2
 
sudo cp "$VM_BIN" "$INSTALL_DIR/victoria-metrics-prod"
sudo chmod +x "$INSTALL_DIR/victoria-metrics-prod"
 
# 6. Write a CLEAN seed scrape config. Always overwrite — a previous run (or a
#    blackbox scrape task) may have left this file polluted with relabel rules
#    and no valid node_exporter job, which is why Active Targets was empty.
#    Task 8 (Configure Scrape Target) will append additional targets after.
echo "[+] Writing clean $SCRAPE_CONFIG with node_exporter ${MYIP}:9100"
sudo tee "$SCRAPE_CONFIG" > /dev/null <<EOF
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: "node_exporter"
    static_configs:
      - targets: ["${MYIP}:9100"]
EOF
 
# 7. systemd service WITH -promscrape.config (this is what makes VM actually
#    scrape — without it the Active Targets page is empty). configCheckInterval
#    lets task 8's later edits hot-reload without a restart.
echo "[+] Creating systemd service (with promscrape)..."
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=VictoriaMetrics
After=network.target
 
[Service]
User=root
ExecStart=$INSTALL_DIR/victoria-metrics-prod -httpListenAddr=:$VM_PORT -storageDataPath=$DATADIR -retentionPeriod=$RETENTION -promscrape.config=$SCRAPE_CONFIG -promscrape.configCheckInterval=15s
Restart=always
RestartSec=5
 
[Install]
WantedBy=multi-user.target
EOF
 
sudo systemctl daemon-reload
sudo systemctl enable victoria_metrics
sudo systemctl restart victoria_metrics
 
# 8. Open firewall (RHEL ships firewalld active; Ubuntu usually doesn't)
if command -v firewall-cmd >/dev/null 2>&1; then
  echo "[+] Opening port $VM_PORT in firewalld..."
  sudo firewall-cmd --permanent --add-port=${VM_PORT}/tcp >/dev/null 2>&1 || true
  sudo firewall-cmd --reload >/dev/null 2>&1 || true
fi
 
sleep 3
 
# 9. Verify — listening AND scraping
echo "=============================="
if ss -lntp 2>/dev/null | grep -q ":${VM_PORT}"; then
  echo " VICTORIAMETRICS READY on :${VM_PORT}"
  sleep 4
  echo "[+] Active scrape targets:"
  curl -s "http://localhost:${VM_PORT}/api/v1/targets" | head -c 600 || true
  echo ""
else
  echo " WARNING: not listening — service status + journal below:"
  sudo systemctl status victoria_metrics --no-pager || true
  sudo journalctl -u victoria_metrics --no-pager -n 20 || true
fi
echo "=============================="