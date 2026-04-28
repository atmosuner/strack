# API (`apps/api`)

Node.js + Fastify + Prisma + PostgreSQL.

## Environment

| Variable        | Required | Description |
|----------------|----------|-------------|
| `DATABASE_URL` | For DB features & integration tests | PostgreSQL connection string (see repo root [`.env.example`](../../.env.example)). |
| `JWT_SECRET`   | No       | HS256 secret for auth tokens (min 16 chars). Default in dev; **set explicitly in production.** |
| `PORT`         | No       | Default `3333`. |
| `HOST`         | No       | Default `0.0.0.0`. |

## Local database

From the **repository root**:

```bash
docker compose up -d
```

Copy [`.env.example`](../../.env.example) to **`.env` in the repo root** (`D:\Dev\idea\.env` — same folder as `pnpm-workspace.yaml`). You can optionally add **`apps/api/.env`** for overrides. `DATABASE_URL` must be set for migrations and the API.

`db:migrate` / `db:migrate:dev` / `db:push` load root `.env` automatically (see [`scripts/prisma-with-root-env.mjs`](../scripts/prisma-with-root-env.mjs)); the dev server loads the same paths via [`src/bootstrap-env.ts`](src/bootstrap-env.ts).

Apply migrations:

```bash
pnpm --filter api db:migrate
```

Generate Prisma Client (also runs on `pnpm install` via `postinstall` when engines download successfully):

```bash
pnpm --filter api db:generate
```

## Scripts

| Script            | Description |
|-------------------|-------------|
| `pnpm dev`        | Dev server with `tsx watch`. |
| `pnpm build`      | Compile to `dist/`. |
| `pnpm test`       | Vitest: unit tests always; **DB integration tests run only when `DATABASE_URL` is set.** |
| `pnpm db:migrate` | `prisma migrate deploy` (CI / prod). |
| `pnpm db:migrate:dev` | `prisma migrate dev` (local schema changes). |

## Auth (Task 3)

| Endpoint | Description |
|----------|-------------|
| `POST /auth/register` | Body: `{ "email", "password" (≥8), "householdName" }` — creates user (hashed password), household, OWNER membership; returns `{ token, userId, householdId }`. |
| `POST /auth/login` | Body: `{ "email", "password" }` — returns `{ token, userId }`. |
| `GET /me` | Header: `Authorization: Bearer <token>` — returns `{ user: { id, email }, householdId }` (owner household). |

Duplicate email on register returns **409**.

## Household children & providers (Task 4)

All routes require `Authorization: Bearer <token>` and membership in `householdId` (otherwise **403**).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/households/:householdId/children` | List children. Query: `includeArchived=true` to include archived. Default omits archived. |
| `POST` | `/households/:householdId/children` | Body `{ "name", "notes"? }` — **201** `{ child }`. |
| `GET` | `/households/:householdId/children/:childId` | **200** `{ child }` or **404**. |
| `PATCH` | `/households/:householdId/children/:childId` | Partial update: `name`, `notes`, `archived`. |
| `GET` | `/households/:householdId/providers` | Same query semantics as children. |
| `POST` | `/households/:householdId/providers` | Body `{ "name", "notes"? }` — **201** `{ provider }`. |
| `GET` | `/households/:householdId/providers/:providerId` | **200** `{ provider }` or **404**. |
| `PATCH` | `/households/:householdId/providers/:providerId` | Partial update. |

## Integration tests

[`src/household.integration.test.ts`](src/household.integration.test.ts) creates a `User`, `Household`, and `HouseholdMember` (OWNER) via `createHouseholdWithOwner`.

[`src/auth.integration.test.ts`](src/auth.integration.test.ts) covers register, login, `/me`, and duplicate email (requires `DATABASE_URL` + `JWT_SECRET`).

[`src/auth.me.guard.test.ts`](src/auth.me.guard.test.ts) asserts `GET /me` returns **401** without a token (no database needed).

[`src/children-providers.integration.test.ts`](src/children-providers.integration.test.ts) covers child/provider CRUD, archived list filtering, and **403** for non-members (requires `DATABASE_URL`).

- **With Postgres:** start Docker (`docker compose up -d`), set `DATABASE_URL`, then:

  ```bash
  pnpm --filter api test
  ```

- **Without `DATABASE_URL`:** the suite is skipped so CI/agents without Docker still get a green run; **use a real DB in your pipeline** before release.

## Task 2 model overview

- **User** — `email` (unique), optional `passwordHash` (Task 3).
- **Household** — `name`.
- **HouseholdMember** — links `userId` + `householdId`, `role` (`OWNER` | `MEMBER`).

Bootstrap helper: [`src/services/householdBootstrap.ts`](src/services/householdBootstrap.ts).
