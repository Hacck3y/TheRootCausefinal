#!/usr/bin/env bash
# Generate strong random secrets and print ready-to-paste .env lines.
set -euo pipefail
echo "# --- Generated secrets ($(date -u +%Y-%m-%dT%H:%M:%SZ)) ---"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "DB_PASSWORD=$(openssl rand -hex 16)"
echo "MINIO_ROOT_PASSWORD=$(openssl rand -hex 16)"
echo "ADMIN_PASSWORD=$(openssl rand -hex 12)"
echo "# Copy the lines you need into your .env file."
