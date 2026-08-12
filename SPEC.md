# Product Specification

## 1. Purpose

The platform is a research prototype for controlled experiments about fragmented attention and behavioral attention allocation in short-form mobile video environments. It provides a researcher-facing web application for configuring studies and a participant-facing mobile application that presents an experimentally controlled vertical video feed.

The primary behavioral attention measure is `total_viewed_seconds`: the sum of active viewed time across every exposure by one participant to one Post. This measure is an operational indicator of attention allocation, not a claim to measure the entire psychological construct of attention.

## 2. Scientific and product principles

The platform must prioritize, in order:

1. Experimental integrity
2. Accurate viewed-time measurement
3. Reliable playback
4. Reliable and persistent condition assignment
5. Transparent research data
6. Simple researcher workflow

Researcher-configured presentation must remain distinguishable from observed participant behavior. Raw events and exposures must be retained so derived values can be audited and recomputed.

## 3. Interfaces

### 3.1 Researcher web application

The researcher interface is intended for desktop or standard web use. Researchers can configure stimuli, conditions, session rules, publication, and exports.

### 3.2 Participant mobile application

The participant interface is mobile-only. It presents full-screen Posts in a vertical short-video feed and records exposure and interaction behavior. The prototype does not require participant accounts or profiles.

## 4. Core concepts

### 4.1 Experiment

An experiment is the top-level research study. It contains one or more conditions and has a lifecycle that includes at least draft and published states. A published experiment provides a study code participants can enter.

An experiment defines one session mode:

- **Time-controlled:** the researcher specifies a fixed duration in seconds and configures the participant-facing time-display treatment independently for each condition.
- **Stimulus-controlled:** the session is governed by the configured stimulus sequence rather than a fixed time budget.

In V0, published experiments may remain editable and there is no experiment versioning system. This deliberate prototype simplification means interpretation and exports must account for configuration changes during data collection. Versioning or immutable publication remains a post-V0 integrity improvement.

Researchers may deactivate an entire study. V0 implements this as an irreversible soft deletion: archive the experiment, deactivate every study code, interrupt active participant sessions, and prevent further participation while retaining stimulus snapshots and collected records for audit and export. Physical deletion of research records is not part of this control.

Researchers may permanently delete a never-published experiment after typing its exact name. This removes its draft conditions, Posts, seeded comments, and experiment-scoped creator profiles. Any experiment with a publication snapshot or participant session is ineligible for permanent deletion and must be deactivated instead.

### 4.2 Condition

A condition belongs to one experiment and contains an ordered list of Posts. It independently defines Post-order randomization and, for time-controlled experiments, the participant time-display treatment. Researchers can create multiple conditions and duplicate a condition. Duplication must copy its participant-facing configuration and ordered Post configuration without merging subsequent edits between source and copy.

### 4.3 Post

“Post” is the canonical domain term and is capitalized in product documentation. Each Post belongs to a condition and contains:

- Original YouTube Shorts URL
- Parsed YouTube video ID
- Researcher-defined Post name
- Researcher-readable video title
- Video duration in seconds
- Assigned reusable creator profile
- Displayed number of likes
- Displayed number of shares
- Zero or more researcher-seeded comments
- Presentation position within the condition

The original submitted YouTube URL is canonical research data. It must always be stored unchanged and included in exports alongside the parsed video ID. The system must not host or download the video.

V0 does not add a platform-authored Post description. YouTube player chrome is masked at the presentation edges, and the participant feed presents the assigned researcher-configured creator profile as an explicit experimental stimulus.

Researchers can create, duplicate, and reorder Posts. A duplicated Post copies the configured stimulus and social-signal fields but receives its own identity and position. The product must define whether copying seeded comments produces independent comment records; the recommended behavior is an independent deep copy.

### 4.4 Creator presentation

Researchers can create creator profiles within each experiment containing a profile image, display name, handle, and optional profile description. One profile may be assigned to multiple Posts in that experiment but cannot be assigned across experiments. Creator presentation is researcher-configured experimental stimulus data, not participant identity. Publication snapshots and exports preserve the presented creator fields so later profile edits do not make collected data ambiguous.

Researchers may delete a creator profile from active authoring. V0 implements this as archival: a profile assigned to a Post in any active study must first be replaced. Posts belonging only to archived experiments do not block profile archival because their immutable publication snapshots retain the presented creator fields. Archival hides the profile from authoring without removing its stored image or historical publication context.

### 4.5 Seeded comment

A researcher may configure multiple seeded comments on each Post. Each contains:

- Display name
- Comment text
- Optional displayed number of comment likes
- Stable order within the Post

