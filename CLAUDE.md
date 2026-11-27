# Learning app (working title)

A cross-platform learning app built around spaced repetition and a per-user
knowledge model. First use case: the owner studying Korean. Later: physics and
general science, friends as testers, then app stores.

Read `docs/SPEC.md`, `docs/DATA_MODEL.md` and `docs/ROADMAP.md` before larger
changes. `docs/ROADMAP.md` says which milestone is current.

## About the developer

Carlos knows Python and Java but is new to web and app development. When you
introduce a concept, tool or file for the first time, explain in two or three
sentences what it is and why it is needed. Prefer the simplest solution that
works; do not add libraries or infrastructure without saying why.

## Stack

- App: Expo (React Native) with TypeScript, one codebase for Android, iOS, web
- Navigation: Expo Router
- Backend: Supabase (Postgres, Auth, Row Level Security, Storage, Edge Functions)
- Scheduling: FSRS via the `ts-fsrs` package
- AI: provider-agnostic layer, called only from Supabase Edge Functions

## Rules that must not be broken

1. `review_events` is append-only. Never update or delete rows in it. Mastery
   and statistics are derived from it.
2. Every table has Row Level Security enabled, with policies restricting rows
   to `auth.uid() = user_id`. A table without policies is a bug.
3. No AI provider key ever reaches the client. AI calls go through Edge
   Functions. User-supplied keys are stored encrypted, never logged.
4. App code never names a specific AI provider or model. It calls the
   internal AI interface in `src/lib/ai.ts` (`planCourse`, `prepareLesson`,
   `generatePractice`, `askTutor`; later `generateItems`, `gradeAnswer`).
   On the server, tasks ask for a tier ('plan' or 'light'); provider
   adapters live behind `supabase/functions/ai/provider.ts`.
5. AI output is validated against a schema before it is stored. Invalid output
   is rejected, never saved.
6. Every AI call writes one row to `ai_usage`.
7. Scheduling uses `ts-fsrs`. Do not write a custom scheduling algorithm.
8. Database changes are made only as migration files in `supabase/migrations/`,
   never by hand in the dashboard.
9. Secrets live in `.env` files that are listed in `.gitignore`.
10. A learner's answer is stored as structured data (`response` is jsonb with
    a `type` field), never as bare text, so handwritten answers can be added
    later without changing the table.

## Working conventions

- TypeScript strict mode; no `any` without a comment explaining it.
- Small commits with clear messages; one topic per commit.
- Scheduling and mastery logic are pure functions with unit tests.
- Korean text is handled as Unicode NFC; compare typed answers after
  normalising and trimming.
- When a decision changes the spec or data model, update the file in `docs/`
  in the same commit.
- Learner-facing screens are designed, not only made to work: one thing per
  page instead of long scrolling pages, short text, a clear main action,
  immediate feedback (animation, sound), visible progress and a rewarding
  end. Build them from the session parts in `src/components/session/`
  (layout, option cards, feedback panel, confetti) so they look and behave
  alike.

## Commands

Run from the repository root. Expo SDK 58; see `AGENTS.md` for Expo-specific
guidance (always read the versioned Expo docs, not memory).

- Install dependencies: `npm install` (after cloning or pulling package changes)
- Add a package: `npx expo install <package>` (picks SDK-compatible versions)
- Start dev server: `npx expo start` (press `w` for web; scan the QR code with
  Expo Go on the phone; use `--tunnel` if the phone cannot reach the PC)
- Type check: `npx tsc --noEmit`
- Lint: `npx expo lint`
- Check dependency versions: `npx expo-doctor`
- Publish the web version: happens on its own after every push to `main`
  (merged pull request) through the EAS Workflow `.eas/workflows/deploy.yml`,
  which reads the `EXPO_PUBLIC_` values from the Expo project's "production"
  environment variables; runs are listed on expo.dev under the project's
  Workflows. By hand: `npm run deploy:web` (builds into `dist/` with the
  values from `.env` and deploys to EAS Hosting as production). Either way
  the address is https://learning-app-plubub.expo.app; Expo project
  `@plubub/learning-app`, the CLI needs `npx eas-cli@latest login` once per
  machine. New sign-ups are switched off in Supabase Auth, because the
  address is public.
- Cloud sessions (claude.ai/code, the Claude phone app): the SessionStart
  hook in `.claude/settings.json` runs `scripts/cloud-session-setup.sh`,
  which installs the npm packages there. Database migrations, Supabase
  secrets and Edge Function deploys need the Supabase login and are done
  from a computer with the CLI linked, not from cloud sessions.
- Run unit tests: `npm test` (Jest with jest-expo; once) or `npm run test:watch`.
  Test files are `*-test.ts` in `__tests__` folders next to the code, never
  inside `src/app/` (every file there becomes a screen)
- New migration: `npx supabase migration new <name>` (creates an empty file in
  `supabase/migrations/`; from a non-interactive shell add `< /dev/null`, or it
  waits for SQL on stdin)
- Apply migrations to the cloud project: `npx supabase db push --remote`
  (CLI v3 targets a local Docker database unless `--remote` is given)
- Regenerate database types after a migration: `npm run db:types`
  (writes `src/lib/database.types.ts`; never edit that file by hand)
- List applied migrations: `npx supabase migration list --remote`
- Database security checks (run after every migration):
  `npx supabase db query --remote -f supabase/tests/rls_m1.sql` and the same
  with `supabase/tests/rls_courses.sql` (each runs in a transaction that is
  rolled back and prints "all ... checks passed"), then
  `npx supabase db advisors --remote`
- Edge Function (`supabase/functions/ai/`, runs on Deno, not checked by
  `tsc`): type check with
  `npx deno check --config supabase/functions/ai/deno.json supabase/functions/ai/index.ts`,
  deploy with `npx supabase functions deploy ai`
- AI secrets (server only, never in `.env`):
  `npx supabase secrets set ANTHROPIC_API_KEY=...`; optional
  `AI_MODEL_PLAN`, `AI_MODEL_LIGHT`, `AI_DAILY_CALLS`, `AI_DAILY_PLANS`
- One-time setup per machine: `npx supabase login`, then
  `npx supabase link --project-ref kwyrtvjirgqzzxzdxpqu` (asks for the
  database password)

Environment: copy `.env.example` to `.env` and fill in the Supabase URL and
publishable key. Restart `npx expo start` after changing `.env`.

Setting up another computer: see `docs/SETUP.md`.
