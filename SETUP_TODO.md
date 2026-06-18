# SETUP TODO — The CivicX

This is your manual checklist to take The CivicX from code to a running,
production-ready deployment. Items are ordered. Everything marked **[REQUIRED]**
must be done before going live; **[OPTIONAL]** items can wait.

The codebase is already wired so that a plain local run works with zero config.
Production hardening is gated behind environment variables you set here.

---

## 0. Prerequisites (on your Linux box)

- [ ] Install **Docker Engine** and the **Docker Compose plugin** (`docker compose version` should work).
- [ ] Install **make** and **openssl** (`sudo apt-get install -y make openssl`).
- [ ] Ensure these host ports are free: `3000, 3005, 8000, 3001-3004, 5432, 6379, 5672, 15672, 9200, 9000, 9001`.
- [ ] Elasticsearch needs raised virtual memory. Run once:
      `sudo sysctl -w vm.max_map_count=262144`
      and persist it: add `vm.max_map_count=262144` to `/etc/sysctl.conf`.

---

## 1. First local test run (no external accounts needed)

A working `.env` with random secrets was already generated for you. To run:

```bash
make up          # builds & starts everything (development mode)
# or without make:
docker compose up --build -d
```

Then open:
- Web app: http://localhost:3000
- Admin panel: http://localhost:3005
- API gateway health: http://localhost:8000/health

In this development mode `AUTH_REQUIRED=false`, `ALLOW_MOCK_AUTH=true`, and
`DEV_MODE=true`, so you can sign in with mock Google + see the OTP in the API
response. This is for testing only.

- [ ] Confirm the stack boots and the three URLs above respond.
- [ ] Run the integration tests: `make test` (or `python3 test_suite.py`).

---

## 2. Secrets **[REQUIRED before production]**

The generated `.env` is fine for local testing but you should rotate secrets
for any shared/production environment.

- [ ] Generate fresh secrets: `./scripts/generate-secrets.sh`
- [ ] Set strong values in `.env` for: `JWT_SECRET`, `DB_PASSWORD`,
      `MINIO_ROOT_PASSWORD`, `ADMIN_PASSWORD`.
- [ ] **Never commit `.env`** (it is already gitignored). Store production
      secrets in your secret manager (Docker secrets, Vault, AWS SSM, etc.).
- [ ] Note your **admin password** — you'll need it to log into the admin panel
      once auth is enforced.

---

## 3. Turn on authentication for production **[REQUIRED]**

In `.env` set:

```
AUTH_REQUIRED=true
ALLOW_MOCK_AUTH=false
DEV_MODE=false
```

This makes the services reject unauthenticated/spoofed requests and stops the
OTP from being returned in API responses.

- [ ] Set the three flags above.
- [ ] Start with the production override so restart policies, limits and admin
      login are active:
      ```bash
      make up-prod
      # = docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
      ```

---

## 4. Google OAuth (real sign-in) **[REQUIRED for production login]**

The app restricts sign-in to Google. With `ALLOW_MOCK_AUTH=false` you must
configure a real Google client so tokens are verified server-side.

- [ ] Go to https://console.cloud.google.com/apis/credentials
- [ ] Create an **OAuth 2.0 Client ID** (Web application).
- [ ] Add your web app origin to **Authorized JavaScript origins**
      (e.g. `https://app.yourdomain.com`).
- [ ] Copy the **Client ID** into `.env` as `GOOGLE_CLIENT_ID=...`.
- [ ] **Front-end work still needed:** the web app currently sends a
      `mock_google_token`. Integrate Google Identity Services (the
      `@react-oauth/google` library or the GIS script) on the sign-in screen so
      a real Google ID token is sent to `POST /api/v1/auth/login/oauth`. The
      backend already verifies it when `GOOGLE_CLIENT_ID` is set.

---

## 5. Phone / OTP verification (SMS) **[REQUIRED if you keep phone verification]**

OTP generation works, but actual SMS delivery needs a provider. Twilio is
supported out of the box.

- [ ] Create a Twilio account: https://www.twilio.com/
- [ ] Get a phone number capable of SMS.
- [ ] Set in `.env`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
- [ ] With `DEV_MODE=false` and Twilio set, codes are texted to users and never
      exposed in API responses.
