#!/bin/bash
set -e
 
TEMPLATE_ID="<%= customOptions.TEMPLATE_ID %>"
# Optional: which datasource to bind the dashboard's inputs to. If not
# provided, we auto-pick the first Prometheus-type datasource in Grafana.
DS_NAME="<%= customOptions.DS_NAME %>"
 
GRAFANA_URL="http://localhost:3000"
USER="admin"
PASS="admin"
 
echo "Downloading dashboard ID: ${TEMPLATE_ID}"
curl -s -L \
  "https://grafana.com/api/dashboards/${TEMPLATE_ID}/revisions/latest/download" \
  -o dashboard.json
 
# Detect a usable interpreter (python/python3) for JSON work — same RHEL-safe
# pattern as the installers.
PYTHON_CMD=""
if command -v python >/dev/null 2>&1; then PYTHON_CMD="python"
elif command -v python3 >/dev/null 2>&1; then PYTHON_CMD="python3"; fi
if [ -z "$PYTHON_CMD" ]; then echo "ERROR: no python available"; exit 1; fi
 
# Resolve a real datasource to bind to. If DS_NAME wasn't passed, pick the
# first prometheus-type datasource Grafana knows about (VictoriaMetrics is
# registered as type 'prometheus' too, so this covers both).
if [ -z "$DS_NAME" ] || [ "$DS_NAME" = "null" ]; then
  DS_NAME=$(curl -s -u "${USER}:${PASS}" "${GRAFANA_URL}/api/datasources" \
    | "$PYTHON_CMD" -c 'import sys,json; d=json.load(sys.stdin); print(next((x["name"] for x in d if x.get("type")=="prometheus"), ""))')
fi
 
if [ -z "$DS_NAME" ]; then
  echo "ERROR: no prometheus-type datasource found in Grafana to bind to"
  curl -s -u "${USER}:${PASS}" "${GRAFANA_URL}/api/datasources" | head -c 500
  exit 1
fi
 
# Also resolve its UID — modern Grafana panels reference datasources by uid,
# not name, so we need both for a complete substitution.
DS_UID=$(curl -s -u "${USER}:${PASS}" "${GRAFANA_URL}/api/datasources/name/${DS_NAME}" \
  | "$PYTHON_CMD" -c 'import sys,json; print(json.load(sys.stdin).get("uid",""))' 2>/dev/null || echo "")
 
echo "Binding dashboard inputs to datasource: ${DS_NAME} (uid=${DS_UID})"
 
# Build the import payload. CRITICAL: blackbox (and many other) grafana.com
# dashboards declare an __inputs datasource requirement (e.g. DS_PROMETHEUS).
# If we don't supply the `inputs` binding, the import leaves the literal
# placeholder "${DS_PROMETHEUS}" in every panel and you get
# "Datasource ${DS_PROMETHEUS} was not found" → No data. We read the
# dashboard's __inputs and bind EACH datasource input to the real DS.
"$PYTHON_CMD" - "$DS_NAME" "$DS_UID" <<'EOF'
import sys, json, re
 
ds_name = sys.argv[1]
ds_uid  = sys.argv[2] if len(sys.argv) > 2 else ""
with open("dashboard.json") as f:
    dash = json.load(f)
 
# ── Make the datasource URL-DRIVEN (one shared dashboard, per-resource) ──────
# A grafana.com template imports to a fixed UID, so every resource using this
# template shares ONE dashboard in Grafana. If we baked a specific datasource
# into the panels, the last resource to import would win and break the others.
# Instead we expose the datasource as a template VARIABLE named "datasource"
# and point every panel at it — then the iframe URL drives it per-resource
# with var-datasource=<uid>.
 
VAR_NAME = "datasource"
 
# 1) Collect the datasource input/placeholder names this dashboard uses
#    (e.g. DS_PROMETHEUS, DS_SIGNCL-PROMETHEUS) so we can repoint them.
input_names = [i["name"] for i in dash.get("__inputs", []) if i.get("type") == "datasource"]
 
# 2) Drop __inputs so the import doesn't demand a fixed binding.
dash.pop("__inputs", None)
dash.pop("__requires", None)
 
# 3) Ensure a datasource template variable exists at the top of templating.
templating = dash.setdefault("templating", {})
tlist = templating.setdefault("list", [])
# Remove any existing datasource-type vars to avoid duplicates/conflicts.
tlist = [t for t in tlist if t.get("type") != "datasource"]
tlist.insert(0, {
    "name": VAR_NAME,
    "type": "datasource",
    "query": "prometheus",          # VictoriaMetrics is registered as prometheus-type too
    "label": "Datasource",
    "hide": 0,
    "current": {},
    "refresh": 1,
})
templating["list"] = tlist
 
# 4) Repoint every datasource reference in the whole dashboard to the
#    template variable. Covers: the ${DS_...} placeholders, and the modern
#    object form {"type":"prometheus","uid":"..."} on panels/targets.
raw = json.dumps(dash)
for name in input_names:
    raw = raw.replace("${%s}" % name, "${%s}" % VAR_NAME)
raw = re.sub(r"\$\{DS_[A-Za-z0-9_\-]+\}", "${%s}" % VAR_NAME, raw)
dash = json.loads(raw)
 
def repoint(obj):
    if isinstance(obj, dict):
        # Panel/target datasource object → point at the variable.
        if "datasource" in obj:
            ds = obj["datasource"]
            if isinstance(ds, dict) and ds.get("type") in ("prometheus", None):
                obj["datasource"] = {"type": "prometheus", "uid": "${%s}" % VAR_NAME}
            elif isinstance(ds, str) and (ds == "" or ds.startswith("${")):
                obj["datasource"] = "${%s}" % VAR_NAME
        for v in obj.values():
            repoint(v)
    elif isinstance(obj, list):
        for v in obj:
            repoint(v)
 
repoint(dash)
 
# No inputs binding needed now — the variable + URL drive the datasource.
payload = {"dashboard": dash, "overwrite": True}
with open("import.json", "w") as f:
    json.dump(payload, f)
 
print("Datasource is now URL-driven via var-%s (repointed %d input placeholder(s): %s)"
      % (VAR_NAME, len(input_names), ", ".join(input_names) or "none"))
EOF
 
echo "Importing into Grafana..."
RESP=$(curl -s -u "${USER}:${PASS}" \
  -H "Content-Type: application/json" \
  -X POST \
  --data-binary @import.json \
  "${GRAFANA_URL}/api/dashboards/db")
 
echo "$RESP"
 
DASH_UID=$(echo "$RESP" | "$PYTHON_CMD" -c 'import sys,json; print(json.load(sys.stdin).get("uid",""))' 2>/dev/null || echo "")
if [ -n "$DASH_UID" ]; then
  echo "[+] Imported uid=$DASH_UID — datasource is URL-driven via var-datasource."
  echo "    The iframe must pass var-datasource=<datasource-uid> per resource."
fi
 
echo ""
echo "Done"