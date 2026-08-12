"use client";

import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import styles from "./page.module.css";
import { hasSupabaseEnvironment, supabase } from "@/lib/supabase";
import {
  parseYouTubeShortsId,
  requireNonNegativeInteger,
  requirePositiveSeconds,
} from "@/lib/youtube";

type Experiment = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "closed" | "archived";
  session_mode: "time_controlled" | "stimulus_controlled";
  session_duration_seconds: number | null;
  time_display: TimeDisplay;
  post_order_mode: "fixed" | "per_participant_randomized";
};

type TimeDisplay =
  | "hidden"
  | "progress_only"
  | "elapsed"
  | "remaining"
  | "progress_elapsed"
  | "progress_remaining";

type Condition = {
  id: string;
  experiment_id: string;
  name: string;
  position: number;
  post_order_mode: "fixed" | "per_participant_randomized";
  time_display: TimeDisplay;
};

type Post = {
  id: string;
  experiment_id: string;
  condition_id: string;
  creator_profile_id: string | null;
  original_youtube_url: string;
  youtube_video_id: string;
  post_name: string;
  video_title: string;
  video_duration_seconds: number;
  short_description: string;
  description_source: "post_short_description";
  display_likes: number;
  display_shares: number;
  position: number;
};

type CreatorProfile = {
  id: string;
  owner_id: string;
  experiment_id: string;
  display_name: string;
  handle: string;
  profile_description: string;
  profile_image_path: string | null;
  profile_image_url: string | null;
  archived_at: string | null;
};

type SeededComment = {
  id: string;
  post_id: string;
  display_name: string;
  comment_text: string;
  display_likes: number | null;
  position: number;
};

type Notice = { kind: "success" | "error"; text: string } | null;
type YouTubeMetadata = { title: string; durationSeconds: number };
type YouTubeMetadataRequest = { videoId: string; requestId: number };
type YouTubePlayerInstance = {
  destroy: () => void;
  getDuration: () => number;
  getVideoData: () => { title?: string };
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
};
type YouTubePlayerNamespace = {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayerInstance;
};

declare global {
  interface Window {
    YT?: YouTubePlayerNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeIframeApiPromise: Promise<YouTubePlayerNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YouTubePlayerNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;
  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube metadata player did not initialize."));
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("Unable to load the YouTube metadata service."));
      document.head.appendChild(script);
    }
  });
  return youtubeIframeApiPromise;
}

const timeDisplayLabels: Record<TimeDisplay, string> = {
  hidden: "Hidden",
  progress_only: "Progress bar only",
  elapsed: "Elapsed time",
  remaining: "Remaining time",
  progress_elapsed: "Progress bar + elapsed time",
  progress_remaining: "Progress bar + remaining time",
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "Something went wrong. Please try again.";
}

