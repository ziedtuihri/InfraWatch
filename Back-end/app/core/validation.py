"""
app/core/validation.py
----------------------
Input validation for the InfraWatch deployment wizard.

Covers the report's test cases:
  * TC-URL  : malformed / non-HTTP Morpheus appliance URL  -> rejected before any network call
  * TC-CONN : well-formed URL that is unreachable          -> clear "unreachable" error
  * TC-CONN : valid URL but a bad API token                -> clear "invalid token" error
  * TC-TPL  : Grafana template ID outside the supported set -> rejected, naming the bad IDs
"""
from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import logging

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supported Grafana dashboard templates (air-gapped: packaged with the platform).
# EDIT to match exactly the template IDs you ship / covered in your test cases.
# ---------------------------------------------------------------------------
SUPPORTED_GRAFANA_TEMPLATES: dict[int, str] = {
    1860:  "Node Exporter Full",
    7587:  "Prometheus Blackbox Exporter",
    13659: "Blackbox Exporter",
}

MORPHEUS_CHECK_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


class ValidationError(ValueError):
    """Raised when user-supplied configuration is invalid. `.detail` is user-safe."""
    def __init__(self, detail: str, code: str = "invalid_input"):
        super().__init__(detail)
        self.detail = detail
        self.code = code


# ---------------------------------------------------------------------------
# 1. Morpheus appliance URL — format validation (no network involved)
# ---------------------------------------------------------------------------
_HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)"
    r"(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
)


def validate_morpheus_url(raw_url: str) -> str:
    """Validate + normalize the Morpheus appliance URL.

    Returns the normalized base URL (scheme://host[:port]) or raises ValidationError.
    """
    if not raw_url or not raw_url.strip():
        raise ValidationError("Morpheus URL is required.", "url_missing")

    url = raw_url.strip()
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise ValidationError(
            "Morpheus URL must start with http:// or https://.", "url_bad_scheme")

    if not parsed.hostname:
        raise ValidationError("Morpheus URL has no hostname.", "url_no_host")

    host = parsed.hostname
    try:
        ipaddress.ip_address(host)
    except ValueError:
        if not _HOSTNAME_RE.match(host):
            raise ValidationError(
                f"'{host}' is not a valid hostname or IP address.", "url_bad_host")

    try:
        port = parsed.port
    except ValueError:
        raise ValidationError("Morpheus URL port is not a valid number.", "url_bad_port")
    if port is not None and not (1 <= port <= 65535):
        raise ValidationError("Morpheus URL port must be between 1 and 65535.", "url_bad_port")

    if parsed.username or parsed.password:
        raise ValidationError(
            "Do not embed credentials in the URL; use the API token field.", "url_credentials")

    netloc = host if port is None else f"{host}:{port}"
    return f"{parsed.scheme}://{netloc}"


# ---------------------------------------------------------------------------
# 2. Morpheus appliance — live reachability + token check
# ---------------------------------------------------------------------------
@dataclass
class MorpheusCheckResult:
    ok: bool
    code: str          # ok | unreachable | timeout | bad_token | tls_error | unexpected_status
    detail: str
    status_code: Optional[int] = None


async def check_morpheus_connection(
    base_url: str,
    api_token: str,
    verify_ssl: bool = False,
    _transport: Optional[httpx.AsyncBaseTransport] = None,   # test hook
) -> MorpheusCheckResult:
    """Hit /api/whoami with the supplied token: validates reachability AND
    credentials in one call. Never raises — always returns a result the
    route can map to an HTTP response."""
    headers = {"Authorization": f"Bearer {api_token}", "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(
            verify=verify_ssl,
            timeout=MORPHEUS_CHECK_TIMEOUT,
            transport=_transport,
            trust_env=False,   # ignore HTTP(S)_PROXY env vars - same as MorpheusClient
        ) as client:
            resp = await client.get(f"{base_url}/api/whoami", headers=headers)
    except httpx.ConnectTimeout:
        return MorpheusCheckResult(False, "timeout",
            "Connection to the Morpheus appliance timed out. Check the URL and network route.")
    except httpx.ReadTimeout:
        return MorpheusCheckResult(False, "timeout",
            "The Morpheus appliance did not respond in time.")
    except httpx.ConnectError as exc:
        logger.warning("Morpheus connection check failed for %s: %r", base_url, exc)
        if "certificate" in str(exc).lower() or "ssl" in str(exc).lower():
            return MorpheusCheckResult(False, "tls_error",
                "TLS certificate verification failed for the Morpheus appliance.")
        return MorpheusCheckResult(False, "unreachable",
            "Could not reach the Morpheus appliance at this URL. "
            "Check the address and that the appliance is running.")
    except httpx.RequestError as exc:
        logger.warning("Morpheus connection check failed for %s: %r", base_url, exc)
        return MorpheusCheckResult(False, "unreachable",
            "Could not reach the Morpheus appliance at this URL.")

    if resp.status_code in (401, 403):
        return MorpheusCheckResult(False, "bad_token",
            "The Morpheus API token was rejected. Check the token and its permissions.",
            resp.status_code)
    if resp.status_code != 200:
        return MorpheusCheckResult(False, "unexpected_status",
            f"The Morpheus appliance answered with HTTP {resp.status_code}.",
            resp.status_code)
    return MorpheusCheckResult(True, "ok", "Connection to Morpheus verified.", 200)


# ---------------------------------------------------------------------------
# 3. Grafana template IDs — whitelist validation
# ---------------------------------------------------------------------------
def validate_template_ids(template_ids: list) -> list[int]:
    """Validate requested Grafana template IDs against the supported set.

    Returns the cleaned, de-duplicated list of ints, or raises ValidationError
    naming every offending value."""
    if not template_ids:
        raise ValidationError("Select at least one Grafana dashboard template.",
                              "templates_missing")

    cleaned: list[int] = []
    not_numeric: list[str] = []
    for raw in template_ids:
        try:
            cleaned.append(int(str(raw).strip()))
        except (TypeError, ValueError):
            not_numeric.append(repr(raw))
    if not_numeric:
        raise ValidationError(
            f"Template IDs must be numeric. Invalid values: {', '.join(not_numeric)}.",
            "templates_not_numeric")

    seen: set[int] = set()
    cleaned = [t for t in cleaned if not (t in seen or seen.add(t))]

    unsupported = [t for t in cleaned if t not in SUPPORTED_GRAFANA_TEMPLATES]
    if unsupported:
        supported = ", ".join(str(k) for k in sorted(SUPPORTED_GRAFANA_TEMPLATES))
        raise ValidationError(
            f"Unsupported Grafana template ID(s): {', '.join(map(str, unsupported))}. "
            f"Supported IDs in this air-gapped build: {supported}.",
            "templates_unsupported")
    return cleaned
