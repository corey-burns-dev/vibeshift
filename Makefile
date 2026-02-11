# Variables
GO ?= go
DOCKER_COMPOSE ?= docker compose
BUN ?= bun

# Environment Orchestration
ENVIRONMENT ?= dev
ifeq ($(ENVIRONMENT),prod)
	COMPOSE_FILES := -f compose.yml -f compose.prod.yml
else
	COMPOSE_FILES := -f compose.yml -f compose.override.yml
endif

MONITOR_FILES := -f compose.monitoring.yml

# Colors
BLUE := \033[1;34m
GREEN := \033[1;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

.PHONY: help dev dev-backend dev-frontend dev-both build build-backend build-frontend up down recreate recreate-frontend recreate-backend logs logs-backend logs-frontend logs-all fmt fmt-frontend lint lint-frontend install env restart check-versions clean test test-backend test-frontend test-api test-e2e test-e2e-smoke test-up test-down seed admin-list admin-promote admin-demote admin-bootstrap-me deps-update deps-update-backend deps-update-frontend deps-tidy deps-check deps-vuln deps-audit monitor-up monitor-down monitor-logs monitor-config monitor-lite-up monitor-lite-down report report-open

# Default target
help:
	@echo "$(BLUE)╔════════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║           Sanctum - Full Stack Development CLI               ║$(NC)"
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
	@echo "  make monitor-logs       - 📊 View monitoring stack logs"
	@echo "  make monitor-lite-up    - ⚡ Start ultra-lite monitoring (Dozzle, Uptime Kuma)"
	@echo "  make monitor-lite-down  - ⚡ Stop ultra-lite monitoring"
	@echo ""
	@echo "$(GREEN)Environment & Config:$(NC)"
	@echo "  make config-check       - 🔍 Validate merged Docker Compose config"
	@echo "  make env                - ⚙️  Initialize .env file"
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
	@echo "  make test-frontend      - 🧪 Run frontend unit tests (Vitest)"
	@echo "  make test-api           - 🧪 Test all API endpoints"
	@echo "  make test-e2e-smoke     - 🧪 Run Playwright Sanctum smoke tests"
	@echo "  make test-e2e           - 🧪 Run full Playwright E2E suite"
	@echo ""
	@echo "$(GREEN)Database:$(NC)"
	@echo "  make seed               - 🌱 Seed database with test data"
	@echo "  make admin-list         - 👑 List admin users"
	@echo "  make admin-promote user_id=<id> - 👑 Promote user to admin"
	@echo "  make admin-demote user_id=<id>  - 👑 Demote admin user"
	@echo "  make admin-bootstrap-me email=<email> - 👑 Make exactly one admin (you)"
	@echo ""
	@echo "$(GREEN)Utilities:$(NC)"
	@echo "  make env                - ⚙️  Initialize .env file"
	@echo "  make report slug=<name> - 📝 Create a timestamped report in docs/reports/"
	@echo "  make report-open        - 📝 Show most recent report file path"
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
	@echo "  make deps-add-backend pkg=<pkg> - ➕ Add Go dependency inside container"
	@echo ""

# Development targets
dev: env
	@echo "$(BLUE)Starting full stack development environment...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) $(COMPOSE_FILES) up --build

dev-backend: env
	@echo "$(BLUE)Starting backend services (Go, Redis, Postgres)...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) $(COMPOSE_FILES) up --build app redis postgres

dev-frontend: install
	@echo "$(BLUE)Starting frontend dev server...$(NC)"
	cd frontend && $(BUN) --bun vite --host

dev-both: env install
	@echo "$(BLUE)Starting backend in Docker + frontend locally...$(NC)"
	@echo "$(YELLOW)Backend will start in background...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) $(COMPOSE_FILES) up --build app redis postgres -d
	@echo "$(YELLOW)Frontend starting in foreground...$(NC)"
	@cd frontend && $(BUN) --bun vite --host

# Build targets
build: build-backend build-frontend
	@echo "$(GREEN)✓ All images built successfully$(NC)"

build-backend:
	@echo "$(BLUE)Building backend image...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) build app

build-frontend:
	@echo "$(BLUE)Building frontend image...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) build frontend

# Container management
up:
	@echo "$(BLUE)Starting services in background...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) $(COMPOSE_FILES) up -d

down:
	@echo "$(BLUE)Stopping all services...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) down

# Recreate targets (rebuild from scratch without cache)
recreate:
	@echo "$(BLUE)Recreating all containers (no cache)...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) build --no-cache
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) up -d --force-recreate
	@echo "$(GREEN)✓ All containers recreated$(NC)"

recreate-frontend:
	@echo "$(BLUE)Recreating frontend container (no cache)...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) build --no-cache frontend
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) up -d --force-recreate frontend
	@echo "$(GREEN)✓ Frontend container recreated$(NC)"

