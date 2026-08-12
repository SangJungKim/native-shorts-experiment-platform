# Project Status

## Current phase

Milestone 5’s assigned-condition participant feed and interaction persistence are implemented and accepted on a physical iPhone. Android validation remains outstanding. Exposure and viewed-time measurement remain Milestone 6 work.

## Completed

- Built a real Supabase-connected researcher web workspace with local email/password authentication and administrator-provisioned researcher access.
- Added a reset-safe, development-only researcher seed account; no service-role key is exposed to the browser.
- Implemented experiment creation and editing for time-controlled and stimulus-controlled modes, including all six time-display choices.
- A reusable creator-profile prototype was temporarily retired after embedded-player review showed YouTube channel attribution, then restored after the participant presentation adopted masking for that conflicting chrome.
- Implemented condition creation, rename, deletion, and atomic deep duplication.
- Implemented ordered Post creation/editing/deletion, exact original URL preservation, separate parsed YouTube ID storage, creator assignment, duration and nonnegative social-count validation, atomic deep duplication, and persistent up/down ordering.
- Implemented researcher-seeded comment creation/deletion with optional displayed likes; participant comment submission remains absent.
- Added security-definer authoring helpers for atomic condition/Post duplication and ordering, with ownership checks and advisory locking.
- Added pgTAP coverage for authoring duplication, exact URL preservation, seeded-comment deep copies, and deterministic ordering.
- Browser-tested the complete local authoring path using a timed experiment with two duplicated conditions, duplicated Posts, and seeded comments.
- Added a researcher-only condition preview: a 9:16 mobile presentation with embedded YouTube playback, Post descriptions, displayed social signals, seeded comments, presentation-order navigation, and an explicit no-data-recorded warning. Preview navigation reloads each Post player and does not create participant records or events.
- Preview heart and repost controls now toggle local visual states, with a repost checkmark and selected styling. These states reset when the preview closes, never modify displayed counts, and never write behavioral records.
- The condition preview uses an outlined speech-bubble icon for seeded comments instead of a generic dot.
- Superseded the temporary description-source option: every V0 Post now presents only its own short description. Existing profile-sourced text was copied into the Post description before the legacy assignment became optional.
- Creator authoring was temporarily removed, then restored after masked YouTube chrome resolved the conflicting-identity concern. Legacy profile records were retained throughout and are reusable again.
- Removed platform-authored Post descriptions from Post creation, editing, summaries, and condition preview. Legacy database columns remain empty for schema compatibility and are not participant-facing.
- Replaced the experiment-level Post-order control with a condition-level `Shuffle off` / `Shuffle on ✓` control. Each condition independently uses fixed researcher order or a once-per-participant persisted random order. Condition duplication preserves the setting, and participant materialization reads the assigned condition snapshot.
- Condition names remain directly editable, and the `Save name` action stays available whenever the entered name is valid instead of appearing disabled merely because it currently matches the stored name.
- The researcher condition preview now hides embedded YouTube controls, disables keyboard/fullscreen controls and annotations, and requests captions off so no subtitle control is presented. YouTube may still render text permanently encoded into a video image.
- Because YouTube preferences can override URL parameters, the preview now also sends repeated IFrame Player API commands after loading to clear the caption track and unload the captions module.
- Participant-facing preview copy says `Comments`; the researcher authoring area retains the more precise `Seeded comments` terminology.
- Researchers can edit an existing seeded comment’s display name, text, and optional displayed likes, with save/cancel validation in addition to deletion.
- Matched the `Save name` typography and padding to the other condition action buttons.
- Implemented atomic publication validation and immutable internal stimulus snapshots, including exact original YouTube URLs, condition-level time display, condition-level randomization, displayed social signals, and seeded comments.
- Added active eight-character study-code generation. Republishing creates a new snapshot/code, deactivates the previous code, and warns that V0 has no researcher-facing version history; participants already assigned retain their original snapshot.
- Added anonymous participant study-code entry with persistent local auth storage, backend-authoritative simple-random condition assignment, idempotent re-entry, active-session reuse, and one-time persisted Post-order materialization.
- Enforced that a completed participant/study combination cannot participate again. Interrupted-session recovery remains intentionally simple and is deferred to the participant session workflow.
- Added `/feed`, which loads only the participant’s assigned publication snapshot and exact persisted Post order. Study-code entry now opens this assigned feed automatically; `/playback-spike` remains clearly labeled as a diagnostic route.
- Reused the validated 9:16, 90%-width embedded-player behavior: swipe navigation pauses the prior player, every newly active Post seeks to `0:00`, captions are actively suppressed, the assigned creator profile is overlaid, and no platform-authored Post description is added.
- Added participant like/unlike, comments open/close, and reversible repost controls. A selected heart or repost renders its configured count plus one and undo returns it to the configured count. Current state, historical share-tap state, and append-only select/undo events persist separately from immutable displayed likes, shares, and seeded comments.
- Production exposure creation, active viewed-time measurement, comment-panel duration, session clocks/time indicators, and completion are intentionally not included; they remain Milestones 6–8.
- Time-controlled experiments now configure participant time display independently for each condition. The condition preview runs a temporary one-second clock from zero and updates the selected progress/elapsed/remaining treatment; condition duplication preserves the treatment.