Participants can open and close the comments panel and submit text through a compact “What do you think about this?” field. Participant-authored comments use the fixed visible label “User”; participants do not provide a display name. These comments are observed behavior and must be stored separately from researcher-seeded comments. In V0, a submitted comment is visible to its author and researchers but does not automatically become part of another participant's stimulus.

### 4.6 Participant

A participant is anonymous and represented by a generated participant ID stored persistently on the device. No participant profile is required. The privacy and consent policy, identifier retention period, and handling of app deletion or device changes must be defined by the research protocol before deployment.

### 4.7 Assignment

After a valid study code is entered, the participant is assigned anonymously to one condition. The assignment must be persisted and returned idempotently so reopening the app or re-entering the study does not change it.

Assignment must be performed authoritatively by the backend, not selected by the client. V0 uses simple random assignment across the experiment’s conditions. Assignment records must include participant, experiment, condition, assignment time, and enough provenance to audit the method used. A completed participant/study combination cannot participate again.

### 4.8 Exposure

An exposure is one continuous activation of a Post. Every time a Post becomes active—including a return to a previously viewed Post—the application must:

1. Seek the video to `0:00`.
2. Start playback.
3. Create a new exposure with the next exposure number for that participant and Post.
4. Begin accumulating active viewed time only when eligible.

Leaving the Post ends the exposure. Returning creates another exposure rather than reopening the prior record.

Each exposure retains at least participant, experiment, condition, Post, presentation position, exposure number, start time, end time, viewed time, and relevant session elapsed times. Records should also carry a reason for ending where feasible, such as swipe, background, completion, session timeout, or app termination recovery.

## 5. Researcher workflow

The researcher can:

1. Create an experiment.
2. Choose time-controlled or stimulus-controlled session mode.
3. For time-controlled mode, enter a positive total duration and choose a time-display mode for each condition.
4. Create multiple conditions.
5. Duplicate conditions.
6. Create, duplicate, edit, delete, and reorder Posts within each condition.
7. Create reusable creator profiles and assign one to every Post.
8. Add and order seeded comments on Posts.
9. Preview each condition in a mobile-style presentation matching the participant feed.
10. Validate the complete experiment configuration.
11. Publish the experiment.
12. Obtain a unique study code.
13. Eventually download the specified research data exports.

Publication validation must reject missing or invalid required fields, invalid or unsupported YouTube URLs, invalid durations or social counts, empty required condition content, and invalid time-control settings.

## 6. Participant experience

### 6.1 Entry and assignment

The participant enters a study code. The application validates it, establishes or retrieves the persistent anonymous participant identity, and creates or retrieves the persistent condition assignment. V0 does not require sophisticated interrupted-session recovery: interrupted sessions are recorded as interrupted. A completed participant/study combination cannot participate again.

### 6.2 Feed presentation

Posts appear one at a time as a full-screen vertical feed in condition-defined order.

- Swipe up: activate the next Post.
- Swipe down: activate the previous Post.
- Like control: toggle participant like state.
- Comments control: open or close seeded comments.
- Comment composer: submit comment text under the fixed label “User,” without entering a display name.
- Repost control: toggle the participant's current repost state. Selecting it records a share tap; undoing it records a separate event. The prototype need not prove that an external share completed.

The platform shows the researcher-configured creator image, display name, handle, and optional profile description. It adds no platform-authored Post-description overlay. YouTube channel chrome is masked to prevent a competing identity presentation.

Displayed likes, displayed shares, and seeded comments are researcher-set experimental signals. Participant interactions must never mutate those displayed values.

### 6.3 Navigation boundaries

For a stimulus-controlled session, progression beyond the final Post ends the session. Swiping down from the first Post remains on it. V0 does not loop the feed.

### 6.4 Post-order randomization

Researchers may select either a fixed Post order or per-participant randomized Post order independently for each condition. Fixed order follows that condition’s explicit Post positions. When a condition’s shuffle is enabled, the backend generates an order once for each participant assigned to that condition, persists every Post’s assigned presentation position, and returns the same sequence for that session on retries or return. The client must never reshuffle an existing session.

The stored session order must include the original configured position, assigned presentation position, randomization seed, and algorithm/version provenance. Exposures, events, and exports use the participant’s assigned presentation position. Randomization changes ordering only; it does not change condition assignment, Post membership, stimulus fields, or displayed social signals.

## 7. Attention measurement

### 7.1 Primary measure

For participant `i` and Post `j`:

`total_viewed_seconds(i, j) = sum(viewed_time for every exposure of participant i to Post j)`

For example, exposures of 6 seconds and 11 seconds produce `total_viewed_seconds = 17` seconds.

### 7.2 Eligible active viewed time

Time may accumulate only when all applicable conditions are true:

