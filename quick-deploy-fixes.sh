#!/bin/bash
set -euo pipefail

# Sanctum - Quick Security & Deployment Fixes
# This script addresses the most critical issues found in the deployment readiness audit

BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Sanctum - Quick Deployment Fixes                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the sanctum root directory
if [ ! -f "compose.yml" ] || [ ! -d "backend" ]; then
    echo -e "${RED}❌ Error: Please run this script from the sanctum root directory${NC}"
    exit 1
fi

echo -e "${YELLOW}⚠️  This script will make changes to your repository.${NC}"
echo -e "${YELLOW}   Make sure you've committed all work before proceeding.${NC}"
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}1️⃣  Removing .env from version control${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ -f .env ]; then
    # Check if .env is tracked by git
    if git ls-files --error-unmatch .env >/dev/null 2>&1; then
        echo "🔧 Removing .env from git tracking..."
        git rm --cached .env
        echo -e "${GREEN}✓ .env removed from version control (but kept locally)${NC}"
    else
        echo -e "${GREEN}✓ .env is already untracked${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No .env file found${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}2️⃣  Creating .env.example with safe defaults${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cat > .env.example << 'EOF'
# Sanctum Environment Variables Template
# Copy this file to .env and update with your actual values

# Database Configuration
POSTGRES_USER=your_db_user
POSTGRES_DB=sanctum
POSTGRES_PASSWORD=CHANGE_ME_TO_STRONG_PASSWORD_MIN_32_CHARS

# Application Port
GO_PORT=8375

# Redis Configuration
REDIS_URL=redis:6379

# JWT Secret (MUST be at least 32 characters in production)
JWT_SECRET=CHANGE_ME_TO_RANDOM_STRING_MIN_32_CHARS

# CORS Origins (comma-separated, NO WILDCARDS in production)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Environment
APP_ENV=development
EOF

echo -e "${GREEN}✓ Created .env.example with safe placeholder values${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}3️⃣  Creating .dockerignore files${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Root .dockerignore
cat > .dockerignore << 'EOF'
# Version Control
.git
.gitignore
.gitattributes

# Environment & Config
.env
.env.local
.env.*.local
config.yml
!config.example.yml

# Dependencies
node_modules
frontend/node_modules

# Build Artifacts
frontend/dist
frontend/build
backend/tmp
tmp/

# Documentation
*.md
!README.md
docs/

# IDE
.vscode
.idea
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Testing
coverage/
*.test
test-results/
EOF

echo -e "${GREEN}✓ Created root .dockerignore${NC}"

# Frontend .dockerignore
cat > frontend/.dockerignore << 'EOF'
# Dependencies
node_modules
bun.lockb

# Build artifacts
dist
build
.cache

# Testing
coverage
*.test

# IDE
.vscode
.idea

# Misc
*.log
.DS_Store
EOF

echo -e "${GREEN}✓ Created frontend/.dockerignore${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}4️⃣  Updating production Dockerfiles with security fixes${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Backup existing Dockerfile
cp Dockerfile Dockerfile.backup
echo "📦 Backed up existing Dockerfile to Dockerfile.backup"

# Updated production Dockerfile for backend
cat > Dockerfile << 'EOF'
# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy source code
COPY backend/ .

# Build with optimizations
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s" \
    -a -installsuffix cgo \
    -o main .

# Production stage
FROM alpine:3.21

# Add ca-certificates for HTTPS and create non-root user
RUN apk --no-cache add ca-certificates curl && \
    addgroup -g 1000 appgroup && \
    adduser -D -u 1000 -G appgroup appuser

# Set working directory
WORKDIR /home/appuser

# Copy binary from builder with correct ownership
COPY --from=builder --chown=appuser:appgroup /build/main .

# Switch to non-root user
USER appuser

# Expose port
ENV PORT=8375
EXPOSE 8375

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8375/health || exit 1

# Run the application
CMD ["./main"]
EOF

echo -e "${GREEN}✓ Updated backend Dockerfile with:${NC}"
echo "  • Non-root user (appuser:appgroup)"
echo "  • Optimized build flags (-ldflags=\"-w -s\")"
echo "  • Health check"
echo "  • Minimal attack surface"

# Backup and update frontend Dockerfile
cp frontend/Dockerfile frontend/Dockerfile.backup
echo "📦 Backed up existing frontend/Dockerfile to frontend/Dockerfile.backup"

cat > frontend/Dockerfile << 'EOF'
# Build stage
FROM node:24.11.0-alpine3.21 AS build

WORKDIR /app

# Install Bun
RUN apk add --no-cache curl bash && \
    curl -fsSL https://bun.sh/install | bash && \
    mv ~/.bun/bin/bun /usr/local/bin/

# Copy dependency files
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy source files
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY index.html ./

# Build application
RUN bun --bun run build

# Production stage
FROM nginx:1.29.3-alpine AS runtime

# Create non-root user for nginx
RUN addgroup -g 1000 nginx-app && \
    adduser -D -u 1000 -G nginx-app nginx-app

# Copy built files
COPY --from=build --chown=nginx-app:nginx-app /app/dist /usr/share/nginx/html
COPY --chown=nginx-app:nginx-app nginx.conf /etc/nginx/conf.d/default.conf

# Use non-root user
USER nginx-app

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
EOF

