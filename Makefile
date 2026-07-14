COMPOSE ?= docker compose
BACKEND_SERVICES ?= postgres minio minio-create-bucket api worker
WEB_DIR ?= frontend
NEXT_PUBLIC_API_BASE_URL ?= http://localhost:18080
DOCKER_WAIT_SECONDS ?= 120

.PHONY: help docker-ready backend dev watch up down restart logs ps test test-api test-web test-e2e eval-password-reset eval-page-persistence eval-sync-catch-up eval-request-log-redaction eval-frontend-components eval-m4 eval-m5 eval-m5-live eval-editor-sidebar-ux clean kill-web

help:
	@printf '%s\n' \
		'Targets:' \
		'  make dev                       Start Postgres+MinIO+API in Docker, Next via npm run dev' \
		'  make backend                   Start Postgres+MinIO+API containers' \
		'  make watch                     Backend with Docker Compose Watch' \
		'  make up                        Same as backend (background)' \
		'  make down                      Stop containers and free local :3000' \
		'  make restart                   Restart backend containers' \
		'  make logs                      Follow backend container logs' \
		'  make ps                        Show container status' \
		'  make test                      Run API and web gate tests' \
		'  make test-e2e                  Run Cypress full-stack E2E tests' \
		'  make eval-password-reset       Run password-reset smoke eval against local API' \
		'  make eval-page-persistence     Run block persistence smoke eval against local API' \
		'  make eval-sync-catch-up         Prove paginated recovery beyond 500 operations' \
		'  make eval-request-log-redaction Prove request logs never contain auth tokens' \
		'  make eval-frontend-components  Check frontend boundary rules' \
		'  make eval-m4                   Prove M4 search, sharing, permissions and purge' \
		'  make eval-m5                   Run deterministic M5 gate (no provider or API)' \
		'  make eval-m5-live              Run opt-in paid M5 smoke (requires configured local API)' \
		'  make eval-editor-sidebar-ux    Prove code editor and sidebar UX in Cypress' \
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

test: test-api test-web

test-api:
	cd backend && cargo test --lib --bins

test-web:
	cd $(WEB_DIR) && npm test

test-e2e: docker-ready
	$(COMPOSE) --profile e2e up -d --build api-e2e worker-e2e web-e2e
	$(COMPOSE) --profile e2e run --rm cypress

eval-password-reset:
	bash docs/evals/password-reset-smoke.sh

eval-page-persistence:
	node docs/evals/page-persistence-smoke.mjs

eval-sync-catch-up:
	node docs/evals/sync-catch-up-smoke.mjs

eval-request-log-redaction:
	node docs/evals/request-log-redaction-smoke.mjs

eval-frontend-components:
	bash docs/evals/frontend-component-boundaries.sh

eval-m4:
	node docs/evals/m4-smoke.mjs

eval-m5:
	bash docs/evals/m5-gate.sh

eval-m5-live: docker-ready
	@test -n "$$OPENROUTER_API_KEY" || (printf '%s\n' 'OPENROUTER_API_KEY is required (value is never printed)' >&2; exit 1)
	node docs/evals/m5-live.mjs

eval-editor-sidebar-ux: docker-ready
	$(COMPOSE) --profile e2e up -d --build api-e2e worker-e2e web-e2e
	$(COMPOSE) --profile e2e run --rm cypress "npm ci && npx cypress run --spec cypress/e2e/editor-sidebar-ux.cy.ts"

clean: kill-web
	@if docker info >/dev/null 2>&1; then \
		$(COMPOSE) --profile e2e --profile docker-web down --volumes --remove-orphans; \
	else \
		echo "Docker daemon not running; skipped compose clean."; \
	fi