- The Post is the active visible feed item.
- The app is in the foreground and active.
- The video player is in a playing state and playback time is advancing.
- The session has started and has not ended.
- The player is producing qualifying active video viewing time; comment-panel time is measured separately.

Wall-clock time alone is insufficient because buffering, pauses, lifecycle transitions, and player failures can inflate it. Implementation should reconcile monotonic device time with player state and player-position progress. Backgrounding or app inactivity must immediately stop accumulation and close or suspend the current exposure according to a predefined lifecycle policy. The recommended policy is to end the exposure on backgrounding and create a new exposure from `0:00` when the Post becomes active again.

`total_viewed_seconds` represents active video viewing time, not merely time spent on a Post or in the session. Seek operations and playback failures must not count. If reliable buffering/playback-state detection is available, buffering and stalled playback must also be excluded. The YouTube playback spike must validate whether the selected integration supplies reliable enough signals. Opening comments does not pause the session clock, and comment-panel duration must be recorded separately from video viewing time. Whether video continues behind the panel remains an interaction-design decision; only qualifying active playback contributes to `total_viewed_seconds`.

### 7.3 Revisits

A revisit occurs when a participant activates a Post after at least one prior exposure to that Post. Revisit counts are derivable from exposures but may also be materialized for exports. Exposure numbering must be deterministic per participant and Post.

## 8. Time-controlled sessions

The researcher specifies a positive session duration in seconds, such as 300 seconds. This fixed duration is the participant’s finite attention budget.

The researcher selects one display mode independently for each condition:

- Hidden
- Progress bar only
- Elapsed time
- Remaining time
- Progress bar and elapsed time
- Progress bar and remaining time

Any progress indicator appears unobtrusively at the top of the participant feed. The session clock continues while comments are open and pauses while the application is backgrounded or inactive.

By default, when the time budget reaches zero:

1. Stop playback and viewed-time accumulation at the boundary.
2. Close the active exposure at the boundary.
3. Record the session/experiment completion event.
4. End the feed and show a completion state.

The countdown and exposure timer must share a consistent monotonic clock strategy so the recorded attention budget cannot exceed the session duration except for explicitly documented rounding tolerance.

## 9. Social signals and participant behavior

Configured stimulus fields and observed behavior are separate data domains.

- `display_likes`, `display_shares`, and displayed comment likes are immutable presentation values for a published run.
- A heart press records a participant like event/state without changing `display_likes`. The participant UI may render the configured count plus one while that participant's heart is selected; undoing returns the rendered count to the configured value.
- An unlike records a separate event and updates only the participant’s current liked state.
- A repost press records `share_tapped` and current repost state; undo records `share_untapped` and clears only current repost state. The UI may render the configured count plus one while selected, but neither action changes `display_shares`, and historical share-tap information remains retained.
- Opening and closing comments creates behavior events; it does not alter seeded comments.

Exports should expose both configured signals and participant responses with unambiguous names.

## 10. Behavioral event model

The system must preserve enough raw and derived data to represent:

- Participant ID
- Experiment
- Condition
- Post
- Original YouTube URL
- YouTube video ID
- Video duration
- Presentation position
- Exposure number
- Exposure start time
- Exposure end time
- Viewed time
- Total viewed seconds
- Swipe direction
- Revisits
- Likes
- Unlikes
- Comments opened
- Comments closed
- Share tapped
- Experiment started
- Experiment completed
- Session elapsed time

Events should be append-only where practical and contain a unique event ID, participant ID, experiment/condition/Post references as applicable, event type, client-observed timestamp, server-received timestamp, session elapsed time, exposure reference when applicable, and a schema version. Comment-panel open/close events must make panel duration derivable or record it explicitly. V0 requires connectivity and does not support offline synchronization; failures must produce a graceful state rather than silent data loss.

Authoritative timestamps and client timestamps serve different purposes: the client is closest to interaction timing, while the server supports audit and ordering. Clock choices and offline behavior must be documented.

## 11. Research data exports

Researchers will eventually download three UTF-8 CSV files with stable, documented columns and units.

### 11.1 `participant_post_data.csv`

One row per participant × Post, including human-readable stimulus information so researchers do not manually join database IDs:

Before the full export milestone, the prototype may provide a clearly labeled preliminary form containing only activated Posts, anonymous participant ID, assigned condition ID and name, session status, researcher-defined Post name, video title/ID/original URL, realized presentation position, final and ever-observed like/repost indicators, and comment indicators. `like_final` and `reposted_final` represent the state at the end of the recorded session, while `like_ever` and `repost_ever` remain true if the interaction occurred and was later undone. An assigned Post is not treated as watched unless a `post_activated` event exists. Participant-submitted text is exported separately in long form with one row per comment so multiple responses do not break the participant × Post grain.

