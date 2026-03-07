"""
Enable Banking API client.

Handles JWT generation, OAuth flow, token management, and transaction fetching.
All communication with the Enable Banking API is done here.

Required environment variables:
    ENABLE_BANKING_APPLICATION_ID  - from Enable Banking dashboard
    ENABLE_BANKING_PRIVATE_KEY     - PEM RSA private key content (newlines as \\n)
    ENABLE_BANKING_REDIRECT_URI    - OAuth callback URL registered in dashboard
    ENABLE_BANKING_SANDBOX         - "true" for sandbox, "false" for production
"""

import os
import time
import uuid
import logging
from datetime import datetime, timezone, timedelta

import jwt
import requests

logger = logging.getLogger(__name__)

_SANDBOX = os.environ.get("ENABLE_BANKING_SANDBOX", "true").lower() == "true"
_BASE_URL = "https://api.tilisy.com" if _SANDBOX else "https://api.enablebanking.com"
_APP_ID = os.environ.get("ENABLE_BANKING_APPLICATION_ID", "")
_REDIRECT_URI = os.environ.get("ENABLE_BANKING_REDIRECT_URI", "")
_PRIVATE_KEY_PEM = os.environ.get("ENABLE_BANKING_PRIVATE_KEY", "").replace("\\n", "\n")


def _make_jwt() -> str:
    """Build a short-lived RS256 JWT for Enable Banking request signing."""
    now = int(time.time())
    payload = {
        "iss": _APP_ID,
        "iat": now,
        "exp": now + 3600,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, _PRIVATE_KEY_PEM, algorithm="RS256")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_make_jwt()}",
        "Content-Type": "application/json",
    }


def get_auth_url(state: str = "") -> str:
    """Return the OAuth authorization URL to redirect the user to."""
    if not state:
        state = str(uuid.uuid4())
    params = {
        "response_type": "code",
        "client_id": _APP_ID,
        "redirect_uri": _REDIRECT_URI,
        "state": state,
        "scope": "aisp",
    }
    param_str = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{_BASE_URL}/auth?{param_str}"


def exchange_code(code: str) -> dict:
    """Exchange an authorization code for access/refresh tokens.

    Returns dict with keys: access_token, refresh_token, expires_at (ISO string)
    """
    resp = requests.post(
        f"{_BASE_URL}/token",
        json={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _REDIRECT_URI,
        },
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=data.get("expires_in", 3600)
    )
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "expires_at": expires_at.isoformat(),
    }


def refresh_access_token(refresh_token: str) -> dict:
    """Refresh an expired access token.

    Returns dict with keys: access_token, refresh_token, expires_at (ISO string)
    """
    resp = requests.post(
        f"{_BASE_URL}/token",
        json={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=data.get("expires_in", 3600)
    )
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", refresh_token),
        "expires_at": expires_at.isoformat(),
    }


def get_transactions(access_token: str, account_id: str, date_from: datetime) -> list:
    """Fetch booked (settled) transactions for a given account since date_from.

    Returns a list of dicts with keys:
        external_id, amount, currency, date, merchant, description
    """
    resp = requests.get(
        f"{_BASE_URL}/accounts/{account_id}/transactions",
        params={
            "date_from": date_from.strftime("%Y-%m-%d"),
            "status": "booked",
        },
        headers={
            **_headers(),
            "Authorization": f"Bearer {access_token}",
        },
        timeout=30,
    )
    resp.raise_for_status()
    raw = resp.json()

    transactions = []
    for txn in raw.get("transactions", []):
        # Normalise fields across different bank formats
        amount = txn.get("transaction_amount", {})
        amount_value = abs(float(amount.get("amount", 0)))
        # Only ingest debits (expenses)
        if float(amount.get("amount", 0)) >= 0:
            continue

        merchant = (
            txn.get("creditor_name")
            or txn.get("merchant_name")
            or txn.get("remittance_information_unstructured", "")
        )
        transactions.append(
            {
                "external_id": txn.get("transaction_id")
                or txn.get("internal_transaction_id"),
                "amount": amount_value,
                "currency": amount.get("currency", "EUR"),
                "date": txn.get("booking_date") or txn.get("value_date"),
                "merchant": merchant.strip() if merchant else "",
                "description": txn.get(
                    "remittance_information_unstructured", ""
                ).strip(),
            }
        )

    logger.info(f"Fetched {len(transactions)} debit transactions from Enable Banking")
    return transactions
