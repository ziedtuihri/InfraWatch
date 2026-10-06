#!/bin/bash
 
set -e
 
# ---------------- CONFIG ----------------
MORPH_URL="https://projet1-virtual-machine"
AUTH_TOKEN="ea3c4b6b-4b64-47f5-9954-89e184ec3039"
FILE_ID="227"
 
SERVICE_NAME="prometheus"
SERVICE_FILE="/etc/systemd/system/prometheus.service"
 
echo "=============================="
echo " Prometheus FULL CLEAN INSTALL"
echo "=============================="
 
# ---------------- CHECK TOOLS ----------------
echo "[+] Checking required tools..."
 
for cmd in curl tar find; do
    if ! command -v $cmd >/dev/null 2>&1; then
        echo "ERROR: Missing required tool: $cmd"
        exit 1
    fi
done
 
# ---------------- DETECT PYTHON ----------------
echo "[+] Detecting Python interpreter..."
 
PYTHON_CMD=""
PYTHON_MAJOR=""
 
if command -v python >/dev/null 2>&1; then
    PYTHON_MAJOR=$(python -c 'import sys; print(sys.version_info[0])' 2>/dev/null || echo "")
    if [ "$PYTHON_MAJOR" = "2" ] || [ "$PYTHON_MAJOR" = "3" ]; then
        PYTHON_CMD="python"
    fi
fi
 
if [ -z "$PYTHON_CMD" ] && command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
    PYTHON_MAJOR=3
fi
 
if [ -z "$PYTHON_CMD" ]; then
    echo "ERROR: No working Python found"
    exit 1
fi
 
echo "[+] Using: $PYTHON_CMD (Python $PYTHON_MAJOR)"
 
# ---------------- SAFE INSTALL LOCATION (FIXED) ----------------
echo "[+] Detecting safe install location..."
 
INSTALL_DIR=""
 
# NEVER trust /opt on minimal systems
if [ -w /usr/local ] 2>/dev/null; then
    INSTALL_DIR="/usr/local/prometheus"
elif [ -w "$HOME" ]; then
    INSTALL_DIR="$HOME/prometheus"
else
    echo "ERROR: No writable install location found"
    exit 1
fi
 
echo "[+] Install directory: $INSTALL_DIR"
 
# ---------------- CLEAN SERVICE ----------------
echo "[+] Cleaning old service..."
 
sudo systemctl stop $SERVICE_NAME 2>/dev/null || true
sudo systemctl disable $SERVICE_NAME 2>/dev/null || true
sudo rm -f "$SERVICE_FILE" 2>/dev/null || true
sudo systemctl daemon-reload 2>/dev/null || true
sudo systemctl reset-failed $SERVICE_NAME 2>/dev/null || true
 
# ---------------- CLEAN INSTALL ----------------
echo "[+] Removing old installation..."
rm -rf "$INSTALL_DIR"
 
mkdir -p /tmp/prom_test
 
# ---------------- DOWNLOAD ----------------
echo "[+] Downloading package..."
 
curl -k -f -L "${MORPH_URL}/api/virtual-images/${FILE_ID}/download" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -o /tmp/prom_test/package.zip
 
if [ ! -f /tmp/prom_test/package.zip ]; then
    echo "ERROR: Download failed"
    exit 1
fi
 
echo "[+] Download complete"
 
# ---------------- EXTRACT ZIP ----------------
echo "[+] Extracting archive..."
 
$PYTHON_CMD <<EOF
import zipfile
import sys
 
try:
    with zipfile.ZipFile('/tmp/prom_test/package.zip', 'r') as z:
        z.extractall('/tmp/prom_test/')
    print("OK")
except Exception as e:
    print("FAILED:", e)
    sys.exit(1)
EOF
 
# ---------------- HANDLE TAR ----------------
TAR_FILE=$(find /tmp/prom_test -name "*.tar.gz" | head -n 1)
 
if [ -n "$TAR_FILE" ]; then
    echo "[+] Extracting tar.gz..."
    tar -xvzf "$TAR_FILE" -C /tmp/prom_test/
fi
 
# ---------------- FIND BINARY ----------------
echo "[+] Locating prometheus binary..."
 
PROM_PATH=$(find /tmp/prom_test -type f -name "prometheus" | head -n 1)
 
if [ -z "$PROM_PATH" ]; then
    echo "ERROR: Prometheus binary not found"
    find /tmp/prom_test | head -50
    exit 1
fi
 
PROM_DIR=$(dirname "$PROM_PATH")
 
echo "[+] Found binary: $PROM_PATH"
 
# ---------------- INSTALL ----------------
echo "[+] Installing to $INSTALL_DIR..."
 
mkdir -p "$INSTALL_DIR"
cp -r "$PROM_DIR/"* "$INSTALL_DIR/"
 
# ---------------- USER ----------------
id prometheus >/dev/null 2>&1 || sudo useradd --no-create-home --shell /bin/false prometheus
 
sudo chown -R prometheus:prometheus "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/prometheus"
 
# ---------------- FINAL VERIFICATION ----------------
echo "[+] Verifying installation..."
 
if [ ! -f "$INSTALL_DIR/prometheus" ]; then
    echo "ERROR: installation failed (file missing)"
    exit 1
fi
 
echo "=============================="
echo " INSTALL SUCCESS"
echo "=============================="
 
echo "[+] Installed at:"
echo "$INSTALL_DIR"
 
ls -lah "$INSTALL_DIR"
 
echo "[+] Binary test:"
"$INSTALL_DIR/prometheus" --version || true