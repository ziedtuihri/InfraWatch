#!/bin/bash
set -e
 
# ============================================================================
# Blackbox scrape-config injector — works for BOTH Prometheus and
# VictoriaMetrics. Appends the canonical blackbox `/probe` jobs (http + icmp)
# using the standard relabel pattern that essentially every blackbox Grafana
# dashboard (7587, 13659, etc.) expects:
#   - scrape goes to the blackbox exporter (:9115)
#   - the actual probe target is carried via __param_target
#   - `instance` ends up = the probed target (so dashboards filter by it)
#
# Custom options (Morpheus template-rendered):
#   TARGET     -> the thing to probe. For http we use http://<ip>; for icmp
#                 the bare <ip>. We derive both from the VM IP passed here.
#   BB_ADDRESS -> "<ip>:9115" — where the blackbox exporter itself listens
#   ENGINE     -> "prometheus" | "victoria"  (which config file to write)
# ============================================================================
 
TARGET_IP="<%=customOptions.TARGET%>"
BB_ADDRESS="<%=customOptions.BB_ADDRESS%>"
ENGINE="<%=customOptions.ENGINE%>"
# What the http probe should hit. The VMs don't run a web server on :80,
# so probing http://<ip> always fails — point http at a known-good
# external URL so the probe demonstrably succeeds (proves exporter +
# scrape path). icmp still probes the VM's own IP (host up/down).
HTTP_TARGET="<%=customOptions.HTTP_TARGET%>"
 
echo "DEBUG TARGET_IP='${TARGET_IP}' BB_ADDRESS='${BB_ADDRESS}' ENGINE='${ENGINE}' HTTP_TARGET='${HTTP_TARGET}'"
 
if [ -z "$TARGET_IP" ] || [ "$TARGET_IP" = "null" ]; then
  echo "ERROR: TARGET not passed"; exit 1
fi
if [ -z "$BB_ADDRESS" ] || [ "$BB_ADDRESS" = "null" ]; then
  BB_ADDRESS="${TARGET_IP}:9115"
fi
if [ -z "$HTTP_TARGET" ] || [ "$HTTP_TARGET" = "null" ]; then
  # Air-gapped lab: the Morpheus appliance is always reachable from every VM
  # (they download packages from it) and serves HTTPS, so it's a reliable
  # http_2xx probe target. Override via the HTTP_TARGET custom option.
  HTTP_TARGET="https://projet1-virtual-machine"
fi
 
# ── Ensure the blackbox MODULE config has TLS verification disabled ──────────
# The Morpheus appliance uses a self-signed cert. Without insecure_skip_verify
# the http_2xx probe fails with "x509: certificate signed by unknown
# authority" (seen on RHEL). The unified installer receives this via
# CONFIG_CONTENT, but deeply-nested YAML can get flattened when passed through
# Morpheus template rendering — so the deployed module config ended up WITHOUT
# the tls_config block. Rewrite it authoritatively here (we run on the same
# VM right after install) so it's guaranteed correct, then restart blackbox.
BB_MODULE_CONFIG="/opt/blackbox_exporter/blackbox_exporter.yml"
if [ -f "$BB_MODULE_CONFIG" ]; then
  echo "[+] Ensuring blackbox module config has TLS skip + icmp..."
  sudo tee "$BB_MODULE_CONFIG" > /dev/null <<'BBCFG'
modules:
  http_2xx:
    prober: http
    timeout: 5s
    http:
      method: GET
      preferred_ip_protocol: ip4
      ip_protocol_fallback: true
      fail_if_not_ssl: false
      tls_config:
        insecure_skip_verify: true
  icmp:
    prober: icmp
    timeout: 5s
    icmp:
      preferred_ip_protocol: ip4
BBCFG
  echo "[+] Restarting blackbox_exporter to apply module config..."
  sudo systemctl restart blackbox_exporter 2>/dev/null || true
  sleep 2
else
  echo "[!] $BB_MODULE_CONFIG not found — is blackbox installed? Skipping module-config fix."
fi
 
# ── Enable ICMP raw sockets (RHEL fix) ───────────────────────────────────────
# On RHEL the icmp probe fails with "socket: operation not permitted" even
# though the service runs as root — raw ICMP sockets need CAP_NET_RAW, which
# systemd/SELinux can strip from the service. The systemd-native fix is to
# add AmbientCapabilities=CAP_NET_RAW to the unit. We inject it into the
# [Service] section of the installer-created unit, then also grant the binary
# the capability and relax the ping sysctl as belt-and-suspenders.
BB_BIN="/opt/blackbox_exporter/blackbox_exporter"
BB_UNIT="/etc/systemd/system/blackbox_exporter.service"
 