export default function ResearcherApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [studyCodes, setStudyCodes] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<SeededComment[]>([]);
  const [creatorProfiles, setCreatorProfiles] = useState<CreatorProfile[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const loadWorkspace = useCallback(async (currentUser: User) => {
    const profileResult = await supabase
      .from("researcher_profiles")
      .select("user_id")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    if (profileResult.error) throw profileResult.error;
    setAuthorized(Boolean(profileResult.data));
    if (!profileResult.data) return;

    const [experimentResult, codeResult, creatorResult] = await Promise.all([
      supabase
        .from("experiments")
        .select("id,name,description,status,session_mode,session_duration_seconds,time_display,post_order_mode")
        .order("created_at", { ascending: false }),
      supabase.from("study_codes").select("experiment_id,code").eq("is_active", true),
      supabase.from("creator_profiles").select("id,owner_id,experiment_id,display_name,handle,profile_description,profile_image_path,archived_at").is("archived_at", null).order("display_name"),
    ]);
    if (experimentResult.error) throw experimentResult.error;
    if (codeResult.error) throw codeResult.error;
    if (creatorResult.error) throw creatorResult.error;
    setExperiments(experimentResult.data as Experiment[]);
    setStudyCodes(Object.fromEntries(codeResult.data.map((row) => [row.experiment_id, row.code])));
    const creatorsWithImages = await Promise.all(creatorResult.data.map(async (profile) => {
      if (!profile.profile_image_path) return { ...profile, profile_image_url: null };
      const { data } = await supabase.storage.from("creator-images").createSignedUrl(profile.profile_image_path, 3600);
      return { ...profile, profile_image_url: data?.signedUrl ?? null };
    }));
    setCreatorProfiles(creatorsWithImages as CreatorProfile[]);
  }, []);

  const loadExperiment = useCallback(async (experimentId: string) => {
    const conditionResult = await supabase
      .from("conditions")
      .select("id,experiment_id,name,position,post_order_mode,time_display")
      .eq("experiment_id", experimentId)
      .order("position");
    if (conditionResult.error) throw conditionResult.error;
    const nextConditions = conditionResult.data as Condition[];
    setConditions(nextConditions);

    const conditionIds = nextConditions.map((condition) => condition.id);
    if (!conditionIds.length) {
      setPosts([]);
      setComments([]);
      return;
    }
    const postResult = await supabase
      .from("posts")
      .select("*")
      .in("condition_id", conditionIds)
      .order("position");
    if (postResult.error) throw postResult.error;
    const nextPosts = postResult.data as Post[];
    setPosts(nextPosts);

    const postIds = nextPosts.map((post) => post.id);
    if (!postIds.length) {
      setComments([]);
      return;
    }
    const commentResult = await supabase
      .from("seeded_comments")
      .select("id,post_id,display_name,comment_text,display_likes,position")
      .in("post_id", postIds)
      .order("position");
    if (commentResult.error) throw commentResult.error;
    setComments(commentResult.data as SeededComment[]);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    await loadWorkspace(user);
    if (selectedId) await loadExperiment(selectedId);
  }, [loadExperiment, loadWorkspace, selectedId, user]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
      if (data.session?.user) {
        void loadWorkspace(data.session.user).catch((error) =>
          setNotice({ kind: "error", text: errorMessage(error) }),
        );
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (session?.user) {
        void loadWorkspace(session.user).catch((error) =>
          setNotice({ kind: "error", text: errorMessage(error) }),
        );
      }
      if (!session) {
        setAuthorized(false);
        setExperiments([]);
        setSelectedId(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [loadWorkspace]);

  const runAction = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice({ kind: "success", text: success });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const selectExperiment = (experimentId: string) => {
    setSelectedId(experimentId);
    void loadExperiment(experimentId).catch((error) =>
      setNotice({ kind: "error", text: errorMessage(error) }),
    );
  };

  const selectedExperiment = experiments.find((experiment) => experiment.id === selectedId);

  if (!hasSupabaseEnvironment) {
    return <SetupMessage />;
  }
  if (authLoading) {
    return <main className={styles.centered}>Loading researcher workspace…</main>;
  }
  if (!user) {
    return <Login />;
  }
  if (!authorized) {
    return (
      <main className={styles.centered}>
        <section className={styles.authCard}>
          <p className={styles.eyebrow}>Access restricted</p>
          <h1>This account is not provisioned as a researcher.</h1>
          <p>Researcher access must be granted by an administrator.</p>
          <button type="button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar}>
        <div>
          <p className={styles.brandMark}>FA</p>
          <p className={styles.brandName}>Fragmented Attention</p>
          <p className={styles.brandSub}>Created by Sang Jung Kim</p>
        </div>
        <nav className={styles.nav} aria-label="Researcher sections">
          <button className={styles.navActive} type="button">
            Native Shorts Exposure Experiment Platform
          </button>
        </nav>
        <div className={styles.account}>
          <span>{user.email}</span>
          <button type="button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className={styles.workspace}>
        {notice && <div className={notice.kind === "error" ? styles.error : styles.success}>{notice.text}</div>}
        <div className={styles.experimentLayout}>
            <ExperimentList
              busy={busy}
              experiments={experiments}
              selectedId={selectedId}
              onSelect={selectExperiment}
              ownerId={user.id}
              runAction={runAction}
            />
            {selectedExperiment ? (
              <ExperimentEditor
                key={selectedExperiment.id}
                busy={busy}
                experiment={selectedExperiment}
                studyCode={studyCodes[selectedExperiment.id] ?? null}
                conditions={conditions}
                posts={posts}
                comments={comments}
                creatorProfiles={creatorProfiles}
                ownerId={user.id}
                runAction={runAction}
                onPermanentlyDeleted={() => setSelectedId(null)}
              />
            ) : (
              <section className={styles.emptyState}>
                <p className={styles.eyebrow}>Draft workspace</p>
                <h1>Select an experiment</h1>
                <p>Choose a draft from the left, or create your first experiment.</p>
              </section>
            )}
        </div>
      </main>
    </div>
  );
}

function SetupMessage() {
  return (
    <main className={styles.centered}>
      <section className={styles.authCard}>
        <p className={styles.eyebrow}>Configuration needed</p>
        <h1>Supabase environment variables are missing.</h1>
        <p>Copy the researcher web environment example to `.env.local`, then restart Next.js.</p>
      </section>
    </main>
  );
}

function Login() {
  const [email, setEmail] = useState("researcher@example.test");
  const [password, setPassword] = useState("Researcher123!");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    setLoading(false);
  };

  return (
    <main className={styles.loginPage}>
      <section className={styles.loginIntro}>
        <p className={styles.eyebrow}>Scientific authoring environment</p>
        <h1>Study short-video exposure in a controlled, realistic social media environment.</h1>
        <p>Create Experimental Conditions, Add YouTube Shorts, and Track Participant Engagement</p>
      </section>
      <form className={styles.authCard} onSubmit={submit}>
        <p className={styles.eyebrow}>Researcher sign in</p>
        <h2>Welcome back</h2>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {message && <p className={styles.formError}>{message}</p>}
        <button disabled={loading} type="submit">
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className={styles.helper}>The development account is prefilled for local testing.</p>
      </form>
    </main>
  );
}

function ExperimentList({
  experiments,
  selectedId,
  onSelect,
  ownerId,
  busy,
  runAction,
}: {
  experiments: Experiment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  ownerId: string;
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Experiment["session_mode"]>("stimulus_controlled");

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await runAction(async () => {
      const { data, error } = await supabase
        .from("experiments")
        .insert({
          owner_id: ownerId,
          name: name.trim(),
          session_mode: mode,
          session_duration_seconds: mode === "time_controlled" ? 300 : null,
          time_display: "hidden",
          post_order_mode: "fixed",
        })
        .select("id")
        .single();
      if (error) throw error;
      setName("");
      setCreating(false);
      onSelect(data.id);
    }, "Experiment created.");
  };

  return (
    <section className={styles.listPanel}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Studies</p>
          <h2>Experiments</h2>
        </div>
        <button className={styles.compactButton} onClick={() => setCreating(!creating)} type="button">
          {creating ? "Cancel" : "+ New"}
        </button>
      </div>
      {creating && (
        <form className={styles.inlineForm} onSubmit={create}>
          <label>
            Experiment name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Session structure
            <select value={mode} onChange={(event) => setMode(event.target.value as Experiment["session_mode"])}>
              <option value="stimulus_controlled">Stimulus-controlled</option>
              <option value="time_controlled">Time-controlled</option>
            </select>
          </label>
          <button disabled={busy} type="submit">Create draft</button>
        </form>
      )}
      <div className={styles.experimentList}>
        {experiments.map((experiment) => (
          <button
            className={selectedId === experiment.id ? styles.experimentActive : styles.experimentItem}
            key={experiment.id}
            onClick={() => onSelect(experiment.id)}
            type="button"
          >
            <span>{experiment.name}</span>
            <small>{experiment.status} · {experiment.session_mode === "time_controlled" ? "timed" : "stimulus"}</small>
          </button>
        ))}
        {!experiments.length && <p className={styles.muted}>No experiments yet.</p>}
      </div>
    </section>
  );
}

function CreatorProfilesEditor({ creatorProfiles, ownerId, experimentId, busy, runAction }: {
  creatorProfiles: CreatorProfile[];
  ownerId: string;
  experimentId: string;
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const normalizedHandle = handle.trim().replace(/^@/, "");
      if (!displayName.trim() || !normalizedHandle) throw new Error("Creator display name and handle are required.");
      let profileImagePath: string | null = null;
      if (image) {
        const extension = image.name.split(".").pop()?.toLowerCase() || "jpg";
        profileImagePath = `${ownerId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("creator-images").upload(profileImagePath, image, { contentType: image.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { error } = await supabase.from("creator_profiles").insert({
        owner_id: ownerId,
        experiment_id: experimentId,
        display_name: displayName.trim(),
        handle: normalizedHandle,
        profile_description: description.trim(),
        profile_image_path: profileImagePath,
      });
      if (error) {
        if (profileImagePath) await supabase.storage.from("creator-images").remove([profileImagePath]);
        throw error;
      }
      setDisplayName(""); setHandle(""); setDescription(""); setImage(null);
    }, "Reusable creator profile created.");
  };

  return (
    <section className={styles.settingsCard}>
      <div className={styles.sectionHeading}><div><h2>Creator profiles</h2><p>Create identities reusable across Posts in this experiment.</p></div></div>
      <div className={styles.creatorGrid}>
        {creatorProfiles.map((profile) => (
          <article className={styles.creatorCard} key={profile.id}>
            {profile.profile_image_url
              ? <span className={styles.creatorPhoto} style={{ backgroundImage: `url(${profile.profile_image_url})` }} />
              : <span className={styles.creatorFallback}>{profile.display_name.slice(0, 1).toUpperCase()}</span>}
            <div><strong>{profile.display_name}</strong><small>@{profile.handle.replace(/^@/, "")}</small>{profile.profile_description && <p>{profile.profile_description}</p>}</div>
            <button className={styles.dangerButton} disabled={busy} type="button" onClick={() => {
              if (!window.confirm(`Delete creator profile “${profile.display_name}”? Historical publication records and its stored image will be retained.`)) return;
              void runAction(async () => {
                const { error } = await supabase.from("creator_profiles").update({ archived_at: new Date().toISOString() }).eq("id", profile.id);
                if (error) throw error;
              }, "Creator profile deleted from active authoring. Historical records were retained.");
            }}>Delete</button>
          </article>
        ))}
        {!creatorProfiles.length && <p className={styles.muted}>No creator profiles yet.</p>}
      </div>
      <form className={styles.creatorForm} onSubmit={create}>
        <input aria-label="Creator display name" placeholder="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        <input aria-label="Creator handle" placeholder="Handle" value={handle} onChange={(event) => setHandle(event.target.value)} required />
        <input aria-label="Creator profile description" placeholder="Profile description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
        <label className={styles.fileField}>Profile image (optional)<input accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label>
        <button disabled={busy} type="submit">Create profile</button>
      </form>
    </section>
  );
}

function ExperimentEditor({
  experiment,
  studyCode,
  conditions,
  posts,
  comments,
  creatorProfiles,
  ownerId,
  busy,
  runAction,
  onPermanentlyDeleted,
}: {
  experiment: Experiment;
  studyCode: string | null;
  conditions: Condition[];
  posts: Post[];
  comments: SeededComment[];
  creatorProfiles: CreatorProfile[];
  ownerId: string;
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
  onPermanentlyDeleted: () => void;
}) {
  const [name, setName] = useState(experiment.name);
  const [editingExperimentName, setEditingExperimentName] = useState(false);
  const [description, setDescription] = useState(experiment.description);
  const [mode, setMode] = useState(experiment.session_mode);
  const [duration, setDuration] = useState(String(experiment.session_duration_seconds ?? 300));
  const [newCondition, setNewCondition] = useState("");
  const [previewConditionId, setPreviewConditionId] = useState<string | null>(null);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [permanentDeleteName, setPermanentDeleteName] = useState("");
  const experimentCreatorProfiles = creatorProfiles.filter((profile) => profile.experiment_id === experiment.id);

  const downloadSampleParticipantCsv = () => {
    const headers = ["participant_id", "condition_id", "condition", "session_status", "post_name", "video_title", "youtube_video_id", "original_youtube_url", "presentation_position", "like_final", "like_ever", "reposted_final", "repost_ever", "comments_opened_count", "comment_submitted", "participant_comment_count", "any_affordance_interaction"];
    const sampleRows = [
      ["sample-participant-01", "sample-condition-a", "Control", "completed", "Sample Post A", "Sample video A", "l0un24OLf_8", "https://www.youtube.com/shorts/l0un24OLf_8?feature=share", 1, true, true, false, false, 1, false, 0, true],
      ["sample-participant-01", "sample-condition-a", "Control", "completed", "Sample Post B", "Sample video B", "SZJS4EohvMg", "https://www.youtube.com/shorts/SZJS4EohvMg?feature=share", 2, false, false, true, true, 0, false, 0, true],
      ["sample-participant-02", "sample-condition-b", "High social signals", "completed", "Sample Post A", "Sample video A", "l0un24OLf_8", "https://www.youtube.com/shorts/l0un24OLf_8?feature=share", 2, false, true, false, false, 2, true, 1, true],
      ["sample-participant-02", "sample-condition-b", "High social signals", "completed", "Sample Post C", "Sample video C", "2VWoUEoe0dU", "https://www.youtube.com/shorts/2VWoUEoe0dU?feature=share", 1, false, false, false, false, 0, false, 0, false],
      ["sample-participant-03", "sample-condition-a", "Control", "interrupted", "Sample Post A", "Sample video A", "l0un24OLf_8", "https://www.youtube.com/shorts/l0un24OLf_8?feature=share", 1, false, false, false, true, 1, false, 0, true],
      ["sample-participant-03", "sample-condition-a", "Control", "interrupted", "Sample Post B", "Sample video B", "SZJS4EohvMg", "https://www.youtube.com/shorts/SZJS4EohvMg?feature=share", 2, true, true, true, true, 3, true, 2, true],
      ["sample-participant-04", "sample-condition-b", "High social signals", "active", "Sample Post B", "Sample video B", "SZJS4EohvMg", "https://www.youtube.com/shorts/SZJS4EohvMg?feature=share", 1, false, false, false, false, 1, false, 0, true],
      ["sample-participant-04", "sample-condition-b", "High social signals", "active", "Sample Post C", "Sample video C", "2VWoUEoe0dU", "https://www.youtube.com/shorts/2VWoUEoe0dU?feature=share", 2, true, true, false, true, 0, false, 0, true],
      ["sample-participant-05", "sample-condition-a", "Control", "completed", "Sample Post B", "Sample video B", "SZJS4EohvMg", "https://www.youtube.com/shorts/SZJS4EohvMg?feature=share", 2, false, false, false, false, 0, false, 0, false],
      ["sample-participant-05", "sample-condition-a", "Control", "completed", "Sample Post C", "Sample video C", "2VWoUEoe0dU", "https://www.youtube.com/shorts/2VWoUEoe0dU?feature=share", 1, true, true, true, true, 2, true, 1, true],
    ];
    const escapeCsv = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = `\uFEFF${[headers, ...sampleRows].map((row) => row.map(escapeCsv).join(",")).join("\n")}\n`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "SAMPLE_DO_NOT_ANALYZE_participant_engagement.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadParticipantCsv = async () => {
    await runAction(async () => {
      const sessionResult = await supabase.from("sessions").select("id,participant_id,publication_snapshot_id,publication_condition_id,status").eq("experiment_id", experiment.id);
      if (sessionResult.error) throw sessionResult.error;
      const sessionIds = sessionResult.data.map((row) => row.id);
      if (!sessionIds.length) throw new Error("No participant sessions are available yet.");
      const snapshotIds = [...new Set(sessionResult.data.map((row) => row.publication_snapshot_id))];
      const conditionIds = [...new Set(sessionResult.data.map((row) => row.publication_condition_id))];
      const [orderResult, eventResult, stateResult, participantCommentResult, postResult, conditionResult] = await Promise.all([
        supabase.from("session_post_order").select("session_id,publication_post_id,presentation_position").in("session_id", sessionIds),
        supabase.from("behavior_events").select("session_id,publication_post_id,event_type").in("session_id", sessionIds),
        supabase.from("participant_post_state").select("session_id,publication_post_id,liked,reposted,comments_opened_count").in("session_id", sessionIds),
        supabase.from("participant_comments").select("session_id,publication_post_id").in("session_id", sessionIds),
        supabase.from("publication_posts").select("id,publication_snapshot_id,post_name,video_title,youtube_video_id,original_youtube_url").in("publication_snapshot_id", snapshotIds),
        supabase.from("publication_conditions").select("id,name").in("id", conditionIds),
      ]);
      for (const result of [orderResult, eventResult, stateResult, participantCommentResult, postResult, conditionResult]) if (result.error) throw result.error;
      const orderRows = orderResult.data ?? [];
      const eventRows = eventResult.data ?? [];
      const stateRows = stateResult.data ?? [];
      const postRows = postResult.data ?? [];
      const conditionRows = conditionResult.data ?? [];
      const sessionById = new Map(sessionResult.data.map((row) => [row.id, row]));
      const postById = new Map(postRows.map((row) => [row.id, row]));
      const conditionById = new Map(conditionRows.map((row) => [row.id, row.name]));
      const stateByKey = new Map(stateRows.map((row) => [`${row.session_id}:${row.publication_post_id}`, row]));
      const participantCommentCountByKey = new Map<string, number>();
      for (const comment of participantCommentResult.data ?? []) {
        const key = `${comment.session_id}:${comment.publication_post_id}`;
        participantCommentCountByKey.set(key, (participantCommentCountByKey.get(key) ?? 0) + 1);
      }
      const eventsByKey = new Map<string, Set<string>>();
      for (const event of eventRows) {
        if (!event.publication_post_id) continue;
        const key = `${event.session_id}:${event.publication_post_id}`;
        const eventTypes = eventsByKey.get(key) ?? new Set<string>();
        eventTypes.add(event.event_type);
        eventsByKey.set(key, eventTypes);
      }
      const headers = ["participant_id", "condition_id", "condition", "session_status", "post_name", "video_title", "youtube_video_id", "original_youtube_url", "presentation_position", "like_final", "like_ever", "reposted_final", "repost_ever", "comments_opened_count", "comment_submitted", "participant_comment_count", "any_affordance_interaction"];
      const rows = orderRows.flatMap((order) => {
        const key = `${order.session_id}:${order.publication_post_id}`;
        const eventTypes = eventsByKey.get(key) ?? new Set<string>();
        if (!eventTypes.has("post_activated")) return [];
        const sessionRow = sessionById.get(order.session_id)!;
        const postRow = postById.get(order.publication_post_id)!;
        const stateRow = stateByKey.get(key);
        const likeEver = eventTypes.has("like");
        const repostEver = eventTypes.has("share_tapped");
        const commentsOpened = Number(stateRow?.comments_opened_count ?? 0);
        const participantCommentCount = participantCommentCountByKey.get(key) ?? 0;
        const commentSubmitted = participantCommentCount > 0;
        return [[sessionRow.participant_id, sessionRow.publication_condition_id, conditionById.get(sessionRow.publication_condition_id) ?? "", sessionRow.status, postRow.post_name, postRow.video_title, postRow.youtube_video_id, postRow.original_youtube_url, order.presentation_position + 1, Boolean(stateRow?.liked), likeEver, Boolean(stateRow?.reposted), repostEver, commentsOpened, commentSubmitted, participantCommentCount, likeEver || repostEver || commentsOpened > 0 || commentSubmitted]];
      });
      if (!rows.length) throw new Error("No activated Posts are available yet. Complete a new participant feed session first.");
      const escapeCsv = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
      const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      link.download = `participant_engagement_${experiment.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "experiment"}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, "Preliminary participant CSV downloaded.");
  };

  const downloadParticipantCommentsCsv = async () => {
    await runAction(async () => {
      const commentResult = await supabase.from("participant_comments")
        .select("session_id,participant_id,publication_condition_id,publication_post_id,comment_text,session_elapsed_seconds,created_at")
        .eq("experiment_id", experiment.id)
        .order("created_at");
      if (commentResult.error) throw commentResult.error;
      if (!commentResult.data.length) throw new Error("No participant-submitted comments are available yet.");
      const postIds = [...new Set(commentResult.data.map((row) => row.publication_post_id))];
      const conditionIds = [...new Set(commentResult.data.map((row) => row.publication_condition_id))];
      const sessionIds = [...new Set(commentResult.data.map((row) => row.session_id))];
      const [postResult, conditionResult, orderResult] = await Promise.all([
        supabase.from("publication_posts").select("id,post_name,video_title,youtube_video_id,original_youtube_url").in("id", postIds),
        supabase.from("publication_conditions").select("id,name").in("id", conditionIds),
        supabase.from("session_post_order").select("session_id,publication_post_id,presentation_position").in("session_id", sessionIds),
      ]);
      for (const result of [postResult, conditionResult, orderResult]) if (result.error) throw result.error;
      const postById = new Map((postResult.data ?? []).map((row) => [row.id, row]));
      const conditionById = new Map((conditionResult.data ?? []).map((row) => [row.id, row.name]));
      const positionByKey = new Map((orderResult.data ?? []).map((row) => [`${row.session_id}:${row.publication_post_id}`, row.presentation_position + 1]));
      const sequenceByKey = new Map<string, number>();
      const headers = ["participant_id", "condition_id", "condition", "post_name", "video_title", "youtube_video_id", "original_youtube_url", "presentation_position", "comment_number", "comment_text", "submitted_at", "session_elapsed_seconds"];
      const rows = commentResult.data.map((comment) => {
        const key = `${comment.session_id}:${comment.publication_post_id}`;
        const commentNumber = (sequenceByKey.get(key) ?? 0) + 1;
        sequenceByKey.set(key, commentNumber);
        const post = postById.get(comment.publication_post_id)!;
        return [comment.participant_id, comment.publication_condition_id, conditionById.get(comment.publication_condition_id) ?? "", post.post_name, post.video_title, post.youtube_video_id, post.original_youtube_url, positionByKey.get(key) ?? "", commentNumber, comment.comment_text, comment.created_at, comment.session_elapsed_seconds];
      });
      const escapeCsv = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
      const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      link.download = `participant_comments_${experiment.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "experiment"}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    }, "Participant comments CSV downloaded.");
  };

  const saveExperiment = async (event: FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const durationSeconds = mode === "time_controlled" ? requirePositiveSeconds(duration) : null;
      const { error } = await supabase
        .from("experiments")
        .update({
          name: name.trim(),
          description,
          session_mode: mode,
          session_duration_seconds: durationSeconds,
          time_display: "hidden",
        })
        .eq("id", experiment.id);
      if (error) throw error;
    }, "Experiment settings saved.");
  };

  const addCondition = async (event: FormEvent) => {
    event.preventDefault();
    if (!newCondition.trim()) return;
    await runAction(async () => {
      const nextPosition = conditions.length ? Math.max(...conditions.map((item) => item.position)) + 1 : 0;
      const { error } = await supabase.from("conditions").insert({
        experiment_id: experiment.id,
        name: newCondition.trim(),
        position: nextPosition,
        post_order_mode: "fixed",
        time_display: "hidden",
      });
      if (error) throw error;
      setNewCondition("");
    }, "Condition added.");
  };

  return (
    <section className={styles.editor}>
      <header className={styles.editorHeader}>
        <div>
          <p className={styles.eyebrow}>Draft experiment</p>
          {editingExperimentName ? (
            <div className={styles.experimentNameEditor}>
              <input aria-label="Experiment name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
              <button type="button" onClick={() => { setName(experiment.name); setEditingExperimentName(false); }}>Cancel</button>
              <button disabled={busy || !name.trim()} type="button" onClick={() => void runAction(async () => {
                const { error } = await supabase.from("experiments").update({ name: name.trim() }).eq("id", experiment.id);
                if (error) throw error;
                setEditingExperimentName(false);
              }, "Experiment name saved.")}>Save</button>
            </div>
          ) : (
            <div className={styles.experimentTitleRow}><h1>{experiment.name}</h1><button type="button" onClick={() => setEditingExperimentName(true)}>Edit name</button></div>
          )}
        </div>
        <div className={styles.publishActions}>
          {studyCode && <span className={styles.studyCode}>Study code <strong>{studyCode}</strong></span>}
          <span className={styles.statusBadge}>{experiment.status}</span>
          <button title="Fictional demonstration data: exactly 10 rows, never participant records" type="button" onClick={downloadSampleParticipantCsv}>Download sample engagement CSV (10 rows)</button>
          <button disabled={busy} title="One row per participant × activated Post" type="button" onClick={() => void downloadParticipantCsv()}>Download participant engagement CSV</button>
          <button disabled={busy} title="Long-form export with one row per participant-submitted comment" type="button" onClick={() => void downloadParticipantCommentsCsv()}>Download participant comments CSV</button>
          <button disabled={busy || experiment.status === "archived"} type="button" onClick={() => {
            const warning = experiment.status === "published"
              ? "V0 has no researcher-facing version history. Republish the current configuration and replace the active study code? Existing assigned participants keep their prior snapshot."
              : "Publish this experiment and create its study code?";
            if (!window.confirm(warning)) return;
            void runAction(async () => {
              const { error } = await supabase.rpc("publish_experiment", { target_experiment_id: experiment.id });
              if (error) throw error;
            }, experiment.status === "published" ? "Experiment republished with a new active study code." : "Experiment published. Study code created.");
          }}>
            {experiment.status === "archived" ? "Archived" : experiment.status === "published" ? "Republish" : "Publish"}
          </button>
          <button className={styles.dangerButton} disabled={busy || experiment.status === "archived"} type="button" onClick={() => {
            if (!window.confirm("This will stop participant sessions and deactivate the study code. Existing research records will be preserved. Would you like to continue?")) return;
            void runAction(async () => {
              const { error } = await supabase.rpc("deactivate_experiment", { target_experiment_id: experiment.id });
              if (error) throw error;
            }, "Study deactivated. Codes and active participant sessions are no longer usable.");
          }}>{experiment.status === "archived" ? "Study deactivated" : "Stop sessions / deactivate study"}</button>
          <button className={styles.permanentDeleteButton} disabled={busy} type="button" title="Available only for experiments that have never been published" onClick={() => { setPermanentDeleteName(""); setPermanentDeleteOpen(true); }}>Permanently delete</button>
        </div>
      </header>

      {permanentDeleteOpen && (
        <div className={styles.confirmBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPermanentDeleteOpen(false); }}>
          <section aria-labelledby="permanent-delete-title" aria-modal="true" className={styles.confirmDialog} role="dialog">
            <h2 id="permanent-delete-title">Permanently delete experiment?</h2>
            <p>This permanently removes the unpublished experiment and all of its draft conditions, Posts, comments, and creator profiles. It cannot be undone.</p>
            <p>Type <strong>{experiment.name}</strong> to continue.</p>
            <input autoFocus aria-label="Exact experiment name" value={permanentDeleteName} onChange={(event) => setPermanentDeleteName(event.target.value)} />
            <div className={styles.formActions}>
              <button type="button" onClick={() => setPermanentDeleteOpen(false)}>Cancel</button>
              <button className={styles.permanentDeleteButton} disabled={busy || permanentDeleteName !== experiment.name} type="button" onClick={() => void runAction(async () => {
                const { error } = await supabase.rpc("permanently_delete_unpublished_experiment", { target_experiment_id: experiment.id });
                if (error) throw error;
                setPermanentDeleteOpen(false);
                onPermanentlyDeleted();
              }, "Unpublished experiment permanently deleted.")}>Delete permanently</button>
            </div>
          </section>
        </div>
      )}

      {experiment.status === "published" && (
        <p className={styles.publicationWarning}>V0 allows editing after publication and has no researcher-facing version history. Republish to make later edits available to new participants; already assigned participants retain their original snapshot.</p>
      )}

      <form className={styles.settingsCard} onSubmit={saveExperiment}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Session settings</h2>
            <p>Define the participant’s finite attention environment.</p>
          </div>
          <button disabled={busy} type="submit">Save settings</button>
        </div>
        <div className={styles.formGrid}>
          <label>
            Experiment name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Session structure
            <select value={mode} onChange={(event) => setMode(event.target.value as Experiment["session_mode"])}>
              <option value="stimulus_controlled">Stimulus-controlled</option>
              <option value="time_controlled">Time-controlled</option>
            </select>
          </label>
          {mode === "time_controlled" && (
            <>
              <label>
                Total duration (seconds)
                <input type="number" min="0.001" step="0.001" value={duration} onChange={(event) => setDuration(event.target.value)} required />
              </label>
            </>
          )}
          <label className={styles.fullField}>
            Internal description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
        </div>
      </form>

      <CreatorProfilesEditor creatorProfiles={experimentCreatorProfiles} ownerId={ownerId} experimentId={experiment.id} busy={busy} runAction={runAction} />

      <div className={styles.sectionHeading}>
        <div>
          <h2>Conditions and Posts</h2>
          <p>Posts appear in their numbered presentation order.</p>
        </div>
        <form className={styles.quickAdd} onSubmit={addCondition}>
          <input placeholder="New condition name" value={newCondition} onChange={(event) => setNewCondition(event.target.value)} required />
          <button disabled={busy} type="submit">Add condition</button>
        </form>
      </div>

      {!conditions.length && <div className={styles.emptyCard}>Add at least one experimental condition.</div>}
      {conditions.map((condition) => (
        <ConditionCard
          key={condition.id}
          condition={condition}
          posts={posts.filter((post) => post.condition_id === condition.id).sort((a, b) => a.position - b.position)}
          comments={comments}
          creatorProfiles={experimentCreatorProfiles}
          busy={busy}
          timeControlled={experiment.session_mode === "time_controlled"}
          runAction={runAction}
          onPreview={() => setPreviewConditionId(condition.id)}
        />
      ))}
      {previewConditionId && (
        <ConditionPreview
          condition={conditions.find((item) => item.id === previewConditionId)!}
          posts={posts
            .filter((post) => post.condition_id === previewConditionId)
            .sort((a, b) => a.position - b.position)}
          comments={comments}
          creatorProfiles={experimentCreatorProfiles}
          postOrderMode={conditions.find((item) => item.id === previewConditionId)!.post_order_mode}
          sessionDurationSeconds={experiment.session_duration_seconds}
          onClose={() => setPreviewConditionId(null)}
        />
      )}
    </section>
  );
}

function ConditionCard({ condition, posts, comments, creatorProfiles, busy, timeControlled, runAction, onPreview }: {
  condition: Condition;
  posts: Post[];
  comments: SeededComment[];
  creatorProfiles: CreatorProfile[];
  busy: boolean;
  timeControlled: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
  onPreview: () => void;
}) {
  const [name, setName] = useState(condition.name);
  const [addingPost, setAddingPost] = useState(false);

  return (
    <article className={styles.conditionCard}>
      <div className={styles.conditionHeader}>
        <div className={styles.conditionTitle}>
          <span>{condition.position + 1}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Condition name" />
          <button type="button" disabled={busy || !name.trim()} onClick={() => runAction(async () => {
            const { error } = await supabase.from("conditions").update({ name: name.trim() }).eq("id", condition.id);
            if (error) throw error;
          }, "Condition renamed.")}>Save</button>
        </div>
        <div className={styles.rowActions}>
          {timeControlled && (
            <label className={styles.conditionTimeDisplay}>
              <span>Time display</span>
              <select
                aria-label={`${condition.name} participant time display`}
                value={condition.time_display}
                disabled={busy}
                onChange={(event) => {
                  const nextDisplay = event.target.value as TimeDisplay;
                  void runAction(async () => {
                    const { error } = await supabase.from("conditions")
                      .update({ time_display: nextDisplay })
                      .eq("id", condition.id);
                    if (error) throw error;
                  }, `Time display set to ${timeDisplayLabels[nextDisplay]} for this condition.`);
                }}
              >
                {Object.entries(timeDisplayLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          )}
          <button
            className={condition.post_order_mode === "per_participant_randomized" ? styles.shuffleActive : ""}
            type="button"
            aria-pressed={condition.post_order_mode === "per_participant_randomized"}
            title={condition.post_order_mode === "per_participant_randomized"
              ? "Each participant receives one persisted random order"
              : "Participants follow the researcher-defined order"}
            disabled={busy}
            onClick={() => runAction(async () => {
              const nextMode = condition.post_order_mode === "fixed"
                ? "per_participant_randomized"
                : "fixed";
              const { error } = await supabase.from("conditions")
                .update({ post_order_mode: nextMode })
                .eq("id", condition.id);
              if (error) throw error;
            }, condition.post_order_mode === "fixed"
              ? "Per-participant shuffle enabled for this condition."
              : "Researcher-defined order restored for this condition.")}
          >
            {condition.post_order_mode === "per_participant_randomized" ? "Shuffle on ✓" : "Shuffle off"}
          </button>
          <button type="button" onClick={onPreview}>Preview</button>
          <button type="button" disabled={busy} onClick={() => runAction(async () => {
            const { error } = await supabase.rpc("duplicate_condition", { source_condition_id: condition.id });
            if (error) throw error;
          }, "Condition and its Posts duplicated.")}>Duplicate</button>
          <button className={styles.dangerButton} type="button" disabled={busy} onClick={() => {
            if (!window.confirm(`Delete “${condition.name}” and all of its Posts?`)) return;
            void runAction(async () => {
              const { error } = await supabase.from("conditions").delete().eq("id", condition.id);
              if (error) throw error;
            }, "Condition deleted.");
          }}>Delete</button>
        </div>
      </div>

      <div className={styles.postList}>
        {posts.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            displayPosition={index + 1}
            first={index === 0}
            last={index === posts.length - 1}
            comments={comments.filter((comment) => comment.post_id === post.id).sort((a, b) => a.position - b.position)}
            creatorProfiles={creatorProfiles}
            busy={busy}
            runAction={runAction}
          />
        ))}
        {!posts.length && <p className={styles.muted}>No Posts in this condition.</p>}
      </div>

      {addingPost ? (
        <PostForm
          condition={condition}
          position={posts.length ? Math.max(...posts.map((post) => post.position)) + 1 : 0}
          busy={busy}
          creatorProfiles={creatorProfiles}
          onCancel={() => setAddingPost(false)}
          runAction={runAction}
        />
      ) : (
        <button className={styles.addPostButton} type="button" onClick={() => setAddingPost(true)}>
          + Add Post
        </button>
      )}
    </article>
  );
}

function ConditionPreview({ condition, posts, comments, creatorProfiles, postOrderMode, sessionDurationSeconds, onClose }: {
  condition: Condition;
  posts: Post[];
  comments: SeededComment[];
  creatorProfiles: CreatorProfile[];
  postOrderMode: Experiment["post_order_mode"];
  sessionDurationSeconds: number | null;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [previewPosts, setPreviewPosts] = useState(posts);
  const [previewElapsedSeconds, setPreviewElapsedSeconds] = useState(0);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(() => new Set());
  const [repostedPostIds, setRepostedPostIds] = useState<Set<string>>(() => new Set());
  const activePost = previewPosts[activeIndex];
  const activeCreator = creatorProfiles.find((profile) => profile.id === activePost?.creator_profile_id);
  const activeComments = activePost
    ? comments.filter((comment) => comment.post_id === activePost.id).sort((a, b) => a.position - b.position)
    : [];

  useEffect(() => {
    if (sessionDurationSeconds === null) return;
    const timer = window.setInterval(() => {
      setPreviewElapsedSeconds((current) => Math.min(sessionDurationSeconds, current + 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sessionDurationSeconds]);

  const move = (direction: -1 | 1) => {
    const next = activeIndex + direction;
    if (next < 0 || next >= previewPosts.length) return;
    setActiveIndex(next);
    setCommentsOpen(false);
  };

  const shufflePreview = () => {
    const shuffled = [...posts];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const values = new Uint32Array(1);
      crypto.getRandomValues(values);
      const swapIndex = values[0] % (index + 1);
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    setPreviewPosts(shuffled);
    setActiveIndex(0);
    setCommentsOpen(false);
  };

  const toggleLocalState = (
    postId: string,
    setter: Dispatch<SetStateAction<Set<string>>>,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" aria-label={`${condition.name} preview`}>
      <section className={styles.previewPanel}>
        <header className={styles.previewHeader}>
          <div>
            <p className={styles.eyebrow}>Researcher preview · no data recorded</p>
            <h2>{condition.name}</h2>
          </div>
          <button type="button" onClick={onClose}>Close preview</button>
        </header>
        <div className={styles.previewBody}>
          <div className={styles.phonePreview}>
            {!activePost ? (
              <div className={styles.previewEmpty}>Add a Post to preview this condition.</div>
            ) : (
              <>
                <PreviewYouTubePlayer
                  key={activePost.id}
                  videoId={activePost.youtube_video_id}
                  title={`Preview Post ${activeIndex + 1}`}
                />
                <div className={styles.previewMaskTop} />
                <div className={styles.previewMaskBottom} />
                <PreviewTimeDisplay
                  mode={condition.time_display}
                  sessionDurationSeconds={sessionDurationSeconds}
                  elapsedSeconds={previewElapsedSeconds}
                />
                <div className={styles.previewSocial} aria-label="Configured social signals">
                  <button
                    className={likedPostIds.has(activePost.id) ? styles.previewSocialSelected : ""}
                    type="button"
                    aria-label={likedPostIds.has(activePost.id) ? "Unlike in preview" : "Like in preview"}
                    aria-pressed={likedPostIds.has(activePost.id)}
                    onClick={() => toggleLocalState(activePost.id, setLikedPostIds)}
                  >
                    <span>♥</span><small>{(activePost.display_likes + (likedPostIds.has(activePost.id) ? 1 : 0)).toLocaleString()}</small>
                  </button>
                  <button
                    type="button"
                    aria-label="Open seeded comments in preview"
                    onClick={() => setCommentsOpen(true)}
                  >
                    <svg
                      className={styles.previewCommentIcon}
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2.25a9.75 9.75 0 0 0-4.1 18.6 9.7 9.7 0 0 0 7.75-.1L22 22l-1.8-6.05A9.75 9.75 0 0 0 12 2.25Z" />
                    </svg>
                    <small>{activeComments.length}</small>
                  </button>
                  <button
                    className={repostedPostIds.has(activePost.id) ? styles.previewSocialSelected : ""}
                    type="button"
                    aria-label={repostedPostIds.has(activePost.id) ? "Undo repost in preview" : "Repost in preview"}
                    aria-pressed={repostedPostIds.has(activePost.id)}
                    onClick={() => toggleLocalState(activePost.id, setRepostedPostIds)}
                  >
                    <span className={styles.previewRepostIcon}>↻{repostedPostIds.has(activePost.id) && <b>✓</b>}</span>
                    <small>{(activePost.display_shares + (repostedPostIds.has(activePost.id) ? 1 : 0)).toLocaleString()}</small>
                  </button>
                </div>
                {activeCreator && (
                  <div className={styles.previewCreator}>
                    {activeCreator.profile_image_url
                      ? <span className={styles.creatorPhoto} style={{ backgroundImage: `url(${activeCreator.profile_image_url})` }} />
                      : <span className={styles.creatorFallback}>{activeCreator.display_name.slice(0, 1).toUpperCase()}</span>}
                    <div><strong>{activeCreator.display_name}</strong><small>@{activeCreator.handle.replace(/^@/, "")}</small>{activeCreator.profile_description && <p>{activeCreator.profile_description}</p>}</div>
                  </div>
                )}
                {commentsOpen && (
                  <div className={styles.previewComments}>
                    <div className={styles.previewCommentsHeader}>
                      <strong>Comments ({activeComments.length})</strong>
                      <button type="button" onClick={() => setCommentsOpen(false)}>Close</button>
                    </div>
                    <div className={styles.previewCommentsList}>
                      {activeComments.map((comment) => (
                        <article key={comment.id}>
                          <strong>{comment.display_name}</strong>
                          <p>{comment.comment_text}</p>
                          {comment.display_likes !== null && <small>♥ {comment.display_likes.toLocaleString()}</small>}
                        </article>
                      ))}
                      {!activeComments.length && <p>No comments.</p>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <aside className={styles.previewGuide}>
            <p className={styles.eyebrow}>Presentation order</p>
            <h3>Post {previewPosts.length ? activeIndex + 1 : 0} of {previewPosts.length}</h3>
            <p>Use these controls to simulate vertical feed navigation. Changing Posts reloads the embedded player from the beginning.</p>
            <div className={styles.orderModeCard}>
              <strong>{postOrderMode === "fixed" ? "Fixed order" : "Randomized once per participant"}</strong>
              <span>
                {postOrderMode === "fixed"
                  ? "Participants follow the configured Post order."
                  : "This preview shuffle is only an example. Each participant’s actual order will be generated once and stored."}
              </span>
              {postOrderMode === "per_participant_randomized" && (
                <button type="button" onClick={shufflePreview}>Shuffle preview example</button>
              )}
            </div>
            <div className={styles.previewNav}>
              <button disabled={activeIndex === 0 || !previewPosts.length} type="button" onClick={() => move(-1)}>↑ Previous Post</button>
              <button disabled={activeIndex >= previewPosts.length - 1 || !previewPosts.length} type="button" onClick={() => move(1)}>↓ Next Post</button>
            </div>
            <dl>
              <div><dt>Original URL</dt><dd>{activePost?.original_youtube_url ?? "—"}</dd></div>
              <div><dt>Video ID</dt><dd>{activePost?.youtube_video_id ?? "—"}</dd></div>
              <div><dt>Duration</dt><dd>{activePost ? `${activePost.video_duration_seconds}s` : "—"}</dd></div>
              <div><dt>Creator</dt><dd>{activeCreator ? `${activeCreator.display_name} · @${activeCreator.handle.replace(/^@/, "")}` : "—"}</dd></div>
              <div><dt>Time display</dt><dd>{timeDisplayLabels[condition.time_display]}</dd></div>
            </dl>
            <p className={styles.previewDisclaimer}>This matches the participant feed presentation, including its configured creator overlay and masked YouTube chrome. The time indicator and interactions are preview-only and are never recorded. Selected reactions temporarily show the configured count plus one.</p>
          </aside>
        </div>
      </section>
    </div>
  );
}

function PreviewYouTubePlayer({ videoId, title }: { videoId: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const captionTimersRef = useRef<number[]>([]);

  const disableCaptions = useCallback(() => {
    const player = frameRef.current?.contentWindow;
    if (!player) return;
    player.postMessage(JSON.stringify({
      event: "command",
      func: "setOption",
      args: ["captions", "track", {}],
    }), "https://www.youtube.com");
    player.postMessage(JSON.stringify({
      event: "command",
      func: "unloadModule",
      args: ["captions"],
    }), "https://www.youtube.com");
  }, []);

  const handleLoad = () => {
    captionTimersRef.current.forEach(window.clearTimeout);
    disableCaptions();
    captionTimersRef.current = [250, 750, 1500, 3000].map((delay) =>
      window.setTimeout(disableCaptions, delay),
    );
  };

  useEffect(() => () => {
    captionTimersRef.current.forEach(window.clearTimeout);
  }, []);

  return (
    <iframe
      ref={frameRef}
      className={styles.previewVideo}
      src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&controls=0&disablekb=1&fs=0&iv_load_policy=3&cc_load_policy=0`}
      title={title}
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
      onLoad={handleLoad}
    />
  );
}

function PreviewTimeDisplay({ mode, sessionDurationSeconds, elapsedSeconds }: {
  mode: TimeDisplay;
  sessionDurationSeconds: number | null;
  elapsedSeconds: number;
}) {
  if (mode === "hidden" || sessionDurationSeconds === null) return null;

  const elapsed = Math.min(sessionDurationSeconds, elapsedSeconds);
  const remaining = Math.max(0, sessionDurationSeconds - elapsed);
  const progress = sessionDurationSeconds > 0 ? elapsed / sessionDurationSeconds : 0;
  const showProgress = mode === "progress_only" || mode.startsWith("progress_");
  const showElapsed = mode === "elapsed" || mode === "progress_elapsed";
  const showRemaining = mode === "remaining" || mode === "progress_remaining";

  return (
    <div className={styles.previewTimeDisplay} aria-label={`Participant time display preview: ${timeDisplayLabels[mode]}`}>
      {showProgress && (
        <span className={styles.previewProgressTrack}>
          <span style={{ width: `${progress * 100}%` }} />
        </span>
      )}
      {showElapsed && <strong>{formatPreviewTime(elapsed)} elapsed</strong>}
      {showRemaining && <strong>{formatPreviewTime(remaining)} remaining</strong>}
    </div>
  );
}

function formatPreviewTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function YouTubeMetadataLoader({ videoId, onMetadata, onError }: {
  videoId: string;
  onMetadata: (metadata: YouTubeMetadata) => void;
  onError: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading title and duration from YouTube…");

  useEffect(() => {
    let disposed = false;
    let player: YouTubePlayerInstance | null = null;
    let poll: number | null = null;
    let timeout: number | null = null;
    void loadYouTubeIframeApi().then((YT) => {
      if (disposed || !containerRef.current) return;
      player = new YT.Player(containerRef.current, {
        height: "200",
        width: "320",
        videoId,
        playerVars: { controls: 0, playsinline: 1, rel: 0 },
        events: {
          onReady: ({ target }: { target: YouTubePlayerInstance }) => {
            target.mute();
            target.playVideo();
            poll = window.setInterval(() => {
              const durationSeconds = target.getDuration();
              const title = target.getVideoData().title?.trim() ?? "";
              if (durationSeconds > 0 && title) {
                target.pauseVideo();
                if (poll !== null) window.clearInterval(poll);
                if (timeout !== null) window.clearTimeout(timeout);
                if (!disposed) {
                  setStatus("YouTube title and duration loaded. You can adjust either field before saving.");
                  onMetadata({ title, durationSeconds });
                }
              }
            }, 250);
            timeout = window.setTimeout(() => {
              if (poll !== null) window.clearInterval(poll);
              target.pauseVideo();
              if (!disposed) {
                const message = "YouTube did not provide title and duration. Confirm that this Short permits embedding, or enter the metadata manually.";
                setStatus(message);
                onError(message);
              }
            }, 8000);
          },
          onError: () => {
            const message = "YouTube could not load this Short for metadata. You can still enter title and duration manually.";
            setStatus(message);
            onError(message);
          },
        },
      });
    }).catch((error) => { const message = errorMessage(error); setStatus(message); onError(message); });
    return () => {
      disposed = true;
      if (poll !== null) window.clearInterval(poll);
      if (timeout !== null) window.clearTimeout(timeout);
      player?.destroy();
    };
  }, [onError, onMetadata, videoId]);

  return <div className={styles.metadataPlayer}><div ref={containerRef} /><span>{status}</span></div>;
}

function PostForm({ condition, position, creatorProfiles, busy, onCancel, runAction }: {
  condition: Condition;
  position: number;
  creatorProfiles: CreatorProfile[];
  busy: boolean;
  onCancel: () => void;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [postName, setPostName] = useState("");
  const [title, setTitle] = useState("");
  const [likes, setLikes] = useState("0");
  const [shares, setShares] = useState("0");
  const [creatorProfileId, setCreatorProfileId] = useState(creatorProfiles[0]?.id ?? "");
  const [validation, setValidation] = useState("");
  const [metadataRequest, setMetadataRequest] = useState<YouTubeMetadataRequest | null>(null);

  const applyMetadata = useCallback((metadata: YouTubeMetadata) => {
    setTitle(metadata.title);
    setDuration(String(Number(metadata.durationSeconds.toFixed(3))));
    setValidation("");
  }, []);
  const metadataError = useCallback((message: string) => setValidation(message), []);
  const loadMetadata = () => {
    try {
      const videoId = parseYouTubeShortsId(url);
      setMetadataRequest((previous) => ({ videoId, requestId: (previous?.requestId ?? 0) + 1 }));
      setValidation("");
    }
    catch (error) { setMetadataRequest(null); setValidation(errorMessage(error)); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidation("");
    try {
      const videoId = parseYouTubeShortsId(url);
      const videoDuration = requirePositiveSeconds(duration);
      if (!postName.trim()) throw new Error("Post name is required.");
      if (!title.trim()) throw new Error("Video title is required.");
      const displayLikes = requireNonNegativeInteger(likes, "Displayed likes");
      const displayShares = requireNonNegativeInteger(shares, "Displayed shares");
      if (!creatorProfileId) throw new Error("Create and select a creator profile first.");
      await runAction(async () => {
        const { error } = await supabase.from("posts").insert({
          experiment_id: condition.experiment_id,
          condition_id: condition.id,
          creator_profile_id: creatorProfileId,
          original_youtube_url: url,
          youtube_video_id: videoId,
          post_name: postName.trim(),
          video_title: title.trim(),
          video_duration_seconds: videoDuration,
          short_description: "",
          description_source: "post_short_description",
          display_likes: displayLikes,
          display_shares: displayShares,
          position,
        });
        if (error) throw error;
        onCancel();
      }, "Post created with its original URL preserved.");
    } catch (error) {
      setValidation(errorMessage(error));
    }
  };

  return (
    <form className={styles.postForm} onSubmit={submit}>
      <h3>New Post</h3>
      <div className={styles.formGrid}>
        <label className={styles.fullField}>Original YouTube Shorts URL<input value={url} onBlur={loadMetadata} onChange={(event) => { setUrl(event.target.value); setMetadataRequest(null); }} placeholder="https://www.youtube.com/shorts/…" required /></label>
        <label>Parsed video ID<input value={parseSafe(url)} readOnly /></label>
        <button className={styles.metadataButton} type="button" onClick={loadMetadata}>Get title, video ID &amp; duration from YouTube</button>
        <p className={`${styles.fieldHint} ${styles.fullField}`}>Each click replaces the YouTube title and duration currently entered. The researcher-defined Post name, displayed likes, and displayed shares are not replaced.</p>
        <label className={styles.fullField}>Post name<input value={postName} onChange={(event) => setPostName(event.target.value)} placeholder="Researcher-defined label, such as Treatment video 1" required /><span className={styles.fieldHint}>For researcher organization and exports; participants do not see this name.</span></label>
        <label className={styles.fullField}>YouTube video title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title imported from YouTube" required /></label>
        <label>Video duration (seconds)<input type="number" min="0.001" step="0.001" value={duration} onChange={(event) => setDuration(event.target.value)} required /></label>
        <label>Displayed likes<input type="number" min="0" step="1" value={likes} onChange={(event) => setLikes(event.target.value)} required /></label>
        <label>Displayed shares<input type="number" min="0" step="1" value={shares} onChange={(event) => setShares(event.target.value)} required /></label>
        <label>Creator profile<select value={creatorProfileId} onChange={(event) => setCreatorProfileId(event.target.value)} required><option value="">Select a profile</option>{creatorProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name} · @{profile.handle.replace(/^@/, "")}</option>)}</select></label>
      </div>
      {metadataRequest && <YouTubeMetadataLoader key={`${metadataRequest.videoId}:${metadataRequest.requestId}`} videoId={metadataRequest.videoId} onMetadata={applyMetadata} onError={metadataError} />}
      {validation && <p className={styles.formError}>{validation}</p>}
      <div className={styles.formActions}><button type="button" onClick={onCancel}>Cancel</button><button disabled={busy} type="submit">Create Post</button></div>
    </form>
  );
}

function PostCard({ post, displayPosition, first, last, comments, creatorProfiles, busy, runAction }: {
  post: Post;
  displayPosition: number;
  first: boolean;
  last: boolean;
  comments: SeededComment[];
  creatorProfiles: CreatorProfile[];
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState(post.original_youtube_url);
  const [duration, setDuration] = useState(String(post.video_duration_seconds));
  const [postName, setPostName] = useState(post.post_name ?? post.video_title ?? "");
  const [title, setTitle] = useState(post.video_title);
  const [likes, setLikes] = useState(String(post.display_likes));
  const [shares, setShares] = useState(String(post.display_shares));
  const [creatorProfileId, setCreatorProfileId] = useState(post.creator_profile_id ?? "");
  const [validation, setValidation] = useState("");
  const [metadataRequest, setMetadataRequest] = useState<YouTubeMetadataRequest | null>(null);

  const applyMetadata = useCallback((metadata: YouTubeMetadata) => {
    setTitle(metadata.title);
    setDuration(String(Number(metadata.durationSeconds.toFixed(3))));
    setValidation("");
  }, []);
  const metadataError = useCallback((message: string) => setValidation(message), []);
  const loadMetadata = () => {
    try {
      const videoId = parseYouTubeShortsId(url);
      setMetadataRequest((previous) => ({ videoId, requestId: (previous?.requestId ?? 0) + 1 }));
      setValidation("");
    }
    catch (error) { setMetadataRequest(null); setValidation(errorMessage(error)); }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setValidation("");
    try {
      const videoId = parseYouTubeShortsId(url);
      const values = {
        original_youtube_url: url,
        youtube_video_id: videoId,
        post_name: postName.trim(),
        video_title: title.trim(),
        video_duration_seconds: requirePositiveSeconds(duration),
        short_description: "",
        description_source: "post_short_description" as const,
        display_likes: requireNonNegativeInteger(likes, "Displayed likes"),
        display_shares: requireNonNegativeInteger(shares, "Displayed shares"),
        creator_profile_id: creatorProfileId,
      };
      if (!postName.trim()) throw new Error("Post name is required.");
      if (!title.trim()) throw new Error("Video title is required.");
      if (!creatorProfileId) throw new Error("Select a creator profile.");
      await runAction(async () => {
        const { error } = await supabase.from("posts").update(values).eq("id", post.id);
        if (error) throw error;
      }, "Post saved.");
    } catch (error) {
      setValidation(errorMessage(error));
    }
  };

  return (
    <article className={styles.postCard}>
      <div className={styles.postSummary}>
        <span className={styles.postNumber}>{displayPosition}</span>
        <div className={styles.postIdentity}>
          <strong>{post.post_name ?? post.video_title}</strong>
          <span>{post.youtube_video_id}</span>
          <span>{post.video_duration_seconds}s</span>
          <small title={post.original_youtube_url}>{post.original_youtube_url}</small>
        </div>
        <div className={styles.rowActions}>
          <button disabled={busy || first} type="button" aria-label="Move Post up" onClick={() => runAction(async () => { const { error } = await supabase.rpc("move_post", { target_post_id: post.id, direction: "up" }); if (error) throw error; }, "Post moved up.")}>↑</button>
          <button disabled={busy || last} type="button" aria-label="Move Post down" onClick={() => runAction(async () => { const { error } = await supabase.rpc("move_post", { target_post_id: post.id, direction: "down" }); if (error) throw error; }, "Post moved down.")}>↓</button>
          <button disabled={busy} type="button" onClick={() => runAction(async () => { const { error } = await supabase.rpc("duplicate_post", { source_post_id: post.id }); if (error) throw error; }, "Post and seeded comments duplicated.")}>Duplicate</button>
          <button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "Close" : "Edit"}</button>
          <button className={styles.dangerButton} disabled={busy} type="button" onClick={() => { if (!window.confirm("Delete this Post and its seeded comments?")) return; void runAction(async () => { const { error } = await supabase.from("posts").delete().eq("id", post.id); if (error) throw error; }, "Post deleted."); }}>Delete</button>
        </div>
      </div>
      {expanded && (
        <div className={styles.postDetails}>
          <form onSubmit={save}>
            <div className={styles.formGrid}>
              <label className={styles.fullField}>Original YouTube Shorts URL<input value={url} onBlur={loadMetadata} onChange={(event) => { setUrl(event.target.value); setMetadataRequest(null); }} required /></label>
              <label className={styles.fullField}>Post name<input value={postName} onChange={(event) => setPostName(event.target.value)} required /><span className={styles.fieldHint}>For researcher organization and exports; participants do not see this name.</span></label>
              <label className={styles.fullField}>YouTube video title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
              <label>Parsed video ID<input value={parseSafe(url)} readOnly /></label>
              <button className={styles.metadataButton} type="button" onClick={loadMetadata}>Get title, video ID &amp; duration from YouTube</button>
              <p className={`${styles.fieldHint} ${styles.fullField}`}>Each click replaces the YouTube title and duration currently entered. The researcher-defined Post name, displayed likes, and displayed shares are not replaced.</p>
              <label>Video duration (seconds)<input type="number" min="0.001" step="0.001" value={duration} onChange={(event) => setDuration(event.target.value)} required /></label>
              <label>Displayed likes<input type="number" min="0" step="1" value={likes} onChange={(event) => setLikes(event.target.value)} /></label>
              <label>Displayed shares<input type="number" min="0" step="1" value={shares} onChange={(event) => setShares(event.target.value)} /></label>
              <label>Creator profile<select value={creatorProfileId} onChange={(event) => setCreatorProfileId(event.target.value)} required><option value="">Select a profile</option>{creatorProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name} · @{profile.handle.replace(/^@/, "")}</option>)}</select></label>
            </div>
            {metadataRequest && <YouTubeMetadataLoader key={`${metadataRequest.videoId}:${metadataRequest.requestId}`} videoId={metadataRequest.videoId} onMetadata={applyMetadata} onError={metadataError} />}
            {validation && <p className={styles.formError}>{validation}</p>}
            <button disabled={busy} type="submit">Save Post</button>
          </form>
          <CommentsEditor post={post} comments={comments} busy={busy} runAction={runAction} />
        </div>
      )}
    </article>
  );
}

function parseSafe(url: string) {
  try { return parseYouTubeShortsId(url); } catch { return "Invalid Shorts URL"; }
}

function parseCommentCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (character !== "\r") field += character;
  }
  if (quoted) throw new Error("The comments CSV contains an unclosed quoted field.");
  if (field || row.length) { row.push(field); rows.push(row); }
  const nonEmptyRows = rows.filter((values) => values.some((value) => value.trim()));
  if (nonEmptyRows.length < 2) throw new Error("The comments CSV must contain a header and at least one comment.");
  const headers = nonEmptyRows[0].map((value) => value.trim().toLowerCase());
  const nameIndex = headers.indexOf("display_name");
  const textIndex = headers.indexOf("comment_text");
  const likesIndex = headers.indexOf("likes");
  if (nameIndex < 0 || textIndex < 0 || likesIndex < 0) {
    throw new Error("CSV headers must be display_name, comment_text, and likes.");
  }
  if (nonEmptyRows.length > 501) throw new Error("Upload no more than 500 comments at once.");
  return nonEmptyRows.slice(1).map((values, index) => {
    const displayName = (values[nameIndex] ?? "").trim();
    const commentText = (values[textIndex] ?? "").trim();
    const likes = (values[likesIndex] ?? "").trim();
    if (!displayName) throw new Error(`Row ${index + 2}: display_name is required.`);
    if (!commentText) throw new Error(`Row ${index + 2}: comment_text is required.`);
    return { displayName, commentText, displayLikes: likes === "" ? null : requireNonNegativeInteger(likes, `Row ${index + 2} likes`) };
  });
}

function CommentsEditor({ post, comments, busy, runAction }: {
  post: Post;
  comments: SeededComment[];
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [text, setText] = useState("");
  const [likes, setLikes] = useState("");

  const add = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const displayedLikes = likes === "" ? null : requireNonNegativeInteger(likes, "Displayed comment likes");
      await runAction(async () => {
        const nextPosition = comments.length ? Math.max(...comments.map((comment) => comment.position)) + 1 : 0;
        const { error } = await supabase.from("seeded_comments").insert({
          experiment_id: post.experiment_id,
          post_id: post.id,
          display_name: displayName.trim(),
          comment_text: text.trim(),
          display_likes: displayedLikes,
          position: nextPosition,
        });
        if (error) throw error;
        setDisplayName(""); setText(""); setLikes("");
      }, "Seeded comment added.");
    } catch (error) {
      throw error;
    }
  };

  const uploadCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await runAction(async () => {
      const imported = parseCommentCsv(await file.text());
      const firstPosition = comments.length ? Math.max(...comments.map((comment) => comment.position)) + 1 : 0;
      const { error } = await supabase.from("seeded_comments").insert(imported.map((comment, index) => ({
        experiment_id: post.experiment_id,
        post_id: post.id,
        display_name: comment.displayName,
        comment_text: comment.commentText,
        display_likes: comment.displayLikes,
        position: firstPosition + index,
      })));
      if (error) throw error;
    }, "Seeded comments imported from CSV.");
  };

  return (
    <section className={styles.commentsEditor}>
      <h3>Seeded comments <span>{comments.length}</span></h3>
      <div className={styles.commentCsvImport}>
        <label>Upload comments CSV<input accept=".csv,text/csv" disabled={busy} type="file" onChange={(event) => void uploadCsv(event)} /></label>
        <span>Required headers: <code>display_name, comment_text, likes</code>. Imported rows are appended.</span>
      </div>
      {comments.map((comment) => (
        <SeededCommentRow key={comment.id} comment={comment} busy={busy} runAction={runAction} />
      ))}
      <form className={styles.commentForm} onSubmit={add}>
        <input placeholder="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        <input placeholder="Comment text" value={text} onChange={(event) => setText(event.target.value)} required />
        <input aria-label="Optional displayed comment likes" placeholder="Likes (optional)" min="0" step="1" type="number" value={likes} onChange={(event) => setLikes(event.target.value)} />
        <button disabled={busy} type="submit">Add comment</button>
      </form>
    </section>
  );
}