- Milestone 1 repository bootstrap and quality baseline.
- Added Supabase CLI 2.113.0 as a reproducible root development dependency and local database scripts.
- Added an initial migration defining researcher ownership, experiments, reusable creator profiles, conditions, ordered Posts, seeded comments, internal publication snapshots, study codes, anonymous participants, assignments, sessions, exposures, behavioral events, participant interaction state, and creator-image storage.
- Separated editable authoring records, immutable participant-visible publication snapshots, and observed participant behavior.
- Added composite constraints and indexes preventing cross-experiment/condition/session references, duplicate assignments, duplicate exposure numbers, duplicate event IDs, and multiple active or completed sessions for one participant/experiment.
- Added row-level security for single-owner researchers and assigned anonymous participants. Participants cannot directly create assignments or promote themselves to researcher access.
- Added a private, researcher-folder-scoped `creator-images` storage policy for JPEG, PNG, and WebP files up to 5 MiB.
- Added pgTAP integrity and authorization suites under `supabase/tests/database`.
- Documented local Supabase commands, data boundaries, UUID idempotency strategy, V0 snapshot semantics, authorization rules, and storage policy.

- Created the five root planning documents:
  - `AGENTS.md`
  - `SPEC.md`
  - `PLAN.md`
  - `IMPLEMENT.md`
  - `STATUS.md`
- Documented the research purpose, product scope, researcher and participant workflows, measurement model, time-controlled sessions, data requirements, intended architecture, exclusions, implementation rules, and sequential milestones.
- Identified technical and research-policy questions that require validation before implementation.
- Recorded the approved V0 decisions in `AGENTS.md`, `SPEC.md`, `PLAN.md`, `IMPLEMENT.md`, and this status file.
- Installed Node.js 26.7.0 and npm 11.19.0 through Homebrew on the development machine.
- Created an npm-workspaces monorepo with:
  - `apps/researcher-web`: Next.js 16.3.0 and TypeScript shell
  - `apps/participant-mobile`: React Native 0.86.2, Expo 57.0.11, Expo Router 57.0.11, and TypeScript shell
  - `packages/shared`: empty reserved shared workspace
  - `supabase`: empty reserved backend directory with no schema or integration
- Added root scripts, one root lockfile, ESLint configuration, TypeScript checks, environment templates, ignore rules, local-development documentation, and a basic GitHub Actions quality workflow.
- Replaced Expo’s showcase UI with a minimal Router shell so generated demo defects do not require weakened lint/type checks.
- Removed Next.js build-time Google Font downloads so the researcher shell builds without external font access.
- Added an isolated `/playback-spike` Expo Router screen with exactly three configurable YouTube IDs, a full-viewport vertically paginated feed, revisit-to-zero behavior, a manual autoplay fallback, and visible/console instrumentation.

## YouTube playback spike

### Chosen approach

- **Player:** `react-native-youtube-iframe` 2.4.1
- **Rendering dependency:** Expo-supported `react-native-webview` 13.16.1
- **Web-only peer used by the configured Expo export:** `react-native-web-webview` 1.0.2

The wrapper was chosen because it uses YouTube’s IFrame Player API, explicitly supports Expo, runs through WebView rather than requiring a custom native YouTube SDK, and does not require changing Expo 57 or React Native 0.86. It is less complex than maintaining a custom WebView/IFrame message bridge while exposing the controls required by this spike.

