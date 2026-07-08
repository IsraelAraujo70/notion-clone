# ponytail: M1 só precisa do frontend; alvos de backend/stack existem para M2+.
.PHONY: dev dev-web test test-web test-api build up down

dev: dev-web

dev-web:
	pnpm --dir frontend dev

test: test-web test-api

test-web:
	pnpm --dir frontend test

test-api:
	cargo test --manifest-path backend/Cargo.toml

build:
	pnpm --dir frontend build
	cargo build --manifest-path backend/Cargo.toml

up:
	docker compose up --build

down:
	docker compose down
