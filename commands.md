# Port Registry & CLI Commands Guide

This document lists all running service URLs, API gateway proxies, infrastructure panels, and command line tools for "The CivicX".

---

## 1. Running Service URLs & Endpoints

### Frontend Applications
*   **Web App Client (Next.js)**: [http://localhost:3000](http://localhost:3000)
    *   *Purpose*: Citizen landing page, structured reporting form, feeds browser, and voting/explanation dialogs.
*   **Admin Panel Dashboard (Vite/React)**: [http://localhost:3005](http://localhost:3005)
    *   *Purpose*: Staff moderator panel for reviewing posts, handling disputes, survey creation, and user bans.

### API Gateway Reverse Proxy
*   **API Gateway Portal**: [http://localhost:8000](http://localhost:8000)
    *   *Proxy Endpoints*:
        *   Identity Service: `http://localhost:8000/api/v1/auth/...`
        *   Content Service: `http://localhost:8000/api/v1/content/...`
        *   Feed Service: `http://localhost:8000/api/v1/feed/...`
        *   Community Service: `http://localhost:8000/api/v1/community/...`

### Standalone Backend Services
*   **Identity Service**: [http://localhost:3001](http://localhost:3001) (FastAPI REST & user database mapping)
*   **Content Service**: [http://localhost:3002](http://localhost:3002) (FastAPI submissions & EXIF parser logic)
*   **Feed Service**: [http://localhost:3003](http://localhost:3003) (FastAPI feed generator & search router)
*   **Community Service**: [http://localhost:3004](http://localhost:3004) (FastAPI voting mechanics, surveys & reports)

### Infrastructure Consoles
*   **MinIO Console (S3 Object Storage)**: [http://localhost:9001](http://localhost:9001)
    *   *Username*: `minioadmin`
    *   *Password*: `minioadmin`
    *   *Asset Bucket*: `media-uploads`
*   **RabbitMQ Management Console**: [http://localhost:15672](http://localhost:15672)
    *   *Username*: `guest`
    *   *Password*: `guest`
*   **Elasticsearch Cluster Health**: [http://localhost:9200](http://localhost:9200)

---

## 2. Command Line Tools & Scripts

### Startup & Deployment
*   **Launch Background Infrastructure**:
    ```bash
    npm run dev:infra
    ```
    *Bootstraps: PostgreSQL, Redis, RabbitMQ, Elasticsearch, and MinIO storage.*

*   **Launch Complete Stack (Services & Frontends)**:
    ```bash
    npm run dev:apps
    ```
    *Builds Docker images and boots gateway, frontends, and microservices in the foreground.*

### Testing & Verification
*   **Run Automated Integration Test Suite**:
    ```bash
    python3 test_suite.py
    ```
    *Performs 18 state-isolated tests asserting all 24 MVP features against the running services (or falls back to mock simulations).*

### Cleanup & Reset
*   **Stop and Wipe Docker Resources**:
    ```bash
    ./stop.sh
    ```
    *Cleanly downs all containers, networks, and wipes active volume caching.*
