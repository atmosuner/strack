# Family Private Class Tracker

Monorepo: **Expo** (`apps/mobile`) + **Vite + shadcn** web (`apps/web`) + **Node/Fastify** API (`apps/api`) + shared types (`packages/shared`).

See [docs/specs/spec-family-private-class-tracker.md](docs/specs/spec-family-private-class-tracker.md) and [docs/specs/implementation-plan-family-private-class-tracker.md](docs/specs/implementation-plan-family-private-class-tracker.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- For mobile: [Expo CLI](https://docs.expo.dev/get-started/installation/) via `npx expo`

## Setup

```bash
pnpm install
```

**Database (Task 2+):** start Postgres and set `DATABASE_URL` (see `[.env.example](.env.example)` and [apps/api/README.md](apps/api/README.md)).

```bash
docker compose up -d
pnpm --filter api db:migrate
```

## Commands


| Script            | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| `pnpm dev:api`    | API dev server (default [http://localhost:3333](http://localhost:3333)) |
| `pnpm dev:mobile` | Expo dev server                                                         |
| `pnpm dev:web`    | Vite + shadcn (default [http://localhost:5173](http://localhost:5173))  |
| `pnpm lint`       | ESLint (API + web + shared; mobile ignored until RN rules added)        |
| `pnpm typecheck`  | Typecheck api, mobile, web, shared                                      |
| `pnpm test`       | Run all workspace tests                                                 |
| `pnpm build`      | Build api, web, shared                                                  |


### Health check

```bash
pnpm dev:api
# other terminal:
curl -s http://localhost:3333/health
```

Expected: `{"ok":true,"service":"family-private-class-tracker-api"}`

## Environment

- API: optional `PORT` (default `3333`), `HOST` (default `0.0.0.0`), `**JWT_SECRET**` for auth (see [apps/api/README.md](apps/api/README.md)).
- Mobile: optional `**EXPO_PUBLIC_API_URL**` — base URL of the API (default `http://localhost:3333`). On **Android emulator**, use `http://10.0.2.2:3333` so the device can reach the host machine.

