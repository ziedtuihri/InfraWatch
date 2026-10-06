MYIP="<%=customOptions.MYIP%>"
echo "DEBUG IP_HOST='${MYIP}'"
 
if [ -z "$MYIP" ] || [ "$MYIP" = "null" ]; then
  echo "ERROR: IP_HOST not passed from customOptions"
  exit 1
fi
 
GRAFANA_URL="http://localhost:3000"
GUSER="admin"
GPASS="admin"
DS_NAME="VictoriaMetrics-${MYIP}"
FILE=/etc/grafana/provisioning/datasources/prometheus.yml
 
# ── Clean up ANY pre-existing registration of this datasource ────────────────
# A datasource can exist in two places: the provisioning file OR Grafana's DB
# (if it was ever created via the API). A stale/broken DB entry can't be
# overwritten by the provisioning file, and a stale provisioning entry makes
# the old "grep && exit" guard skip the rewrite. So we clear BOTH first, then
# write one clean provisioning entry — exactly the version that worked.
 
# 1) Delete from Grafana DB via API if present (ignore errors / API differences).
DS_ID=$(curl -s -u "${GUSER}:${GPASS}" "${GRAFANA_URL}/api/datasources/name/${DS_NAME}" \
  | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -n1)
if [ -n "$DS_ID" ]; then
  echo "[+] Removing existing DB datasource id=${DS_ID}"
  curl -s -u "${GUSER}:${GPASS}" -X DELETE "${GRAFANA_URL}/api/datasources/${DS_ID}" >/dev/null 2>&1 || true
fi
 
# 2) Remove any existing block for this datasource from the provisioning file
#    so we don't duplicate it and so a previously-broken block is replaced.
touch "$FILE"
if grep -q "name: ${DS_NAME}" "$FILE" 2>/dev/null; then
  echo "[+] Removing existing provisioning block for ${DS_NAME}"
  # Delete the 7-line block starting at the matching "- name:" line.
  sudo sed -i "/- name: ${DS_NAME}/,+6d" "$FILE" 2>/dev/null \
    || sed -i "/- name: ${DS_NAME}/,+6d" "$FILE" 2>/dev/null || true
fi
 
# ── Write the clean datasource (exactly the working version) ─────────────────
grep -q "apiVersion: 1" "$FILE" || cat >> "$FILE" <<BASE
apiVersion: 1
 
datasources:
BASE
 
cat >> "$FILE" <<EOD
 
  - name: ${DS_NAME}
    type: prometheus
    access: proxy
    url: http://${MYIP}:8428
    isDefault: false
    editable: false
 
EOD
 
echo "[+] Wrote clean datasource ${DS_NAME} -> http://${MYIP}:8428"
systemctl restart grafana-server.service
echo "[+] Grafana restarted"