Primary references consulted:

- YouTube IFrame API: `https://developers.google.com/youtube/iframe_api_reference`
- Expo 57 WebView documentation: `https://docs.expo.dev/versions/v57.0.0/sdk/webview/`
- Player documentation: `https://lonelycpp.github.io/react-native-youtube-iframe/`

### Implemented spike behavior

- Route: `/playback-spike`
- Configuration: `apps/participant-mobile/src/playback-spike-config.ts`
- Exactly three player instances are rendered as full-viewport vertical pages.
- After a page settles, the previous player receives `play=false`, the newly active player receives `seekTo(0, true)`, and then receives `play=true` after a short handoff delay.
- The same activation path runs for revisits, so A → B → C → B → A issues a fresh seek-to-zero command for each return.
- If scripted playback is blocked, a visible button repeats seek-to-zero and play after a direct user gesture.
- No production attention timer, research event persistence, Supabase connection, or database behavior exists.

### Playback controls available

- Play and pause through the wrapper’s controlled `play` property
- Seek through `seekTo(seconds, allowSeekAhead)`, used as `seekTo(0, true)`
- Current position through asynchronous `getCurrentTime()`, polled once per second for spike instrumentation
- Duration, mute state, volume, and playback-rate getters are also exposed by the wrapper but are not needed by this spike

The YouTube API seeks to a keyframe at or before the requested time. A zero-second request should therefore return approximately to `0:00`; actual device observations must establish the acceptable tolerance.

### Playback-state information available

The wrapper’s state callback distinguishes:

- `playing`
- `paused`
- `buffering`
- `ended`
- `unstarted`
- `video cued`

Direct buffering detection is therefore available through the `buffering` state. Position polling can additionally reveal a non-advancing position, but production stalled-playback logic must not be implemented until callback timing and false transitions are measured on physical devices and real network conditions.

The wrapper does not expose YouTube’s newer `onAutoplayBlocked` callback directly. The spike infers failure to start from observed state/position and provides a manual play button.

### Known and expected platform limitations

#### iOS

- WKWebView/Safari media policies may block unmuted scripted playback until a user gesture. The manual seek-and-play button is the fallback under test.
- Fullscreen-change support in the wrapper documentation is Android-only; this spike disables fullscreen because fullscreen is irrelevant to the feed requirement.
- WebView pause/seek command latency, state callback ordering, audio handoff, and restart accuracy must be measured on a physical iPhone.

#### Android

- Autoplay usually works through WebView, but the wrapper documents `forceAndroidAutoplay` for affected older devices. The spike does not enable its user-agent override by default; enable it only if device testing proves necessary.
- WebView touch handling may compete with vertical feed gestures depending on OS/WebView versions. Swipe behavior beginning directly over player controls requires physical-device testing.
- Pause/seek latency, buffering transitions, audio overlap, and behavior when the YouTube app is absent require physical Android testing.

#### Both platforms

- YouTube videos can be unavailable, private, region/age restricted, or disallow embedding.
- Network quality affects IFrame readiness and buffering events.
- Three simultaneous WebViews may have memory/startup costs; this spike intentionally uses exactly three to match the requested sequence, but production virtualization strategy remains undecided.
- Autoplay behavior can vary with user interaction history, audio state, browser/WebView policy, and YouTube policy.
- Expo web export proves bundling only; it does not validate native playback behavior.

### Physical-device acceptance test still required

On both a representative iPhone and Android phone:

1. Confirm Video A begins at approximately `0:00` or succeeds after the manual play gesture.
2. Watch A briefly, then swipe A → B → C.
3. Watch B for about 10 seconds before leaving it.
4. Swipe C → B and confirm B restarts near `0:00`, not near 10 seconds.
5. Swipe B → A and confirm A also restarts near `0:00`.
6. Confirm only the active video produces audio/playback.
7. Observe `playing`, `paused`, `buffering`, and `ended` when they can be induced.
8. Compare visible position and command timestamps to perceived player behavior.
9. Test swipes that start both outside and directly over the embedded player controls.

Until this test passes on both platforms, the answer to “Can we build the required mobile YouTube feed reliably?” is **provisionally feasible, not yet validated**.

### Physical iPhone build readiness

