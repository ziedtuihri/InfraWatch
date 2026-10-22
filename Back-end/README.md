# AlienDataCenter

## Malware scanning integration

The Malware Analysis page lets an operator select running Docker VM containers and start a recurring scan schedule. The backend scans immediately, then repeats after each selected interval has elapsed following the completed scan. The schedule and latest result remain available when the operator leaves and returns to the page, and `DELETE /api/v1/malware/scans/schedule` stops future scans and requests cancellation at the next file boundary. Schedules are held in backend process memory; they do not survive a backend restart. The scan does not inspect the backend container's own filesystem.

Filename rules are stored in `app/data/malicious_filename_prefixes.txt`. A scanned file whose basename starts with a listed prefix (case-insensitive) is reported as malicious, with its host and a descriptive alert in the Malware Analysis results table.

The scanner requires the Docker SDK and access to the Docker daemon. The development Compose file mounts `/var/run/docker.sock` and the model artifact; access to the Docker socket is highly privileged and should only be enabled for a trusted backend deployment.

### Model input

`MALWARE_MODEL_PATH` points to `malware_detection_model.pkl` (default: `MLOps_InfraWatch-/malware_detection_model.pkl` in a source checkout). Set it to the deployed artifact location when running outside the provided Compose setup. The backend pins scikit-learn 1.9.1 to match the artifact. The scanner extracts the six model inputs: file size, byte entropy, `.exe` extension flag, access time, modification time, and metadata-change time. `/proc`, `/sys`, `/dev`, `/run`, `/boot`, `/etc`, `/bin`, `/sbin`, `/lib`, `/lib64`, `/usr`, and `/var/lib` are excluded whenever they fall under the selected scan path. A scan is capped at 5,000 files per container, 32 MiB per file, and 256 MiB total; skipped files and errors are reported in the response.

The feature mapping is not production-validated; validate it against labeled files from the intended VM environments and review false-positive and recall rates before relying on detections. `hex_malware_models.pkl` is not currently used: that artifact expects 531 tabular features named `F_1` through `F_531`, and this repository has no extractor mapping files to that schema. It must not be given invented byte features.

Each container scan is capped at 5,000 files, 32 MiB per file, and 256 MiB total. Skipped files and errors are reported in the response. The endpoint accepts container names or IDs from the running VM list:

```json
{
  "container_ids": ["VM1", "VM2"],
  "target_path": "/"
}
```

The default target is `/`. A different absolute, non-system path can be supplied as `target_path`.

Recurring schedules use `POST /api/v1/malware/scans/schedule` with `container_ids`, `target_path`, and `interval_seconds` (20 seconds to 48 hours). `GET` returns the caller's current schedule and latest result. Schedules are scoped by `X-User-Id`; requests without that header share an anonymous schedule.

## Notification feed

The authenticated Notifications page polls `GET /api/v1/notifications` every 10 seconds using the `X-User-Id` header. The endpoint returns all rows from `notifications` belonging to that user, newest first. `POST /api/v1/notifications/read` accepts `{"notification_ids": [1, 2]}` with the same header and marks only those notifications belonging to that user as read. Opening the page marks the notifications already loaded as read; the page also supports selecting notifications and marking the selection read. Apply the `notifications` table and `idx_notifications_user` index from `db/init.sql` before using the feed.

### MLOps lifecycle

Keep training data and model artifacts out of the API request path. Version the dataset snapshot, training code, dependency set, and exported artifact together; gate promotion on malware recall and false-positive thresholds; deploy an approved artifact atomically; and monitor drift and analyst-confirmed outcomes. The API currently provides inference and alert persistence, while model registry, scheduled retraining, drift monitoring, and response automation remain deployment-level pipeline steps.
