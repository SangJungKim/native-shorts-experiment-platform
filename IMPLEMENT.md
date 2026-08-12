# Implementation Rules

These rules govern future implementation work. They do not authorize implementation now.

## 1. Work from the research contract

- Read `AGENTS.md`, `SPEC.md`, `PLAN.md`, and `STATUS.md` before making changes.
- Treat `SPEC.md` as the product contract and `PLAN.md` as the delivery sequence.
- Resolve ambiguous measurement or experimental behavior with the research team before coding it.
- Do not silently change scientific semantics to simplify engineering.
- Record consequential decisions and update documentation before or with implementation.

## 2. Protect experimental integrity

- Keep configured stimulus data, published snapshots, raw participant observations, and derived aggregates separate.
- Never update displayed likes, shares, or comment likes in response to participant behavior.
- Treat configured creator profiles as reusable stimulus data. Snapshot the presented creator fields at publication, use private Storage objects with narrowly authorized signed URLs, and mask conflicting YouTube identity chrome in both preview and participant presentation.
- Soft-delete creator profiles and retain their images for historical snapshots. Block archival while an editable Post still references the profile.
- Store participant like/unlike, repost/repost-undo, historical share-tap, and comment-panel activity as distinct behavioral data. A selected participant reaction may render the configured count plus one, but must never write that increment into configured or published display counts.
- Preserve the original YouTube URL exactly as entered, as well as the parsed video ID.
- Preserve enough participant-visible context to interpret V0 data while documenting that published experiments remain editable and unversioned.
- Treat researcher-facing study deletion as explicit deactivation unless a separate authorized retention workflow requires physical erasure: deactivate codes, interrupt active sessions, and preserve collected records.
- Do not add platform-authored Post descriptions. Present only researcher-configured creator profiles, and consistently mask competing YouTube channel chrome.
- Store explicit presentation order rather than relying on creation time or database order.

## 3. Model time explicitly

- Use seconds as the documented external duration unit; use sufficient internal precision and define rounding only at display/export boundaries.
- Use a monotonic clock for elapsed calculations where the platform permits.
- Do not infer viewed time from exposure start/end wall-clock timestamps alone.
- Accumulate time only while the active Post is visible, the app is active, playback is playing, and player position is advancing.
- Measure `total_viewed_seconds` as active video viewing time. Exclude inactive/background time, seeks, and errors; exclude buffering/stalls when reliable detection is validated by the YouTube spike.
- Keep the session clock running while comments are open, pause it while backgrounded, and record comment-panel duration separately.
- End an exposure on every configured exit transition and create a fresh exposure on every activation/revisit.
- On activation, seek to `0:00` before counted playback begins.
- Give the session budget and exposure measurement one consistent timing source and state machine.
- Define and test precision/tolerance; never conceal known timing uncertainty.

## 4. Use explicit state machines

- Represent participant session, active Post, exposure, player, comments panel, app lifecycle, and synchronization states explicitly.
- Enumerate valid transitions and terminal reasons.
- Make transition handlers idempotent so duplicate callbacks cannot create duplicate exposures or completion events.
- Treat rapid swipes, delayed callbacks, backgrounding, connectivity loss, and termination explicitly. V0 records interruptions and does not support offline synchronization.

## 5. Preserve raw, auditable data

- Retain append-only events and individual exposure records even when aggregates are materialized.
- Use stable IDs/idempotency safeguards for ordinary online retries without an offline event queue.
- Record client-observed and server-received timestamps, session elapsed time, schema version, and relevant entity/exposure references.
- Make `total_viewed_seconds` reproducible as the sum of exposure viewed time.
- Avoid destructive corrections to raw data; use traceable correction or version records.
- Ensure exports identify stimuli directly with original URLs, video IDs, condition, and position.

## 6. Make assignment authoritative and persistent

- Assign conditions atomically using simple random assignment in V0.
- Enforce one assignment per participant per experiment at the database level.
- Return the existing assignment on retries and app restarts.
- Do not permit the mobile client to choose or change its condition.
- Preserve assignment provenance sufficient for auditing allocation behavior.
- Prevent completed participant/study combinations from participating again.
- Treat condition assignment and each condition’s Post-order randomization setting as separate concerns. Persist the realized participant order, configured source position, seed, and algorithm version; do not rely on a client-side shuffle.
- Store and snapshot the participant time-display treatment per condition. The researcher preview uses a preview-only running clock and must not imply that its time is measured participant data.

## 7. Separate published and draft behavior

- Validate drafts before publication.
- V0 permits edits to published experiments and has no versioning; expose this limitation and do not imply historical immutability.
- Make study codes non-ambiguous and scoped to the intended published experiment.
- Define explicit archival or closure behavior rather than deleting studies with collected data.

## 8. Security and privacy

- Follow least privilege for database and storage access.
- Keep researcher authentication separate from anonymous participant identity.
- Scope researcher access by ownership/authorization and participant access by session/assignment.
- Never place secrets in source control, client bundles, fixtures, screenshots, or logs.
- Use anonymous participant identifiers and collect no unnecessary personally identifiable information.
- Avoid logging study codes, tokens, or data that can unnecessarily link participant activity.
- Treat consent, retention, deletion, and export access as implementation requirements before real data collection.

## 9. YouTube and media rules

- Use an approved embedded YouTube player and follow YouTube platform policies.
- Never download, proxy, transcode, or host YouTube video content.
- Validate URLs and retain the researcher-entered original value.
- Handle autoplay restrictions, unavailable videos, age/region restrictions, buffering, and player errors explicitly.
- Verify player behavior on physical iOS and Android devices; simulator-only verification is insufficient for timing claims.

## 10. Testing requirements

- Test domain and timer logic independently of UI.
- Use deterministic state-machine tests with a controllable clock and simulated player/app lifecycle events.
- Add database constraint, authorization, concurrency, and idempotency tests.
- Maintain a golden research dataset whose expected exposures, events, aggregates, and CSV files are reviewed.
- Test revisits, rapid swipes, like/unlike, share taps, comment duration, buffering, lifecycle changes, interruption, timeout, connectivity failure, and duplicate callbacks.
- Perform calibrated physical-device tests before claiming viewed-time accuracy.
- Reconcile exports against raw records automatically.
- Do not weaken or delete integrity tests merely to make a change pass.

## 11. Code and change discipline

- Keep shared domain names and event meanings consistent across web, mobile, backend, and exports.
- Never label an assigned Post as watched without an activation or exposure record. Preliminary exports must be identified as provisional and must not substitute assignment rows for observed viewing.
- Prefer small, reviewable changes tied to one milestone and its acceptance criteria.
- Add schema migrations; do not make undocumented manual production database changes.
- Use explicit types for IDs, seconds, timestamps, event kinds, session modes, and display modes.
- Validate at UI, service, and database boundaries as appropriate; database constraints are the final integrity layer.
- Design online request retries and concurrency before optimistic client behavior; do not add offline synchronization in V0.
- Avoid premature features, abstraction, and analytics not required by the prototype.
- Do not add a dependency without explaining its purpose, maintenance/security implications, and why platform capabilities are insufficient.

## 12. Completion and documentation

For each milestone:

- Meet every acceptance criterion or document the unresolved exception.
- Run proportional automated and device verification.
- Update `STATUS.md` with completed work, tests, decisions, known issues, and the next step.
- Update the specification and export/event contracts when approved behavior changes.
- Clearly distinguish measured facts, derived values, assumptions, and limitations in researcher-facing documentation.
