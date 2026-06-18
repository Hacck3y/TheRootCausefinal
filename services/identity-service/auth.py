"""
Shared authentication utilities for The CivicX services.

A small, dependency-light JWT helper used across services. Enforcement is
gated by the AUTH_REQUIRED environment variable so the stack runs without
friction in local development (AUTH_REQUIRED=false) and is fully enforced in
production (AUTH_REQUIRED=true).

This file is intentionally duplicated into each service directory so that each
service has a self-contained Docker build context. Keep the copies in sync.
"""
import os
import time
from typing import Optional

import jwt
from fastapi import Header, HTTPException

JWT_SECRET = os.getenv("JWT_SECRET", "dev-insecure-secret-change-me")
JWT_ALG = "HS256"
JWT_EXPIRY_SECONDS = int(os.getenv("JWT_EXPIRY_SECONDS", str(60 * 60 * 24 * 7)))  # 7 days
AUTH_REQUIRED = os.getenv("AUTH_REQUIRED", "false").lower() == "true"


def create_access_token(subject: str, role: str = "user", extra: Optional[dict] = None) -> str:
    """Create a signed HS256 JWT for the given subject (user id)."""
    now = int(time.time())
    payload = {"sub": subject, "role": role, "iat": now, "exp": now + JWT_EXPIRY_SECONDS}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT. Raises on invalid/expired tokens."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def _extract(authorization: Optional[str]) -> Optional[dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        return decode_token(token)
    except Exception:
        return None


async def get_principal(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Return the decoded token payload, or None. Never raises."""
    return _extract(authorization)


async def require_auth(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Require a valid token when AUTH_REQUIRED is enabled."""
    principal = _extract(authorization)
    if AUTH_REQUIRED and not principal:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return principal


async def require_admin(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Require a valid admin-role token when AUTH_REQUIRED is enabled."""
    principal = _extract(authorization)
    if AUTH_REQUIRED:
        if not principal:
            raise HTTPException(status_code=401, detail="Authentication required.")
        if principal.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required.")
    return principal
