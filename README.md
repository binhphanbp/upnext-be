# UpNext Backend

Backend API for an IT recruitment platform, built with NestJS, PostgreSQL, Prisma, Scalar and pnpm.

## Status

This repository is being rebuilt around a smaller baseline architecture. The current codebase keeps the application shell, environment validation, Prisma schema, shared decorators, common DTOs and utilities. Feature modules should be added under `src/modules` as they are rebuilt.

## Requirements

- Node.js 22+
- pnpm 10.11.0 via Corepack
- Docker, for building the production image locally

## Local Development

This repo does not own production infrastructure. PostgreSQL, reverse proxy, SSL, monitoring, backups and deploy scripts belong in `upnext-infra`.

```bash
corepack enable
corepack pnpm install
cp .env.example .env
corepack pnpm prisma:generate
corepack pnpm start:dev
```

Point `DATABASE_URL` at a local or shared development PostgreSQL instance before running migrations or starting the app.

API: `http://localhost:4000/api/v1`

API docs: `http://localhost:4000/docs`

Health: `http://localhost:4000/health`

## Production Docker Image

The Dockerfile builds the NestJS app, runs `prisma generate`, and starts `node dist/src/main.js` as a non-root user. It does not copy `.env` and does not run migrations at container startup.

```bash
docker build -t upnext-be:local .
docker run --rm -p 4000:4000 \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e DATABASE_URL='postgresql://upnext:<password>@host.docker.internal:5432/upnext?schema=public' \
  -e JWT_ACCESS_SECRET='<strong-access-token-secret>' \
  -e JWT_ACCESS_EXPIRES_IN='15m' \
  -e APP_FRONTEND_URL='https://upnext.works' \
  -e SMTP_HOST='<smtp-host>' \
  -e SMTP_PORT='587' \
  -e SMTP_SECURE='false' \
  -e SMTP_USER='<smtp-user>' \
  -e SMTP_PASS='<smtp-password>' \
  -e MAIL_FROM='UpNext <contact@upnext.works>' \
  -e CLOUDINARY_CLOUD_NAME='<cloudinary-cloud-name>' \
  -e CLOUDINARY_API_KEY='<cloudinary-api-key>' \
  -e CLOUDINARY_API_SECRET='<cloudinary-api-secret>' \
  -e CLOUDINARY_FOLDER='upnext' \
  -e CORS_ORIGIN='https://upnext.works,https://staging.upnext.works' \
  upnext-be:local
```

API in Docker: `http://localhost:4000/api/v1`

API docs in Docker: `http://localhost:4000/docs`

Health in Docker: `http://localhost:4000/health`

Production migrations must be run by the deploy flow in `upnext-infra`:

```bash
corepack pnpm prisma:migrate:deploy
```

## Useful Commands

```bash
corepack pnpm lint
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm prisma:generate
corepack pnpm prisma:migrate:deploy
corepack pnpm prisma:studio
```

## Project Structure

```text
src/
  common/
    config/
    decorators/
    dto/
    utils/
  modules/
    # Feature modules go here as they are rebuilt.
prisma/
  schema.prisma
  seed.ts
```

## Team Baseline

Before opening a pull request, run:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```
