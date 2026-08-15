import { useLocalSearchParams, router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  FlatList,
  Image,
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import YoutubePlayer, { PLAYER_STATES, YoutubeIframeRef } from "react-native-youtube-iframe";
import { supabase } from "@/lib/supabase";

type Session = {
  id: string;
  participant_id: string;
  experiment_id: string;
  publication_snapshot_id: string;
  publication_condition_id: string;
  status: "started" | "completed" | "interrupted";
  session_elapsed_seconds: number;
  session_mode: "time_controlled" | "stimulus_controlled";
  session_duration_seconds: number | null;
  time_display: TimeDisplay;
};
type TimeDisplay = "hidden" | "progress_only" | "elapsed" | "remaining" | "progress_elapsed" | "progress_remaining";
type FeedPost = {
  id: string;
  original_youtube_url: string;
  youtube_video_id: string;
  video_title: string;
  video_duration_seconds: number;
  display_likes: number;
  display_shares: number;
  presentation_position: number;
  creator_display_name: string | null;
  creator_handle: string | null;
  creator_profile_description: string | null;
  creator_profile_image_path: string | null;
  creator_profile_image_url: string | null;
};
type Comment = {
  id: string;
  publication_post_id: string;
  display_name: string;
  comment_text: string;
  display_likes: number | null;
  position: number;
  participantAuthored?: boolean;
};
type PostState = { liked: boolean; reposted: boolean; shareTapped: boolean };
type PlayerRef = { current: YoutubeIframeRef | null };

const DISABLE_CAPTIONS_SCRIPT = `
  (function disableYouTubeCaptions() {
    function disable() {
      try {
        if (!window.player) return;
        if (typeof window.player.setOption === 'function') {
          window.player.setOption('captions', 'track', {});
          window.player.setOption('cc', 'track', {});
        }
        if (typeof window.player.unloadModule === 'function') {
          window.player.unloadModule('captions');
          window.player.unloadModule('cc');
        }
      } catch (_) {}
    }
    disable();
    window.setInterval(disable, 500);
  })();
  true;
`;

export default function AssignedFeedScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const { height, width } = useWindowDimensions();
  const [session, setSession] = useState<Session | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [postStates, setPostStates] = useState<Record<string, PostState>>({});
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [suspendedIndex, setSuspendedIndex] = useState<number | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const commentsScrollRef = useRef<ScrollView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [studyEnded, setStudyEnded] = useState(false);
  const [displayElapsedSeconds, setDisplayElapsedSeconds] = useState(0);

  const activeIndexRef = useRef(-1);
  const activationTokenRef = useRef(0);
  const playerRefs = useRef<Record<string, PlayerRef>>({});
  const readyPlayersRef = useRef(new Set<string>());
  const elapsedSecondsRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastActiveTickRef = useRef(0);

  const loadFeed = useCallback(async () => {
    if (!sessionId) throw new Error("The assigned session is missing.");
    const sessionResult = await supabase.from("sessions").select("id,participant_id,experiment_id,publication_snapshot_id,publication_condition_id,status,session_elapsed_seconds").eq("id", sessionId).single();
    if (sessionResult.error) throw sessionResult.error;
    const [snapshotResult, conditionResult] = await Promise.all([
      supabase.from("publication_snapshots").select("session_mode,session_duration_seconds").eq("id", sessionResult.data.publication_snapshot_id).single(),
      supabase.from("publication_conditions").select("time_display").eq("id", sessionResult.data.publication_condition_id).single(),
    ]);
    if (snapshotResult.error) throw snapshotResult.error;
    if (conditionResult.error) throw conditionResult.error;
    const nextSession = {
      ...sessionResult.data,
      session_elapsed_seconds: Number(sessionResult.data.session_elapsed_seconds),
      session_mode: snapshotResult.data.session_mode,
      session_duration_seconds: snapshotResult.data.session_duration_seconds,
      time_display: conditionResult.data.time_display,
    } as Session;
    if (nextSession.status !== "started") throw new Error("This session is no longer active.");

    const orderResult = await supabase.from("session_post_order").select("publication_post_id,presentation_position").eq("session_id", sessionId).order("presentation_position");
    if (orderResult.error) throw orderResult.error;
    const postIds = orderResult.data.map((row) => row.publication_post_id);
    if (!postIds.length) throw new Error("The assigned condition contains no Posts.");

    const [postResult, commentResult, participantCommentResult, stateResult] = await Promise.all([
      supabase.from("publication_posts").select("id,original_youtube_url,youtube_video_id,video_title,video_duration_seconds,display_likes,display_shares,creator_display_name,creator_handle,creator_profile_description,creator_profile_image_path").in("id", postIds),
      supabase.from("publication_seeded_comments").select("id,publication_post_id,display_name,comment_text,display_likes,position").in("publication_post_id", postIds).order("position"),
      supabase.from("participant_comments").select("id,publication_post_id,display_name,comment_text,created_at").eq("session_id", sessionId).order("created_at"),
      supabase.from("participant_post_state").select("publication_post_id,liked,reposted,share_tapped").eq("session_id", sessionId),
    ]);
    if (postResult.error) throw postResult.error;
    if (commentResult.error) throw commentResult.error;
    if (participantCommentResult.error) throw participantCommentResult.error;
    if (stateResult.error) throw stateResult.error;

    const postById = new Map(postResult.data.map((post) => [post.id, post]));
    const orderedPosts = await Promise.all(orderResult.data.map(async (order) => {
      const sourcePost = postById.get(order.publication_post_id)!;
      const signedImage = sourcePost.creator_profile_image_path
        ? await supabase.storage.from("creator-images").createSignedUrl(sourcePost.creator_profile_image_path, 3600)
        : null;
      return {
      ...postById.get(order.publication_post_id)!,
      video_duration_seconds: Number(postById.get(order.publication_post_id)!.video_duration_seconds),
      display_likes: Number(postById.get(order.publication_post_id)!.display_likes),
      display_shares: Number(postById.get(order.publication_post_id)!.display_shares),
      presentation_position: order.presentation_position,
      creator_profile_image_url: signedImage?.data?.signedUrl ?? null,
      };
    })) as FeedPost[];
    playerRefs.current = Object.fromEntries(orderedPosts.map((post) => [post.id, { current: null }]));
    setSession(nextSession);
    elapsedSecondsRef.current = nextSession.session_elapsed_seconds;
    setDisplayElapsedSeconds(nextSession.session_elapsed_seconds);
    lastActiveTickRef.current = Date.now();
    setPosts(orderedPosts);
    const participantComments = participantCommentResult.data.map((comment, index) => ({
      ...comment,
      display_likes: null,
      position: 1_000_000 + index,
      participantAuthored: true,
    }));
    setComments([...(commentResult.data as Comment[]), ...participantComments]);
    setPostStates(Object.fromEntries(stateResult.data.map((state) => [state.publication_post_id, { liked: state.liked, reposted: state.reposted, shareTapped: state.share_tapped }])));
  }, [sessionId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFeed().catch((failure) => setError(failure instanceof Error ? failure.message : "Unable to load the assigned feed.")).finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [loadFeed]);

  useEffect(() => {
    if (!session) return;
    const checkSession = async () => {
      const result = await supabase.from("sessions").select("status").eq("id", session.id).single();
      if (!result.error && result.data.status !== "started") {
        setPlayingIndex(null);
        setSuspendedIndex(activeIndexRef.current);
        setStudyEnded(true);
      }
    };
    const poll = setInterval(() => void checkSession(), 3000);
    return () => clearInterval(poll);
  }, [session]);

  const persistSessionElapsed = useCallback(async () => {
    if (!session) return;
    await supabase.from("sessions").update({ session_elapsed_seconds: elapsedSecondsRef.current }).eq("id", session.id);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const accrueActiveTime = () => {
      const now = Date.now();
      if (appStateRef.current === "active") {
        elapsedSecondsRef.current += Math.max(0, now - lastActiveTickRef.current) / 1000;
        const capped = session.session_duration_seconds === null
          ? elapsedSecondsRef.current
          : Math.min(session.session_duration_seconds, elapsedSecondsRef.current);
        elapsedSecondsRef.current = capped;
        setDisplayElapsedSeconds(capped);
      }
      lastActiveTickRef.current = now;
    };
    const clock = setInterval(accrueActiveTime, 250);
    const persistence = setInterval(() => void persistSessionElapsed(), 5000);
    const subscription = AppState.addEventListener("change", (nextState) => {
      accrueActiveTime();
      appStateRef.current = nextState;
      lastActiveTickRef.current = Date.now();
      if (nextState !== "active") void persistSessionElapsed();
    });
    return () => {
      accrueActiveTime();
      clearInterval(clock);
      clearInterval(persistence);
      subscription.remove();
      void persistSessionElapsed();
    };
  }, [persistSessionElapsed, session]);

  const recordInteraction = useCallback(async (postId: string, eventType: string) => {
    if (!session) return false;
    const { error: interactionError } = await supabase.rpc("record_participant_interaction", {
      target_session_id: session.id,
      target_publication_post_id: postId,
      target_event_type: eventType,
      target_client_observed_at: new Date().toISOString(),
      target_session_elapsed_seconds: elapsedSecondsRef.current,
    });
    if (interactionError) {
      setError(`Your action could not be recorded: ${interactionError.message}`);
      return false;
    }
    return true;
  }, [session]);

  const seekAndPlay = useCallback((index: number, token: number) => {
    const post = posts[index];
    if (!post || activeIndexRef.current !== index || activationTokenRef.current !== token) return;
    const player = playerRefs.current[post.id]?.current;
    if (!player || !readyPlayersRef.current.has(post.id)) return;
    player.seekTo(0, true);
    setTimeout(() => {
      if (activeIndexRef.current === index && activationTokenRef.current === token) setPlayingIndex(index);
    }, 150);
  }, [posts]);

  const activatePost = useCallback((nextIndex: number) => {
    if (nextIndex === activeIndexRef.current) return;
    const previousIndex = activeIndexRef.current;
    setPlayingIndex(null);
    activeIndexRef.current = nextIndex;
    const token = ++activationTokenRef.current;
    void recordInteraction(posts[nextIndex].id, "post_activated");
    if (previousIndex >= 0) {
      const direction = nextIndex > previousIndex ? "swipe_up" : "swipe_down";
      void recordInteraction(posts[previousIndex].id, direction);
    }
    seekAndPlay(nextIndex, token);
  }, [posts, recordInteraction, seekAndPlay]);

  useEffect(() => {
    if (posts.length && activeIndexRef.current < 0) activatePost(0);
  }, [activatePost, posts.length]);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.max(0, Math.min(posts.length - 1, Math.round(event.nativeEvent.contentOffset.y / height)));
    setSuspendedIndex(null);
    if (nextIndex === activeIndexRef.current) {
      const token = ++activationTokenRef.current;
      setTimeout(() => seekAndPlay(nextIndex, token), 100);
    } else {
      activatePost(nextIndex);
    }
  };

  const toggleLike = async (post: FeedPost) => {
    const current = postStates[post.id] ?? { liked: false, reposted: false, shareTapped: false };
    const nextLiked = !current.liked;
    setPostStates((states) => ({ ...states, [post.id]: { ...current, liked: nextLiked } }));
    if (!(await recordInteraction(post.id, nextLiked ? "like" : "unlike"))) {
      setPostStates((states) => ({ ...states, [post.id]: current }));
    }
  };

  const toggleRepost = async (post: FeedPost) => {
    const current = postStates[post.id] ?? { liked: false, reposted: false, shareTapped: false };
    const nextReposted = !current.reposted;
    const nextState = { ...current, reposted: nextReposted, shareTapped: current.shareTapped || nextReposted };
    setPostStates((states) => ({ ...states, [post.id]: nextState }));
    if (!(await recordInteraction(post.id, nextReposted ? "share_tapped" : "share_untapped"))) {
      setPostStates((states) => ({ ...states, [post.id]: current }));
    }
  };

  const openComments = async (post: FeedPost) => {
    setCommentsPostId(post.id);
    await recordInteraction(post.id, "comments_opened");
  };
  const closeComments = async () => {
    const postId = commentsPostId;
    setCommentsPostId(null);
    if (postId) await recordInteraction(postId, "comments_closed");
  };

  const submitComment = async () => {
    if (!session || !commentsPostId || submittingComment) return;
    const text = commentText.trim();
    if (!text) {
      setError("Enter a comment before posting.");
      return;
    }
    Keyboard.dismiss();
    setSubmittingComment(true);
    const { data, error: submitError } = await supabase.rpc("submit_participant_comment", {
      target_session_id: session.id,
      target_publication_post_id: commentsPostId,
      target_display_name: "User",
      target_comment_text: text,
      target_session_elapsed_seconds: elapsedSecondsRef.current,
    });
    if (submitError) setError(`Your comment could not be submitted: ${submitError.message}`);
    else {
      setComments((current) => [...current, {
        id: String(data),
        publication_post_id: commentsPostId,
        display_name: "User",
        comment_text: text,
        display_likes: null,
        position: 1_000_000 + current.length,
        participantAuthored: true,
      }]);
      setCommentText("");
      setError("");
      setTimeout(() => commentsScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSubmittingComment(false);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#7dffa4" /><Text style={styles.centerText}>Loading assigned feed…</Text></View>;
  if (error && !posts.length) return <SafeAreaView style={styles.center}><Text style={styles.error}>{error}</Text><Pressable style={styles.retryButton} onPress={() => router.replace("/")}><Text>Return to study code</Text></Pressable></SafeAreaView>;
  if (studyEnded) return <SafeAreaView style={styles.center}><Text style={styles.endedTitle}>This study has ended.</Text><Text style={styles.centerText}>The researcher has deactivated this study. No further activity will be recorded.</Text><Pressable style={styles.retryButton} onPress={() => router.replace("/")}><Text>Return to study code</Text></Pressable></SafeAreaView>;

  const frameWidth = width * 0.9;
  const frameHeight = frameWidth * (16 / 9);
  const youtubeCanvasWidth = frameHeight * (16 / 9);
  const commentRows = comments.filter((comment) => comment.publication_post_id === commentsPostId);

  return (
    <View style={styles.screen}>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {session ? <ParticipantTimeDisplay session={session} elapsedSeconds={displayElapsedSeconds} /> : null}
      <FlatList
        data={posts}
        getItemLayout={(_, index) => ({ index, length: height, offset: height * index })}
        keyExtractor={(post) => post.id}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollBeginDrag={() => { activationTokenRef.current += 1; setPlayingIndex(null); setSuspendedIndex(activeIndexRef.current); }}
        pagingEnabled
        renderItem={({ item: post, index }) => {
          const state = postStates[post.id] ?? { liked: false, reposted: false, shareTapped: false };
          const postCommentCount = comments.filter((comment) => comment.publication_post_id === post.id).length;
          return (
            <View style={[styles.page, { height }]}>
              <View style={[styles.playerFrame, { height: frameHeight, width: frameWidth }]}>
                {suspendedIndex === index ? <View style={styles.suspended} /> : (
                  <YoutubePlayer
                    height={frameHeight}
                    initialPlayerParams={{ controls: false, iv_load_policy: 3, preventFullScreen: true, showClosedCaptions: false }}
                    mute={playingIndex !== index}
                    onChangeState={(playerState: PLAYER_STATES) => { if (playerState === PLAYER_STATES.ENDED && activeIndexRef.current === index) setPlayingIndex(null); }}
                    onReady={() => { readyPlayersRef.current.add(post.id); if (activeIndexRef.current === index) seekAndPlay(index, activationTokenRef.current); }}
                    play={playingIndex === index}
                    ref={playerRefs.current[post.id]}
                    videoId={post.youtube_video_id}
                    webViewProps={{ injectedJavaScript: DISABLE_CAPTIONS_SCRIPT }}
                    width={youtubeCanvasWidth}
                  />
                )}
                <View style={styles.actions}>
                  <Pressable accessibilityLabel={state.liked ? "Unlike Post" : "Like Post"} onPress={() => void toggleLike(post)} style={styles.actionButton}>
                    <SymbolView
                      animationSpec={state.liked ? { effect: { type: "bounce" } } : undefined}
                      name={{ ios: state.liked ? "heart.fill" : "heart", android: state.liked ? "favorite" : "favorite_border", web: state.liked ? "favorite" : "favorite_border" }}
                      size={34}
                      tintColor={state.liked ? "#ff3040" : "#ffffff"}
                    />
                    <Text style={styles.count}>{(post.display_likes + (state.liked ? 1 : 0)).toLocaleString()}</Text>
                  </Pressable>
                  <Pressable accessibilityLabel="Open comments" onPress={() => void openComments(post)} style={styles.actionButton}>
                    <SymbolView name={{ ios: "bubble.right", android: "chat_bubble_outline", web: "chat_bubble_outline" }} size={32} tintColor="#ffffff" />
                    <Text style={styles.count}>{postCommentCount}</Text>
                  </Pressable>
                  <Pressable accessibilityLabel={state.reposted ? "Undo repost" : "Repost"} onPress={() => void toggleRepost(post)} style={styles.actionButton}>
                    <SymbolView
                      animationSpec={state.reposted ? { effect: { type: "bounce" } } : undefined}
                      name={{ ios: "arrow.2.squarepath", android: "repeat", web: "repeat" }}
                      size={34}
                      tintColor={state.reposted ? "#00c853" : "#ffffff"}
                    />
                    <Text style={styles.count}>{(post.display_shares + (state.reposted ? 1 : 0)).toLocaleString()}</Text>
                  </Pressable>
                </View>
                {post.creator_display_name && post.creator_handle ? <View style={styles.creatorOverlay}>
                  {post.creator_profile_image_url
                    ? <Image source={{ uri: post.creator_profile_image_url }} style={styles.creatorImage} />
                    : <View style={styles.creatorFallback}><Text style={styles.creatorFallbackText}>{post.creator_display_name.slice(0, 1).toUpperCase()}</Text></View>}
                  <View style={styles.creatorText}><Text style={styles.creatorName}>{post.creator_display_name}</Text><Text style={styles.creatorHandle}>@{post.creator_handle.replace(/^@/, "")}</Text>{post.creator_profile_description ? <Text numberOfLines={2} style={styles.creatorDescription}>{post.creator_profile_description}</Text> : null}</View>
                </View> : null}
              </View>
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
      <Modal animationType="slide" onRequestClose={() => void closeComments()} transparent visible={commentsPostId !== null}>
        <Pressable onPress={() => void closeComments()} style={styles.modalBackdrop}>
          <Pressable style={styles.commentsPanel}>
            <View style={styles.commentsHeader}><Text style={styles.commentsTitle}>Comments ({commentRows.length})</Text><Pressable onPress={() => void closeComments()}><Text style={styles.close}>Close</Text></Pressable></View>
            <ScrollView ref={commentsScrollRef}>{commentRows.map((comment) => <View key={comment.id} style={styles.comment}><Text style={styles.commentName}>{comment.display_name}{comment.participantAuthored ? " · Your comment" : ""}</Text><Text style={styles.commentText}>{comment.comment_text}</Text>{comment.display_likes !== null ? <Text style={styles.commentLikes}>♥ {comment.display_likes.toLocaleString()}</Text> : null}</View>)}{!commentRows.length ? <Text style={styles.emptyComments}>No comments yet.</Text> : null}</ScrollView>
            <View style={styles.commentComposer}>
              <TextInput accessibilityLabel="What do you think about this?" maxLength={5000} multiline onChangeText={setCommentText} onSubmitEditing={() => void submitComment()} placeholder="What do you think about this?" returnKeyType="send" submitBehavior="blurAndSubmit" style={[styles.commentInput, styles.commentTextInput]} value={commentText} />
              <Pressable disabled={submittingComment} onPress={() => void submitComment()} style={styles.submitComment}><Text style={styles.submitCommentText}>{submittingComment ? "Posting…" : "Post comment"}</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ParticipantTimeDisplay({ session, elapsedSeconds }: { session: Session; elapsedSeconds: number }) {
  if (session.session_mode !== "time_controlled" || session.session_duration_seconds === null || session.time_display === "hidden") return null;
  const elapsed = Math.min(session.session_duration_seconds, elapsedSeconds);
  const remaining = Math.max(0, session.session_duration_seconds - elapsed);
  const progress = session.session_duration_seconds > 0 ? elapsed / session.session_duration_seconds : 0;
  const showProgress = session.time_display === "progress_only" || session.time_display.startsWith("progress_");
  const showElapsed = session.time_display === "elapsed" || session.time_display === "progress_elapsed";
  const showRemaining = session.time_display === "remaining" || session.time_display === "progress_remaining";
  return (
    <View pointerEvents="none" style={styles.timeDisplay}>
      {showProgress ? <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View> : null}
      {showElapsed ? <Text style={styles.timeText}>{formatSessionTime(elapsed)} elapsed</Text> : null}
      {showRemaining ? <Text style={styles.timeText}>{formatSessionTime(remaining)} remaining</Text> : null}
    </View>
  );
}

function formatSessionTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#111", flex: 1 },
  timeDisplay: { left: "5%", position: "absolute", right: "5%", top: 54, zIndex: 10 },
  progressTrack: { backgroundColor: "rgba(0,0,0,.66)", borderColor: "rgba(255,255,255,.78)", borderRadius: 999, borderWidth: 1, height: 6, overflow: "hidden" },
  progressFill: { backgroundColor: "#7dffa4", borderRadius: 999, height: "100%" },
  timeText: { alignSelf: "flex-end", backgroundColor: "rgba(0,0,0,.66)", borderRadius: 999, color: "white", fontSize: 10, fontWeight: "800", marginTop: 5, overflow: "hidden", paddingHorizontal: 7, paddingVertical: 4 },
  page: { alignItems: "center", backgroundColor: "#111", justifyContent: "center" },
  playerFrame: { alignItems: "center", backgroundColor: "#000", borderColor: "#222", borderWidth: 1, justifyContent: "center", overflow: "hidden" },
  suspended: { backgroundColor: "#000", flex: 1, width: "100%" },
  actions: { bottom: 18, gap: 14, position: "absolute", right: 11 },
  creatorOverlay: { alignItems: "center", bottom: 18, flexDirection: "row", left: 12, maxWidth: "70%", position: "absolute" },
  creatorImage: { borderColor: "white", borderRadius: 21, borderWidth: 1, height: 42, width: 42 },
  creatorFallback: { alignItems: "center", backgroundColor: "#315743", borderColor: "white", borderRadius: 21, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  creatorFallbackText: { color: "white", fontSize: 18, fontWeight: "800" },
  creatorText: { flexShrink: 1, marginLeft: 9 },
  creatorName: { color: "white", fontSize: 13, fontWeight: "800" },
  creatorHandle: { color: "white", fontSize: 11 },
  creatorDescription: { color: "white", fontSize: 10, marginTop: 2 },
  actionButton: { alignItems: "center", backgroundColor: "transparent", minHeight: 48, minWidth: 46, paddingHorizontal: 4, paddingVertical: 2 },
  count: { color: "white", fontSize: 11, fontWeight: "700", marginTop: 1 },
  center: { alignItems: "center", backgroundColor: "#10231c", flex: 1, gap: 14, justifyContent: "center", padding: 24 },
  centerText: { color: "white" }, error: { color: "#ffb6af", fontSize: 15, textAlign: "center" },
  endedTitle: { color: "white", fontSize: 23, fontWeight: "800", textAlign: "center" },
  retryButton: { backgroundColor: "#f2f5f1", borderRadius: 10, padding: 12 },
  errorBanner: { backgroundColor: "#8d2f28", color: "white", left: 10, padding: 8, position: "absolute", right: 10, top: 50, zIndex: 20 },
  modalBackdrop: { backgroundColor: "rgba(0,0,0,.55)", flex: 1, justifyContent: "flex-end" },
  commentsPanel: { backgroundColor: "#f7f8f5", borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "66%", minHeight: "38%", padding: 18 },
  commentsHeader: { alignItems: "center", borderBottomColor: "#d9dfda", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 12 },
  commentsTitle: { color: "#17241e", fontSize: 19, fontWeight: "800" }, close: { color: "#2d6547", fontWeight: "700" },
  comment: { borderBottomColor: "#e0e5e1", borderBottomWidth: 1, gap: 4, paddingVertical: 13 }, commentName: { fontWeight: "800" }, commentText: { color: "#35423b", lineHeight: 20 }, commentLikes: { color: "#69756e", fontSize: 11 }, emptyComments: { color: "#77827c", padding: 24, textAlign: "center" },
  commentComposer: { borderTopColor: "#d9dfda", borderTopWidth: 1, gap: 8, paddingTop: 12 },
  commentInput: { backgroundColor: "white", borderColor: "#cfd8d2", borderRadius: 8, borderWidth: 1, color: "#17241e", paddingHorizontal: 10, paddingVertical: 9 },
  commentTextInput: { maxHeight: 90, minHeight: 48, textAlignVertical: "top" },
  submitComment: { alignItems: "center", alignSelf: "flex-end", backgroundColor: "#245c40", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  submitCommentText: { color: "white", fontWeight: "800" },
});
