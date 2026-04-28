# Spec: Family Private Class Tracker (MVP)

## Assumptions I'm Making

Correct these **before implementation**; the rest of this document follows from them.

1. **Greenfield:** There is no existing production codebase in this repo yet; this spec defines the first vertical slice.
2. **Clients:** **Expo (React Native) + TypeScript** for iOS/Android (household-first, mobile-first).
3. **API:** **Node.js + TypeScript** HTTP API (REST), deployed as one service to start.
4. **Database:** **PostgreSQL** with a schema managed by **Prisma** (or Drizzle—pick one before coding).
5. **Auth:** **Email + password** or **magic link** for MVP; tokens stored per platform best practice (secure storage on mobile). OAuth (Google/Apple) can be Phase 1.5.
6. **Region / locale:** **US**, **English** UI first; times stored in **UTC**, displayed in device timezone.
7. **Calendar export:** **ICS** generated **server-side** with an unguessable token per household; HTTPS only.
8. **Payments for “real money signal”:** Integrated via **Stripe** (or similar) behind a feature flag; exact flow (IAP vs web) follows product/legal choice in Open Questions.
9. **No two-way Google Calendar sync in MVP** (per [idea one-pager](../ideas/family-private-class-tracker.md)); ICS subscribe/export only.

---

## Objective

### What we're building

A **household** application where parents (and invited caregivers) manage **private lessons**—tennis, tutoring, fitness, etc.—as **first-class calendar events** tied to **children**, **providers**, optional **notes**, **recurrence**, and **light payment/package state**. Users can **subscribe** to an **ICS feed** so lessons appear in Apple/Google Calendar.

### Why

US households with **2+ private lessons/week** lose time and money to fragmented tools (generic calendars + chat + memory). Success for the initiative includes **habit** and **early paid signal** (beta, deposit, or subscription).

### Users

- **Primary:** Parent or guardian who coordinates schedules (“owner”).
- **Secondary:** Second caregiver invited to the same **household** with role-based visibility (especially for money fields).

### Success criteria (MVP done when)


| Criterion         | Testable condition                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Core loop**     | User can create household, add child + provider, create/edit recurring lesson, see it in **week/agenda** and **today/this week**. |
| **Sharing**       | Second user can accept invite and see the same lessons per role rules.                                                            |
| **ICS**           | Subscribing the feed in a major calendar app shows **correct times** and updates after edits (within documented cache TTL).       |
| **Money (light)** | Owner can mark lesson or package state (paid/unpaid / credits per agreed minimal model); member sees fields only if role allows.  |
| **Quality**       | `pnpm lint` and `pnpm test` pass in CI; no P0 open bugs for flows above.                                                          |


---

## Tech Stack


| Layer      | Choice                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------- |
| Mobile app | Expo SDK (current stable), TypeScript, React Navigation                                       |
| API        | Node.js 20+, TypeScript, REST (e.g. Fastify or Hono)                                          |
| ORM / DB   | Prisma + PostgreSQL (Neon/Supabase/RDS—env-specific)                                          |
| Auth       | JWT in Authorization header from mobile, or session—**document chosen pattern in Plan phase** |
| Infra      | As simple as possible (single API deploy + managed Postgres)                                  |


---

## Commands

Replace with actual scripts after `package.json` exists; structure should remain:

```bash
# Install (monorepo root)
pnpm install

# API — local dev
pnpm --filter api dev

# API — database
pnpm --filter api db:migrate
pnpm --filter api db:generate

# Mobile — Expo
pnpm --filter mobile start

# Quality gates (root)
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

**Build / CI (target)**

```bash
pnpm build
pnpm test -- --coverage
```

---

## Project Structure (target monorepo)

```
apps/
  mobile/          → Expo app (screens, navigation, API client)
  api/             → HTTP server, routes, services, ICS generation
packages/
  shared/          → Shared TypeScript types, zod schemas (optional)
prisma/            → schema.prisma, migrations (if colocated at root)
docs/
  specs/           → This spec and future ADRs
  ideas/           → Product ideation
tests/
  e2e/             → Detox/Maestro or Playwright for web if added later
