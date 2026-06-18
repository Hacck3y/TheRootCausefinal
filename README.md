# The CivicX

**The CivicX** is a civic intelligence platform for documenting public problems, analysing their root causes, proposing solutions, debating ideas, and turning the strongest proposals into lawful civic action.

This project is not just a discussion space. It is the foundation for a future platform where citizens can move beyond shallow political arguments and participate in structured civic problem-solving.

## What We Are Building

We are building a platform where people can:

* Submit real public problems
* Analyse the deeper root causes behind those problems
* Propose practical and lawful solutions
* Debate and improve ideas through community review
* Convert strong proposals into actionable civic mandates
* Use evidence, satire, data, and structured discussion to improve public reasoning

The simple product flow is:

```text
See a problem → Submit it → Analyse the root cause → Propose a solution → Debate it → Improve it → Turn it into a mandate → Take action
```

## Why This Exists

Public discussions often stop at outrage, blame, or political tribalism.
The CivicX is designed to move the conversation forward.

Instead of only asking:

```text
Who is responsible?
```

we also ask:

```text
Why does this keep happening?
What system, incentive, behaviour, or failure allows it to continue?
What can realistically be changed?
```

The goal is to convert public frustration into public intelligence.

## Core Principles

* **Root cause before rage**
* **Solutions before slogans**
* **Evidence before allegations**
* **Debate before blind agreement**
* **Lawful civic action before chaos**
* **Public improvement before political loyalty**

## Who This Is For

The CivicX is for citizens, builders, researchers, students, creators, reformers, and anyone tired of shallow political shouting.

It is for people who want a serious place for:

* Civic thinking
* Public problem-solving
* Governance analysis
* Reform ideas
* Satire and public commentary
* Evidence-based discussion
* Community-driven solutions

## Project Status

This repository is the early technical foundation of **The CivicX**.

The product is being developed as a platform for structured civic participation, where users can submit problems, analyse causes, draft solution blueprints, review proposals, and support actionable mandates.

## Vision

A citizen should be able to see a public problem, submit it to the platform, help identify the root cause, collaborate on a solution, and turn that solution into a clear, lawful, community-backed action.

That is the mission of **The CivicX**.

---

## Technical Architecture & Developer Guide

This project is structured as a scalable **monorepo** utilizing Docker to run the client applications, API gateway, microservices, and databases in a coordinated ecosystem.

### Architecture Mapping

Based on the MVP PRD architecture design:

```
                  ┌─────────────────────────────────────────┐
                  │              Client Layer               │
                  │   [web-app:3000]     [admin-panel:3005] │
                  └────────────────────┬────────────────────┘
                                       │ HTTPS
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │             [api-gateway]               │
                  │              Port :8000                 │
                  └──────┬──────────┬──────────┬──────────┬─┘
                         │          │          │          │
         ┌───────────────┘          │          │          └────────────────┐
         ▼                          ▼          ▼                           ▼
┌─────────────────┐       ┌───────────┐  ┌──────────┐            ┌──────────────────┐
│identity-service │       │  content- │  │  feed-   │            │community-service │
│   Port :3001    │       │  service  │  │ service  │            │   Port :3004     │
│                 │       │Port :3002 │  │Port :3003│            │                  │
└────────┬────────┘       └─────┬─────┘  └────┬─────┘            └────────┬─────────┘
         │                      │             │                           │
         │                      │  ┌──────────┼───────────────┐           │
         │                      │  │          │               │           │
         ▼                      ▼  ▼          ▼               ▼           ▼
┌─────────────────┐       ┌───────────┐  ┌──────────┐    ┌──────────┐ ┌─────────────┐
│     User DB     │       │Content DB │  │  Redis   │    │Elastic-  │ │Moderation DB│
│  (Postgres:     │       │(Postgres: │  │ (Cache)  │    │  search  │ │ (Postgres:  │
│    user_db)     │       │content_db)│  │  :6379   │    │  :9200   │ │moderation_db│
└─────────────────┘       └─────┬─────┘  └──────────┘    └──────────┘ └─────────────┘
                                │                               ▲
                                ▼ (Message Queue Event)         │
                          ┌───────────┐                         │
                          │ RabbitMQ  ├─────────────────────────┘
                          │   :5672   │
                          └───────────┘
```

#### Services Directory

*   **`apps/api-gateway` (Port `8000`)**: Single entry point. Routes incoming client requests to their destination microservices.
*   **`apps/web-app` (Port `3000`)**: Next.js client portal. Allows users to submit issues, view cause profiles, and support blueprints.
*   **`apps/admin-panel` (Port `3005`)**: Vite-React static SPA for administration and moderation tools (runs on Nginx).
*   **`services/identity-service` (Port `3001`)**: Verification service. Connects to `user_db` and integrates Google OAuth 2.0.
*   **`services/content-service` (Port `3002`)**: Media handling and structured forms. Extracts verification metadata (EXIF/GPS) and uploads files to MinIO object storage. Publishes events to RabbitMQ.
*   **`services/feed-service` (Port `3003`)**: Feed generator and index searches. Interacts with Redis (caching) and Elasticsearch. Consumes RabbitMQ events to index new posts.
*   **`services/community-service` (Port `3004`)**: Governance controls. Validates voting mandates (mandatory comments) and hosts the keyword-based troll detection filters.

---

### Port & Infrastructure Registry

All databases, caches, queues, and services map to standard ports on the local network when running inside Docker:

