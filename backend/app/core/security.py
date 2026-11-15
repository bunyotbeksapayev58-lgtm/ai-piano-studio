import os
import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Optional, Tuple
from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "ai-piano-studio-super-secure-key-2026-v2")
SALT_LENGTH = 16
ITERATIONS = 100000

def hash_password(password: str) -> str:
    """
    Hashes a password using PBKDF2-HMAC-SHA256 with a unique random salt.
    Format: pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>
    """
    salt = secrets.token_bytes(SALT_LENGTH)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    salt_b64 = base64.b64encode(salt).decode("ascii")
    key_b64 = base64.b64encode(key).decode("ascii")
    return f"pbkdf2_sha256${ITERATIONS}${salt_b64}${key_b64}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against the stored PBKDF2 hash using constant-time comparison.
    """
    try:
        parts = hashed_password.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = base64.b64decode(parts[2])
        expected_hash = base64.b64decode(parts[3])
        actual_hash = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(expected_hash, actual_hash)
    except Exception:
        return False

def create_access_token(user_id: str, email: str, username: str, expires_in_seconds: int = 86400 * 7) -> str:
    """
    Generates a cryptographically signed JSON web token (HS256).
    """
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "email": email,
        "username": username,
        "exp": int(time.time()) + expires_in_seconds
    }
    header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signing_input = f"{header_b64}.{payload_b64}"
    sig = hmac.new(SECRET_KEY.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{signing_input}.{sig_b64}"

def decode_access_token(token: str) -> Optional[dict]:
    """
    Validates token signature and expiration. Returns payload dict or None.
    """
    try:
        parts = token.strip().split(".")
        if len(parts) != 3:
            return None
        signing_input = f"{parts[0]}.{parts[1]}"
        expected_sig = hmac.new(SECRET_KEY.encode(), signing_input.encode(), hashlib.sha256).digest()
        
        # Add back base64 padding
        sig_str = parts[2]
        sig_str += "=" * (-len(sig_str) % 4)
        actual_sig = base64.urlsafe_b64decode(sig_str)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        payload_str = parts[1]
        payload_str += "=" * (-len(payload_str) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_str).decode())

        if payload.get("exp", 0) < time.time():
            return None  # Expired

        return payload
    except Exception:
        return None