- Participant ID
- Experiment and condition identifiers/names as appropriate
- Original YouTube URL
- YouTube video ID
- Video duration in seconds
- Displayed likes
- Displayed shares
- Number of seeded comments
- Presentation position
- Number of exposures
- First viewed seconds
- `total_viewed_seconds`
- Participant liked at session end
- Share tapped at least once
- Comments opened count or indicator, with the final contract stated explicitly

`first_viewed_seconds` means viewed time in exposure number 1, not wall-clock duration. Missing interaction counts should export as zero, not blank. Published stimulus snapshots should supply the presentation fields.

### 11.2 `exposures.csv`

One row per exposure, including participant, experiment, condition, human-readable Post/stimulus fields, presentation position, exposure number, revisit indicator, exposure start and end timestamps, viewed seconds, start/end session elapsed seconds, and end reason.

### 11.3 `events.csv`

One row per behavioral or lifecycle event, including event ID/type, participant, experiment, condition, Post and exposure where applicable, original URL/video ID where applicable, swipe direction or interaction payload, client timestamp, server timestamp, session elapsed seconds, and schema version.

Export computations must be reproducible from retained data. CSV escaping, timestamp timezone (recommended UTC ISO 8601), numeric precision, boolean representation, deleted/edited stimulus handling, and data-version metadata must be standardized before export implementation.

## 12. Reliability and integrity requirements

- Assignment creation must be atomic and protected against duplicate concurrent requests.
- Per-participant Post-order materialization must be atomic and idempotent, with the realized order retained for audit and export.
- Exposure and event submissions must use stable IDs or idempotency safeguards for ordinary online retries without building offline synchronization.
- Because V0 permits published edits without versioning, exports must expose the best available stimulus context and clearly document this limitation.
- Post order must be stored explicitly and snapshotted for a published configuration.
- Timer logic must use monotonic time on-device where available, not repeated subtraction from wall-clock timestamps.
- Participant-facing writes must be authorized only for that anonymous participant/session.
- Researcher data and exports require authenticated, experiment-scoped authorization.
- Database constraints should prevent impossible relationships and duplicate exposure numbers.
- Connectivity and data-collection failures must be graceful and visible. V0 does not support offline participation or synchronization and must not silently claim successful completion when required writes fail.
- All duration fields and export headers must state units, using seconds unless explicitly documented otherwise.

## 13. Intended architecture

- Researcher: Next.js with TypeScript
- Participant: React Native with Expo, Expo Router, and TypeScript
- Backend: Supabase with PostgreSQL
- Video: YouTube embedded playback
- No participant-created profile or identity system

YouTube videos must not be downloaded or hosted by this platform.

## 14. Prototype exclusions

Do not build:

- A public social network
- Followers or participant profiles
- Messaging
- Recommendation, personalization, or trending feeds
- Payments
- An advanced analytics dashboard
- Statistical analysis inside the platform
- AI features
- Custom video hosting
- Participant comment submission

## 15. Requirements to validate before implementation

1. **YouTube mobile embedding:** verify the chosen Expo-compatible embedded player can reliably seek to zero, autoplay under platform policies, expose playback/buffering state and position frequently enough, and comply with YouTube terms on iOS and Android.
2. **YouTube metadata:** decide whether duration is entered by researchers or retrieved through an approved API; validate URL variants and any API quota/key implications.
3. **Playback and comments semantics:** validate reliable buffering/stall detection and decide whether video continues behind comments; the session clock continues and panel duration is recorded separately.
4. **Anonymous identity edge cases:** define treatment of app deletion, device changes, and cleared local storage while minimizing personally identifiable information.
5. **Editable publication risk:** define warnings and minimum observation/export context for V0’s editable, unversioned published experiments.
6. **Failure details:** refine graceful online-only handling for player failures, expired study codes, failed writes, and app termination; interrupted sessions remain interrupted.
7. **Privacy and ethics:** establish consent, retention, deletion, access, de-identification, and institutional review requirements before real participant deployment.
8. **Export contract:** exact CSV/event schemas may be refined before the export milestone; finalize headers, names versus IDs, boolean/count semantics, numeric precision, timezone, and interrupted-exposure treatment before export implementation.

## 16. Success criteria for the prototype

The prototype succeeds when a researcher can publish a valid multi-condition experiment, a participant can enter its code and receive a stable condition assignment, the participant can navigate the configured mobile feed, every activation restarts video and creates an auditable exposure, only eligible active playback time is counted, configured social signals remain unchanged by behavior, and the three exports reproduce participant-level, exposure-level, and event-level data with the original stimulus URLs intact.
