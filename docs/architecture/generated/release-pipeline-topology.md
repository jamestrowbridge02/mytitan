# Release Pipeline And Deployment Topology

- Stable suite: scripts/validate-e2e-stable.sh
- Health: scripts/healthcheck.sh
- Readiness: scripts/production-readiness-check.sh
- Release evidence package: scripts/create-release-evidence-package.sh
- Deployment topology: Docker Compose services app, api, marketing, postgres, redis, and supporting local release services as declared in docker-compose.yml.
- Data retention/archive approach: tenant-scoped archive and retention controls are documented in existing architecture and launch-operation evidence.
