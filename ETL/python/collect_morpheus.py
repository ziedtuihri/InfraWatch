#!/usr/bin/env python3
"""Read Morpheus inventory endpoints and save one versioned JSON snapshot."""

import argparse
import json
import os
import ssl
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ENDPOINTS = {
    "hosts": ("servers", "servers", {}),
    "vms": ("instances", "instances", {"details": "true"}),
    "networks": ("networks", "networks", {}),
    "datastores": ("data-stores", "datastores", {}),
}
PAGE_SIZE = 100
SENSITIVE_KEY_PARTS = (
    "password",
    "token",
    "secret",
    "credential",
    "privatekey",
    "authorization",
    "passphrase",
)


class CollectionError(RuntimeError):
    """Raised when a Morpheus endpoint cannot be collected safely."""


def _redact_sensitive_values(value):
    if isinstance(value, dict):
        return {
            key: (
                "[REDACTED]"
                if any(part in key.lower().replace("_", "") for part in SENSITIVE_KEY_PARTS)
                else _redact_sensitive_values(child)
            )
            for key, child in value.items()
        }
    if isinstance(value, list):
        return [_redact_sensitive_values(item) for item in value]
    return value


def _request_json(url: str, token: str, context: ssl.SSLContext, timeout: int) -> dict:
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="GET",
    )
    try:
        with urlopen(request, context=context, timeout=timeout) as response:
            payload = json.load(response)
    except HTTPError as exc:
        raise CollectionError(
            f"Morpheus GET failed with HTTP {exc.code} for {url.split('?', 1)[0]}"
        ) from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise CollectionError(
            f"Could not collect Morpheus endpoint {url.split('?', 1)[0]}: {exc}"
        ) from exc

    if not isinstance(payload, dict):
        raise CollectionError("Morpheus returned a non-object JSON response")
    return payload


def _collect_endpoint(
    base_url: str,
    endpoint: str,
    response_key: str,
    extra_params: dict[str, str],
    token: str,
    context: ssl.SSLContext,
    timeout: int,
    max_pages: int,
) -> list[dict]:
    records = []
    for page in range(max_pages):
        params = urlencode(
            {"max": PAGE_SIZE, "offset": page * PAGE_SIZE, **extra_params}
        )
        payload = _request_json(
            f"{base_url}/api/{endpoint}?{params}", token, context, timeout
        )
        page_records = payload.get(response_key)
        if not isinstance(page_records, list):
            raise CollectionError(
                f"Morpheus response for /api/{endpoint} has no {response_key} list"
            )
        if any(not isinstance(record, dict) for record in page_records):
            raise CollectionError(
                f"Morpheus response for /api/{endpoint} contains a non-object record"
            )
        records.extend(_redact_sensitive_values(record) for record in page_records)
        if len(page_records) < PAGE_SIZE:
            return records
    raise CollectionError(
        f"Reached MORPHEUS_MAX_PAGES={max_pages} while collecting /api/{endpoint}; "
        "increase the limit so the snapshot is complete"
    )


def collect_snapshot(
    base_url: str,
    token: str,
    environment: str,
    run_id: str,
    validate_certs: bool = True,
    max_pages: int = 100,
    timeout: int = 30,
) -> dict:
    if not base_url.startswith(("https://", "http://")):
        raise ValueError("MORPHEUS_URL must start with https:// or http://")
    if not token:
        raise ValueError("MORPHEUS_TOKEN is required")
    if max_pages < 1:
        raise ValueError("max_pages must be positive")

    context = ssl.create_default_context()
    if not validate_certs:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

    snapshot = {
        "run_id": run_id,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "source": "morpheus",
        "environment": environment,
        "containers": [],
    }
    normalized_url = base_url.rstrip("/")
    for key, (endpoint, response_key, extra_params) in ENDPOINTS.items():
        snapshot[key] = _collect_endpoint(
            normalized_url,
            endpoint,
            response_key,
            extra_params,
            token,
            context,
            timeout,
            max_pages,
        )
    return snapshot


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()

    try:
        snapshot = collect_snapshot(
            base_url=os.environ.get("MORPHEUS_URL", ""),
            token=os.environ.get("MORPHEUS_TOKEN", ""),
            environment=os.environ.get(
                "MORPHEUS_ENVIRONMENT", "morpheus-vm-essentials"
            ),
            run_id=args.run_id,
            validate_certs=os.environ.get("MORPHEUS_VALIDATE_CERTS", "true").lower()
            in {"1", "true", "yes"},
            max_pages=int(os.environ.get("MORPHEUS_MAX_PAGES", "100")),
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
    except (CollectionError, ValueError, OSError) as exc:
        print(f"Morpheus collection failed: {exc}", file=sys.stderr)
        return 1

    print(f"Collected Morpheus inventory to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
