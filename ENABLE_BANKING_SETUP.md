# Enable Banking Integration — Setup Guide

This document covers the full setup process, issues encountered on the VPS (sandbox), and
the steps required to get the production Pi deployment working with real BBVA data.

---

## How the integration works

1. The app calls `POST /auth` on the Enable Banking API with the bank (ASPSP) details.
   Enable Banking returns a URL — redirect the user there.
2. The user logs into their bank. The bank redirects back to our `ENABLE_BANKING_REDIRECT_URI`
   with a `code` query parameter.
3. The app calls `POST /sessions` with the code. Enable Banking returns a `session_id` and
   the list of authorized accounts.
4. The app stores `session_id` + `accounts` in the `AppToken` table (key = `enable_banking`).
5. Every 6 hours APScheduler calls `sync_transactions()`, which fetches transactions from
   `GET /accounts/{account_id}/transactions` using a fresh JWT on every request.

**Authentication is JWT-based on every request** — there are no OAuth access tokens or refresh
tokens. A new RS256 JWT (signed with our private key) is generated per API call.

---

## Issues encountered on VPS and how they were fixed

### 1. `cryptography` package missing
PyJWT requires the `cryptography` package to sign RS256 tokens. It was missing from
`requirements.txt`, causing a silent failure at JWT generation time.

**Fix:** Added `cryptography` to `requirements.txt`.

### 2. OAuth callback only handled POST
The VPS receives the OAuth callback as a direct GET redirect from Enable Banking.
The original code only handled POST (intended for the Pi relay flow).

**Fix:** Added GET support to `bank_callback()` in `app.py`.

### 3. systemd strips backslashes from `\n` in EnvironmentFile
The private key was stored in `.env` as a single line with literal `\n` characters
(e.g. `KEY=-----BEGIN PRIVATE KEY-----\nMIIE...`). systemd reads the EnvironmentFile
and strips the backslashes, leaving bare `n` characters. The key becomes unparseable.

**Fix:** Store the private key as a real file on disk and point to it via
`ENABLE_BANKING_PRIVATE_KEY_PATH`. The code reads the file directly, avoiding all
escaping issues.

```bash
# Generate the key file from the existing .env value
grep ENABLE_BANKING_PRIVATE_KEY= .env | cut -d= -f2- | sed 's/\\n/\n/g' > private.pem

# Replace the .env line
sed -i 's|^ENABLE_BANKING_PRIVATE_KEY=.*|ENABLE_BANKING_PRIVATE_KEY_PATH=/path/to/private.pem|' .env
```

### 4. `GET /auth` returns 405 — endpoint is POST
The original code built a URL and opened it directly in the browser (standard OAuth2 style).
Enable Banking's `/auth` endpoint is not a browser redirect — it is a backend API call that
requires a JWT and returns a redirect URL in the response body.

**Fix:** Changed `get_auth_url()` to `POST /auth` with a JSON body and return `data["url"]`.

### 5. JWT missing `kid` header
Enable Banking requires the `kid` claim in the JWT header (set to the application ID).
Without it the API returns `401: kid is missing in JWT header`.

**Fix:** Added `headers={"kid": _APP_ID}` to `jwt.encode()`.

### 6. JWT `aud` claim wrong
Enable Banking requires `"aud": "api.enablebanking.com"` in every JWT payload — even for
the sandbox (which uses `api.tilisy.com` as the base URL).

**Fix:** Hardcoded `"aud": "api.enablebanking.com"` in `_make_jwt()`.

### 7. `exchange_code` called wrong endpoint
The original code called `POST /token` (standard OAuth2). Enable Banking uses
`POST /sessions` with `{"code": code}`. The response returns `session_id` and `accounts`,
not `access_token` / `refresh_token`.

**Fix:** Rewrote `exchange_code()` to call `/sessions` and store `session_id` + `accounts`.

### 8. `get_transactions` used OAuth access token
The original `get_transactions()` accepted an `access_token` and used it as the Bearer token.
Enable Banking uses JWT-based auth for every request — no separate access token exists.

**Fix:** Removed `access_token` parameter. All requests use `_headers()` (fresh JWT).

### 9. Token refresh logic not applicable
`bank_sync.py` had logic to refresh an expired access token before syncing. Since there are
no access tokens in this API, the refresh logic was dead code and would fail if triggered.

