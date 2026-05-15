# Security Notes

## Secrets

Production secrets must be stored only in platform secret stores:

- GitHub Actions: repository secrets
- Fly.io: app secrets
- Vercel: environment variables
- Neon and Upstash: managed credentials

Do not commit real database URLs, API tokens, Redis passwords, Fly tokens, Vercel tokens, or `.env` files.

## If a Secret Is Suspected to Be Exposed

1. Rotate the credential in the source platform first.
2. Update every dependent runtime secret.
3. Redeploy the affected services.
4. Check recent access logs for unexpected access.
5. If the value was committed, treat it as compromised even after removal.

For this project, rotate these together if the production database credential is suspected:

- Neon database password
- Fly API secret `SPRING_DATASOURCE_PASSWORD`
- Fly worker secret `DB_PASSWORD`
- GitHub Actions secret `NEON_DATABASE_URL`

## Local Development

The local Docker Compose files use non-production placeholder credentials. They are not valid for production and must not be reused in hosted services.