if [ -f "$BB_UNIT" ]; then
  if ! grep -q "AmbientCapabilities=CAP_NET_RAW" "$BB_UNIT"; then
    echo "[+] Adding CAP_NET_RAW to the blackbox systemd unit..."
    # Insert the two capability lines right after the [Service] header.
    sudo sed -i '/^\[Service\]/a AmbientCapabilities=CAP_NET_RAW\nCapabilityBoundingSet=CAP_NET_RAW' "$BB_UNIT"
    sudo systemctl daemon-reload
  fi
fi
 
if [ -f "$BB_BIN" ]; then
  echo "[+] Granting CAP_NET_RAW on the binary (fallback)..."
  sudo setcap cap_net_raw+ep "$BB_BIN" 2>/dev/null && echo "    setcap OK" || echo "    setcap unavailable"
fi
sudo sysctl -w net.ipv4.ping_group_range="0 2147483647" >/dev/null 2>&1 || true
 
echo "[+] Restarting blackbox_exporter to apply ICMP capability..."
sudo systemctl restart blackbox_exporter 2>/dev/null || true
sleep 2
 
# Pick config file + reload action based on engine.
case "$ENGINE" in
  victoria|victoriametrics)
    CONFIG="/opt/victoria_metrics/scrape.yml"
    RELOAD_SVC="victoria_metrics"
    ;;
  *)
    CONFIG="/opt/prometheus/prometheus.yml"
    RELOAD_SVC="prometheus"
    ;;
esac
 
echo "[+] Target config: $CONFIG  (engine=$ENGINE)"
 
# Ensure config exists with a scrape_configs: key.
if [ ! -f "$CONFIG" ]; then
  echo "[+] Config missing — creating base"
  sudo mkdir -p "$(dirname "$CONFIG")"
  sudo tee "$CONFIG" > /dev/null <<EOF
global:
  scrape_interval: 15s
scrape_configs:
EOF
fi
 
# Normalize an empty-list "scrape_configs: []" into a block key.
if grep -qE '^scrape_configs:\s*\[\s*\]\s*$' "$CONFIG"; then
  sudo sed -i -E 's/^scrape_configs:\s*\[\s*\]\s*$/scrape_configs:/' "$CONFIG"
fi
grep -q "^scrape_configs:" "$CONFIG" || echo "scrape_configs:" | sudo tee -a "$CONFIG" > /dev/null
 
# Idempotency: skip if a blackbox job for this target already exists.
if grep -q "blackbox_http.*${TARGET_IP}\|__param_target.*${TARGET_IP}" "$CONFIG" 2>/dev/null; then
  echo "[+] Blackbox jobs for ${TARGET_IP} already present, skipping"
else
  echo "[+] Injecting blackbox http + icmp jobs (http=${HTTP_TARGET}, icmp=${TARGET_IP})"
  cat <<EOF | sudo tee -a "$CONFIG" > /dev/null
 
  - job_name: "blackbox_http"
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets: ["${HTTP_TARGET}"]
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: "${BB_ADDRESS}"
 
  - job_name: "blackbox_icmp"
    metrics_path: /probe
    params:
      module: [icmp]
    static_configs:
      - targets: ["${TARGET_IP}"]
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: "${BB_ADDRESS}"
EOF
fi
 
echo "[+] Config now:"
cat "$CONFIG"
 
# Open the blackbox port on the VM. The unified installer doesn't touch the
# firewall, and RHEL ships firewalld active (Ubuntu usually doesn't) — which
# is why :9115 opened on Ubuntu but not RHEL. Handle every common manager.
BB_PORT="9115"
echo "[+] Opening port ${BB_PORT}..."
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow ${BB_PORT}/tcp || true
elif command -v firewall-cmd >/dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-port=${BB_PORT}/tcp || true
  sudo firewall-cmd --reload || true
elif command -v iptables >/dev/null 2>&1; then
  sudo iptables -C INPUT -p tcp --dport ${BB_PORT} -j ACCEPT 2>/dev/null || \
  sudo iptables -A INPUT -p tcp --dport ${BB_PORT} -j ACCEPT || true
fi
 
# Reload the scraper.
echo "[+] Restarting ${RELOAD_SVC}..."
sudo systemctl restart "${RELOAD_SVC}" 2>/dev/null || echo "    (service ${RELOAD_SVC} not found — is it installed on this host?)"
 
sleep 5
echo "[+] Verifying blackbox targets are registered..."
if [ "$ENGINE" = "victoria" ] || [ "$ENGINE" = "victoriametrics" ]; then
  curl -s "http://localhost:8428/api/v1/targets" 2>/dev/null | grep -o "blackbox[^\"]*" | head || true
else
  curl -s "http://localhost:9090/api/v1/targets" 2>/dev/null | grep -o "blackbox[^\"]*" | head || true
fi
echo ""
echo "[+] Done"