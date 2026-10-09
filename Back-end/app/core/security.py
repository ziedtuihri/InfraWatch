"""
app/core/security.py
--------------------
Secrets at rest for InfraWatch.

Passwords  -> PBKDF2-HMAC-SHA256 (stdlib), format:
              pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
              Legacy plaintext rows still verify and are transparently
              re-hashed on the next successful login.

Morpheus API token -> ALWAYS encrypted before storage:
  * 'enc$'  Fernet (AES-128-CBC + HMAC) when the `cryptography` package
            is installed - preferred.
  * 'enc2$' stdlib fallback when it is not: an HMAC-SHA256 keystream
            cipher with encrypt-then-MAC authentication. No third-party
            dependency, so the token is never stored in plaintext even
            on a machine where `pip install cryptography` is not possible.

Key material (both schemes derive from the same source; first match wins):
  1. INFRAWATCH_ENCRYPTION_KEY env var / `encryption_key` in settings
  2. Auto-generated keyfile at AlienDataCenter/.encryption_key (chmod 600)
Losing the key makes stored tokens unreadable - re-save the connection.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets

from config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Passwords (stdlib only)
# ---------------------------------------------------------------------------
_PBKDF2_ITERATIONS = 260_000
_HASH_PREFIX = "pbkdf2_sha256"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), _PBKDF2_ITERATIONS
    ).hex()
    return f"{_HASH_PREFIX}${_PBKDF2_ITERATIONS}${salt}${dk}"


def verify_password(password: str, stored: str) -> tuple[bool, bool]:
    """Return (matches, needs_rehash). needs_rehash=True means a legacy
    plaintext row matched and should be upgraded to a PBKDF2 hash."""
    if not stored:
        return False, False
    if stored.startswith(_HASH_PREFIX + "$"):
        try:
            _, iters, salt, dk = stored.split("$")
            calc = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iters)
            ).hex()
            return hmac.compare_digest(calc, dk), False
        except (ValueError, TypeError):
            return False, False
    return hmac.compare_digest(stored, password), True   # legacy plaintext row


# ---------------------------------------------------------------------------
# Shared key material
# ---------------------------------------------------------------------------
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_KEYFILE = os.path.join(_ROOT, ".encryption_key")
_key_material_cache = None


def _key_material() -> bytes:
    global _key_material_cache
    if _key_material_cache is not None:
        return _key_material_cache
    configured = getattr(settings, "encryption_key", "") or ""
    if configured:
        _key_material_cache = configured.encode("utf-8")
        return _key_material_cache
    if os.path.exists(_KEYFILE):
        with open(_KEYFILE, "rb") as f:
            _key_material_cache = f.read().strip()
            return _key_material_cache
    material = secrets.token_urlsafe(48).encode("ascii")
    with open(_KEYFILE, "wb") as f:
        f.write(material)
    try:
        os.chmod(_KEYFILE, 0o600)
    except OSError:
        pass
    logger.warning(
        "Generated a new token-encryption key at %s. Back it up, or set "
        "INFRAWATCH_ENCRYPTION_KEY in the environment - losing it makes "
        "stored Morpheus tokens unreadable.", _KEYFILE)
    _key_material_cache = material
    return material


# ---------------------------------------------------------------------------
# Scheme 1: Fernet (preferred, needs `cryptography`)
# ---------------------------------------------------------------------------
_ENC_PREFIX = "enc$"
_fernet = None
_fernet_checked = False


def _get_fernet():
    global _fernet, _fernet_checked
    if _fernet_checked:
        return _fernet
    _fernet_checked = True
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        logger.warning(
            "'cryptography' not installed - falling back to the built-in "
            "HMAC-SHA256 stream cipher for token encryption. "
            "Install it for AES: pip install cryptography")
        return None
    key = base64.urlsafe_b64encode(hashlib.sha256(_key_material()).digest())
    _fernet = Fernet(key)
    return _fernet


# ---------------------------------------------------------------------------
# Scheme 2: stdlib fallback - HMAC-SHA256 keystream + encrypt-then-MAC
# ---------------------------------------------------------------------------
_ENC2_PREFIX = "enc2$"


def _stdlib_keys():
    material = _key_material()
    k_enc = hashlib.sha256(material + b"|infrawatch-enc").digest()
    k_mac = hashlib.sha256(material + b"|infrawatch-mac").digest()
    return k_enc, k_mac


def _keystream(k_enc: bytes, nonce: bytes, length: int) -> bytes:
    out = b""
    counter = 0
    while len(out) < length:
        out += hmac.new(k_enc, nonce + counter.to_bytes(8, "big"), hashlib.sha256).digest()
        counter += 1
    return out[:length]


def _stdlib_encrypt(plain: bytes) -> str:
    k_enc, k_mac = _stdlib_keys()
    nonce = os.urandom(16)
    ct = bytes(a ^ b for a, b in zip(plain, _keystream(k_enc, nonce, len(plain))))
    tag = hmac.new(k_mac, nonce + ct, hashlib.sha256).digest()
    return _ENC2_PREFIX + base64.urlsafe_b64encode(nonce + ct + tag).decode("ascii")


def _stdlib_decrypt(stored: str) -> str:
    k_enc, k_mac = _stdlib_keys()
    blob = base64.urlsafe_b64decode(stored[len(_ENC2_PREFIX):].encode("ascii"))
    nonce, ct, tag = blob[:16], blob[16:-32], blob[-32:]
    if not hmac.compare_digest(hmac.new(k_mac, nonce + ct, hashlib.sha256).digest(), tag):
        raise ValueError("MAC verification failed")
    return bytes(a ^ b for a, b in zip(ct, _keystream(k_enc, nonce, len(ct)))).decode("utf-8")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def encrypt_secret(plain: str) -> str:
    """Encrypt a secret for storage. Never stores plaintext: uses Fernet when
    available, otherwise the stdlib authenticated stream cipher."""
    if plain is None or plain == "":
        return plain
    f = _get_fernet()
    if f is not None:
        return _ENC_PREFIX + f.encrypt(plain.encode("utf-8")).decode("ascii")
    return _stdlib_encrypt(plain.encode("utf-8"))


def decrypt_secret(stored: str) -> str:
    """Decrypt a stored secret. Legacy plaintext values pass through
    unchanged (they get encrypted on their next save)."""
    if not stored:
        return stored
    if stored.startswith(_ENC_PREFIX):
        f = _get_fernet()
        if f is None:
            logger.error("Fernet-encrypted secret found but 'cryptography' is "
                         "not installed - pip install cryptography")
            return ""
        from cryptography.fernet import InvalidToken
        try:
            return f.decrypt(stored[len(_ENC_PREFIX):].encode("ascii")).decode("utf-8")
        except InvalidToken:
            logger.error("Could not decrypt stored secret - wrong or rotated "
                         "encryption key. Re-save the Morpheus connection.")
            return ""
    if stored.startswith(_ENC2_PREFIX):
        try:
            return _stdlib_decrypt(stored)
        except Exception:
            logger.error("Could not decrypt stored secret - wrong or rotated "
                         "encryption key. Re-save the Morpheus connection.")
            return ""
    return stored   # legacy plaintext row
