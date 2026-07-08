COMPOSE ?= docker compose

.PHONY: help dev watch up down restart logs ps test test-api test-web test-e2e eval-password-reset eval-frontend-components clean

help:
	@printf '%s\n' \
		'Targets:' \
		'  make dev                       Build and run the full stack in the foreground' \
		'  make watch                     Build and run with Docker Compose Watch when supported' \
		'  make up                        Build and run the full stack in the background' \
		'  make down                      Stop containers' \
		'  make restart                   Restart the full stack in the background' \
		'  make logs                      Follow all container logs' \
		'  make ps                        Show container status' \
		'  make test                      Run API and web gate tests' \
		'  make test-e2e                  Run Cypress full-stack E2E tests' \
		'  make eval-password-reset       Run password-reset smoke eval against local API' \
		'  make eval-frontend-components  Check frontend boundary rules' \
		'  make clean                     Stop containers and remove local volumes'

dev:
	$(COMPOSE) up --build

watch:
	$(COMPOSE) up --watch --build

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

restart: down up

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

test: test-api test-web

test-api:
	cd backend && cargo test --lib --bins

test-web:
	cd frontend && npm test

test-e2e:
	$(COMPOSE) --profile e2e up -d --build api-e2e web-e2e
	$(COMPOSE) --profile e2e run --rm cypress

eval-password-reset:
	bash docs/evals/password-reset-smoke.sh

eval-frontend-components:
	bash docs/evals/frontend-component-boundaries.sh

clean:
	$(COMPOSE) down --volumes --remove-orphans