The participant app is now configured for a custom iOS development build without initiating any Apple signing action:

- Added iOS bundle identifier `com.sangjungkim.viralityexperiment.participant`.
- Installed the Expo 57-compatible `expo-dev-client` 57.0.10.
- Confirmed `react-native-webview` 13.16.1 and `react-native-youtube-iframe` 2.4.1 are installed in the participant workspace.
- Confirmed the resolved Expo configuration targets SDK 57 and includes the bundle identifier.
- Expo Doctor passes 20/20 checks after these changes.
- Participant lint and typecheck pass.

The Mac is not yet ready to run `npx expo run:ios --device`: `/Applications/Xcode.app` is absent, `xcode-select` points to standalone Command Line Tools, `xcodebuild` is unavailable, and CocoaPods is not currently exposed on the shell path. Full Xcode installation and first-launch setup are therefore required before a local iPhone build.

Expo Go is not the selected path for this test. The current App Store Expo Go on physical iPhone supports a different SDK generation than this SDK 57 project, while the installed development client allows the project’s exact native dependencies to be compiled into its own test app.

No `ios` directory has been generated yet. No Xcode project, signing team, Apple Account, certificate, provisioning profile, device registration, or device permission has been created or selected by Codex. The first `npx expo run:ios --device` invocation will generate native files and then require the user-controlled Xcode/device signing setup.

Subsequently, the user generated the iOS project and selected signing outside Codex. The first physical-device bundle step was blocked because Xcode 26 generated the project with User Script Sandboxing enabled, preventing React Native’s debug script from writing `ip.txt` into the built app. The generated project now sets `ENABLE_USER_SCRIPT_SANDBOXING = NO` for Debug and Release. This is an iOS build-only compatibility setting and may need to be reapplied if `expo prebuild --clean` regenerates the project.

The playback spike was successfully launched on a physical iPhone. Based on manual review, the spike now uses a visibly bordered square player with displayed dimensions and includes local-only animated like and repost test controls. A controlled pause alone did not stop outgoing iPhone audio reliably, so the spike now suspends/unmounts the outgoing YouTube WebView when a swipe begins and also mutes every non-active player. Like/repost actions only update spike UI and console/debug logs; they are not production behavior or persisted research events. Participant-mobile lint and typecheck pass after these changes; the strengthened audio isolation still requires another physical-device check.

At the user’s direction, the spike square-crops its three landscape test videos. A first attempt to scale the square WebView was rejected during physical testing because the wrapper internally fixes its player page height to 16:9, producing a malformed partial-height result. The corrected approach renders a full-height 16:9 player, centers it behind the square viewport, and clips excess left/right content. Native YouTube controls remain disabled because the side crop would cut them off; the external spike play button remains available. This is an intentional stimulus alteration for the isolated landscape-video spike and is not yet a production presentation decision. Vertical Shorts will require an explicit aspect/orientation strategy before production.

The spike subsequently replaced the landscape samples with three user-provided public YouTube Shorts. Their original submitted URLs are preserved alongside parsed IDs in `playback-spike-config.ts`. The cover geometry now assumes 9:16 source content: it enlarges the wrapper’s fixed 16:9 iframe page until the contained vertical video reaches square width, centers it in both axes, and clips it to the 90%-width square viewport. Physical iPhone testing must confirm that all three videos allow embedding and that the assumed 9:16 crop behaves consistently.

Physical review showed that square cover cropping removed meaningful portions of the Shorts. The spike therefore no longer crops or enlarges video content. It now centers YouTube’s standard 16:9 embedded player inside the 90%-width square frame and restores YouTube controls. Vertical Shorts may show black space, but the complete original video frame remains visible. Preserving the full stimulus takes priority over filling the square.

The square was then replaced with a 9:16 Shorts frame at 90% of screen width. Because the wrapper’s internal page is fixed at 16:9, the spike centers an oversized landscape YouTube canvas behind the vertical viewport; for 9:16 source videos, this clips the player canvas’s side area while retaining the complete vertical video frame. Native YouTube controls are hidden because they fall outside the clipped viewport, and the external spike play control remains available.

The external “Seek to 0 + play active video” button was subsequently removed at the user’s direction. The spike-only repost control now toggles a persistent local visual state: it animates, turns green, displays a checkmark within the repost icon, changes its label to “Reposted,” and logs repost/undo-repost test taps. No repost data is persisted.

