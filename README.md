# Virality Experiment

Research prototype for studying fragmented attention in short-form mobile video environments.

This repository contains the researcher authoring and publishing application, anonymous participant study-code entry, the isolated mobile playback spike, and a migration-defined Supabase database contract.

## Prerequisites

- Node.js 24 or newer
- npm
- For mobile device development: the prerequisites listed in the Expo documentation for the target platform

## Install

From the repository root:

```sh
npm install
```

Copy environment templates only when local values are needed. Never commit secrets.

## Workspace layout

- `apps/researcher-web`: Next.js and TypeScript researcher shell
- `apps/participant-mobile`: React Native, Expo, Expo Router, and TypeScript participant shell
- `packages/shared`: reserved for framework-independent shared types and logic
- `supabase`: local configuration, database migration, storage policy, and pgTAP tests

## Development

Start the researcher web shell:

```sh
npm run dev:researcher
```

For the local researcher workflow, keep Docker Desktop open and start Supabase first with `npm run db:start`. Open `http://localhost:3000`, then use the development-only account:

- Email: `researcher@example.test`
- Password: `Researcher123!`

`npm run db:reset` recreates this account and deletes locally authored test data. These credentials are for local development only and must never be used for a hosted deployment.

Start Expo for the participant mobile shell:

```sh
npm run dev:participant
```

Copy `apps/participant-mobile/.env.example` to `.env.local`. For a physical phone, use the Mac's Wi-Fi/LAN IP instead of `127.0.0.1`, and use only the local publishable/anonymous key printed by `npm run db:start`. Anonymous sign-in is enabled locally. Because participant identity uses native persistent storage, rebuild the development client after installing dependencies:

```sh
cd apps/participant-mobile
npx expo run:ios --device
```

The Expo terminal provides options for opening supported simulators, devices, or web. Keep the phone and Mac on the same network when connecting to local Supabase.

## Quality checks

Run all currently available checks:

```sh
npm run check
```

Or run them separately:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The root test command runs workspace tests. Database tests are run separately because they require a running local Supabase stack.

## Local database

Install and start Docker Desktop, then run:

```sh
npm run db:start
npm run db:reset
npm run db:lint
npm run db:test
```

See [`supabase/README.md`](supabase/README.md) for the data boundaries, authorization model, idempotency rules, and creator-image storage policy.

## External researcher demo

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the staging Supabase, public researcher website, and TestFlight workflow. This external release is for workflow and playback feedback; active viewed-time measurement remains a later milestone.

## Environment files

- Root: `.env.example`
- Researcher web: `apps/researcher-web/.env.example`
- Participant mobile: `apps/participant-mobile/.env.example`
- Supabase local configuration: `supabase/.env.example`

Local Supabase credentials are printed by `npm run db:start`. Never expose the service-role key in a client application.