**Fix:** Removed the refresh block from `bank_sync.py`.

---

## Environment variables

| Variable | Description | VPS (sandbox) | Pi (production) |
|---|---|---|---|
| `ENABLE_BANKING_APPLICATION_ID` | App ID from Enable Banking dashboard | sandbox app ID | production app ID |
| `ENABLE_BANKING_PRIVATE_KEY_PATH` | Path to PEM private key file on disk | `/home/deployer/.../private.pem` | `/path/on/pi/private.pem` |
| `ENABLE_BANKING_REDIRECT_URI` | Callback URL registered in dashboard | `http://<vps-ip>:5001/api/bank/callback` | `https://api.barnola.net/finances/oauth/callback` |
| `ENABLE_BANKING_SANDBOX` | `true` for sandbox, `false` for production | `true` | `false` |
| `ENABLE_BANKING_ASPSP_NAME` | Bank name as listed in Enable Banking | `BBVA` | `BBVA` |
| `ENABLE_BANKING_ASPSP_COUNTRY` | ISO country code | `ES` | `ES` |
| `ENABLE_BANKING_ACCOUNT_ID` | BBVA account UUID (set after first OAuth) | set after first sync | set after first sync |
| `INTERNAL_API_KEY` | Shared secret for the Pi relay callback | not needed | required |

---

## Steps to get production (Pi) working

### Step 1 — Create a production application in Enable Banking dashboard

1. Go to enablebanking.com dashboard
2. Create a new application with environment: **Production** (not Sandbox)
3. Generate a new RSA key pair:
   ```bash
   openssl genrsa -out private.pem 4096
   openssl req -new -x509 -key private.pem -out certificate.pem -days 730
   ```
4. Upload `certificate.pem` to the dashboard
5. Set the redirect URI to `https://api.barnola.net/finances/oauth/callback`
6. Note the new `application_id`

### Step 2 — Build the cluster-api relay

In the `home-cluster` repo, add a relay endpoint that:
- Accepts `GET /finances/oauth/callback?code=...&state=...` from Enable Banking
- Forwards it as `POST http://<pi-ip>:5001/api/bank/callback` with:
  - Body: `{"code": "<code>", "state": "<state>"}`
  - Header: `X-Internal-Key: <INTERNAL_API_KEY>`

Reference: `app/routers/finances.py` (new file). Config needed: `FINANCES_API_URL`,
`FINANCES_INTERNAL_KEY`.

### Step 3 — Set up the Pi `.env`

```
ENABLE_BANKING_APPLICATION_ID=<prod app id>
ENABLE_BANKING_PRIVATE_KEY_PATH=/home/pi/finances/private.pem
ENABLE_BANKING_REDIRECT_URI=https://api.barnola.net/finances/oauth/callback
ENABLE_BANKING_SANDBOX=false
ENABLE_BANKING_ASPSP_NAME=BBVA
ENABLE_BANKING_ASPSP_COUNTRY=ES
INTERNAL_API_KEY=<shared secret, same as in cluster-api config>
```

Copy `private.pem` (production key, NOT the sandbox one) to the Pi.

### Step 4 — Deploy

1. Merge `develop` → `main` — Pi auto-deploys via GitHub Actions + Docker Compose
2. Confirm the service is running: `docker compose logs -f`

### Step 5 — Run OAuth flow

1. Open `https://api.barnola.net/finances/bank` (or hit `GET /api/bank/auth-url`)
2. Open the returned URL in browser → BBVA login → authorize access
3. Enable Banking redirects to `https://api.barnola.net/finances/oauth/callback`
4. cluster-api relay forwards to Pi → tokens stored
5. Check `GET /api/bank/status` → `has_token: true`

### Step 6 — Get account ID and run first sync

After the OAuth flow completes, the `session_id` and `accounts` list are stored. The
account ID should be in the response from `GET /api/bank/status`. Set it in `.env`:

```
ENABLE_BANKING_ACCOUNT_ID=<account uuid from status response>
```

Restart the Pi service, then trigger a manual sync:
```bash
curl -X POST https://api.barnola.net/finances/api/bank/sync \
  -H "X-Internal-Key: <INTERNAL_API_KEY>"
```

Check `GET /api/bank/logs` to confirm transactions were imported.
