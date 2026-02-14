# Sanctum Documentation

Welcome to the Sanctum documentation hub. This guide helps you find the right documentation quickly.

## Quick Links

- **Getting Started**: See `/README.md` and `/CONTRIBUTING.md` in the project root
- **AI Instructions**: See `/AGENTS.md` (canonical) and `/CLAUDE.md` (Claude overlay)
- **API Architecture**: [architecture/api-architecture.md](architecture/api-architecture.md)
- **Feature Checklist**: [features/implementation-checklist.md](features/implementation-checklist.md)
- **Production Readiness**: [operations/production-readiness.md](operations/production-readiness.md)
- **Docker Version Management**: [operations/docker-version-management.md](operations/docker-version-management.md)
- **Migration Guide**: [development/migrations.md](development/migrations.md)
- **Testing Guide**: [testing/sanctum-test-matrix.md](testing/sanctum-test-matrix.md)

## Documentation Structure

### `/architecture/` - System Design
High-level architecture and design documents:
- [api-architecture.md](architecture/api-architecture.md) - Backend API design and patterns
- [frontend-architecture.md](architecture/frontend-architecture.md) - Frontend structure and patterns
- [chat-dock.md](architecture/chat-dock.md) - Chat dock component design

### `/features/` - Feature Planning & Specs
Feature specifications, wishlists, and implementation planning:
- [implementation-checklist.md](features/implementation-checklist.md) - Feature implementation tracking
- [feature-wishlist.md](features/feature-wishlist.md) - Consolidated feature wishlist (production + experimental)
- [admin-role.md](features/admin-role.md) - Admin role implementation
- [feature-flags.md](features/feature-flags.md) - Feature flag system
- [onboarding-flow.md](features/onboarding-flow.md) - Signup Sanctum onboarding flow and backend contract
- [github-issue-templates.md](features/github-issue-templates.md) - Issue templates and agent prompts
- [review/](features/review/) - Features under review
- [production-review/](features/production-review/) - Production readiness reviews
- [upcoming/](features/upcoming/) - Upcoming feature specs

### `/development/` - Developer Workflow
Developer setup, tools, and best practices:
- [seeding.md](development/seeding.md) - Database seeding guide
- [migrations.md](development/migrations.md) - Database migration workflow and commands
- [git-best-practices.md](development/git-best-practices.md) - Git workflow and best practices
- [hooks/](development/hooks/) - Git hooks documentation
  - [hooks-quick-reference.md](development/hooks/hooks-quick-reference.md)
  - [hooks-usage-examples.md](development/hooks/hooks-usage-examples.md)

### `/operations/` - Production Operations
Production deployment, monitoring, and incident response:
- [production-readiness.md](operations/production-readiness.md) - Production readiness checklist and known issues
- [docker-version-management.md](operations/docker-version-management.md) - Centralized Docker/Compose version catalog workflow
- [stress-testing.md](operations/stress-testing.md) - Stress testing guide and scenarios
- [runbooks/](operations/runbooks/) - Operational runbooks
  - [ci-runbook.md](operations/runbooks/ci-runbook.md)
  - [rollback-runbook.md](operations/runbooks/rollback-runbook.md)

### `/guides/` - Technology Guides
Language and framework-specific guides:
- [go-instructions.md](guides/go-instructions.md) - Go development guidelines

### `/testing/` - Test Documentation
Test strategies, matrices, and guidelines:
- [sanctum-test-matrix.md](testing/sanctum-test-matrix.md) - Comprehensive test coverage matrix

### `/agents/` - AI Agent Instructions
AI-specific prompts and guidelines (see individual files for agent-specific instructions)

### `/reports/` - Timestamped Reports
Historical implementation reports following `YYYY-MM-DD-HHMM-<slug>.md` naming convention

## Navigation by Task

### "I want to..."

#### Build a new feature
1. Check [features/implementation-checklist.md](features/implementation-checklist.md)
2. Review [architecture/api-architecture.md](architecture/api-architecture.md) for backend patterns
3. Review [architecture/frontend-architecture.md](architecture/frontend-architecture.md) for frontend patterns
4. Add to [features/feature-wishlist.md](features/feature-wishlist.md) if not yet planned

#### Understand the system architecture
1. Start with [architecture/api-architecture.md](architecture/api-architecture.md)
2. Review [architecture/frontend-architecture.md](architecture/frontend-architecture.md)
3. Check feature-specific docs in [features/](features/)

#### Set up my development environment
1. Follow setup in `/README.md` (project root)
2. Review [development/seeding.md](development/seeding.md) for database setup
3. Set up git hooks: [development/hooks/](development/hooks/)
4. Read [development/git-best-practices.md](development/git-best-practices.md)

#### Prepare for production
1. Review [operations/production-readiness.md](operations/production-readiness.md)
2. Run stress tests: [operations/stress-testing.md](operations/stress-testing.md)
3. Familiarize with [operations/runbooks/](operations/runbooks/)

#### Contribute to the project
1. Read `/CONTRIBUTING.md` (project root)
2. Follow [development/git-best-practices.md](development/git-best-practices.md)
3. Use [development/hooks/](development/hooks/) for automated checks

#### Work with AI agents
1. Read `/AGENTS.md` and `/CLAUDE.md` (project root)
2. Check [agents/](agents/) for agent-specific instructions

#### Run tests
1. See [testing/sanctum-test-matrix.md](testing/sanctum-test-matrix.md)
2. Backend: `make test-backend`
3. Frontend: `make test-frontend`

## Documentation Standards

- **Naming**: Use kebab-case for all files and directories (e.g., `production-readiness.md`)
- **Reports**: Create timestamped reports in `/reports/` using `REPORT_TEMPLATE.md`
- **Updates**: When restructuring docs, update this navigation hub

## Contributing to Documentation

When adding new documentation:
1. Place it in the appropriate category directory
2. Use kebab-case naming
3. Add a link to this README
4. Update any affected navigation sections
5. Create a report in `/reports/` for substantial changes
