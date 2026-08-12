# Agents

## Repository purpose

This repository contains a research prototype for experimentally studying fragmented attention in short-form mobile video environments. Treat it as a scientific instrument, not a consumer social network.

## Priorities

In descending order:

1. Experimental integrity
2. Accurate active viewed-time measurement
3. Reliable YouTube playback
4. Persistent and reliable condition assignment
5. Transparent, analysis-ready research data
6. A simple researcher workflow

Viewing duration is a behavioral measure of attention allocation; do not describe it as the complete psychological construct of attention.

## Persistent rules

- Read `SPEC.md`, `PLAN.md`, `IMPLEMENT.md`, and `STATUS.md` before implementation work.
- Work milestone by milestone and satisfy the stated acceptance criteria.
- Keep researcher-configured social signals separate from participant behavior.
- Preserve every original YouTube Shorts URL in storage and exports; never reconstruct it from the video ID.
- Never download or host YouTube videos. Use embedded YouTube playback.
- Preserve individual exposure and event records; do not retain only aggregates.
- Count viewed time only while the Post is active, the app is active, and playback is genuinely progressing.
- Reactivating any Post starts playback at `0:00` and creates a new exposure.
- Make condition assignment persistent and idempotent for returning participants.
- When per-participant Post randomization is enabled, generate each participant’s order once, persist every assigned presentation position, and reuse it on return; never reshuffle an active session.
- Use simple random assignment in V0 and prevent repeat participation for a completed participant/study combination.
- V0 permits editable published experiments without versioning; do not imply historical immutability.
- Record interrupted sessions rather than building sophisticated recovery, and require connectivity without offline synchronization.
- Use anonymous participant identifiers and collect no unnecessary personally identifiable information.
- Keep the session clock running while comments are open, pause it while backgrounded, and record comment-panel duration separately.
- Treat `total_viewed_seconds` as active video viewing time; validate reliable buffering/stall exclusion during the YouTube spike.
- Keep identifiers, timestamps, durations, ordering, and export definitions explicit and auditable.
- Prefer simple, testable behavior over premature abstraction or extra product features.
- Do not add out-of-scope social, recommendation, analytics, AI, payment, or video-hosting features.
- Do not install packages, initialize frameworks, or write application code until explicitly requested.
- Update `STATUS.md` after material work, including decisions, verification performed, known issues, and the next milestone.
- Do not place secrets or participant-identifying information in source control or logs.

## Intended stack

- Researcher web application: Next.js and TypeScript
- Participant mobile application: React Native, Expo, Expo Router, and TypeScript
- Backend: Supabase and PostgreSQL
- Video playback: embedded YouTube playback
- Do not add synthetic creator profiles, platform-authored Post descriptions, or obscure YouTube’s own channel attribution in the embedded player.

These are intended choices, not initialized dependencies. Validate feasibility questions identified in `SPEC.md` and `PLAN.md` before committing to implementation details.
