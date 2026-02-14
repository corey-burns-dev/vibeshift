# Rollback Runbook

This runbook describes the procedure for rolling back a failed deployment of the Sanctum platform.

## 1. Identify the Failure
Determine the scope of the failure:
- Is it a code-only failure (API crashing, UI bugs)?
- Is it a database-related failure (failed migrations, data corruption)?
- Is it a configuration failure (wrong env vars, Redis unreachable)?

## 2. Immediate Mitigation: Code Rollback
If the failure is due to new code, revert to the previously known stable Docker image.

### Kubernetes / Helm
```bash
helm rollback sanctum-prod
```

### Docker Compose
1. Update `compose.prod.yml` or `infra/versions.env` to the previous version tag.
2. Redeploy:
```bash
./scripts/compose.sh up -d --force-recreate
```

## 3. Database Rollback
If a migration failed or caused issues, it must be rolled back.

### Automatic Migration Revert
The backend supports DOWN migrations. Use the migration tool to revert the specific version.

```bash
cd backend
go run cmd/migrate/main.go down
```
*Note: Run this once for each migration version you need to revert.*

### Manual Data Recovery
If data was corrupted beyond what migrations can fix, restore from the last successful snapshot (RDS/LVM/Backup).

## 4. Verification
After rollback, verify system health:
1. Check health endpoints: `GET /health/ready`
2. Check logs for errors: `docker logs sanctum-backend`
3. Verify core functionality: Login, Chat, Post creation.

## 5. Post-Mortem
Document the incident in `docs/logs/incidents/` once the system is stable.
