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

**Last Updated:** 2026-02-14  
**Critical Items:** All items marked 🔒 Security are MANDATORY before production deployment.
