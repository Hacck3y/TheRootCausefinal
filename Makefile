# The CivicX — common operations
COMPOSE_DEV  = docker compose
COMPOSE_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml

.PHONY: help env secrets infra up up-prod down logs ps test clean

help:
	@echo "CivicX make targets:"
	@echo "  make env        - create .env from .env.example if missing"
	@echo "  make secrets    - print fresh random secrets for .env"
	@echo "  make infra      - start only infrastructure (db, redis, mq, es, minio)"
	@echo "  make up         - build & start the full stack (development)"
	@echo "  make up-prod    - build & start the full stack (production overrides)"
	@echo "  make down       - stop everything"
	@echo "  make logs       - tail logs"
	@echo "  make ps         - show running containers"
	@echo "  make test       - run the integration test suite"
	@echo "  make clean      - stop and wipe volumes (DESTRUCTIVE)"

env:
	@test -f .env || cp .env.example .env && echo ".env ready (edit it before production)"

secrets:
	@./scripts/generate-secrets.sh

infra:
	$(COMPOSE_DEV) -f docker-compose.infra.yml up -d

up:
	$(COMPOSE_DEV) up --build -d

up-prod:
	$(COMPOSE_PROD) up --build -d

down:
	$(COMPOSE_DEV) down

logs:
	$(COMPOSE_DEV) logs -f --tail=100

ps:
	$(COMPOSE_DEV) ps

test:
	python3 test_suite.py

clean:
	$(COMPOSE_DEV) down -v
