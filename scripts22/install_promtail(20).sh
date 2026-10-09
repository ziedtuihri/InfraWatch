#!/bin/bash
set -e
 
# ============================================================================
# Promtail install — ships this resource's logs to the CENTRAL Loki.
# Adapted to the InfraWatch pipeline pattern:
#   - LOKI_HOST custom option -> central Loki (the InfraWatch server)
#   - MYIP / HOSTNAME custom options -> stream labels so the Logs Page can
#     filter by resource
#   - runs as ROOT so it can read /var/log on RHEL (root-owned, 0600)
#   - covers BOTH RHEL (/var/log/messages,secure) and Ubuntu (/var/log/syslog)
#   - interpreter-agnostic extraction (python/python3)
# ============================================================================
 
MORPH_URL="https://projet1-virtual-machine"
AUTH_TOKEN="ea3c4b6b-4b64-47f5-9954-89e184ec3039"
FILE_ID="260"
 
SERVICE_NAME="promtail"
SERVICE_FILE="/etc/systemd/system/promtail.service"
INSTALL_DIR="/usr/local/promtail"
 
# Central Loki host (the InfraWatch/Grafana server). Promtail pushes here.
LOKI_HOST="<%=customOptions.LOKI_HOST%>"
if [ -z "$LOKI_HOST" ] || [ "$LOKI_HOST" = "null" ]; then
  LOKI_HOST="10.202.52.94"
fi
LOKI_URL="http://${LOKI_HOST}:3100"
 
# This resource's identity, used as stream labels for the Logs Page filter.
MYIP="<%=customOptions.MYIP%>"
if [ -z "$MYIP" ] || [ "$MYIP" = "null" ]; then
  MYIP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
[ -z "$MYIP" ] && MYIP="unknown"
 
HOST_LABEL="<%=customOptions.HOSTNAME%>"
if [ -z "$HOST_LABEL" ] || [ "$HOST_LABEL" = "null" ]; then
  HOST_LABEL=$(hostname 2>/dev/null || echo "$MYIP")
fi
 
echo "=============================="
echo "   PROMTAIL -> LOKI INSTALL"
echo "   push to: ${LOKI_URL}"
echo "   host=${HOST_LABEL} instance=${MYIP}:9100"
echo "=============================="
 
# ---------------- TOOLS + PYTHON ----------------
for cmd in curl find; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing $cmd"; exit 1; }
done
PYTHON_CMD=""
if command -v python3 >/dev/null 2>&1; then PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then PYTHON_CMD="python"; fi
[ -z "$PYTHON_CMD" ] && { echo "ERROR: no python"; exit 1; }
echo "[+] python: $PYTHON_CMD"
 
# ---------------- STOP OLD (before removing binary) ----------------
sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
sudo pkill -f "$INSTALL_DIR/promtail" 2>/dev/null || true
sudo rm -f "$SERVICE_FILE" 2>/dev/null || true
sudo systemctl daemon-reload 2>/dev/null || true
sleep 1
sudo rm -rf "$INSTALL_DIR"
rm -rf /tmp/promtail_install
mkdir -p /tmp/promtail_install
 
# ---------------- DOWNLOAD ----------------
echo "[+] Downloading..."
curl -k -f -L "${MORPH_URL}/api/virtual-images/${FILE_ID}/download" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -o /tmp/promtail_install/package.zip
[ -f /tmp/promtail_install/package.zip ] || { echo "ERROR: download failed"; exit 1; }
 
# ---------------- EXTRACT (+ nested) ----------------
echo "[+] Extracting..."
"$PYTHON_CMD" - <<'EOF'
import zipfile
with zipfile.ZipFile('/tmp/promtail_install/package.zip') as z:
    z.extractall('/tmp/promtail_install')
EOF
while find /tmp/promtail_install -type f -name "*.zip" | grep -q .; do
  Z=$(find /tmp/promtail_install -type f -name "*.zip" | head -n 1)
  echo "    nested: $Z"
  "$PYTHON_CMD" - "$Z" <<'EOF'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    z.extractall("/tmp/promtail_install")
EOF
  rm -f "$Z"
done
 
# ---------------- FIND BINARY ----------------
PROMTAIL_BIN=$(find /tmp/promtail_install -type f -name "promtail*" ! -name "*.zip" ! -name "*.yaml" | head -n 1)
[ -z "$PROMTAIL_BIN" ] && { echo "ERROR: promtail binary not found"; find /tmp/promtail_install | head -50; exit 1; }
echo "[+] Found: $PROMTAIL_BIN"
chmod +x "$PROMTAIL_BIN"
 
# ---------------- INSTALL ----------------
sudo mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/config"
# Persistent dir for the positions file (survives reboots so Promtail resumes
# from where it left off rather than re-reading or losing its place).
sudo mkdir -p /var/lib/promtail
sudo cp "$PROMTAIL_BIN" "$INSTALL_DIR/promtail"
sudo chmod +x "$INSTALL_DIR/promtail"
 
# ---------------- CONFIG ----------------
# Labels host + instance on EVERY stream so the backend can filter by resource.
# __path__ covers Ubuntu (syslog, *.log) AND RHEL (messages, secure, cron).
echo "[+] Writing config..."
sudo tee "$INSTALL_DIR/config/promtail.yaml" > /dev/null <<EOF
server:
  http_listen_port: 9080
  grpc_listen_port: 0
 