| Port | Service Name | Service Type / Target database |
| :--- | :--- | :--- |
| **`3000`** | `web-app` | Client Next.js Portal |
| **`3005`** | `admin-panel` | Admin Web Panel (Nginx) |
| **`8000`** | `api-gateway` | FastAPI / Python Gateway |
| **`5432`** | `postgres` | User DB (`user_db`), Content DB (`content_db`), Moderation DB (`moderation_db`) |
| **`6379`** | `redis` | Redis Cache Store |
| **`5672`** | `rabbitmq` | RabbitMQ Message Queue (AMQP Broker) |
| **`15672`** | `rabbitmq-dashboard` | RabbitMQ Management Console dashboard |
| **`9200`** | `elasticsearch` | Search Index Engine |
| **`9000`** | `minio-api` | S3 API endpoint for file uploads |
| **`9001`** | `minio-console` | S3 Administration Dashboard Console |

---

### Local Environment Setup

Ensure you have **Docker Engine + Compose plugin**, **Python (v3.11+)**, and **Node.js (v20+)** installed. On Linux, also raise the vm map count Elasticsearch needs: `sudo sysctl -w vm.max_map_count=262144`.

#### 1. Environment file

Copy the template and (for anything beyond a quick local test) fill in real secrets:
```bash
cp .env.example .env
./scripts/generate-secrets.sh   # prints strong random values to paste in
```
A `.env` is created for you on first setup with random secrets and development
defaults (`AUTH_REQUIRED=false`, `ALLOW_MOCK_AUTH=true`, `DEV_MODE=true`) so the
stack runs immediately. See **[SETUP_TODO.md](./SETUP_TODO.md)** for the full
production checklist.

#### 2. Running the Complete Stack

```bash
make up            # build & start everything (development)
# equivalent: docker compose up --build -d
```

#### 3. Running Only Databases (Infrastructure)

```bash
make infra
# equivalent: docker compose -f docker-compose.infra.yml up -d
```

#### 4. Accessing Dashboards
*   **Web app**: [http://localhost:3000](http://localhost:3000)
*   **Admin panel**: [http://localhost:3005](http://localhost:3005)
*   **RabbitMQ Portal**: [http://localhost:15672](http://localhost:15672) (User: `guest`, Pass: `guest`)
*   **MinIO Console**: [http://localhost:9001](http://localhost:9001) (credentials from your `.env`)

#### 5. Shutting Down
```bash
make down          # stop containers
make clean         # stop AND wipe volumes (DESTRUCTIVE)
```

---

### Production Deployment & Security

The codebase ships with a production override that enables real authentication,
restart policies, resource limits, and log rotation. Full step-by-step
instructions (Google OAuth, SMS/OTP, TLS, backups) live in
**[SETUP_TODO.md](./SETUP_TODO.md)**. In short:

1. Set strong secrets and flip the auth flags in `.env`:
   ```
   AUTH_REQUIRED=true
   ALLOW_MOCK_AUTH=false
   DEV_MODE=false
   JWT_SECRET=<64-char random>
   PUBLIC_API_URL=https://api.yourdomain.com
   CORS_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com
   ```
2. Build & launch with the production override:
   ```bash
   make up-prod
   # = docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
   ```

**Security model (what changed from the prototype):**

* **Signed JWTs** — login issues an HS256 token (`JWT_SECRET`, with expiry).
  Frontends send it as `Authorization: Bearer …`.
* **Enforcement is env-gated** — when `AUTH_REQUIRED=true`, services reject
  unauthenticated requests and derive the actor from the verified token instead
  of trusting client-supplied IDs (prevents identity spoofing).
* **Admin panel login** — staff authenticate via `/api/v1/auth/admin/login`
  (`ADMIN_USERNAME`/`ADMIN_PASSWORD`); admin-only routes require an admin token.
* **Google OAuth verification** — set `GOOGLE_CLIENT_ID` to verify real Google
  ID tokens server-side.
* **OTP privacy** — codes are sent via SMS (Twilio) and never returned in API
  responses unless `DEV_MODE=true`.
* **Configurable origins/URLs** — API base URL and CORS origins are driven by
  env vars, not hardcoded to localhost.
* **Hardened containers** — non-root users, health checks, restart policies, and
  per-service memory limits.

---

### Monorepo Workspaces Layout

```
.
├── apps/
│   ├── admin-panel/             # React/Vite Admin Interface
│   │   ├── Dockerfile
│   │   └── src/
│   ├── api-gateway/             # API Router Reverse Proxy
│   │   ├── Dockerfile
│   │   └── src/
│   └── web-app/                 # Next.js Frontend Application
│       ├── Dockerfile
│       └── src/
├── services/
│   ├── community-service/       # Voting Rules & Filtering
│   │   ├── Dockerfile
│   │   └── src/
│   ├── content-service/         # Submissions & EXIF extraction
│   │   ├── Dockerfile
│   │   └── src/
│   ├── feed-service/            # Redis Caching & Search Engine
│   │   ├── Dockerfile
│   │   └── src/
│   └── identity-service/        # Google Auth & Token Validation
│       ├── Dockerfile
│       └── src/
├── infra/
│   └── postgres/
│       └── init.sql             # DB Schema Builder script
├── package.json                 # Monorepo Workspace configuration
├── docker-compose.infra.yml     # Infrastructure-only compose
└── docker-compose.yml           # Unified app docker-compose
```