function SeededCommentRow({ comment, busy, runAction }: {
  comment: SeededComment;
  busy: boolean;
  runAction: (action: () => Promise<void>, success: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(comment.display_name);
  const [text, setText] = useState(comment.comment_text);
  const [likes, setLikes] = useState(comment.display_likes === null ? "" : String(comment.display_likes));
  const [validation, setValidation] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setValidation("");
    try {
      if (!displayName.trim()) throw new Error("Display name is required.");
      if (!text.trim()) throw new Error("Comment text is required.");
      const displayedLikes = likes === "" ? null : requireNonNegativeInteger(likes, "Displayed comment likes");
      await runAction(async () => {
        const { error } = await supabase.from("seeded_comments").update({
          display_name: displayName.trim(),
          comment_text: text.trim(),
          display_likes: displayedLikes,
        }).eq("id", comment.id);
        if (error) throw error;
        setEditing(false);
      }, "Seeded comment saved.");
    } catch (error) {
      setValidation(errorMessage(error));
    }
  };

  if (editing) {
    return (
      <form className={styles.commentEditForm} onSubmit={save}>
        <input aria-label="Edit comment display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        <input aria-label="Edit comment text" value={text} onChange={(event) => setText(event.target.value)} required />
        <input aria-label="Edit displayed comment likes" placeholder="Likes (optional)" min="0" step="1" type="number" value={likes} onChange={(event) => setLikes(event.target.value)} />
        {validation && <p className={styles.formError}>{validation}</p>}
        <div className={styles.formActions}>
          <button type="button" onClick={() => { setEditing(false); setValidation(""); }}>Cancel</button>
          <button disabled={busy} type="submit">Save comment</button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.commentRow}>
      <div><strong>{comment.display_name}</strong><p>{comment.comment_text}</p><small>{comment.display_likes ?? "—"} displayed likes</small></div>
      <div className={styles.rowActions}>
        <button disabled={busy} type="button" onClick={() => setEditing(true)}>Edit</button>
        <button className={styles.dangerButton} disabled={busy} type="button" onClick={() => runAction(async () => { const { error } = await supabase.from("seeded_comments").delete().eq("id", comment.id); if (error) throw error; }, "Seeded comment deleted.")}>Delete</button>
      </div>
    </div>
  );
}