recreate-backend:
	@echo "$(BLUE)Recreating backend container (no cache)...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) build --no-cache app
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) up -d --force-recreate app
	@echo "$(GREEN)✓ Backend container recreated$(NC)"

# Logging
logs: logs-backend

logs-backend:
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) logs -f app

logs-frontend:
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) logs -f frontend

logs-all:
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) logs -f

# Monitoring targets
monitor-up:
	@echo "$(BLUE)Starting observability stack...$(NC)"
	$(DOCKER_COMPOSE) $(MONITOR_FILES) up -d
	@echo "$(GREEN)✓ Monitoring stack started (Grafana: http://localhost:3000)$(NC)"

monitor-down:
	@echo "$(BLUE)Stopping observability stack...$(NC)"
	$(DOCKER_COMPOSE) $(MONITOR_FILES) down
	@echo "$(GREEN)✓ Monitoring stack stopped$(NC)"

monitor-logs:
	$(DOCKER_COMPOSE) $(MONITOR_FILES) logs -f

monitor-config:
	$(DOCKER_COMPOSE) $(MONITOR_FILES) config

# Lite Monitoring targets
monitor-lite-up:
	@echo "$(BLUE)Starting ultra-lite observability stack...$(NC)"
	$(DOCKER_COMPOSE) -f compose.monitor-lite.yml up -d
	@echo "$(GREEN)✓ Lite Monitoring started (Dozzle: http://localhost:8081, Uptime Kuma: http://localhost:3001)$(NC)"

monitor-lite-down:
	@echo "$(BLUE)Stopping ultra-lite observability stack...$(NC)"
	$(DOCKER_COMPOSE) -f compose.monitor-lite.yml down
	@echo "$(GREEN)✓ Lite Monitoring stopped$(NC)"

# Config validation
config-check:
	@echo "$(BLUE)Validating merged Docker Compose configuration for environment: $(ENVIRONMENT)...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) config

# Code quality
fmt:
	@echo "$(BLUE)Formatting Go code...$(NC)"
	cd backend && $(GO) fmt ./...
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
	# In CI, clean build artifacts to ensure linting is deterministic.
	# Locally we avoid removing `dist` so developers' build output isn't destroyed.
	cd frontend && if [ -n "$(CI)" ]; then rm -rf dist; fi && $(BUN) --bun biome check .
	@echo "$(GREEN)✓ Frontend linting passed$(NC)"

# Frontend dependencies
install:
	@echo "$(BLUE)Installing frontend dependencies...$(NC)"
	cd frontend && $(BUN) install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

# Swagger documentation
swagger:
	@echo "$(BLUE)Generating Swagger documentation...$(NC)"
	cd backend && ~/go/bin/swag init -g cmd/server/main.go --output ./docs
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

report:
	@if [ -z "$(slug)" ]; then \
		echo "$(YELLOW)Usage: make report slug=<short-kebab-slug>$(NC)"; \
		echo "Example: make report slug=auth-refresh-fix"; \
		exit 1; \
	fi
	@./scripts/new_report.sh "$(slug)"

report-open:
	@latest="$$(ls -1 docs/reports/*.md 2>/dev/null | grep -v 'REPORT_TEMPLATE.md' | sort | tail -n 1)"; \
	if [ -z "$$latest" ]; then \
		echo "$(YELLOW)No report files found in docs/reports.$(NC)"; \
		exit 1; \
	fi; \
	echo "$$latest"

clean:
	@echo "$(BLUE)Cleaning up containers, volumes, and artifacts...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) down -v
	-chmod -R 755 tmp/ 2>/dev/null || true
	-rm -rf tmp/ 2>/dev/null || true
	rm -rf frontend/node_modules frontend/dist
	$(GO) clean
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

# Testing
test: test-backend

test-backend:
	@echo "$(BLUE)Running backend tests...$(NC)"
	make test-up
	@echo "$(BLUE)Waiting for test database...$(NC)"
	@sleep 5
	cd backend && APP_ENV=test $(GO) test ./...

test-frontend:
	@echo "$(BLUE)Running frontend unit tests...$(NC)"
	cd frontend && $(BUN) run test:run

test-api:
	@echo "$(BLUE)Running API endpoint tests...$(NC)"
	./test-api.sh

test-up:
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) up -d postgres_test redis

