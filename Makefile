.PHONY: help dev prod build up down logs clean lint fmt

help:
	@echo "Vibeshift - Development & Production Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev        - Start development environment with hot reloading"
	@echo "  make logs       - View live logs from containers"
	@echo "  make down       - Stop all containers"
	@echo ""
	@echo "Production:"
	@echo "  make prod       - Start production environment"
	@echo "  make build      - Build production image"
	@echo ""
	@echo "Code Quality:"
	@echo "  make fmt        - Format Go code"
	@echo "  make lint       - Run Go linter"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean      - Remove containers, volumes, and build artifacts"
	@echo "  make env        - Copy .env.example to .env"

dev:
	docker-compose up --build

prod:
	docker-compose -f compose.yml up -d --build

build:
	docker-compose -f compose.yml build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f app

clean:
	docker-compose down -v
	rm -rf tmp/
	go clean

fmt:
	go fmt ./...

lint:
	go vet ./...

env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example - please update with your settings"; \
	else \
		echo ".env already exists"; \
	fi

restart: down dev
.PHONY: help dev prod build up down logs clean lint fmt

help:
	@echo "Vibeshift - Development & Production Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development environment (backend + frontend via Compose)"
	@echo "  make dev:backend  - Start only the backend service via Compose"
	@echo "  make dev:frontend - Start only the frontend service via Compose"
	@echo "  make dev:both     - Start both services (same as make dev)"
	@echo "  make frontend-dev - Run frontend dev server locally (npm run dev)"
	@echo "  make logs         - View live logs from containers"
	@echo "  make down         - Stop all containers"
	@echo ""
	@echo "Production:"
	@echo "  make prod         - Start production environment"
	@echo "  make build        - Build production image"
	@echo ""
	@echo "Code Quality:"
	@echo "  make fmt          - Format Go code"
	@echo "  make lint         - Run Go linter"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean        - Remove containers, volumes, and build artifacts"
	@echo "  make env          - Copy .env.example to .env"

dev:
	docker-compose up --build

dev:backend
	docker-compose up --build app

dev:frontend
	docker-compose up --build frontend

dev:both
	docker-compose up --build

frontend-dev:
	cd frontend && npm ci && npm run dev

prod:
	docker-compose -f compose.yml up -d --build

build:
	docker-compose -f compose.yml build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f app

clean:
	docker-compose down -v
	rm -rf tmp/
	go clean

fmt:
	go fmt ./...

lint:
	go vet ./...

env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example - please update with your settings"; \
	else \
		echo ".env already exists"; \
	fi

restart: down dev
