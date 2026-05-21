# UpNext Backend

Backend API for an IT recruitment platform, built with NestJS, PostgreSQL, Prisma and pnpm.

## Features

- NestJS modular architecture
- PostgreSQL data model with Prisma
- JWT authentication and role-based access control
- Core recruitment modules: users, companies, jobs and applications
- Swagger API docs at `/docs`
- Docker Compose for local PostgreSQL and API runtime
- CI with GitHub Actions: format, lint, typecheck and build
- Husky, lint-staged, ESLint and Prettier

## Requirements

- Node.js 24+
- pnpm 11+
- Docker Desktop

## Local Development

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm prisma:migrate --name init
pnpm prisma:seed
pnpm start:dev
```

API: `http://localhost:3000/api/v1`

Swagger: `http://localhost:3000/docs`

Demo accounts after seeding:

- `admin@upnext.dev` / `Password123!`
- `recruiter@upnext.dev` / `Password123!`
- `candidate@upnext.dev` / `Password123!`

## Useful Commands

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm prisma:studio
docker compose up --build
```

## Project Structure

```text
src/
  modules/
    applications/
    auth/
    companies/
    health/
    jobs/
    prisma/
    users/
  shared/
    config/
    decorators/
    dto/
    utils/
prisma/
  schema.prisma
  seed.ts
```
