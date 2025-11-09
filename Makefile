.PHONY: help dev dev:backend dev:frontend prod build build:backend build:frontend up down logs logs:backend logs:frontend logs:all clean lint fmt install env restart

# Variables
DOCKER_COMPOSE := docker-compose
GO := go
PNPM := pnpm
GO_PORT ?= 8080
FRONTEND_PORT ?= 5173

# Color output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help:
	@echo "$(BLUE)╔════════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║           Vibeshift - Full Stack Development CLI               ║$(NC)"
	@echo "$(BLUE)╚════════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(GREEN)Development:$(NC)"
	@echo "  make dev                - 🚀 Start full stack (backend + frontend + databases)"
	@echo "  make dev:backend        - 🔧 Backend only (Go + Redis + Postgres)"
	@echo "  make dev:frontend       - 🎨 Frontend only (Vite dev server, local)"
	@echo ""
	@echo "$(GREEN)Build & Compose:$(NC)"
	@echo "  make build              - 🔨 Build all Docker images (prod)"
	@echo "  make build:backend      - 🔨 Build backend image"
	@echo "  make build:frontend     - 🔨 Build frontend image"
	@echo "  make up                 - ⬆️  Start services in background"
	@echo "  make down               - ⬇️  Stop all services"
	@echo ""
	@echo "$(GREEN)Logs & Monitoring:$(NC)"
	@echo "  make logs               - 📋 Stream backend logs"
	@echo "  make logs:backend       - 📋 Backend logs only"
	@echo "  make logs:frontend      - 📋 Frontend logs only"
	@echo "  make logs:all           - 📋 All service logs"
	@echo ""
	@echo "$(GREEN)Code Quality:$(NC)"
	@echo "  make fmt                - 🎨 Format Go code"
	@echo "  make lint               - 🔍 Lint Go code"
	@echo "  make install            - 📦 Install frontend dependencies"
	@echo ""
	@echo "$(GREEN)Utilities:$(NC)"
	@echo "  make env                - ⚙️  Initialize .env file"
	@echo "  make restart            - 🔄 Restart all services"
	@echo "  make clean              - 🧹 Clean containers, volumes, and artifacts"
	@echo ""

# Development targets
dev: env
	@echo "$(BLUE)Starting full stack development environment...$(NC)"
	$(DOCKER_COMPOSE) up --build

dev:backend: env
	@echo "$(BLUE)Starting backend services (Go, Redis, Postgres)...$(NC)"
	$(DOCKER_COMPOSE) up --build app redis postgres

dev:frontend: install
	@echo "$(BLUE)Starting frontend dev server...$(NC)"
	cd frontend && $(PNPM) dev

# Build targets
build: build:backend build:frontend
	@echo "$(GREEN)✓ All images built successfully$(NC)"

build:backend:
	@echo "$(BLUE)Building backend image...$(NC)"
	$(DOCKER_COMPOSE) build app

build:frontend:
	@echo "$(BLUE)Building frontend image...$(NC)"
	$(DOCKER_COMPOSE) build frontend

# Container management
up:
	@echo "$(BLUE)Starting services in background...$(NC)"
	$(DOCKER_COMPOSE) up -d

down:
	@echo "$(BLUE)Stopping all services...$(NC)"
	$(DOCKER_COMPOSE) down

# Logging
logs:
	$(DOCKER_COMPOSE) logs -f app

logs:backend:
	$(DOCKER_COMPOSE) logs -f app

logs:frontend:
	$(DOCKER_COMPOSE) logs -f frontend

logs:all:
	$(DOCKER_COMPOSE) logs -f

# Code quality
fmt:
	@echo "$(BLUE)Formatting Go code...$(NC)"
	$(GO) fmt ./...
	@echo "$(GREEN)✓ Code formatted$(NC)"

lint:
	@echo "$(BLUE)Linting Go code...$(NC)"
	$(GO) vet ./...
	@echo "$(GREEN)✓ Linting passed$(NC)"

# Frontend dependencies
install:
	@echo "$(BLUE)Installing frontend dependencies...$(NC)"
	cd frontend && $(PNPM) install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

# Environment setup
env:
	@if [ ! -f .env ]; then \
		echo "$(BLUE)Creating .env from .env.example...$(NC)"; \
		cp .env.example .env; \
		echo "$(YELLOW)⚠️  Update .env with your settings$(NC)"; \
	fi

# Utility targets
restart: down dev

clean:
	@echo "$(BLUE)Cleaning up containers, volumes, and artifacts...$(NC)"
	$(DOCKER_COMPOSE) down -v
	rm -rf tmp/ frontend/node_modules frontend/dist
	$(GO) clean
	@echo "$(GREEN)✓ Cleanup complete$(NC)"
