# Supabase backend

Milestone 2 establishes the database contract without connecting either application to Supabase. The schema is defined entirely by timestamped migrations and can be recreated from an empty local Supabase database.

## Local requirements

- Docker Desktop running
- Node.js and the root dependencies installed

From the repository root:

```sh
npm run db:start
npm run db:reset
npm run db:lint
npm run db:test
```

`db:start` starts the local Supabase stack. `db:reset` recreates the database and applies every migration. `db:test` executes the pgTAP files in `supabase/tests/database` inside transactions.

The reset also seeds a development-only researcher account (`researcher@example.test` / `Researcher123!`) for the local web workflow. A hosted deployment must use an administrator-controlled researcher invitation/provisioning process instead of these credentials.

Do not edit a deployed database manually. Add a new migration for every subsequent schema change.

## Data boundaries

Editable researcher authoring data lives in:

- `experiments`
- `creator_profiles` (deprecated prototype data retained only for non-destructive migration)
- `conditions`
- `posts`
- `seeded_comments`

Immutable presentation context lives in `publication_*` snapshot tables. A publish operation will copy all participant-visible experiment, condition, Post, social-signal, comment, and ordering fields into these tables. V0 does not expose publication history or a version-management interface, but these internal snapshots are required so later authoring edits cannot rewrite collected research context. Source rows may be edited or deleted; snapshot values and the original YouTube URL remain intact. Nullable creator snapshot columns remain only as legacy schema and are not populated by new V0 authoring.

Participant observations live separately in:

- `participants` and `assignments`
- `sessions`
- `exposures`
- append-only `behavior_events`
- `participant_post_state`

Displayed likes, shares, and seeded-comment likes exist only in authoring/publication data. Actual likes, unlikes, share taps, and comment activity are stored in events and participant state and never update displayed counts.

## Integrity and idempotency

- Composite foreign keys prevent conditions, Posts, assignments, sessions, exposures, and events from crossing experiment or publication boundaries.
- One assignment is allowed per anonymous participant and experiment.
- One active and one completed session are allowed per participant and experiment; interrupted sessions remain auditable.
- A participant/Post exposure number is unique.
- Session, exposure, and event IDs are supplied by the client as UUID idempotency keys, so an ordinary online retry conflicts instead of duplicating a record.
- Events have immutable UUID primary keys and no participant update/delete policy.
- All externally meaningful durations use seconds with millisecond-scale decimal precision.

Milestone 4 will add the backend publication and atomic simple-random assignment functions. Direct participant inserts into `assignments` are intentionally denied, so the participant cannot select a condition.

## Authorization

All application tables use row-level security.

- Authenticated researchers can author and read only experiments they own. Creator profiles are owner-scoped.
- Researchers can read response data only for owned experiments.
- Anonymous authenticated participants can read only their own assignment and its publication snapshot/condition.
- Participants can write sessions, exposures, events, and interaction state only under their own identity and assigned publication.
- Participant creation and assignment require a trusted backend function; no direct client policy permits them.

The prototype currently uses single-owner experiments. Collaborator/team roles are outside V0 unless explicitly added later.

## Creator image storage

An earlier prototype migration created a private `creator-images` bucket. Synthetic creator presentation is now retired, so new V0 authoring does not use this bucket. It remains in place to avoid deleting local prototype data:

- Maximum object size: 5 MiB
- Allowed types: JPEG, PNG, and WebP
- Required object path: `<researcher-user-id>/<filename>`
- Only that authenticated researcher can read or modify objects in their folder

No participant delivery endpoint is planned for this legacy bucket. It remains deliberately non-public.