The spike explicitly disables YouTube closed-caption loading, annotations, embedded controls, and fullscreen. This removes the player’s subtitle control and requests that optional YouTube captions remain off. Text permanently encoded into a creator’s video image cannot be removed by the embedded player.

The spike-only like and repost controls are positioned as a vertical overlay inside the 9:16 video frame near its bottom-right edge, with the heart above repost. Their local toggle, animation, checkmark, and debug logging behavior is unchanged.

The like and repost bounding boxes now use translucent black backgrounds in both inactive and selected states. Selected-state feedback remains on the icon itself.

Physical iPhone testing showed that YouTube could still restore closed captions despite `cc_load_policy=0`, likely from a remembered player preference. The spike now also injects a player-page guard that clears caption tracks and unloads the `captions`/`cc` modules every 500 milliseconds after the IFrame page loads. This is a spike workaround whose effectiveness must be rechecked on-device; it still cannot alter text baked into the video pixels.

## Verification

Final passing commands:

- `npm run lint` — passed after Milestone 2 changes
- `npm run typecheck` — passed after Milestone 2 changes
- `npm test` — passed; no workspace application tests currently exist
- `npm run build` — researcher Next.js production build passed
- `npx supabase --version` — Supabase CLI 2.113.0
- Supabase `db lint` and `test db` command help checks — passed
- `npm run db:start` — local Supabase stack started successfully with Docker Desktop
- `npm run db:reset` — fresh database recreated and the initial migration applied successfully
- `npm run db:lint` — no schema errors found at warning level
- `npm run db:test` — both pgTAP suites passed; 19/19 tests successful
- Milestone 3 database suite — three pgTAP files and 27/27 tests passed
- Browser workflow — sign-in, creator creation, experiment creation, condition/Post/comment authoring, deep duplication, and Post movement passed against local Supabase
- Condition preview browser check — modal opening, 9:16 YouTube presentation, configured social signals, creator/Post context, next/previous navigation, seeded-comments panel, and no-data-recorded labeling passed
- Per-participant randomization — incremental migration applied without resetting local authoring data; schema lint passed; 35/35 pgTAP tests passed; researcher setting persistence and illustrative preview shuffle passed in browser testing
- Interactive preview controls — heart and repost toggles, selected/checkmark states, unchanged displayed counts, and reset-on-close behavior passed browser validation
- Description-source option — incremental migration preserved existing data; 37/37 pgTAP tests passed; browser validation confirmed the per-Post selector persists and the preview presents the assigned creator profile description when selected
- Synthetic creator retirement — incremental migration copied any selected legacy profile description into its Post, made legacy references optional, and restricted new V0 descriptions to Post text; schema lint, 35/35 pgTAP tests, workspace lint, typecheck, production web build, and browser validation passed
- Description removal and condition-level shuffle — incremental migration preserved previous order choices at the condition level; schema lint, 36/36 pgTAP tests, workspace lint, typecheck, and production web build passed
- Milestone 4 publication and assignment — schema lint passed; five pgTAP files cover publication, exact URL snapshots, study codes, simple-random provenance, idempotent assignment/session reuse, persisted Post order, and completed-study rejection
- Milestone 5 feed foundation — database interaction RPC, 65/65 pgTAP tests, workspace lint/typecheck, and Expo static export including `/feed` passed; physical iPhone and Android testing remains required
- Reversible participant reactions — local migration applied; schema lint, 69/69 pgTAP tests, workspace lint/typecheck, and Expo static export passed. Heart and repost selections display the configured count plus one without mutating the configured signal; undo restores the displayed base count and emits a distinct append-only event.
- Restored reusable researcher-configured creator profiles after the decision to mask conflicting YouTube channel chrome. Researchers can create profiles with display name, handle, description, and an optional private Storage image, then assign one to each Post. Publication snapshots retain the exact presented creator fields. The participant feed and researcher preview now show the creator overlay at the lower-left of the 9:16 frame; the preview also mirrors the mobile reaction counts and undo behavior. Private images use short-lived signed URLs and participant read access is limited to images referenced by their assigned publication snapshot. Local migration/schema lint, 72/72 pgTAP tests, workspace lint/typecheck, researcher production build, Expo export, and browser preview/assignment checks passed.
- Removed the preview-only top badges (`PREVIEW` and Post position) so the 9:16 condition preview no longer presents a panel absent from the participant feed. Condition-controlled time treatments remain visible when configured.
- Disabled pointer interaction on the preview-only YouTube iframe so hovering over the video cannot reveal YouTube’s top hover panel. Researcher preview reaction, comment, and navigation controls remain interactive overlays.
- Matched the participant feed’s player boxing geometry in researcher preview: a centered 16:9 YouTube canvas is rendered behind and clipped by the 9:16 phone frame. This replaces the full-width narrow iframe presentation and geometrically excludes player chrome outside the Shorts frame.
- Re-enabled pointer interaction on the boxed preview player so researchers can hover and click the embedded video to begin playback; clipping remains responsible for hiding chrome outside the 9:16 frame.
- Resolved a physical-iPhone native/JavaScript runtime mismatch found after an `ExpoLinking` error and Hermes malloc crash. Accidental root dependencies pinned React Native 0.86.0 while Expo SDK 57 and the participant workspace require 0.86.2; the duplicate root Expo/React/React Native dependencies were removed, npm now resolves React Native 0.86.2 consistently, and CocoaPods/codegen were refreshed successfully with React Native 0.86.2 and Hermes `250829098.0.16`. A clean Xcode rebuild and physical-device confirmation remain required. Expo Doctor could not run during this repair because the npm registry DNS lookup was unavailable.
- Physical iPhone acceptance passed after the runtime repair. The assigned `/feed` correctly presents creator information, reversible heart and repost counts, comments, swipe-driven prior-player/audio isolation, and revisit playback restarting at approximately `0:00`. Milestone 5 is accepted for iOS; Android playback acceptance remains outstanding.
- Added the published condition’s participant time treatment to `/feed`: progress-only, elapsed, remaining, progress + elapsed, progress + remaining, and hidden modes now render unobtrusively at the top. The active session clock resumes from stored `session_elapsed_seconds`, continues while comments are open, pauses while the app is inactive/backgrounded, persists periodically and on lifecycle changes, and supplies current elapsed time to interaction events. Participant lint/typecheck and Expo export pass. Automatic completion when a timed session reaches zero is not yet implemented and remains session-completion work; the display currently caps at the configured duration.
- Added a preliminary `participant_post_data` CSV download for early researcher feedback. Researchers now enter a readable video title for each Post; titles are copied into publication snapshots. The participant feed records an append-only `post_activated` event on every activation/revisit, and the CSV includes only participant × Post rows with at least one activation. Columns cover anonymous participant ID, condition, session status, title, video ID, exact original URL, realized one-based presentation position, current/ever-like, current/ever-repost, comment-open count, and any-affordance interaction. Existing authoring Posts were conservatively initialized with their video ID as title and should be renamed before republishing. Local migration/schema lint, 75/75 pgTAP tests, workspace lint/typecheck, researcher build, and Expo export pass. This is explicitly preliminary; exposure/viewed-time fields and final three-file schemas remain later milestones.
- The preliminary CSV now includes both assigned condition ID and readable condition name. Added a destructive-looking but research-safe `Delete / deactivate study` control: after explicit confirmation it archives the experiment, deactivates every active study code, interrupts active participant sessions with a recorded reason, and retains existing research records. Archived studies are blocked from republishing in both the UI and database. Open participant feeds poll session status and stop playback within approximately three seconds, showing a study-ended screen. Schema lint, 80/80 pgTAP tests, workspace lint/typecheck, researcher build, and Expo export pass.
- Added creator-profile deletion as archival. Active creator cards now provide a Delete control; deletion is blocked in both UI and database while any editable Post uses the profile. Unused profiles disappear from active authoring choices, while their row and private image remain available for historical publication interpretation. Schema lint, 83/83 pgTAP tests, researcher lint/typecheck, and production build pass.
- Refined creator-profile archival so Posts belonging only to archived experiments no longer block deletion from active authoring. Active draft or published experiments still require reassignment first; immutable publication snapshots continue preserving historical creator presentation.
- Added researcher CSV import for seeded comments on an individual Post using `display_name`, `comment_text`, and `likes` headers; imports append up to 500 validated rows. Added participant-authored comments as a separate behavioral record with anonymous participant/session/Post provenance and a `comment_submitted` event. V0 shows submitted comments only to their author and researchers so participants cannot alter later participants' experimental stimuli. Schema lint, 89/89 pgTAP tests, workspace lint/typecheck, researcher production build, and iOS Expo export pass.
- Simplified participant comment submission to one compact “What do you think about this?” text box under the fixed label “User”; participants no longer enter a display name. Changed participant time-display state from whole-second rounding to fractional updates so progress bars advance continuously while the app is active, including while comments are open.
- Clarified preliminary interaction exports by naming end-state fields `like_final` and `reposted_final`, alongside `like_ever` and `repost_ever`. The participant × Post file also includes `comment_submitted` and `participant_comment_count`. A separate long-form `participant_comments.csv` download contains one row per submitted comment and its participant, condition, stimulus identifiers, realized position, sequence, text, timestamp, and session elapsed time.
- Scoped creator profiles to individual experiments. The researcher interface now shows and creates profiles only for the selected experiment, while database constraints prevent cross-experiment Post assignments. Existing profiles shared across experiments are copied per experiment during migration so Post assignments and historical image references remain intact. The local migration, schema lint, 89/89 pgTAP tests, researcher lint/typecheck, and production build pass.
- Added guarded permanent deletion for never-published experiments. Researchers must type the exact experiment name; the database rejects deletion if any publication snapshot or participant session exists. Eligible deletion cascades through draft conditions, Posts, seeded comments, and experiment-scoped creator profiles, while published/data-bearing studies remain archive-only.
- Clarified study deactivation in the researcher interface: the confirmation now explicitly warns that participant sessions will stop and the study code will be deactivated, asks whether to continue, and states that existing research records will be preserved.
- Renamed the preliminary participant × activated-Post export in the researcher interface to “Participant engagement CSV” and changed its downloaded filename prefix to `participant_engagement_`; its row grain remains participant × activated Post.
- Restored URL-first YouTube metadata authoring without an API key or new package. Pasting or blurring a valid Shorts URL immediately exposes the parsed video ID; `Load YouTube metadata` uses Google’s IFrame Player API in a visible muted metadata player, briefly begins playback because `getDuration()` remains zero until metadata loads, then pauses and fills the YouTube title and duration. Researchers may adjust the populated values before saving, and manual fallback remains available for non-embeddable videos. Browser validation with `l0un24OLf_8` populated its title and 35-second duration; researcher lint/typecheck and production build pass.
- Added a researcher-defined Post name distinct from the imported YouTube video title. The name is editable in Post authoring, visible in the Post list, preserved in publication snapshots, and included in the preliminary participant CSV. Existing Posts inherit their current video title as the initial Post name. The local migration, schema lint, 84/84 pgTAP tests, researcher lint/typecheck, and production build pass.