test-down:
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) down

# E2E Testing (Playwright)
test-e2e-smoke:
	@echo "$(BLUE)Running Playwright smoke E2E tests...$(NC)"
	@echo "$(YELLOW)⚠️  Ensure backend and frontend are running (make dev or run both locally)$(NC)"
	cd frontend && PLAYWRIGHT_BASE_URL=http://localhost:5173 PLAYWRIGHT_API_URL=http://localhost:8375/api DB_HOST=localhost DB_PORT=5433 DB_USER=sanctum_user DB_PASSWORD=sanctum_password DB_NAME=sanctum_test $(BUN) run test:e2e:smoke

test-e2e:
	@echo "$(BLUE)Running full Playwright E2E suite...$(NC)"
	@echo "$(YELLOW)⚠️  Ensure backend and frontend are running (make dev or run both locally)$(NC)"
	cd frontend && PLAYWRIGHT_BASE_URL=http://localhost:5173 PLAYWRIGHT_API_URL=http://localhost:8375/api DB_HOST=localhost DB_PORT=5433 DB_USER=sanctum_user DB_PASSWORD=sanctum_password DB_NAME=sanctum_test $(BUN) run test:e2e

# Database seeding
seed:
	@echo "$(BLUE)Seeding database with default parameters...$(NC)"
	cd backend && $(GO) run cmd/seed/main.go

seed-all:
	@echo "$(BLUE)Applying MegaPopulated seeder preset...$(NC)"
	cd backend && $(GO) run cmd/seed/main.go -preset MegaPopulated

seed-clean:
	@echo "$(BLUE)Cleaning and seeding database...$(NC)"
	cd backend && $(GO) run cmd/seed/main.go -clean=true
	@echo "$(GREEN)✓ Database seeded successfully!$(NC)"
	@echo "$(YELLOW)📧 Test users password: password123$(NC)"

# Admin management
admin-list:
	@echo "$(BLUE)Listing admin users...$(NC)"
	cd backend && APP_ENV=development $(GO) run ./cmd/admin/main.go list-admins

admin-promote:
	@if [ -z "$(user_id)" ]; then echo "Usage: make admin-promote user_id=<id>"; exit 1; fi
	@echo "$(BLUE)Promoting user $(user_id) to admin...$(NC)"
	cd backend && APP_ENV=development $(GO) run ./cmd/admin/main.go promote $(user_id)

admin-demote:
	@if [ -z "$(user_id)" ]; then echo "Usage: make admin-demote user_id=<id>"; exit 1; fi
	@echo "$(BLUE)Demoting user $(user_id) from admin...$(NC)"
	cd backend && APP_ENV=development $(GO) run ./cmd/admin/main.go demote $(user_id)

admin-bootstrap-me:
	@if [ -z "$(email)" ]; then echo "Usage: make admin-bootstrap-me email=<email>"; exit 1; fi
	@echo "$(BLUE)Bootstrapping single-admin mode for $(email)...$(NC)"
	./scripts/admin_bootstrap_me.sh "$(email)"

# Dependency Management
deps-install-backend:
	@echo "$(BLUE)Installing Go dependencies...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) exec -T app go mod download
	@echo "$(GREEN)✓ Go dependencies installed$(NC)"

deps-add-backend:
	@if [ -z "$(pkg)" ]; then echo "Usage: make deps-add-backend pkg=github.com/foo/bar"; exit 1; fi
	@echo "$(BLUE)Adding Go package $(pkg) inside container...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) exec -T app go get $(pkg)
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) exec -T app go mod tidy
	@echo "$(GREEN)✓ Package added$(NC)"

deps-tidy:
	@echo "$(BLUE)Tidying Go modules inside container...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) exec -T app go mod tidy
	@echo "$(GREEN)✓ Go modules tidied$(NC)"

deps-update: deps-tidy
	@echo "$(BLUE)Updating frontend dependencies...$(NC)"
	cd frontend && $(BUN) update
	@echo "$(GREEN)✓ Frontend dependencies updated$(NC)"

deps-update-backend:
	@echo "$(BLUE)Updating Go dependencies...$(NC)"
	@echo "$(BLUE)Updating Go dependencies inside container...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) exec -T app go get -u ./...
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) exec -T app go mod tidy
	@echo "$(GREEN)✓ Go dependencies updated$(NC)"

deps-update-frontend:
	@echo "$(BLUE)Updating frontend dependencies...$(NC)"
	cd frontend && $(BUN) update
	@echo "$(GREEN)✓ Frontend dependencies updated$(NC)"

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
