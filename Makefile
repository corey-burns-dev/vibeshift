.PHONY: help dev prod build up down logs clean lint fmt

help:
	@echo "Vibeshift - Development & Production Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development environment with hot reloading"
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
