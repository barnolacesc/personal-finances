"""
Enable Banking API client.

Handles JWT generation, OAuth flow, session management, and transaction fetching.
All communication with the Enable Banking API is done here.

Authentication: every request carries a freshly signed RS256 JWT in the
Authorization header. There are no OAuth access tokens or refresh tokens —
the JWT itself is the credential.

Required environment variables:
    ENABLE_BANKING_APPLICATION_ID   - from Enable Banking dashboard
    ENABLE_BANKING_PRIVATE_KEY_PATH - path to PEM RSA private key file (preferred)
    ENABLE_BANKING_PRIVATE_KEY      - PEM RSA private key content (fallback)
    ENABLE_BANKING_REDIRECT_URI     - OAuth callback URL registered in dashboard
    ENABLE_BANKING_SANDBOX          - "true" for sandbox, "false" for production
    ENABLE_BANKING_ASPSP_NAME       - bank name (default: BBVA)
    ENABLE_BANKING_ASPSP_COUNTRY    - bank country ISO code (default: ES)
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
_ASPSP_NAME = os.environ.get("ENABLE_BANKING_ASPSP_NAME", "BBVA")
_ASPSP_COUNTRY = os.environ.get("ENABLE_BANKING_ASPSP_COUNTRY", "ES")


def _load_private_key() -> str:
    key_path = os.environ.get("ENABLE_BANKING_PRIVATE_KEY_PATH", "")
    if key_path:
        with open(key_path) as f:
            return f.read()
    return os.environ.get("ENABLE_BANKING_PRIVATE_KEY", "").replace("\\n", "\n")


_PRIVATE_KEY_PEM = _load_private_key()


def _make_jwt() -> str:
    """Build a short-lived RS256 JWT for Enable Banking request signing."""
    now = int(time.time())
    payload = {
        "iss": _APP_ID,
        "aud": "api.enablebanking.com",
        "iat": now,
        "exp": now + 3600,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(
        payload, _PRIVATE_KEY_PEM, algorithm="RS256", headers={"kid": _APP_ID}
    )


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_make_jwt()}",
        "Content-Type": "application/json",
    }


def get_auth_url(state: str = "") -> str:
    """POST /auth to initiate bank authorization. Returns the bank redirect URL."""
    if not state:
        state = str(uuid.uuid4())
    valid_until = (datetime.now(timezone.utc) + timedelta(days=90)).strftime(
        "%Y-%m-%dT%H:%M:%S.000000+00:00"
    )
    body = {
        "access": {
            "balances": True,
            "transactions": True,
            "valid_until": valid_until,
        },
        "aspsp": {
            "name": _ASPSP_NAME,
            "country": _ASPSP_COUNTRY,
        },
        "state": state,
        "redirect_url": _REDIRECT_URI,
        "psu_type": "personal",
    }
    resp = requests.post(
        f"{_BASE_URL}/auth",
        json=body,
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["url"]


def exchange_code(code: str) -> dict:
    """POST /sessions to complete authorization.

    Returns dict with keys: session_id, accounts, expires_at (ISO string)
    """
    resp = requests.post(
        f"{_BASE_URL}/sessions",
        json={"code": code},
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    accounts = [
        a.get("uid") or a.get("id") or a.get("account_id")
        for a in data.get("accounts", [])
    ]
    expires_at = datetime.now(timezone.utc) + timedelta(days=90)
    return {
        "session_id": data.get("session_id", ""),
        "accounts": accounts,
        "expires_at": expires_at.isoformat(),
    }


def get_transactions(account_id: str, date_from: datetime) -> list:
    """Fetch booked transactions for an account since date_from.

    Returns a list of dicts with keys:
        external_id, amount, currency, date, merchant, description
    """
    resp = requests.get(
        f"{_BASE_URL}/accounts/{account_id}/transactions",
        params={
            "date_from": date_from.strftime("%Y-%m-%d"),
            "status": "booked",
        },
        headers=_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    raw = resp.json()

    transactions = []
    for txn in raw.get("transactions", []):
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
