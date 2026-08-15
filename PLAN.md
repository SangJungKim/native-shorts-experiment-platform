# Development Plan

Development is sequential. Do not start a milestone until its prerequisites and unresolved scientific decisions are addressed. Each milestone should include tests and a `STATUS.md` update.

## Milestone 0 — Validate research and platform decisions

### Work

- Record approved V0 allocation, publication, interruption, repeat-participation, feed-boundary, connectivity, identity, session-clock, video-time, and comment-duration decisions.
- Validate remaining playback questions, especially reliable buffering/stall detection and whether video continues behind comments.
- Define the anonymous participant and consent/privacy model.
- Refine the exact event taxonomy and CSV contracts before the export milestone.
- Build a small, disposable playback feasibility spike only after application-code work is explicitly authorized.

### Acceptance criteria

- Decisions are written in `SPEC.md` or an architecture decision record.
- The selected player approach has been tested on representative iOS and Android devices for seek-to-zero, autoplay, buffering callbacks, lifecycle transitions, and position reporting.
- Attention and session timing rules are unambiguous enough to create deterministic tests.
- V0 product and measurement policies are documented.
- The export contract has a documented refinement checkpoint before Milestone 9.

## Milestone 1 — Initialize the repository and quality baseline

### Work

- Initialize the researcher, participant, and backend project structure using the intended stack.
- Establish TypeScript, formatting, linting, testing, environment-variable conventions, and continuous integration.
- Document local setup without committing secrets.

### Acceptance criteria

- Both clients build and launch in supported development environments.
- Automated checks run from documented commands and pass.
- Environment configuration is validated with safe example files.
- No product behavior beyond a minimal shell is introduced.

## Milestone 2 — Design the domain model and backend security

### Work

- Model experiments, published versions, conditions, ordered Posts, seeded comments, study codes, anonymous participants, assignments, sessions, exposures, events, and participant interaction state.
- Add constraints, indexes, authorization policies, idempotency strategy, and snapshot/version behavior.

### Acceptance criteria

- Migrations create a fresh database reproducibly.
- Constraints prevent cross-experiment references, duplicate assignments, duplicate event IDs, and duplicate exposure numbers.
- Participant access is limited to the appropriate published study and its own write scope.
- Researcher access is authenticated and experiment-scoped.
- Original URLs and published presentation snapshots cannot be lost through ordinary edits.
- Automated database tests cover authorization and integrity rules.

## Milestone 3 — Build researcher authoring workflows

### Work

- Create experiments, choose session mode, and configure time display per condition.
- Configure fixed or per-participant randomized Post order independently for each condition and provide a clearly non-recording example preview shuffle.
- Create conditions and ordered Posts with YouTube URL parsing and validation.
- Configure social signals and seeded comments.
- Create reusable creator profiles, upload optional profile images, and assign a profile to every Post.
- Duplicate conditions and Posts and reorder Posts.

### Acceptance criteria

- A researcher can create a complete multi-condition draft without direct database work.
- Original URLs are stored exactly as submitted and parsed IDs are stored separately.
- Posts require no platform-authored description and require an assigned reusable creator profile.
- Condition preview matches the participant feed’s creator and social-control presentation closely enough to inspect experimental stimuli before publication.
- Duplicates receive independent identities and expected deep-copied child data.
- Reordering persists deterministically.
- The selected Post-order and time-display treatments persist per condition and are snapshotted; previews do not alter configured treatments or order.
- Validation errors are clear and prevent invalid numeric values or broken references.

## Milestone 4 — Publish experiments and assign conditions

### Work

- Validate and publish a stable experiment version.
- Generate a unique, usable study code.
- Establish anonymous participant identity and backend-authoritative assignment.
- Implement simple random assignment and approved re-entry behavior.
- Materialize each randomized participant Post order exactly once with stored seed/algorithm provenance and idempotent retry behavior.

### Acceptance criteria

- Invalid drafts cannot publish.
- Researchers can edit a published V0 experiment and receive a clear warning that V0 has no versioning.
- A valid study code resolves only to the intended published experiment.
- Concurrent repeated assignment requests return the same assignment.
- Returning participants receive the same condition across app restarts.
- Returning participants receive the same realized Post order; an active session is never reshuffled.
- Allocation tests demonstrate simple random assignment and audit fields.
- A completed participant/study combination cannot start another session.

## Milestone 5 — Build the participant feed and interactions

Implementation is complete; physical-device acceptance remains pending.

### Work

- Implement study-code entry, assignment retrieval, and mobile-only full-screen feed.
- Embed YouTube playback without downloading or hosting videos.
- Implement swipe up/down, like/unlike, seeded comments panel, and share tap.
- Keep configured social signals visually and structurally separate from participant behavior.

### Acceptance criteria

- Each active Post fills the feed, preserves YouTube attribution, and shows the correct Post fields.
- Swipe up activates the next Post and swipe down activates the previous Post according to boundary rules.
- Every activation, including revisit, seeks to `0:00` and begins playback within documented platform constraints.
- Like/unlike, comments open/close, and share taps record behavior without changing displayed counts.
- Participants cannot submit comments.
- Playback failure has a clear participant state and produces diagnostic data.

## Milestone 5D — Hosted external researcher demo

### Work

- Create a hosted staging Supabase project and apply the migration-defined schema.
- Deploy the researcher Next.js application to a public staging URL.
- Provision only invited researcher accounts; do not add public researcher registration.
- Configure an Expo/EAS iOS build and distribute the participant application through an internal TestFlight group before external invitations.
- Run an off-network smoke test covering authoring, publication, code entry, assignment persistence, playback/revisit behavior, interactions, comments, deactivation, and preliminary CSV downloads.
- Label the release as a workflow/playback demo without validated viewed-time measurement.