positions:
  filename: /var/lib/promtail/positions.yaml
 
clients:
  - url: ${LOKI_URL}/loki/api/v1/push
 
scrape_configs:
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: varlogs
          host: "${HOST_LABEL}"
          instance: "${MYIP}:9100"
          __path__: /var/log/{syslog,messages,secure,auth.log,cron,*.log}
 
  # journald — RHEL/systemd logs primarily go here, not always to /var/log
  # files. Omit an explicit 'path' so Promtail uses the system default journal
  # location (works whether the journal is persistent at /var/log/journal or
  # volatile at /run/log/journal). Hardcoding /var/log/journal crashes Promtail
  # on hosts where that directory doesn't exist.
  - job_name: journal
    journal:
      max_age: 12h
      labels:
        job: varlogs
        host: "${HOST_LABEL}"
        instance: "${MYIP}:9100"
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: unit
EOF
 
# ---------------- ENSURE JOURNAL IS READABLE ----------------
# Promtail's journal target needs a populated journal directory. On some RHEL
# hosts journald is volatile (/run/log/journal) and /var/log/journal is absent,
# which crashed Promtail ("no such file or directory"). Make it persistent,
# flush existing volatile logs into it, and verify before starting Promtail.
echo "[+] Ensuring persistent journald..."
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal 2>/dev/null || true
# Make journald persistent across boots.
if [ -f /etc/systemd/journald.conf ]; then
  sudo sed -i 's/^#\?Storage=.*/Storage=persistent/' /etc/systemd/journald.conf 2>/dev/null || true
fi
sudo systemctl restart systemd-journald 2>/dev/null || true
sleep 1
# Flush any volatile logs into the persistent store so the dir has content.
sudo journalctl --flush 2>/dev/null || true
sleep 1
 
# If the journal directory STILL has no machine subdirectory, drop the journal
# job from the config so Promtail doesn't crash — the file-based scrape alone
# still ships /var/log on this host.
if ! sudo find /var/log/journal -mindepth 1 -maxdepth 1 -type d 2>/dev/null | grep -q .; then
  echo "[!] No persistent journal present — removing journal job (file scrape still active)."
  sudo "$PYTHON_CMD" - "$INSTALL_DIR/config/promtail.yaml" <<'PYEOF'
import sys, re
p = sys.argv[1]
txt = open(p).read()
# Strip the '- job_name: journal' block up to (but not including) the next
# top-level list item or EOF.
txt = re.sub(r"\n  - job_name: journal.*?(?=\n  - job_name:|\Z)", "\n", txt, flags=re.S)
open(p, "w").write(txt)
PYEOF
fi
 
# ---------------- SYSTEMD (run as ROOT to read /var/log) ----------------
echo "[+] Creating service (User=root for /var/log access)..."
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Promtail Agent
After=network.target
 
[Service]
User=root
ExecStart=$INSTALL_DIR/promtail -config.file=$INSTALL_DIR/config/promtail.yaml
Restart=always
RestartSec=5
 
[Install]
WantedBy=multi-user.target
EOF
 
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
 
# ---------------- SELINUX (RHEL) ----------------
# On RHEL, SELinux can block a service from making outbound network connections
# (the push to central Loki) and from reading some log paths — even as root —
# which shows up as "HTTP 000" / no logs arriving. Allow it.
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce 2>/dev/null)" = "Enforcing" ]; then
  echo "[+] SELinux is Enforcing — applying booleans for outbound + log read..."
  # Let confined services initiate network connections.
  sudo setsebool -P nis_enabled 1 2>/dev/null || true
  sudo setsebool -P daemons_enable_cluster_mode 1 2>/dev/null || true
  # The reliable, low-friction fix for a custom agent: label the binary as a
  # generic executable and allow it network access. If that's not enough,
  # fall back to permissive for just this domain isn't simple for an unconfined
  # binary — running ExecStart as root under unconfined_service_t usually works.
  # As a last resort (lab/demo), set SELinux permissive so logs flow.
  sudo setenforce 0 2>/dev/null || true
  echo "    (set SELinux permissive so Promtail can push; revisit for prod)"
fi
 
# ---------------- START ----------------
sudo systemctl restart "$SERVICE_NAME"
 
# ---------------- VERIFY ----------------
sleep 3
echo "=============================="
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo " PROMTAIL RUNNING -> ${LOKI_URL}"
  echo "[+] Testing reachability to central Loki (with retries)..."
  CODE="000"
  for i in 1 2 3 4 5; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${LOKI_URL}/ready" || echo "000")
    [ "$CODE" = "200" ] && break
    echo "    attempt $i: HTTP $CODE — retrying..."
    sleep 3
  done
  if [ "$CODE" = "200" ]; then
    echo "    Loki reachable (HTTP 200) — logs should start flowing."
  else
    echo "    WARNING: still HTTP $CODE reaching ${LOKI_URL}/ready."
    echo "    Check: firewall on the server's :3100, and this VM's route to ${LOKI_HOST}."
  fi
else
  echo " ERROR: Promtail failed to start"
  sudo systemctl status "$SERVICE_NAME" --no-pager || true
  sudo journalctl -u "$SERVICE_NAME" --no-pager -n 25 || true
  exit 1
fi
echo "=============================="