#!/bin/bash
set -e
 
# ============================================================================
# VictoriaMetrics scrape-target injector — the VM equivalent of the Prometheus
# "Direct Scrape" task (task 8). Appends a scrape target to VM's scrape config
# and restarts the service so it picks it up. SAME logic/flow as Prometheus —
# just VM's config file + VM's service.
#
# The VM install (task 6) already:
#   - created /opt/victoria_metrics/scrape.yml (seeded with the node target)
#   - started the victoria_metrics service WITH -promscrape.config pointing at
#     that file (+ configCheckInterval for hot-reload)
# So here we only append (if missing) and reload — no service edits needed.
#
# Custom options (Morpheus template-rendered):
#   TARGET   -> "<ip>:9100"
#   JOB_NAME -> node_exporter
# ============================================================================
 
VM_CONFIG="/opt/victoria_metrics/scrape.yml"
TARGET="<%=customOptions.TARGET%>"
JOB_NAME="<%=customOptions.JOB_NAME%>"
[ -z "$JOB_NAME" ] && JOB_NAME="node_exporter"
 
echo "=============================="
echo " VictoriaMetrics CONFIG INJECTOR"
echo "=============================="
 
if [ -z "$TARGET" ] || [ "$TARGET" = "null" ]; then
  echo "ERROR: TARGET is required"; exit 1
fi
 
# Ensure the config exists (install seeds it, but be safe on a standalone run).
if [ ! -f "$VM_CONFIG" ]; then
  echo "[+] Config missing — creating base $VM_CONFIG"
  sudo mkdir -p "$(dirname "$VM_CONFIG")"
  sudo tee "$VM_CONFIG" > /dev/null <<EOF
global:
  scrape_interval: 15s
scrape_configs:
EOF
fi
 
# Avoid duplicates (mirror Prometheus task 8). Match the FULL target incl port
# — not just the IP — so a blackbox entry (<ip>:9115) doesn't cause the node
# target (<ip>:9100) to be wrongly skipped (they share the same IP).
if grep -q "\"$TARGET\"" "$VM_CONFIG"; then
  echo "[+] Target $TARGET already exists, skipping append"
else
  # Normalize an empty-list "scrape_configs: []" to a block key so we can append.
  if grep -qE '^scrape_configs:\s*\[\s*\]\s*$' "$VM_CONFIG"; then
    sudo sed -i -E 's/^scrape_configs:\s*\[\s*\]\s*$/scrape_configs:/' "$VM_CONFIG"
  fi
  grep -q "^scrape_configs:" "$VM_CONFIG" || echo "scrape_configs:" | sudo tee -a "$VM_CONFIG" > /dev/null
 
  echo "[+] Injecting target $TARGET (job=$JOB_NAME)"
  cat <<EOF | sudo tee -a "$VM_CONFIG" > /dev/null
 
  - job_name: "${JOB_NAME}"
    static_configs:
      - targets: ["${TARGET}"]
EOF
fi
 
echo "[+] Config now:"
cat "$VM_CONFIG"
 
# Reload (mirror Prometheus task 8's restart). The service already has
# -promscrape.config baked in, so a restart makes it read the updated file.
echo "[+] Restarting VictoriaMetrics..."
sudo systemctl restart victoria_metrics
 
sleep 5
echo "[+] Verifying target is now active..."
curl -s "http://localhost:8428/api/v1/targets" | head -c 800 || true
echo ""
echo "[+] Done"