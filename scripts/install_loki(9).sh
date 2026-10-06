#!/bin/bash
 
set -e
 
# ---------------- INPUTS ----------------
PROM_CONFIG="/opt/prometheus/prometheus.yml"
TARGET="<%=customOptions.TARGET%>"
JOB_NAME="<%=customOptions.JOB_NAME%>"
 
if [ -z "$JOB_NAME" ]; then
  JOB_NAME="type1_auto_exporter"
fi
 
echo "=============================="
echo " Prometheus CONFIG INJECTOR"
echo "=============================="
 
# ---------------- VALIDATION ----------------
if [ -z "$TARGET" ]; then
  echo "ERROR: TARGET is required"
  exit 1
fi
 
# ---------------- CHECK CONFIG ----------------
if [ ! -f "$PROM_CONFIG" ]; then
  echo "ERROR: Prometheus config not found: $PROM_CONFIG"
  exit 1
fi
 
# ---------------- AVOID DUPLICATES ----------------
if grep -q "$TARGET" "$PROM_CONFIG"; then
  echo "[+] Target already exists, skipping"
  exit 0
fi
 
# ---------------- INJECT ----------------
cat <<EOF >> "$PROM_CONFIG"
 
  - job_name: "${JOB_NAME}"
    static_configs:
      - targets: ["${TARGET}"]
EOF
 
echo "[+] Config updated"
 
# ---------------- RELOAD ----------------
echo "[+] Restarting Prometheus..."
 
systemctl restart prometheus
 
echo "[+] Reload complete"