```

---

## Code Style

**Conventions**

- **TypeScript:** `strict` mode; no `any` without comment and ticket to remove.
- **Naming:** `PascalCase` components, `camelCase` functions/vars, `kebab-case` file names for routes.
- **API:** Plural REST resources `/households`, `/lessons`; JSON with consistent error shape `{ error: { code, message } }`.
- **Dates:** Store UTC; format with `Intl` or `date-fns-tz` on client.

**Example (API handler sketch)**

```typescript
// Good: validate input, map to service, return typed JSON
export async function createLesson(req: CreateLessonRequest): Promise<LessonDto> {
  const input = createLessonSchema.parse(req.body);
  return lessonService.create(input);
}
```

---

## Testing Strategy


| Level           | Scope                                                 | Tooling (target)                    |
| --------------- | ----------------------------------------------------- | ----------------------------------- |
| **Unit**        | Pure logic, recurrence rules, money state transitions | Vitest or Jest                      |
| **Integration** | API + test DB (docker or ephemeral)                   | Vitest + supertest                  |
| **Contract**    | Mobile API client vs OpenAPI/schema                   | Optional: zod shared schemas        |
| **E2E**         | Critical paths: signup → lesson → ICS URL smoke       | Maestro/Detox—add after core stable |


**Coverage:** Aim for **≥70%** on `packages/shared` and domain services; API routes covered by integration tests for happy + main error paths.

---

## Boundaries

### Always

- Run **lint + typecheck + tests** before merging to `main`.
- **Validate all external input** (API body/query) with a schema library.
- **Never log** tokens, full ICS URLs in production logs, or child PII at `info` level.
- **Migrations** reviewed in PR with rollback notes.

### Ask first

- New **dependencies** (especially native modules).
- **Database** schema breaks or multi-step data migrations.
- **Third-party** services (new payment provider, push provider).
- **Public API** or versioning promises.

### Never

- Commit **secrets** (`.env` in git); use secret manager or local env only.
- Ship **without** HTTPS for API and ICS endpoints.
- Remove or skip **failing tests** without owner approval and issue link.

---

## Success Criteria (release gate)

1. All **Success criteria** table rows in **Objective** pass on a **staging** environment.
2. **ICS** feed validated manually on at least **one** of: Apple Calendar, Google Calendar (document steps in `docs/`).
3. **Privacy:** Data map documented; minors’ data minimized; account deletion path exists or is explicitly flagged as post-MVP with date.
4. **Observability:** Structured logs + request IDs on API; basic error tracking (Sentry or similar) wired for mobile + API.

---

## Open Questions


| Topic                    | Decision needed                                                  |
| ------------------------ | ---------------------------------------------------------------- |
| **Package model**        | Per-provider credits vs single household balance (see idea doc). |
| **Co-parent / two-home** | v1 or later? Affects roles schema.                               |
| **Payments**             | Stripe Checkout web vs in-app purchase (Apple/Google rules).     |
| **Push**                 | Expo push vs FCM/APNs direct for MVP.                            |


---

## Phase 2: Plan (outline — review before tasks)

1. **Foundation:** Monorepo bootstrap, Prisma schema for `User`, `Household`, `HouseholdMember`, `Child`, `Provider`, `Lesson`, `Invitation`.
2. **Auth:** Sign-up/login, household creation, JWT issuance, protected routes.
3. **Core CRUD:** Children, providers, lessons (including weekly recurrence + single-instance exceptions).
4. **Views API:** Queries for agenda/week/today; pagination rules.
5. **Invites:** Token invites, accept flow, roles (owner vs member), visibility for payment fields.
6. **ICS:** Signed URL, `GET` returns valid `text/calendar`; rotation documented.
7. **Notifications:** Lesson reminders (cron or queue)—minimal viable channel.
8. **Payments (flagged):** Stripe customer + subscription or deposit—only after legal review checklist.

**Risks:** Recurrence + timezone bugs; ICS caching confusion; app store policy if using external payment links.

---

## Phase 3: Tasks (initial backlog — dependency order)

- **Task:** Bootstrap monorepo (`apps/api`, `apps/mobile`, shared config).
  - **Acceptance:** `pnpm install`, `pnpm lint`, `pnpm typecheck` succeed at root.
  - **Verify:** CI stub runs lint/typecheck.
  - **Files:** Root `package.json`, `pnpm-workspace.yaml`, ESLint/TSConfig.
- **Task:** Prisma schema + migrations for core entities (no invites yet).
  - **Acceptance:** `db:migrate` applies clean on empty DB; seed script optional.
  - **Verify:** Integration test creates household + lesson.
  - **Files:** `prisma/schema.prisma`, `apps/api/src/...`
- **Task:** Auth endpoints + mobile login screen + secure token storage.
  - **Acceptance:** Register/login flows work against staging DB.
  - **Verify:** Manual + integration test.
  - **Files:** `apps/api/src/auth/`*, `apps/mobile/screens/Login*`
- **Task:** Lesson CRUD + recurrence (weekly) + exception instance.
  - **Acceptance:** Matches PRD acceptance; DST test case documented.
  - **Verify:** Unit tests for recurrence helper; API integration tests.
  - **Files:** `apps/api/src/lessons/`*, `packages/shared/recurrence.ts` (if extracted)
- **Task:** Mobile agenda/week/today UI wired to API.
  - **Acceptance:** Demo path complete without crashes on iOS/Android simulators.
  - **Verify:** Manual checklist + screenshot in PR.
  - **Files:** `apps/mobile/screens/`*
- **Task:** ICS feed generation + subscription documentation.
  - **Acceptance:** URL works, updates reflect after edit within TTL note.
  - **Verify:** Manual Google/Apple verification steps recorded.
  - **Files:** `apps/api/src/calendar/ics.ts`
- **Task:** Invites + role visibility for payment fields.
  - **Acceptance:** Member cannot see restricted fields per spec.
  - **Verify:** API tests with two users.
  - **Files:** `apps/api/src/invites/`*, mobile accept screen.

---

## Keeping This Spec Alive

- Update this file when stack, scope, or success criteria change.
- PRs that implement behavior should reference **section headings** here.

---

## Verification (spec-driven checklist)

- Spec covers: Objective, Commands, Project Structure, Code Style, Testing, Boundaries, Success Criteria, Open Questions.
- Human reviewed and approved assumptions and stack.
- Success criteria are specific and testable.
- Boundaries (Always / Ask first / Never) defined.
- Spec committed to version control with the repo.

