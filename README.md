# UpNext Backend

Backend API for an IT recruitment platform, built with NestJS, PostgreSQL, Prisma and pnpm.

## Status

This repository is being rebuilt around a smaller baseline architecture. The current codebase keeps the application shell, environment validation, Prisma schema, shared decorators, common DTOs and utilities. Feature modules should be added under `src/modules` as they are rebuilt.

## Requirements

- Node.js 22+
- pnpm 10.11.0 via Corepack
- Docker Desktop

## Local Development

```bash
corepack enable
corepack pnpm install
cp .env.example .env
docker compose up -d postgres
corepack pnpm prisma:generate
corepack pnpm prisma:migrate --name init
corepack pnpm start:dev
```

API: `http://localhost:3000/api/v1`

API docs: `http://localhost:3000/docs`

## Docker

```bash
docker compose up --build
```

API in Docker: `http://localhost:3636/api/v1`

API docs in Docker: `http://localhost:3636/docs`

## Useful Commands

```bash
corepack pnpm lint
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
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
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```
