# AlienDataCenter

## Malware scanning integration

The API does not execute the notebook or scan the backend host. It dispatches a Morpheus task to VM instances; the VM-side collector extracts the notebook's six features, and FastAPI loads the trained model, scores each batch, and stores detections in the existing `alert_log`. The `GET /api/v1/malware/notifications` response is the frontend notification-table source. Each row includes `vm_name`, `resource_id`, `name` (the alert description), `severity`, `status`, and `fired_at`.

### Model artifact

The notebook is exploratory and depends on `malwareDataset.csv`; it does not include the dataset or a trained artifact. Train/export a deployable pipeline from the backend directory:

```bash
python scripts/train_malware_model.py /path/to/malwareDataset.csv --output models/malware_model.joblib
```

Deploy that artifact at `MALWARE_MODEL_PATH` (default `models/malware_model.joblib`) and restart the API after replacing it. The training script fits scaling and classification together in one sklearn `Pipeline`, preventing inference from accidentally using a different scaler.

**Do not treat the current notebook features as production-validated.** It assigns file size, entropy, executable status, and filesystem timestamps to dataset columns named `usage_counter`, `fs_excl_counter`, `task_size`, `end_data`, `policy`, and `nivcsw`. Those dataset columns must actually have those meanings and comparable units. Validate them against labeled files from the intended VM environments, use a held-out test set, and review malware recall/false-positive rates before enabling automated response. The training script reports test metrics but does not claim the feature mapping is sound.

### API and Morpheus setup

Configure these backend environment variables:

```env
MALWARE_MODEL_PATH=/app/models/malware_model.joblib
MALWARE_SCAN_TASK_ID=<Morpheus task id>
MALWARE_CALLBACK_URL=https://<backend-host>:8001
MALWARE_CALLBACK_TOKEN=<long random shared secret>
```

The backend action is `POST /api/v1/malware/scans` with `X-User-Id` and either `{ "all_instances": true, "target_path": "/" }` or `{ "instance_ids": [17, 18], "target_path": "/opt" }`. The `all_instances` mode pages through Morpheus instances. The endpoint dispatches `MALWARE_SCAN_TASK_ID` with per-task custom options `TARGET_PATH`, `CALLBACK_URL`, and `CALLBACK_TOKEN`.

Configure that Morpheus task to invoke `scripts/malware_scanner.py` on each target VM, passing the custom options plus that VM's Morpheus resource ID and display name as `RESOURCE_ID` and `VM_NAME`. Ensure the scanner script is installed or delivered to the VM by the task, Python 3 is available, and the VM can reach the callback URL. The scanner posts up to 100 files per request to `POST /api/v1/malware/scan-results`; callback requests must include `X-Malware-Token`. The callback endpoint runs model inference and only persists positive detections.

Notifications can be loaded with `GET /api/v1/malware/notifications?limit=100&offset=0` and the normal `X-User-Id` header. Detections are recorded as Critical alerts in `alert_log`, so existing acknowledgement and audit history behavior is reused; repeated scans of the same file do not create a new row unless an acknowledged alert is re-fired.

### MLOps lifecycle

Keep training data and model artifacts out of the API request path. Version the dataset snapshot, training code, dependency set, and exported artifact together; gate promotion on malware recall and false-positive thresholds; deploy an approved artifact atomically; and monitor drift and analyst-confirmed outcomes. The API currently provides inference and alert persistence, while model registry, scheduled retraining, drift monitoring, and response automation remain deployment-level pipeline steps.