- `npm install`
- `npm run lint`
- `npm run typecheck`
- `npm test` — no workspace product tests exist yet, so the configured `--if-present` runner completed successfully
- `npm run build` — Next.js production build
- `EXPO_NO_TELEMETRY=1 npx expo export --platform web` — Expo Router production export
- `npm run check` — final combined lint, typecheck, test, and researcher build check
- `npx expo-doctor` — 20/20 checks passed after adding the spike dependencies
- `EXPO_NO_TELEMETRY=1 npx expo export --platform web` — exported `/playback-spike` successfully

Failures encountered and resolved during bootstrap:

- Initial `create-next-app` attempt failed because the managed workspace did not yet contain the `apps` parent directory. Creating the requested directory resolved it.
- Initial Expo lint failed because Expo telemetry attempted to write outside the managed workspace and the generated template lacked its explicit ESLint preset. Direct ESLint configuration with `eslint-config-expo` resolved it.
- Initial lint/typecheck found defects in Expo’s generated showcase code. Replacing the showcase with the required minimal shell resolved them without weakening checks.
- Initial Next.js build failed because the generated template fetched Google Fonts during compilation. Using system fonts removed the network dependency and resolved the build.

Spike check issue resolved:

- The first Expo web export after adding the player failed because `react-native-youtube-iframe` declares a separate web fallback peer, `react-native-web-webview`. Adding that declared peer resolved the export. Native Expo compatibility had already passed Expo Doctor.