echo -e "${GREEN}✓ Updated frontend Dockerfile with:${NC}"
echo "  • Non-root user (nginx-app)"
echo "  • Frozen lockfile for reproducible builds"
echo "  • Health check"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}5️⃣  Creating production environment checklist${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cat > PRODUCTION_CHECKLIST.md << 'EOF'
# 🚀 Production Deployment Checklist

## 🔒 Security (CRITICAL - Do NOT skip)

- [ ] Generate a strong `POSTGRES_PASSWORD` (minimum 32 characters, random)
  ```bash
  openssl rand -base64 32
  ```

- [ ] Generate a strong `JWT_SECRET` (minimum 32 characters, random)
  ```bash
  openssl rand -base64 32
  ```

- [ ] Update `ALLOWED_ORIGINS` in `.env` with actual production domain(s)
  - ❌ NEVER use `*` in production
  - ✅ Use specific domains: `https://yourdomain.com,https://www.yourdomain.com`

- [ ] Ensure `.env` is NOT committed to git
  ```bash
  git ls-files | grep .env  # Should return nothing
  ```

- [ ] Set up secrets management (AWS Secrets Manager, HashiCorp Vault, etc.)

- [ ] Enable HTTPS/TLS for all endpoints

- [ ] Configure firewall rules to restrict database access

- [ ] Set up SSL certificates (Let's Encrypt recommended)

## 🗄️ Database

- [ ] Use managed PostgreSQL service (RDS, Cloud SQL, etc.) instead of Docker container

- [ ] Set up automated backups (daily minimum)

- [ ] Test database restore procedure

- [ ] Configure connection pooling (max 25 connections recommended)

- [ ] Set up database monitoring and alerts

- [ ] Create read-only replica for reporting (if needed)

## 📊 Monitoring & Logging

- [ ] Set up application monitoring (Prometheus, Datadog, etc.)

- [ ] Configure log aggregation (ELK Stack, Loki, CloudWatch, etc.)

- [ ] Set up error tracking (Sentry, Rollbar, etc.)

- [ ] Create health check dashboards

- [ ] Configure alerts for:
  - High error rates
  - Database connection failures
  - High memory/CPU usage
  - Slow response times

## 🚀 Deployment

- [ ] Set `APP_ENV=production` in environment variables

- [ ] Build Docker images with production tags
  ```bash
  docker build -t sanctum-backend:v1.0.0 .
  docker build -t sanctum-frontend:v1.0.0 ./frontend
  ```

- [ ] Push images to container registry

- [ ] Set up CI/CD pipeline (GitHub Actions, GitLab CI, etc.)

- [ ] Configure auto-scaling (if using Kubernetes/ECS)

- [ ] Set up CDN for static assets (CloudFront, Cloudflare, etc.)

## 🔄 Post-Deployment

- [ ] Run smoke tests on production

- [ ] Monitor logs for errors in first 24 hours

- [ ] Test all critical user flows

- [ ] Verify database backups are working

- [ ] Document rollback procedure

## 🛡️ Ongoing Maintenance

- [ ] Schedule regular security audits

- [ ] Keep dependencies updated
  ```bash
  make deps-update
  make deps-vuln
  ```

- [ ] Review logs weekly for anomalies

- [ ] Test disaster recovery quarterly

---

**Last Updated:** 2026-01-31  
**Critical Items:** All items marked 🔒 Security are MANDATORY before production deployment.
EOF

echo -e "${GREEN}✓ Created PRODUCTION_CHECKLIST.md${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}6️⃣  Summary & Next Steps${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${GREEN}✅ Quick fixes applied successfully!${NC}"
echo ""
echo -e "${YELLOW}Files created/modified:${NC}"
echo "  • .env.example (safe template)"
echo "  • .dockerignore (root)"
echo "  • frontend/.dockerignore"
echo "  • Dockerfile (production-hardened)"
echo "  • frontend/Dockerfile (production-hardened)"
echo "  • PRODUCTION_CHECKLIST.md"
echo ""
echo -e "${YELLOW}Backup files created:${NC}"
echo "  • Dockerfile.backup"
echo "  • frontend/Dockerfile.backup"
echo ""
echo -e "${RED}⚠️  CRITICAL NEXT STEPS:${NC}"
echo ""
echo "1. ${YELLOW}Generate production secrets:${NC}"
echo "   ${BLUE}openssl rand -base64 32${NC}  # Run this twice for DB password and JWT secret"
echo ""
echo "2. ${YELLOW}Update your .env file:${NC}"
echo "   • Replace CHANGE_ME placeholders with actual secrets"
echo "   • Set ALLOWED_ORIGINS to your production domain"
echo ""
echo "3. ${YELLOW}Commit these changes:${NC}"
echo "   ${BLUE}git add .env.example .dockerignore frontend/.dockerignore Dockerfile frontend/Dockerfile PRODUCTION_CHECKLIST.md${NC}"
echo "   ${BLUE}git commit -m 'security: add production hardening and remove .env from version control'${NC}"
echo ""
echo "4. ${YELLOW}Review remaining issues:${NC}"
echo "   • See docs/reports/2026-01-31-deployment-readiness.md for full details"
echo "   • Fix error handling violations (search for '_ =' in backend code)"
echo "   • Set up proper database migrations"
echo ""
echo "5. ${YELLOW}Before deploying to production:${NC}"
echo "   • Complete all items in PRODUCTION_CHECKLIST.md"
echo "   • Run 'make deps-vuln' to check for security vulnerabilities"
echo "   • Test thoroughly in a staging environment"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Good luck with your deployment! 🚀${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