### Acceptance criteria

- Invited researchers can use the web application without access to the development Mac or local network.
- A TestFlight-installed iPhone can join a hosted demo study over cellular data.
- Client bundles contain only publishable Supabase credentials and no service-role or database secrets.
- Unprovisioned researcher accounts are denied access, while anonymous participants remain scoped by assignment/session policies.
- The external smoke-test checklist passes and known measurement limitations are shown to reviewers.
- `STATUS.md` records hosted project/build identifiers without recording secrets.

## Milestone 5W — Mobile participant web demo

### Work

- Export the existing Expo participant interface for web without creating a divergent participant design.
- Deploy it as a separate public mobile-web project connected to hosted Supabase.
- Preserve study-code entry, anonymous assignment, feed presentation, creator overlays, interactions, comments, and condition time display.
- Validate browser-specific YouTube playback and lifecycle behavior on physical iOS and Android devices.

### Acceptance criteria

- A participant can open a public URL without Expo, TestFlight, or researcher credentials and enter a valid study code.
- The web interface visually matches the native participant application at representative phone viewport sizes.
- Direct navigation and refresh work for the study-code and assigned-feed routes.
- Anonymous identity, assignment, and realized Post order persist across ordinary reloads in the same browser profile.
- Physical mobile-browser testing covers autoplay fallback, swipe paging, pause/audio isolation, revisit-to-zero, comments, interactions, background/foreground behavior, and browser-storage clearing.
- The web delivery remains labeled as a demo until its timing and playback behavior are independently validated; native results are not generalized to web.

## Milestone 6 — Implement exposure and attention measurement

### Work

- Create a measurement state machine for Post activation, playback, buffering, app lifecycle, navigation, and termination.
- Record exposure boundaries and viewed-time increments with idempotent persistence.
- Derive per-participant/Post totals and revisit measures.
- Record abnormal termination as interrupted and handle required-connectivity failures gracefully; do not build offline synchronization.

### Acceptance criteria

- Every activation creates exactly one new numbered exposure.
- Leaving, backgrounding under the chosen policy, timeout, and player failure close exposures correctly.
- Active video time excludes background/inactivity and excludes buffering/stalls when the playback spike validates reliable detection.
- Comment-panel duration is recorded separately from active video viewing time.
- Two exposures of 6 and 11 seconds produce 17 total viewed seconds.
- Aggregates reconcile with raw exposure records within documented rounding tolerance.
- Automated state-machine tests cover rapid swipes, revisits, duplicate submissions, buffering, background/foreground, clock changes, and crash recovery.
- Device tests compare recorded time with controlled playback scenarios.

## Milestone 7 — Implement time-controlled sessions

### Work

- Enforce the active session budget with the same timing foundation as exposure measurement.
- Implement all six researcher-selected time-display modes.
- Stop the feed and close the active exposure exactly at the budget boundary.

### Acceptance criteria

- Hidden, progress-only, elapsed, remaining, and both combined modes render correctly.
- The top indicator is unobtrusive and does not obstruct video controls or stimulus content.
- The timer continues while comments are open and pauses while the app is backgrounded or inactive.
- At zero, playback and exposure measurement stop, completion is recorded once, and a completion state appears.
- Recorded active viewed time does not exceed the finite budget beyond documented precision tolerance.
- Stimulus-controlled sessions remain unaffected by time-display logic.

## Milestone 8 — Implement behavioral persistence and completion

### Work

- Persist all required lifecycle, swipe, interaction, exposure, and completion events.
- Add ordinary online-request idempotency and visible failed-write handling without offline synchronization.
- Record interrupted sessions and prevent completed participant/study combinations from participating again.

### Acceptance criteria

- All required event types are observable in test sessions with client and server timestamps and session elapsed time.
- Retries do not create duplicate logical events or exposures.
- App interruption is recorded as interrupted; connectivity failure produces a graceful online-required state.
- A session cannot be reported complete before required terminal records are durably accepted or explicitly queued under the approved policy.

## Milestone 9 — Build research exports

### Work

- Provide a preliminary participant × activated-Post CSV for early researcher feedback before freezing the final contract.

- Generate `participant_post_data.csv`, `exposures.csv`, and `events.csv` from retained study data.
- Include human-readable stimulus context, original URLs, IDs, units, and version metadata.
- Authorize and audit researcher downloads.

### Acceptance criteria

- Participant/Post export has exactly one row per participant × presented Post.
- Exposure and event exports have exactly one row per retained exposure/event.
- Totals recomputed from `exposures.csv` match participant/Post totals.
- Original YouTube URLs appear unchanged in all applicable exports.
- Researchers can identify stimuli without manually joining internal database IDs.
- Empty values, zeroes, booleans, quoting, Unicode, timestamps, and precision follow the documented contract.
- Golden-dataset tests verify all three files, including revisits, unlike behavior, no-interaction Posts, and incomplete sessions.

## Milestone 10 — End-to-end validation and research readiness

### Work

- Test complete researcher and participant journeys across supported devices.
- Conduct timing calibration, assignment concurrency/load checks, accessibility review, data-loss testing, and security/privacy review.
- Prepare a pilot protocol and operational documentation.

### Acceptance criteria

- A scripted multi-condition study passes end to end from authoring through export.
- Timing error stays within a research-team-approved tolerance on target devices and network conditions.
- Assignment remains stable under concurrency and repeat entry.
- No configured social signal is mutated by participant behavior.
- Exported records reconcile with a manually observed pilot session.
- Known limitations, supported environments, retention/consent procedures, and incident recovery steps are documented.
- The research team approves a limited pilot before wider participant use.