Installation warnings:

- npm reported 22 transitive dependency audit findings in the generated dependency tree: 8 moderate and 14 high. No breaking `npm audit fix --force` was applied. These should be reassessed as framework releases update and before deployment.
- npm warned that `unrs-resolver` has a postinstall script not covered by npm’s `allowScripts` approval mechanism. The generated applications and final checks still passed.

Milestone 2 database issues found and resolved during verification:

- Initial local startup was blocked until Docker Desktop was installed and opened; the stack now runs successfully.
- The first authorization suite exposed an unqualified condition ID in the participant publication policy. Qualifying the outer table ID restored access to exactly the assigned condition.
- Four initial pgTAP checks used the three-argument `throws_ok` form incorrectly and compared against descriptive text as though it were an exact PostgreSQL error message. The checks now assert the intended SQLSTATEs and pass.

## Not started

- No hosted Supabase project has been created or linked. The researcher web app connects only to local Supabase; the participant app is not connected.
- No production participant feed, behavioral measurement, publication/assignment RPC logic, analytics, or export logic exists.
- Hosted researcher invitation/provisioning is not implemented; local development uses a seeded test account.
- No product features were implemented beyond minimal framework shell screens.

## Current decisions

- The product has two interfaces: a researcher web application and participant mobile application.
- The primary behavioral measure is `total_viewed_seconds`, summed across retained exposure records.
- Every Post activation begins a new exposure and restarts playback at `0:00`.
- Configured social signals remain separate from actual participant behavior.
- Reusable researcher-configured creator profiles are participant-visible stimulus data. They are snapshotted at publication, and YouTube identity chrome is masked to avoid conflicting creator cues.
- Original YouTube URLs must be retained unchanged and included in research exports.
- YouTube videos will be embedded, not downloaded or hosted.
- The intended stack is Next.js/TypeScript, React Native/Expo/Expo Router/TypeScript, and Supabase/PostgreSQL, subject to feasibility validation.
- V0 uses simple random condition assignment.
- Published V0 experiments remain editable and have no versioning system.
- Interrupted sessions are recorded as interrupted without sophisticated recovery.
- A completed participant/study combination cannot participate again.
- Stimulus-controlled sessions end after the final Post.
- V0 requires connectivity and has no offline synchronization; failures must be graceful.
- Participants use anonymous identifiers; unnecessary personally identifiable information is not collected.
- The session clock continues with comments open and pauses while backgrounded.
- `total_viewed_seconds` measures active video viewing time; buffering/stall exclusion requires playback-spike validation.
- Comment-panel duration is recorded separately from video viewing time.
- Exact CSV and event schemas may be refined before the export milestone.
- Post order is configured per condition as fixed or randomized once per participant. A realized randomized order is persisted and reused, with seed and algorithm provenance retained for audit.