- [ ] (Alternative) To use a different SMS provider, edit `send_otp_sms()` in
      `services/identity-service/main.py`.

> Privacy note: the service stores only a SHA-256 hash of the phone number, never
> the raw number or the OTP — keep it that way.

---

## 6. Cloudflare Turnstile / CAPTCHA **[OPTIONAL but recommended]**

The UI has a CAPTCHA step but currently passes a mock token.

- [ ] Create a Turnstile site at https://dash.cloudflare.com/?to=/:account/turnstile
- [ ] Put the **site key** in the web app's CAPTCHA widget (front-end change in
      `apps/web-app`).
- [ ] Verify the **secret key** server-side in `request_otp`/`verify`
      (`services/identity-service/main.py`) by calling Turnstile's
      `siteverify` endpoint. Store the secret as an env var.

---

## 7. Public URLs, domain & TLS **[REQUIRED for production]**

The frontends bake the API URL in at **build time**, so set it before building.

- [ ] Point DNS for your app, admin and api hostnames at the server.
- [ ] In `.env` set `PUBLIC_API_URL=https://api.yourdomain.com`.
- [ ] In `.env` set `CORS_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com`.
- [ ] Set `MINIO_PUBLIC_URL=https://media.yourdomain.com` (the browser must be
      able to load uploaded media from this URL).
- [ ] Put a TLS-terminating reverse proxy (Nginx, Caddy, or Traefik) in front of
      ports 3000 (web), 3005 (admin), 8000 (gateway) and 9000 (MinIO). Caddy is
      easiest for automatic Let's Encrypt certificates.
- [ ] Rebuild the frontends after changing `PUBLIC_API_URL`: `make up-prod`
      (build args only take effect on `--build`).

---

## 8. Object storage (MinIO) hardening **[RECOMMENDED]**

- [ ] Change `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` from defaults.
- [ ] The `media-uploads` bucket is created automatically and set to public-read
      (needed so media renders in the browser). If you want signed/private URLs
      instead, adjust the `minio-create-bucket` step in `docker-compose.yml` and
      generate presigned URLs in `content-service`.
- [ ] For real scale, consider swapping MinIO for S3/GCS (boto3 already used).

---

## 9. Data persistence & backups **[REQUIRED for production]**

Docker named volumes already persist `postgres_data`, `es_data`, `minio_data`,
`redis_data`, `rabbitmq_data`.

- [ ] Schedule **PostgreSQL backups** (e.g. nightly `pg_dump` of `user_db`,
      `content_db`, `moderation_db` to off-box storage).
- [ ] Back up the MinIO bucket (`mc mirror` or provider-side replication).
- [ ] Test a restore at least once.

---

## 10. Observability & ops **[RECOMMENDED]**

- [ ] All services expose `/health`. Wire them into your uptime monitor.
- [ ] Log rotation is configured in `docker-compose.prod.yml` (10MB x 3). Ship
      logs to a central store if you have one.
- [ ] Add Sentry/equivalent error tracking to the FastAPI services and the
      frontends.
- [ ] Consider an API-gateway rate limiter (e.g. slowapi) to protect
      `request-otp` and `login` from abuse.

---

## 11. Source control hygiene **[OPTIONAL]**

- [ ] `package-lock.json` is currently gitignored. For reproducible production
      builds, commit lockfiles instead (remove those lines from `.gitignore`).
- [ ] Pin Docker base images to digests if you need fully reproducible builds.

---

## Quick command reference

```bash
make env        # create .env from template if missing
make secrets    # print fresh random secrets
make infra      # only the infra (db, redis, mq, es, minio)
make up         # full stack, development
make up-prod    # full stack, production overrides (auth on)
make test       # run integration tests
make logs       # tail logs
make down       # stop
make clean      # stop and wipe volumes (DESTRUCTIVE)
```

## Default local credentials (development only — change for production)

- Admin panel login (when `VITE_REQUIRE_ADMIN_LOGIN`/`AUTH_REQUIRED` are on):
  username `admin`, password = `ADMIN_PASSWORD` in your `.env`.
- MinIO console (http://localhost:9001): `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`.
- RabbitMQ console (http://localhost:15672): `guest` / `guest`.
