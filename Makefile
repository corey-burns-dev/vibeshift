# Variables
GO ?= go
DOCKER_COMPOSE ?= docker compose
BUN ?= bun

# Colors
BLUE := \033[1;34m
GREEN := \033[1;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

.PHONY: help dev dev-backend dev-frontend dev-both build build-backend build-frontend up down recreate recreate-frontend recreate-backend logs logs-backend logs-frontend logs-all fmt fmt-frontend lint lint-frontend install env restart check-versions clean test test-api test-up test-down test-backend seed deps-update deps-update-backend deps-update-frontend deps-tidy deps-check deps-vuln deps-audit

# Default target
help:
	@echo "$(BLUE)╔════════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║           Vibeshift - Full Stack Development CLI               ║$(NC)"
	@echo "$(BLUE)╚════════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(GREEN)Development:$(NC)"
	@echo "  make dev                - 🚀 Start full stack (backend + frontend + databases)"
	@echo "  make dev-backend        - 🔧 Backend only (Go + Redis + Postgres)"
	@echo "  make dev-frontend       - 🎨 Frontend only (Vite dev server, local)"
	@echo "  make dev-both           - 🔀 Backend in Docker + Frontend local (best DX)"
	@echo ""
	@echo "$(GREEN)Build & Compose:$(NC)"
	@echo "  make build              - 🔨 Build all Docker images (prod)"
	@echo "  make build-backend      - 🔨 Build backend image"
	@echo "  make build-frontend     - 🔨 Build frontend image"
	@echo "  make up                 - ⬆️  Start services in background"
	@echo "  make recreate           - 🔄 Rebuild all containers (no cache)"
	@echo "  make recreate-frontend  - 🔄 Rebuild frontend container (no cache)"
	@echo "  make recreate-backend   - 🔄 Rebuild backend container (no cache)"
	@echo "  make down               - ⬇️  Stop all services"
	@echo ""
	@echo "$(GREEN)Logs & Monitoring:$(NC)"
	@echo "  make logs               - 📋 Stream backend logs"
	@echo "  make logs-backend       - 📋 Backend logs only"
	@echo "  make logs-frontend      - 📋 Frontend logs only"
	@echo "  make logs-all           - 📋 All service logs"
	@echo ""
	@echo "$(GREEN)Code Quality:$(NC)"
	@echo "  make fmt                - 🎨 Format Go code"
	@echo "  make fmt-frontend       - 🎨 Format frontend code (Biome)"
	@echo "  make lint               - 🔍 Lint Go code"
	@echo "  make lint-frontend      - 🔍 Lint frontend code (Biome)"
	@echo "  make install            - 📦 Install frontend dependencies"
	@echo ""
	@echo "$(GREEN)Testing:$(NC)"
	@echo "  make test               - 🧪 Run backend tests"
	@echo "  make test-api           - 🧪 Test all API endpoints"
	@echo ""
	@echo "$(GREEN)Database:$(NC)"
	@echo "  make seed               - 🌱 Seed database with test data"
	@echo ""
	@echo "$(GREEN)Utilities:$(NC)"
	@echo "  make env                - ⚙️  Initialize .env file"
	@echo "  make restart            - 🔄 Restart all services"
	@echo "  make clean              - 🧹 Clean containers, volumes, and artifacts"
	@echo "  make check-versions     - 🔍 Check latest Docker image versions"
	@echo ""
	@echo "$(GREEN)Dependencies:$(NC)"
	@echo "  make deps-update        - 📦 Update all dependencies (Go + frontend)"
	@echo "  make deps-update-backend - 📦 Update Go dependencies only"
	@echo "  make deps-tidy          - 🧹 Tidy Go modules (go mod tidy)"
	@echo "  make deps-check         - 🔍 Check for outdated Go dependencies"
	@echo "  make deps-vuln          - 🛡️  Scan for security vulnerabilities"
	@echo "  make deps-audit         - 🔎 Full dependency audit (check + vuln)"
	@echo ""

# Development targets
dev: env
	@echo "$(BLUE)Starting full stack development environment...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) up --build

dev-backend: env
	@echo "$(BLUE)Starting backend services (Go, Redis, Postgres)...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) up --build app redis postgres

dev-frontend: install
	@echo "$(BLUE)Starting frontend dev server...$(NC)"
	cd frontend && $(BUN) --bun vite --host

dev-both: env install
	@echo "$(BLUE)Starting backend in Docker + frontend locally...$(NC)"
	@echo "$(YELLOW)Backend will start in background...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) up --build app redis postgres -d
	@echo "$(YELLOW)Frontend starting in foreground...$(NC)"
	@cd frontend && $(BUN) --bun vite --host

# Build targets
build: build-backend build-frontend
	@echo "$(GREEN)✓ All images built successfully$(NC)"

build-backend:
	@echo "$(BLUE)Building backend image...$(NC)"
	$(DOCKER_COMPOSE) build app

build-frontend:
	@echo "$(BLUE)Building frontend image...$(NC)"
	$(DOCKER_COMPOSE) build frontend

# Container management
up:
	@echo "$(BLUE)Starting services in background...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) up -d

down:
	@echo "$(BLUE)Stopping all services...$(NC)"
	$(DOCKER_COMPOSE) down

# Recreate targets (rebuild from scratch without cache)
recreate:
	@echo "$(BLUE)Recreating all containers (no cache)...$(NC)"
	$(DOCKER_COMPOSE) build --no-cache
	$(DOCKER_COMPOSE) up -d --force-recreate
	@echo "$(GREEN)✓ All containers recreated$(NC)"

recreate-frontend:
	@echo "$(BLUE)Recreating frontend container (no cache)...$(NC)"
	$(DOCKER_COMPOSE) build --no-cache frontend
	$(DOCKER_COMPOSE) up -d --force-recreate frontend
	@echo "$(GREEN)✓ Frontend container recreated$(NC)"

recreate-backend:
	@echo "$(BLUE)Recreating backend container (no cache)...$(NC)"
	$(DOCKER_COMPOSE) build --no-cache app
	$(DOCKER_COMPOSE) up -d --force-recreate app
	@echo "$(GREEN)✓ Backend container recreated$(NC)"

# Logging
logs: logs-backend

logs-backend:
	$(DOCKER_COMPOSE) logs -f app

logs-frontend:
	$(DOCKER_COMPOSE) logs -f frontend

logs-all:
	$(DOCKER_COMPOSE) logs -f

# Code quality
fmt:
	@echo "$(BLUE)Formatting Go code...$(NC)"
	$(GO) fmt ./...
	@echo "$(GREEN)✓ Code formatted$(NC)"

lint:
	@echo "$(BLUE)Linting Go code with golangci-lint...$(NC)"
	@if ! command -v golangci-lint >/dev/null 2>&1; then \
		echo "$(YELLOW)golangci-lint not found. Run 'make install-linter' to install it.$(NC)"; \
		exit 1; \
	fi
	cd backend && golangci-lint run ./...
	@echo "$(GREEN)✓ Linting passed$(NC)"

.PHONY: install-linter
install-linter:
	@echo "$(BLUE)Installing golangci-lint...$(NC)"
	@GO111MODULE=on go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@echo "$(GREEN)✓ golangci-lint installed (ensure $HOME/go/bin is in your PATH)$(NC)"

fmt-frontend:
	@echo "$(BLUE)Formatting frontend code with Biome...$(NC)"
	cd frontend && $(BUN) --bun biome format --write .
	@echo "$(GREEN)✓ Frontend code formatted$(NC)"

lint-frontend:
	@echo "$(BLUE)Linting frontend code with Biome...$(NC)"
	cd frontend && $(BUN) --bun biome check --write .
	@echo "$(GREEN)✓ Frontend linting passed$(NC)"

# Frontend dependencies
install:
	@echo "$(BLUE)Installing frontend dependencies...$(NC)"
	cd frontend && $(BUN) install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

# Swagger documentation
swagger:
	@echo "$(BLUE)Generating Swagger documentation...$(NC)"
	cd backend && ~/go/bin/swag init -g main.go --output ./docs
	@echo "$(GREEN)✓ Swagger docs generated$(NC)"

# Environment setup
env:
	@if [ ! -f config.yml ]; then \
		echo "$(BLUE)Creating config.yml from config.example.yml...$(NC)"; \
		cp config.example.yml config.yml; \
		echo "$(YELLOW)⚠️  Update config.yml with your settings$(NC)"; \
	fi
	@./scripts/generate_env.sh

# Utility targets
restart: down dev

check-versions:
	@bash scripts/check-versions.sh

clean:
	@echo "$(BLUE)Cleaning up containers, volumes, and artifacts...$(NC)"
	$(DOCKER_COMPOSE) down -v
	-chmod -R 755 tmp/ 2>/dev/null || true
	-rm -rf tmp/ 2>/dev/null || true
	rm -rf frontend/node_modules frontend/dist
	$(GO) clean
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

# Testing
test: test-backend

test-backend:
	@echo "$(BLUE)Running backend tests...$(NC)"
	cd backend && $(GO) test ./...

test-api:
	@echo "$(BLUE)Running API endpoint tests...$(NC)"
	./test-api.sh

test-up:
	$(DOCKER_COMPOSE) up -d postgres_test redis

test-down:
	$(DOCKER_COMPOSE) down

# Database seeding
seed:
	@echo "$(BLUE)Seeding database with test data...$(NC)"
	cd backend && $(GO) run cmd/seed/main.go
	@echo "$(GREEN)✓ Database seeded successfully!$(NC)"
	@echo "$(YELLOW)📧 Test users password: password123$(NC)"

# Dependency Management
deps-update:
	@echo "$(BLUE)Updating Go dependencies...$(NC)"
	cd backend && $(GO) get -u ./...
	cd backend && $(GO) mod tidy
	@echo "$(GREEN)✓ Go dependencies updated$(NC)"
	@echo "$(BLUE)Updating frontend dependencies...$(NC)"
	cd frontend && $(BUN) update
	@echo "$(GREEN)✓ Frontend dependencies updated$(NC)"

deps-update-backend:
	@echo "$(BLUE)Updating Go dependencies...$(NC)"
	cd backend && $(GO) get -u ./...
	cd backend && $(GO) mod tidy
	@echo "$(GREEN)✓ Go dependencies updated$(NC)"

deps-update-frontend:
	@echo "$(BLUE)Updating frontend dependencies...$(NC)"
	cd frontend && $(BUN) update
	@echo "$(GREEN)✓ Frontend dependencies updated$(NC)"

deps-tidy:
	@echo "$(BLUE)Tidying Go modules...$(NC)"
	cd backend && $(GO) mod tidy
	@echo "$(GREEN)✓ Go modules tidied$(NC)"

deps-check:
	@echo "$(BLUE)Checking for outdated Go dependencies...$(NC)"
	@if [ ! -f "$(HOME)/go/bin/go-mod-outdated" ]; then \
		echo "$(YELLOW)Installing go-mod-outdated...$(NC)"; \
		$(GO) install github.com/psampaz/go-mod-outdated@latest; \
	fi
	cd backend && $(GO) list -u -m -json all | $(HOME)/go/bin/go-mod-outdated -update -direct
	@echo ""
	@echo "$(GREEN)✓ Dependency check complete$(NC)"

deps-vuln:
	@echo "$(BLUE)Scanning for security vulnerabilities...$(NC)"
	@if [ ! -f "$(HOME)/go/bin/govulncheck" ]; then \
		echo "$(YELLOW)Installing govulncheck...$(NC)"; \
		$(GO) install golang.org/x/vuln/cmd/govulncheck@latest; \
	fi
	cd backend && $(HOME)/go/bin/govulncheck ./...
	@echo "$(GREEN)✓ Vulnerability scan complete$(NC)"

deps-audit: deps-check deps-vuln
	@echo "$(GREEN)✓ Full dependency audit complete$(NC)"