# Variables
GO ?= go
DOCKER_COMPOSE ?= ./scripts/compose.sh
BUN ?= bun
K6_DOCKER_IMAGE ?= grafana/k6:0.49.0

# Environment Orchestration
ENVIRONMENT ?= dev
ifeq ($(ENVIRONMENT),prod)
	COMPOSE_FILES := -f compose.yml -f compose.prod.yml
else ifeq ($(ENVIRONMENT),stress)
	COMPOSE_FILES := -f compose.yml -f compose.prod.yml -f compose.stress.yml
else
	COMPOSE_FILES := -f compose.yml -f compose.override.yml
endif

MONITOR_FILES := -f compose.monitoring.yml
ARTIFACT_DIR ?= tmp/stress-runs

# Colors
BLUE := \033[1;34m
GREEN := \033[1;32m
YELLOW := \033[1;33m
RED := \033[1;31m
NC := \033[0m # No Color

.PHONY: help dev dev-build dev-clean dev-backend dev-frontend dev-both build build-backend build-frontend up down recreate recreate-frontend recreate-backend logs logs-backend logs-frontend logs-all fmt fmt-frontend lint lint-frontend install env restart check-versions versions-check clean test test-api test-backend-integration test-frontend test-up test-down test-backend seed db-migrate db-migrate-up db-migrate-auto db-schema-status db-reset-dev deps-update deps-update-backend deps-update-frontend deps-tidy deps-check deps-vuln deps-audit deps-freshness monitor-up monitor-down monitor-logs monitor-config monitor-lite-up monitor-lite-down config-sanity stress-stack-up stress-stack-down stress-low stress-medium stress-high stress-extreme stress-insane stress-all ai-report stress-ai-low stress-ai-medium stress-ai-high stress-ai-extreme stress-ai-insane stress-index gateway-up gateway-down gateway-logs ai-memory-backfill ai-memory-update ai-memory-validate ai-docs-verify openapi-check

# Default target
help:
	@echo "$(BLUE)╔════════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║           Sanctum - Full Stack Development CLI               ║$(NC)"
	@echo "$(BLUE)╚════════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(GREEN)Development:$(NC)"
	@echo "  make dev                - 🚀 Start full stack (fast; no rebuild)"
	@echo "  make dev-build          - 🔨 Build images then start (first time or after Dockerfile change)"
	@echo "  make dev-clean          - 🧹 Fresh start (clean volumes/data + build + dev)"
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
	@echo "  make config-sanity      - 🔍 Validate config and env safety defaults"
	@echo "  make versions-check     - 🔍 Verify compose/docker versions match catalog"
	@echo "  make env                - ⚙️  Initialize .env file"
	@echo ""
	@echo "$(GREEN)Code Quality:$(NC)"
	@echo "  make fmt                - 🎨 Format Go code"
	@echo "  make fmt-frontend       - 🎨 Format frontend code (Biome)"
	@echo "  make lint               - 🔍 Lint Go code"
	@echo "  make lint-frontend      - 🔍 Lint frontend code (Biome)"
	@echo "  make openapi-check      - 🔍 Verify frontend endpoints are covered by OpenAPI"
	@echo "  make install            - 📦 Install frontend dependencies"
	@echo ""
	@echo "$(GREEN)Testing:$(NC)"
	@echo "  make test               - 🧪 Run backend tests"
	@echo "  make test-api           - 🧪 Test all API endpoints"
	@echo "  make test-frontend      - 🧪 Run frontend unit tests"
	@echo "  make test-backend-integration - 🧪 Run integration tests (requires DB/Redis)"
	@echo "  make stress-low         - 🧪 Run mixed low-profile stress test (k6 + artifacts)"
	@echo "  make stress-medium      - 🧪 Run mixed medium-profile stress test (k6 + artifacts)"
	@echo "  make stress-high        - 🧪 Run mixed high-profile stress test (k6 + artifacts)"
	@echo "  make stress-extreme     - 🧪 Run mixed extreme-profile stress test (k6 + artifacts)"
	@echo "  make stress-insane      - 🧪 Run mixed insane-profile stress test (k6 + artifacts)"
	@echo "  make ai-report          - 🤖 Generate AI report for latest run (or RUN_DIR=...)"
	@echo "  make stress-ai-low      - 🤖 End-to-end: stack up + low stress + AI report"
	@echo "  make stress-ai-medium   - 🤖 End-to-end: stack up + medium stress + AI report"
	@echo "  make stress-ai-high     - 🤖 End-to-end: stack up + high stress + AI report"
	@echo "  make stress-ai-extreme  - 🤖 End-to-end: stack up + extreme stress + AI report"
	@echo "  make stress-ai-insane   - 🤖 End-to-end: stack up + insane stress + AI report"
	@echo "  make stress-all         - 🤖 Run low/medium/high/extreme/insane with AI report + index"
	@echo "  make stress-index       - 📄 Rebuild stress report index page"
	@echo ""
	@echo "$(GREEN)Gateway & Proxy:$(NC)"
	@echo "  make gateway-up         - 🛡️  Start app behind Nginx gateway (port 8080)"
	@echo "  make gateway-down       - ⬇️  Stop gateway and app stack"
	@echo "  make gateway-logs       - 📋 View Nginx gateway logs"
	@echo ""
	@echo "$(GREEN)Database:$(NC)"
	@echo "  make seed               - 🌱 Seed database with test data"
	@echo "  make db-migrate         - 🧭 Apply SQL migrations (Docker)"
	@echo "  make db-migrate-auto    - 🧭 Run AutoMigrate mode (explicit)"
	@echo "  make db-schema-status   - 🧭 Show schema mode and migration status (Docker)"
	@echo "  make db-reset-dev       - 🧹 Reset dev DB volumes and reapply migrations"
	@echo ""
	@echo "$(GREEN)Utilities:$(NC)"
	@echo "  make env                - ⚙️  Initialize .env file"
	@echo "  make restart            - 🔄 Restart all services"
	@echo "  make clean              - 🧹 Clean containers, volumes, and artifacts"
	@echo "  make check-versions     - 🔍 Check latest Docker image versions"
	@echo "  make ai-memory-backfill - 🧠 Backfill lessons/context from high-signal reports"
	@echo "  make ai-memory-update   - 🧠 Update memory from one report (REPORT=docs/reports/...)"
	@echo "  make ai-memory-validate - 🧠 Validate lesson/report memory schema"
	@echo "  make ai-docs-verify     - 📚 Verify template sync, memory schema, and docs links"
	@echo ""
	@echo "$(GREEN)Dependencies:$(NC)"
	@echo "  make deps-update        - 📦 Update all dependencies (Go + frontend)"
	@echo "  make deps-update-backend - 📦 Update Go dependencies only"
	@echo "  make deps-tidy          - 🧹 Tidy Go modules (go mod tidy)"
	@echo "  make deps-check         - 🔍 Check for outdated Go dependencies"
	@echo "  make deps-vuln          - 🛡️  Scan for security vulnerabilities"
	@echo "  make deps-audit         - 🔎 Full dependency audit (check + vuln)"
	@echo "  make deps-freshness     - 🔍 Check Go and frontend outdated deps"
	@echo "  make deps-add-backend pkg=<pkg> - ➕ Add Go dependency inside container"
	@echo ""

# Development targets (make dev = fast start; make dev-build = first time or after Dockerfile changes)
dev: env
	@echo "$(BLUE)Starting full stack development environment...$(NC)"
	@echo "$(YELLOW)Tip: First time or after Dockerfile changes? Run 'make dev-build'$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) $(COMPOSE_FILES) up app redis postgres frontend

dev-build: env
	@echo "$(BLUE)Building dev images (first time or after Dockerfile changes)...$(NC)"
	@$(MAKE) build
	@echo "$(BLUE)Starting dev stack...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) $(COMPOSE_FILES) up app redis postgres frontend

dev-clean: clean dev-build

dev-backend: env
	@echo "$(BLUE)Starting backend services (Go, Redis, Postgres)...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) $(COMPOSE_FILES) up app redis postgres

dev-frontend: install
	@echo "$(BLUE)Starting frontend dev server...$(NC)"
	cd frontend && $(BUN) --bun vite --host

dev-both: env install
	@echo "$(BLUE)Starting backend in Docker + frontend locally...$(NC)"
	@echo "$(YELLOW)Backend will start in background...$(NC)"
	@set -a; [ -f .env ] && . ./.env; set +a; $(DOCKER_COMPOSE) $(COMPOSE_FILES) up app redis postgres -d
	@echo "$(YELLOW)Frontend starting in foreground...$(NC)"
	@cd frontend && $(BUN) --bun vite --host

# Build targets
build: build-backend build-frontend
	@echo "$(GREEN)✓ All images built successfully$(NC)"

build-backend:
	@echo "$(BLUE)Building backend image...$(NC)"
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 $(DOCKER_COMPOSE) $(COMPOSE_FILES) build app

build-frontend:
	@echo "$(BLUE)Building frontend image...$(NC)"
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 $(DOCKER_COMPOSE) $(COMPOSE_FILES) build frontend

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

config-sanity:
	@bash scripts/config_sanity.sh

# Code quality
fmt:
	@echo "$(BLUE)Formatting Go code...$(NC)"
	cd backend && $(GO) fmt ./...
	@echo "$(GREEN)✓ Code formatted$(NC)"

lint:
	@echo "$(BLUE)Linting Go code with golangci-lint...$(NC)"
	@if command -v golangci-lint >/dev/null 2>&1; then \
		cd backend && golangci-lint run ./...; \
	else \
		$(MAKE) lint-backend-docker; \
	fi
	@echo "$(GREEN)✓ Linting passed$(NC)"

lint-backend-docker:
	@echo "$(BLUE)Linting Go code via Docker (toolchain-stable)...$(NC)"
	docker run --rm -v $(shell pwd)/backend:/app -v $(shell pwd)/.golangci.yml:/.golangci.yml -w /app golangci/golangci-lint:latest golangci-lint run ./...
	@echo "$(GREEN)✓ Docker linting passed$(NC)"

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
	cd frontend && $(BUN) --bun biome check src
	@echo "$(GREEN)✓ Frontend linting passed$(NC)"

# Frontend dependencies
install:
	@echo "$(BLUE)Installing frontend dependencies...$(NC)"
	cd frontend && $(BUN) install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

# Swagger documentation
swagger:
	@echo "$(BLUE)Generating Swagger documentation...$(NC)"
	cd backend && go run github.com/swaggo/swag/cmd/swag@v1.16.6 init -g cmd/server/main.go --output ./docs
	@echo "$(GREEN)✓ Swagger docs generated$(NC)"

openapi-check:
	@echo "$(BLUE)Verifying frontend API paths against OpenAPI...$(NC)"
	@./scripts/check_openapi_frontend_sync.sh
	@echo "$(GREEN)✓ OpenAPI frontend sync check passed$(NC)"

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
	@bash backend/scripts/check-versions.sh

versions-check:
	@bash scripts/verify_versions.sh

ai-memory-backfill:
	@python3 scripts/agent_memory.py backfill --reports-dir docs/reports --lessons-dir docs/lessons

ai-memory-update:
	@if [ -z "$(REPORT)" ]; then echo "Usage: make ai-memory-update REPORT=docs/reports/YYYY-MM-DD-HHMM-slug.md"; exit 1; fi
	@python3 scripts/agent_memory.py update --report "$(REPORT)"

ai-memory-validate:
	@python3 scripts/agent_memory.py validate

ai-docs-verify:
	@./scripts/verify_agent_template_sync.sh
	@python3 scripts/agent_memory.py validate
	@./scripts/check_doc_links.sh

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
	cd backend && $(GO) test -race ./...

test-load:
	@echo "$(BLUE)Running backend load smoke tests...$(NC)"
	cd backend && APP_ENV=test $(GO) test ./test -tags=load -run TestLoadScenarios -count=1

test-stress-http:
	@echo "$(BLUE)Running HTTP stress tests with k6...$(NC)"
	k6 run --config load/profiles/moderate.json load/scripts/http_stress.js

test-stress-ws:
	@echo "$(BLUE)Running WebSocket stress tests with k6...$(NC)"
	k6 run --config load/profiles/moderate.json load/scripts/ws_stress.js

test-soak:
	@echo "$(BLUE)Running 2-hour soak test...$(NC)"
	k6 run --duration 2h load/scripts/soak_test.js

stress-stack-up:
	@echo "$(BLUE)Starting app + monitoring stack for stress pipeline...$(NC)"
	@$(MAKE) ENVIRONMENT=stress up
	@$(MAKE) monitor-up
	@echo "$(YELLOW)Waiting for app to be healthy...$(NC)"
	@ATTEMPTS=0; \
	until [ "$$(docker inspect -f '{{.State.Health.Status}}' sanctum-app-1 2>/dev/null)" = "healthy" ]; do \
		ATTEMPTS=$$((ATTEMPTS+1)); \
		if [ $$ATTEMPTS -ge 60 ]; then \
			echo "$(RED)App did not become healthy after 60 seconds$(NC)"; \
			docker compose logs app; \
			exit 1; \
		fi; \
		printf "."; \
		sleep 2; \
	done
	@echo "$(GREEN)✓ App is healthy$(NC)"
	@ATTEMPTS=0; \
	until $(MAKE) observability-verify >/dev/null 2>&1; do \
		ATTEMPTS=$$((ATTEMPTS+1)); \
		if [ $$ATTEMPTS -ge 30 ]; then \
			echo "$(RED)Observability stack did not become healthy after 30 attempts$(NC)"; \
			$(MAKE) observability-verify; \
			exit 1; \
		fi; \
		echo "$(YELLOW)Waiting for observability stack... attempt $$ATTEMPTS/30$(NC)"; \
		sleep 2; \
	done
	@echo "$(GREEN)✓ Stress stack is ready$(NC)"

stress-stack-down:
	@echo "$(BLUE)Stopping app + monitoring stack for stress pipeline...$(NC)"
	@$(MAKE) monitor-down
	@$(MAKE) ENVIRONMENT=stress down
	@echo "$(GREEN)✓ Stress stack stopped$(NC)"

stress-low:
	@echo "$(BLUE)Running mixed social stress profile: low$(NC)"
	@mkdir -p "$(ARTIFACT_DIR)"
	@set -e; RUN_TS=$$(date -u +%Y%m%dT%H%M%SZ); \
	RUN_DIR="$(ARTIFACT_DIR)/$${RUN_TS}-low"; \
	START_EPOCH=$$(date -u +%s); \
	mkdir -p "$$RUN_DIR"; \
	echo "{\"profile\":\"low\",\"start_epoch\":$$START_EPOCH,\"start_utc\":\"$$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$$RUN_DIR/metadata.json"; \
	if command -v k6 >/dev/null 2>&1; then \
		BASE_URL=$${BASE_URL:-http://localhost:8375} k6 run --config load/profiles/low.json --summary-export "$$RUN_DIR/summary.json" load/scripts/social_mixed.js; \
	else \
		echo "$(YELLOW)k6 not found locally; using Docker image $(K6_DOCKER_IMAGE)$(NC)"; \
		BASE_URL=$${BASE_URL:-http://127.0.0.1:8375}; \
		docker run --rm -i --network host --user $$(id -u):$$(id -g) -v "$(shell pwd):/work" -w /work -e BASE_URL=$$BASE_URL "$(K6_DOCKER_IMAGE)" run --config load/profiles/low.json --summary-export "$$RUN_DIR/summary.json" load/scripts/social_mixed.js; \
	fi; \
	END_EPOCH=$$(date -u +%s); \
	python3 -c "import json,sys,time; p=sys.argv[1]; e=int(sys.argv[2]); d=json.load(open(p, encoding='utf-8')); d['end_epoch']=e; d['end_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(e)); json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)" "$$RUN_DIR/metadata.json" "$$END_EPOCH"; \
	echo "$(GREEN)✓ low profile complete: $$RUN_DIR$(NC)"

stress-medium:
	@echo "$(BLUE)Running mixed social stress profile: medium$(NC)"
	@mkdir -p "$(ARTIFACT_DIR)"
	@set -e; RUN_TS=$$(date -u +%Y%m%dT%H%M%SZ); \
	RUN_DIR="$(ARTIFACT_DIR)/$${RUN_TS}-medium"; \
	START_EPOCH=$$(date -u +%s); \
	mkdir -p "$$RUN_DIR"; \
	echo "{\"profile\":\"medium\",\"start_epoch\":$$START_EPOCH,\"start_utc\":\"$$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$$RUN_DIR/metadata.json"; \
	if command -v k6 >/dev/null 2>&1; then \
		BASE_URL=$${BASE_URL:-http://localhost:8375} k6 run --config load/profiles/medium.json --summary-export "$$RUN_DIR/summary.json" load/scripts/social_mixed.js; \
	else \
		echo "$(YELLOW)k6 not found locally; using Docker image $(K6_DOCKER_IMAGE)$(NC)"; \
		BASE_URL=$${BASE_URL:-http://127.0.0.1:8375}; \
		docker run --rm -i --network host --user $$(id -u):$$(id -g) -v "$(shell pwd):/work" -w /work -e BASE_URL=$$BASE_URL "$(K6_DOCKER_IMAGE)" run --config load/profiles/medium.json --summary-export "$$RUN_DIR/summary.json" load/scripts/social_mixed.js; \
	fi; \
	END_EPOCH=$$(date -u +%s); \
	python3 -c "import json,sys,time; p=sys.argv[1]; e=int(sys.argv[2]); d=json.load(open(p, encoding='utf-8')); d['end_epoch']=e; d['end_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(e)); json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)" "$$RUN_DIR/metadata.json" "$$END_EPOCH"; \
	echo "$(GREEN)✓ medium profile complete: $$RUN_DIR$(NC)"

stress-high:
	@echo "$(BLUE)Running mixed social stress profile: high$(NC)"
	@mkdir -p "$(ARTIFACT_DIR)"
	@set -e; RUN_TS=$$(date -u +%Y%m%dT%H%M%SZ); \
	RUN_DIR="$(ARTIFACT_DIR)/$${RUN_TS}-high"; \
	START_EPOCH=$$(date -u +%s); \
	mkdir -p "$$RUN_DIR"; \
	echo "{\"profile\":\"high\",\"start_epoch\":$$START_EPOCH,\"start_utc\":\"$$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$$RUN_DIR/metadata.json"; \
	if command -v k6 >/dev/null 2>&1; then \
		BASE_URL=$${BASE_URL:-http://localhost:8375} k6 run --config load/profiles/high.json --summary-export "$$RUN_DIR/summary.json" load/scripts/social_mixed.js; \
	else \
		echo "$(YELLOW)k6 not found locally; using Docker image $(K6_DOCKER_IMAGE)$(NC)"; \
		BASE_URL=$${BASE_URL:-http://127.0.0.1:8375}; \
		docker run --rm -i --network host --user $$(id -u):$$(id -g) -v "$(shell pwd):/work" -w /work -e BASE_URL=$$BASE_URL "$(K6_DOCKER_IMAGE)" run --config load/profiles/high.json --summary-export "$$RUN_DIR/summary.json" load/scripts/social_mixed.js; \
	fi; \
	END_EPOCH=$$(date -u +%s); \
	python3 -c "import json,sys,time; p=sys.argv[1]; e=int(sys.argv[2]); d=json.load(open(p, encoding='utf-8')); d['end_epoch']=e; d['end_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(e)); json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)" "$$RUN_DIR/metadata.json" "$$END_EPOCH"; \
	echo "$(GREEN)✓ high profile complete: $$RUN_DIR$(NC)"

stress-extreme:
	@echo "$(BLUE)Running mixed social stress profile: extreme$(NC)"
	@mkdir -p "$(ARTIFACT_DIR)"
	@set -e; RUN_TS=$$(date -u +%Y%m%dT%H%M%SZ); \
	RUN_DIR="$(ARTIFACT_DIR)/$${RUN_TS}-extreme"; \
	START_EPOCH=$$(date -u +%s); \
	mkdir -p "$$RUN_DIR"; \
	echo "{\"profile\":\"extreme\",\"start_epoch\":$$START_EPOCH,\"start_utc\":\"$$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$$RUN_DIR/metadata.json"; \
	if command -v k6 >/dev/null 2>&1; then \
		BASE_URL=$${BASE_URL:-http://localhost:8375} k6 run --config load/profiles/extreme.json --summary-export "$$RUN_DIR/summary.json" load/scripts/social_mixed.js; \
	else \
		echo "$(YELLOW)k6 not found locally; using Docker image $(K6_DOCKER_IMAGE)$(NC)"; \
		BASE_URL=$${BASE_URL:-http://127.0.0.1:8375}; \
		docker run --rm -i --network host --user $$(id -u):$$(id -g) -v "$(shell pwd):/work" -w /work -e BASE_URL=$$BASE_URL "$(K6_DOCKER_IMAGE)" run --config load/profiles/extreme.json --summary-export "$$RUN_DIR/summary.json" load/scripts/social_mixed.js; \
	fi; \
	END_EPOCH=$$(date -u +%s); \
	python3 -c "import json,sys,time; p=sys.argv[1]; e=int(sys.argv[2]); d=json.load(open(p, encoding='utf-8')); d['end_epoch']=e; d['end_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(e)); json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)" "$$RUN_DIR/metadata.json" "$$END_EPOCH"; \
	echo "$(GREEN)✓ extreme profile complete: $$RUN_DIR$(NC)"

stress-insane:
	@echo "$(BLUE)Running mixed social stress profile: insane$(NC)"
	@mkdir -p "$(ARTIFACT_DIR)"
	@set -e; RUN_TS=$$(date -u +%Y%m%dT%H%M%SZ); \
	RUN_DIR="$(ARTIFACT_DIR)/$${RUN_TS}-insane"; \
	START_EPOCH=$$(date -u +%s); \
	mkdir -p "$$RUN_DIR"; \
	echo "{\"profile\":\"insane\",\"start_epoch\":$$START_EPOCH,\"start_utc\":\"$$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$$RUN_DIR/metadata.json"; \
	if command -v k6 >/dev/null 2>&1; then \
		BASE_URL=$${BASE_URL:-http://localhost:8375} k6 run --config load/profiles/insane.json --summary-export "$$RUN_DIR/summary.json" load/scripts/social_mixed.js; \
	else \
		echo "$(YELLOW)k6 not found locally; using Docker image $(K6_DOCKER_IMAGE)$(NC)"; \
		BASE_URL=$${BASE_URL:-http://127.0.0.1:8375}; \
		docker run --rm -i --network host --user $$(id -u):$$(id -g) -v "$(shell pwd):/work" -w /work -e BASE_URL=$$BASE_URL "$(K6_DOCKER_IMAGE)" run --config load/profiles/insane.json --summary-export "$$RUN_DIR/summary.json" load/scripts/social_mixed.js; \
	fi; \
	END_EPOCH=$$(date -u +%s); \
	python3 -c "import json,sys,time; p=sys.argv[1]; e=int(sys.argv[2]); d=json.load(open(p, encoding='utf-8')); d['end_epoch']=e; d['end_utc']=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(e)); json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)" "$$RUN_DIR/metadata.json" "$$END_EPOCH"; \
	echo "$(GREEN)✓ insane profile complete: $$RUN_DIR$(NC)"

ai-report:
	@echo "$(BLUE)Generating AI stress report...$(NC)"
	@ARTIFACT_DIR=$(ARTIFACT_DIR) \
	PROM_URL=$${PROM_URL:-http://localhost:9090} \
	LOKI_URL=$${LOKI_URL:-http://localhost:3100} \
	OLLAMA_URL=$${OLLAMA_URL:-http://localhost:11434} \
	OLLAMA_MODEL=$${OLLAMA_MODEL:-llama3.2:3b} \
	python3 scripts/ai_stress_report.py $$( [ -n "$$RUN_DIR" ] && printf '%s %s' '--run-dir' "$$RUN_DIR" )
	@echo "$(GREEN)✓ AI report complete$(NC)"

stress-index:
	@echo "$(BLUE)Building stress report index...$(NC)"
	@ARTIFACT_DIR=$(ARTIFACT_DIR) python3 scripts/ai_stress_report.py --build-index
	@echo "$(GREEN)✓ Index ready: $(ARTIFACT_DIR)/index.html$(NC)"

gateway-up:
	@echo "$(BLUE)Starting app with Nginx gateway...$(NC)"
	./scripts/compose.sh -f compose.yml -f compose.override.yml -f compose.gateway.yml up -d
	@echo "$(GREEN)✓ Gateway is running at http://localhost:8080$(NC)"

gateway-down:
	@echo "$(BLUE)Stopping gateway stack...$(NC)"
	./scripts/compose.sh -f compose.yml -f compose.override.yml -f compose.gateway.yml down

gateway-logs:
	@echo "$(BLUE)Streaming gateway logs...$(NC)"
	./scripts/compose.sh -f compose.yml -f compose.override.yml -f compose.gateway.yml logs -f gateway

stress-ai-low:
	@set +e; \
	$(MAKE) stress-stack-up; STACK=$$?; \
	$(MAKE) stress-low; STRESS=$$?; \
	$(MAKE) ai-report; REPORT=$$?; \
	$(MAKE) stress-index; INDEX=$$?; \
	if [ $$STACK -eq 0 ] && [ $$STRESS -eq 0 ] && [ $$REPORT -eq 0 ] && [ $$INDEX -eq 0 ]; then \
		echo "$(GREEN)✓ End-to-end low stress + AI pipeline complete$(NC)"; \
		exit 0; \
	fi; \
	echo "$(YELLOW)Pipeline completed with non-zero stage(s): stack=$$STACK stress=$$STRESS report=$$REPORT index=$$INDEX$(NC)"; \
	exit 1

stress-ai-medium:
	@set +e; \
	$(MAKE) stress-stack-up; STACK=$$?; \
	$(MAKE) stress-medium; STRESS=$$?; \
	$(MAKE) ai-report; REPORT=$$?; \
	$(MAKE) stress-index; INDEX=$$?; \
	if [ $$STACK -eq 0 ] && [ $$STRESS -eq 0 ] && [ $$REPORT -eq 0 ] && [ $$INDEX -eq 0 ]; then \
		echo "$(GREEN)✓ End-to-end medium stress + AI pipeline complete$(NC)"; \
		exit 0; \
	fi; \
	echo "$(YELLOW)Pipeline completed with non-zero stage(s): stack=$$STACK stress=$$STRESS report=$$REPORT index=$$INDEX$(NC)"; \
	exit 1

stress-ai-high:
	@set +e; \
	$(MAKE) stress-stack-up; STACK=$$?; \
	$(MAKE) stress-high; STRESS=$$?; \
	$(MAKE) ai-report; REPORT=$$?; \
	$(MAKE) stress-index; INDEX=$$?; \
	if [ $$STACK -eq 0 ] && [ $$STRESS -eq 0 ] && [ $$REPORT -eq 0 ] && [ $$INDEX -eq 0 ]; then \
		echo "$(GREEN)✓ End-to-end high stress + AI pipeline complete$(NC)"; \
		exit 0; \
	fi; \
	echo "$(YELLOW)Pipeline completed with non-zero stage(s): stack=$$STACK stress=$$STRESS report=$$REPORT index=$$INDEX$(NC)"; \
	exit 1

stress-ai-extreme:
	@set +e; \
	$(MAKE) stress-stack-up; STACK=$$?; \
	$(MAKE) stress-extreme; STRESS=$$?; \
	$(MAKE) ai-report; REPORT=$$?; \
	$(MAKE) stress-index; INDEX=$$?; \
	if [ $$STACK -eq 0 ] && [ $$STRESS -eq 0 ] && [ $$REPORT -eq 0 ] && [ $$INDEX -eq 0 ]; then \
		echo "$(GREEN)✓ End-to-end extreme stress + AI pipeline complete$(NC)"; \
		exit 0; \
	fi; \
	echo "$(YELLOW)Pipeline completed with non-zero stage(s): stack=$$STACK stress=$$STRESS report=$$REPORT index=$$INDEX$(NC)"; \
	exit 1

stress-ai-insane:
	@set +e; \
	$(MAKE) stress-stack-up; STACK=$$?; \
	$(MAKE) stress-insane; STRESS=$$?; \
	$(MAKE) ai-report; REPORT=$$?; \
	$(MAKE) stress-index; INDEX=$$?; \
	if [ $$STACK -eq 0 ] && [ $$STRESS -eq 0 ] && [ $$REPORT -eq 0 ] && [ $$INDEX -eq 0 ]; then \
		echo "$(GREEN)✓ End-to-end insane stress + AI pipeline complete$(NC)"; \
		exit 0; \
	fi; \
	echo "$(YELLOW)Pipeline completed with non-zero stage(s): stack=$$STACK stress=$$STRESS report=$$REPORT index=$$INDEX$(NC)"; \
	exit 1

stress-all:
	@set +e; \
	STATUS=0; \
	$(MAKE) stress-stack-up || STATUS=1; \
	$(MAKE) stress-low || STATUS=1; \
	$(MAKE) ai-report || STATUS=1; \
	$(MAKE) stress-medium || STATUS=1; \
	$(MAKE) ai-report || STATUS=1; \
	$(MAKE) stress-high || STATUS=1; \
	$(MAKE) ai-report || STATUS=1; \
	$(MAKE) stress-extreme || STATUS=1; \
	$(MAKE) ai-report || STATUS=1; \
	$(MAKE) stress-insane || STATUS=1; \
	$(MAKE) ai-report || STATUS=1; \
	$(MAKE) stress-index || STATUS=1; \
	if [ $$STATUS -eq 0 ]; then \
		echo "$(GREEN)✓ Completed all stress runs (low to insane) with AI reports$(NC)"; \
		exit 0; \
	fi; \
	echo "$(YELLOW)Completed stress-all with one or more non-zero stages; reports were still generated$(NC)"; \
	exit 1

observability-verify:
	@echo "$(BLUE)Verifying observability stack health...$(NC)"
	@curl -s http://localhost:9090/-/healthy | grep -q "Healthy" || (echo "$(RED)Prometheus unhealthy$(NC)"; exit 1)
	@curl -s http://localhost:3000/api/health | grep -q '"database":\s*"ok"' || (echo "$(RED)Grafana unhealthy$(NC)"; exit 1)
	@echo "$(GREEN)✓ Observability stack is healthy$(NC)"

test-api:
	@echo "$(BLUE)Running API endpoint tests...$(NC)"
	./test-routes.sh

test-frontend:
	@echo "$(BLUE)Running frontend tests...$(NC)"
	cd frontend && $(BUN) run test:run

test-up:
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) up -d postgres_test redis

test-down:
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) down

test-backend-integration: test-up
	@echo "$(BLUE)Running backend integration tests (tag=integration)...$(NC)"
	cd backend && $(GO) test -race -tags=integration ./test/...
	@echo "$(GREEN)✓ Integration tests finished$(NC)"

# Database seeding
seed:
	@echo "$(BLUE)Seeding database with test data...$(NC)"
	cd backend && $(GO) run cmd/seed/main.go
	@echo "$(GREEN)✓ Database seeded successfully!$(NC)"
	@echo "$(YELLOW)📧 Test users password: password123$(NC)"

db-migrate:
	@echo "$(BLUE)Applying SQL migrations inside Docker app container...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) up -d postgres redis
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) run --rm --no-deps app sh -c "cd /app/backend && go run ./cmd/migrate/main.go up"
	@echo "$(GREEN)✓ SQL migrations applied$(NC)"

# Alias for db-migrate
db-migrate-up: db-migrate

db-migrate-auto:
	@echo "$(BLUE)Running explicit automigrations inside Docker app container...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) up -d postgres redis
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) run --rm --no-deps app sh -c "cd /app/backend && DB_SCHEMA_MODE=auto go run ./cmd/migrate/main.go auto"
	@echo "$(GREEN)✓ Automigrations completed$(NC)"

db-schema-status:
	@echo "$(BLUE)Schema status (inside Docker app container)...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) up -d postgres redis
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) run --rm --no-deps app sh -c "cd /app/backend && go run ./cmd/migrate/main.go status"

db-reset-dev:
	@echo "$(BLUE)Resetting dev stack volumes and migration state...$(NC)"
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) down -v --remove-orphans
	$(DOCKER_COMPOSE) $(COMPOSE_FILES) up -d postgres redis
	$(MAKE) db-migrate
	@echo "$(GREEN)✓ Dev DB reset complete$(NC)"

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
	cd backend && $(GO) get -u ./...
	cd backend && $(GO) mod tidy
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
	@if command -v govulncheck >/dev/null 2>&1; then \
		cd backend && govulncheck ./...; \
	else \
		$(MAKE) deps-vuln-docker; \
	fi
	@echo "$(GREEN)✓ Vulnerability scan complete$(NC)"

deps-vuln-docker:
	@echo "$(BLUE)Scanning vulnerabilities via Docker...$(NC)"
	docker run --rm -v $(shell pwd)/backend:/app -w /app golang:1.26 sh -c "go install golang.org/x/vuln/cmd/govulncheck@latest && govulncheck ./..."
	@echo "$(GREEN)✓ Docker vulnerability scan complete$(NC)"

deps-audit: deps-check deps-vuln
	@echo "$(GREEN)✓ Full dependency audit complete$(NC)"

deps-freshness:
	@echo "$(BLUE)Checking frontend outdated dependencies...$(NC)"
	cd frontend && $(BUN) outdated
	@echo "$(BLUE)Checking backend outdated dependencies...$(NC)"
	cd backend && $(GO) list -u -m -f '{{if .Update}}{{.Path}} {{.Version}} -> {{.Update.Version}}{{end}}' all
	@echo "$(GREEN)✓ Freshness check complete$(NC)"
# Perf targets (added by perf agent)
.PHONY: perf-preview perf-harness perf-ws perf-multi-ws build-chattest perf-e2e perf-e2e-local

perf-preview:
	@echo "Building frontend and starting preview on http://localhost:4173 (background). Logs -> /tmp/frontend-preview.log"
	@cd frontend && bun run build > /tmp/frontend-preview.log 2>&1
	@if [ -f /tmp/frontend-preview.pid ]; then \
		OLD_PID=$$(cat /tmp/frontend-preview.pid); \
		if ps -p $$OLD_PID >/dev/null 2>&1; then \
			echo "Stopping existing preview process $$OLD_PID"; \
			kill $$OLD_PID; \
			wait $$OLD_PID 2>/dev/null || true; \
		fi; \
	fi
	@PIDS_ON_PORT=$$(lsof -ti tcp:4173 2>/dev/null || true); \
	if [ -n "$$PIDS_ON_PORT" ]; then \
		echo "Stopping process(es) on port 4173: $$PIDS_ON_PORT"; \
		kill $$PIDS_ON_PORT; \
		sleep 1; \
		REMAINING=$$(lsof -ti tcp:4173 2>/dev/null || true); \
		if [ -n "$$REMAINING" ]; then \
			echo "Force stopping remaining process(es) on 4173: $$REMAINING"; \
			kill -9 $$REMAINING; \
			sleep 1; \
		fi; \
	fi
	@nohup sh -c 'cd frontend && exec bun run preview -- --host --strictPort --port 4173' > /tmp/frontend-preview.log 2>&1 & echo $$! > /tmp/frontend-preview.pid

perf-harness:
	@echo "Open http://localhost:4173/chat"

perf-ws: perf-multi-ws

perf-multi-ws: build-chattest
	@bash scripts/ws-multi-sim.sh

build-chattest:
	@if [ -d backend ]; then \
		echo "Building backend chattest binary..."; \
		cd backend && mkdir -p bin && go build -o bin/chattest ./cmd/chattest && echo "Built backend/bin/chattest"; \
	else \
		echo "backend/ directory not found — cannot build chattest. If you want to run the simulator, ensure you have the backend source or a prebuilt backend/bin/chattest binary."; \
		exit 0; \
	fi

perf-e2e:
	@set -a; [ -f .env ] && . ./.env; set +a; \
	PLAYWRIGHT_BASE_URL=$${PLAYWRIGHT_BASE_URL:-http://localhost:5173} \
	PLAYWRIGHT_API_URL=$${PLAYWRIGHT_API_URL:-http://localhost:8375/api} \
	PGHOST=$${PGHOST:-localhost} \
	PGPORT=$${PGPORT:-5432} \
	PERF_TEST_ONLY=true \
	cd frontend && bun run test:e2e -- --grep "@preprod"

perf-e2e-local:
	@set -a; [ -f .env ] && . ./.env; set +a; \
	PLAYWRIGHT_BASE_URL=$${PLAYWRIGHT_BASE_URL:-http://localhost:5173} \
	PLAYWRIGHT_API_URL=$${PLAYWRIGHT_API_URL:-http://localhost:8375/api} \
	PGHOST=$${PGHOST:-localhost} \
	PGPORT=$${PGPORT:-5432} \
	PERF_TEST_ONLY=true \
	cd frontend && bun run test:e2e -- --grep "@preprod"
