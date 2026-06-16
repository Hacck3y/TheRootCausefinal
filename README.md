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

Ensure you have **Docker Desktop**, **Python (v3.11+)**, and **Node.js (v20+)** installed on your system.

#### 1. Running the Complete Stack

To spin up all services, frontends, and backend datastores in Docker, run:
```bash
npm run dev:apps
```
This builds each application service container and runs them in a unified network.

#### 2. Running Only Databases (Infrastructure)

If you prefer to debug code locally (e.g. running a microservice in watch mode using `npm run dev`), run:
```bash
npm run dev:infra
```
This boots Postgres, Redis, RabbitMQ, Elasticsearch, and MinIO in the background.

#### 3. Accessing Dashboards
*   **RabbitMQ Portal**: Navigate to [http://localhost:15672](http://localhost:15672) (User: `guest`, Pass: `guest`) to inspect active queues.
*   **MinIO Console**: Navigate to [http://localhost:9001](http://localhost:9001) (User: `minioadmin`, Pass: `minioadmin`) to check uploads in the `media-uploads` bucket.
*   **MinIO CDN Endpoint**: [http://localhost:9000/media-uploads](http://localhost:9000/media-uploads)

#### 4. Shitting Down
To stop and clean up containers and volumes, run:
```bash
npm run down
```

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