## Validation required before implementation

- YouTube seek-to-zero, autoplay, swipe handling, pause latency, audio isolation, and state/position reliability on physical iOS and Android devices
- Reliable buffering/stalled-playback detection under controlled network conditions and whether video continues behind comments
- Anonymous identity behavior after app deletion, device changes, or cleared local storage
- Warnings and data safeguards for editable, unversioned published experiments
- Graceful online-only behavior for failed writes, expired codes, player errors, and termination
- Exact event taxonomy and CSV contract before the export milestone
- Consent, privacy, retention, deletion, and research-governance requirements

## Next step

Milestone 5D external researcher-demo deployment is in progress before returning to Milestone 6. Hosted Supabase staging project `emffazwlvifexhklhdll` is linked; all 22 repository migrations were applied, local and remote migration histories match, and remote schema lint reports no errors. Hosted anonymous authentication is enabled, and researcher UID `a9dd4f3f-d6ca-45bd-8f79-e6f37b4b2c9a` is provisioned in `public.researcher_profiles`. The private GitHub repository `SangJungKim/native-shorts-experiment-platform` is connected and pushed. The researcher web application is deployed to Vercel with hosted Supabase client configuration. The participant app is linked to Expo project `@sangjung-kims-team/native-shorts-participant` (`5080c474-c7b7-42eb-a439-49dd87f5e37e`), and its Preview environment contains the hosted Supabase URL and a masked sensitive publishable key. No TestFlight build has occurred yet; the next action is the researcher-demo iOS EAS build and Apple signing setup. Active viewed-time measurement remains explicitly unfinished.
