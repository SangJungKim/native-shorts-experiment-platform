# External Researcher Demo Deployment

This guide prepares a staging-only demo for invited researchers. It is not authorization for research data collection. Active viewed-time and exposure measurement remain unfinished, and the preliminary engagement CSV must not be represented as validated attention measurement.

## Target staging architecture

- Hosted Supabase project for authentication, database, Storage, and participant APIs
- Public Next.js researcher website
- iOS participant application distributed through TestFlight
- Separate staging credentials; never reuse local development credentials or commit secrets

## 1. Hosted Supabase staging project

The project owner must choose the Supabase organization, region, plan, and database password. After creating an empty project:

```sh
npx supabase login
npx supabase link --project-ref YOUR_STAGING_PROJECT_REF
npx supabase db push
npx supabase migration list
```

Enable anonymous authentication for participant identities. Record only the hosted project URL and publishable/anonymous key in client deployment services. Never place the database password, access token, JWT secret, or service-role key in either client.

## 2. Invited researcher accounts

V0 has no public researcher registration. Create each invited researcher through Supabase Authentication, then add that user UUID to `public.researcher_profiles`. Do not reuse the local development account or password. Confirm that an unprovisioned authenticated user receives the access-restricted screen.

## 3. Public researcher website

Create a web-hosting project connected to this repository and configure:

- Framework: Next.js
- Repository root: repository root
- Build command: `npm run build`
- Install command: `npm install`
- Output directory: `apps/researcher-web/.next`

Set these environment variables in the hosting dashboard:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_CLIENT_SAFE_PUBLISHABLE_KEY
```

Test sign-in, authoring, publication, preview, creator-image upload, study deactivation, and CSV downloads from a computer other than the development Mac.

## 4. Expo project and preview environment

The iOS bundle identifier is `com.sangjungkim.viralityexperiment.participant`.

From `apps/participant-mobile`:

```sh
npx eas-cli login
npx eas-cli init
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --visibility sensitive
```

Enter only the hosted client-safe Supabase values. Do not paste service-role credentials.

## 5. TestFlight demo

This requires the project owner's Expo account, Apple Developer membership, App Store Connect access, and explicit signing choices.

```sh
cd apps/participant-mobile
npx eas-cli build --platform ios --profile researcher-demo
npx eas-cli submit --platform ios --profile researcher-demo
```

Use an internal TestFlight group first. After validation, invite the intended external researchers and complete any beta-review requirements shown in App Store Connect.

## 6. External smoke test

1. An invited researcher can sign in at the public website.
2. A researcher can create, preview, publish, and retrieve a study code.
3. An iPhone on cellular data can install/open the TestFlight app and enter the code.
4. Condition assignment and realized Post order persist after reopening.
5. Video A → B → C → B → A pauses prior audio and revisits restart near `0:00`.
6. Likes, reposts, comments, time display, and deactivation behave as designed.
7. Engagement and participant-comments CSVs contain expected anonymous demo records.
8. No service-role key, database password, access token, or participant-identifying information appears in a client bundle or log.

## Demo limitation

Show invited researchers:

> This is a workflow and playback demo. Active viewed-time, exposure, buffering exclusion, and final attention-data exports are not yet validated and must not be used for scientific conclusions.

After feedback, return to Milestone 6 for exposure and active viewed-time measurement.
