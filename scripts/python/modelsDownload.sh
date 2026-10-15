#!/bin/bash
set -e

MORPH_URL="https://projet1-virtual-machine"
AUTH_TOKEN="ea3c4b6b-4b64-47f5-9954-89e184ec3039"
MODEL_FILE_ID="220"  # <-- Replace with your model's Morpheus file/image ID

INSTALL_DIR="/opt/malware_scanner/models"

echo "[+] Downloading trained model package from Morpheus..."
mkdir -p /tmp/malware_pkg "$INSTALL_DIR"

curl -k -L "${MORPH_URL}/api/virtual-images/${MODEL_FILE_ID}/download" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -o /tmp/malware_pkg/package.zip

# Extract package
python3 - << 'EOF'
import zipfile
path = "/tmp/malware_pkg/package.zip"
if zipfile.is_zipfile(path):
    with zipfile.ZipFile(path) as z:
        z.extractall("/tmp/malware_pkg/")
EOF

# Move models to destination
cp /tmp/malware_pkg/*.pkl "$INSTALL_DIR/"
echo "[+] Model successfully downloaded and placed in $INSTALL_DIR ✔"