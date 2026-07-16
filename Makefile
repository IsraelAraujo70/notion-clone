COMPOSE ?= docker compose
BACKEND_SERVICES ?= postgres minio minio-create-bucket api worker
WEB_DIR ?= frontend
MOBILE_DIR ?= mobile
CORE_DIR ?= packages/core
NEXT_PUBLIC_API_BASE_URL ?= http://localhost:18080
EXPO_PUBLIC_API_BASE_URL ?= https://api.reason.israeldeveloper.com.br
DOCKER_WAIT_SECONDS ?= 120

.PHONY: help docker-ready backend dev mobile watch up down restart logs ps test test-api test-core test-web test-mobile test-e2e clean kill-web

help:
	@printf '%s\n' \
		'Targets:' \
		'  make dev                       Start Postgres+MinIO+API in Docker, Next via npm run dev' \
		'  make mobile                    Start the Expo mobile client' \
		'  make backend                   Start Postgres+MinIO+API containers' \
		'  make watch                     Backend with Docker Compose Watch' \
		'  make up                        Same as backend (background)' \
		'  make down                      Stop containers and free local :3000' \
		'  make restart                   Restart backend containers' \
		'  make logs                      Follow backend container logs' \
		'  make ps                        Show container status' \
		'  make test                      Run API and web gate tests' \
		'  make test-e2e                  Run Cypress full-stack E2E tests' \
		'  make clean                     Stop containers, free :3000, remove volumes'

# If the daemon is down, open Docker Desktop (macOS) and wait until it answers.
docker-ready:
	@if docker info >/dev/null 2>&1; then \
		exit 0; \
	fi; \
	echo "Docker daemon is not running."; \
	if [ "$$(uname -s)" = "Darwin" ] && [ -d /Applications/Docker.app ]; then \
		echo "Opening Docker Desktop..."; \
		open -a Docker; \
	else \
		echo "Start Docker and re-run this command."; \
		exit 1; \
	fi; \
	echo "Waiting up to $(DOCKER_WAIT_SECONDS)s for Docker..."; \
	i=0; \
	while [ $$i -lt $(DOCKER_WAIT_SECONDS) ]; do \
		if docker info >/dev/null 2>&1; then \
			echo "Docker is ready."; \
			exit 0; \
		fi; \
		i=$$((i + 2)); \
		sleep 2; \
	done; \
	echo "Docker did not become ready in $(DOCKER_WAIT_SECONDS)s."; \
	echo "Open Docker Desktop, wait until it says Running, then re-run make."; \
	exit 1

# Frontend is local Next (`npm run dev`). Postgres + MinIO + API stay in Docker.
backend: docker-ready
	$(COMPOSE) up -d --build $(BACKEND_SERVICES)

dev: backend
	cd $(WEB_DIR) && NEXT_PUBLIC_API_BASE_URL=$(NEXT_PUBLIC_API_BASE_URL) npm run dev

mobile:
	cd $(MOBILE_DIR) && EXPO_PUBLIC_API_BASE_URL=$(EXPO_PUBLIC_API_BASE_URL) npm start

watch: docker-ready
	$(COMPOSE) up --watch --build $(BACKEND_SERVICES)

up: backend

kill-web:
	@pids=$$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null); \
	if [ -n "$$pids" ]; then \
		echo "Killing process(es) on :3000: $$pids"; \
		kill -9 $$pids 2>/dev/null || true; \
	else \
		echo "Nothing listening on :3000"; \
	fi

down: kill-web
	@if docker info >/dev/null 2>&1; then \
		$(COMPOSE) --profile e2e --profile docker-web down --remove-orphans; \
	else \
		echo "Docker daemon not running; skipped compose down."; \
	fi

restart: down up

logs: docker-ready
	$(COMPOSE) logs -f $(BACKEND_SERVICES)

ps: docker-ready
	$(COMPOSE) ps

test: test-api test-core test-web test-mobile

test-api:
	cd backend && cargo test --lib --bins

test-core:
	cd $(CORE_DIR) && npm run typecheck

test-web:
	cd $(WEB_DIR) && npm test

test-mobile:
	cd $(MOBILE_DIR) && npm run typecheck

test-e2e: docker-ready
	$(COMPOSE) --profile e2e up -d --build api-e2e worker-e2e web-e2e
	$(COMPOSE) --profile e2e run --rm cypress

clean: kill-web
	@if docker info >/dev/null 2>&1; then \
		$(COMPOSE) --profile e2e --profile docker-web down --volumes --remove-orphans; \
	else \
		echo "Docker daemon not running; skipped compose clean."; \
	fi
