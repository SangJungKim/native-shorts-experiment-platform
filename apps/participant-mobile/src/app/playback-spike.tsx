import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import YoutubePlayer, {
  PLAYER_STATES,
  YoutubeIframeRef,
} from "react-native-youtube-iframe";

import { PLAYBACK_SPIKE_VIDEO_IDS } from "@/playback-spike-config";

type PlayerRef = { current: YoutubeIframeRef | null };

type DebugSnapshot = {
  activationTimestamp: string;
  activeIndex: number;
  buffering: boolean;
  playbackPosition: number | null;
  playerState: PLAYER_STATES;
  previousIndex: number | null;
  videoId: string;
};

const INITIAL_DEBUG: DebugSnapshot = {
  activationTimestamp: "not activated",
  activeIndex: 0,
  buffering: false,
  playbackPosition: null,
  playerState: PLAYER_STATES.UNSTARTED,
  previousIndex: null,
  videoId: PLAYBACK_SPIKE_VIDEO_IDS[0],
};

const DISABLE_YOUTUBE_CAPTIONS_SCRIPT = `
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

function timestamp() {
  return new Date().toISOString();
}

export default function PlaybackSpikeScreen() {
  const { height, width } = useWindowDimensions();
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [debug, setDebug] = useState(INITIAL_DEBUG);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [suspendedIndex, setSuspendedIndex] = useState<number | null>(null);
  const [likedVideos, setLikedVideos] = useState<boolean[]>(
    PLAYBACK_SPIKE_VIDEO_IDS.map(() => false),
  );
  const [repostedVideos, setRepostedVideos] = useState<boolean[]>(
    PLAYBACK_SPIKE_VIDEO_IDS.map(() => false),
  );

  const activeIndexRef = useRef(-1);
  const activationTokenRef = useRef(0);
  const playerRefs = useRef<PlayerRef[]>(
    PLAYBACK_SPIKE_VIDEO_IDS.map(() => ({ current: null })),
  );
  const readyPlayersRef = useRef(new Set<number>());
  const shareScales = useRef(
    PLAYBACK_SPIKE_VIDEO_IDS.map(() => new Animated.Value(1)),
  );
  const swipePausedRef = useRef(false);

  const log = useCallback((message: string) => {
    const entry = `${timestamp()}  ${message}`;
    console.log(`[playback-spike] ${entry}`);
    setEventLog((current) => [entry, ...current].slice(0, 8));
  }, []);

  const seekAndPlay = useCallback(
    (index: number, token: number, reason: string) => {
      if (activeIndexRef.current !== index || activationTokenRef.current !== token) {
        return;
      }

      const player = playerRefs.current[index].current;
      if (!player || !readyPlayersRef.current.has(index)) {
        log(`player not ready; waiting to seek/play video ${index + 1}`);
        return;
      }

      log(`seek-to-zero command → video ${index + 1} (${reason})`);
      player.seekTo(0, true);
      setDebug((current) => ({ ...current, playbackPosition: 0 }));

      // Let the controlled pause reach the old WebView before asking the new one to play.
      setTimeout(() => {
        if (activeIndexRef.current !== index || activationTokenRef.current !== token) {
          return;
        }
        log(`play command → video ${index + 1}`);
        setPlayingIndex(index);
      }, 150);
    },
    [log],
  );

  const activateVideo = useCallback(
    (nextIndex: number) => {
      if (nextIndex === activeIndexRef.current) {
        return;
      }

      const previousIndex = activeIndexRef.current >= 0 ? activeIndexRef.current : null;
      if (previousIndex !== null) {
        log(`pause command → video ${previousIndex + 1}`);
      }

      setPlayingIndex(null);
      activeIndexRef.current = nextIndex;
      const token = ++activationTokenRef.current;
      const videoId = PLAYBACK_SPIKE_VIDEO_IDS[nextIndex];
      const activationTimestamp = timestamp();

      setDebug({
        activationTimestamp,
        activeIndex: nextIndex,
        buffering: false,
        playbackPosition: 0,
        playerState: PLAYER_STATES.UNSTARTED,
        previousIndex,
        videoId,
      });
      log(
        `activate video ${nextIndex + 1}; previous=${previousIndex === null ? "none" : previousIndex + 1}; id=${videoId}`,
      );
      seekAndPlay(nextIndex, token, "activation");
    },
    [log, seekAndPlay],
  );

  useEffect(() => {
    activateVideo(0);
  }, [activateVideo]);

  useEffect(() => {
    const interval = setInterval(() => {
      const index = activeIndexRef.current;
      const player = index >= 0 ? playerRefs.current[index].current : null;
      if (!player) {
        return;
      }

      void player
        .getCurrentTime()
        .then((position) => {
          if (activeIndexRef.current !== index) {
            return;
          }
          setDebug((current) => ({ ...current, playbackPosition: position }));
          console.log(
            `[playback-spike] ${timestamp()}  playback position → video ${index + 1}: ${position.toFixed(2)}s`,
          );
        })
        .catch((error: unknown) => {
          log(`position read failed → ${String(error)}`);
        });
    }, 1000);

    return () => clearInterval(interval);
  }, [log]);

  const handleReady = useCallback(
    (index: number) => {
      readyPlayersRef.current.add(index);
      log(`player ready → video ${index + 1}`);
      if (activeIndexRef.current === index) {
        seekAndPlay(index, activationTokenRef.current, "player ready");
      }
    },
    [log, seekAndPlay],
  );

  const handleStateChange = useCallback(
    (index: number, state: PLAYER_STATES) => {
      const isBuffering = state === PLAYER_STATES.BUFFERING;
      log(`player state → video ${index + 1}: ${state}; buffering=${isBuffering}`);

      if (activeIndexRef.current === index) {
        setDebug((current) => ({
          ...current,
          buffering: isBuffering,
          playerState: state,
        }));
        if (state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.ENDED) {
          setPlayingIndex(null);
        }
      }
    },
    [log],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.max(
        0,
        Math.min(
          PLAYBACK_SPIKE_VIDEO_IDS.length - 1,
          Math.round(event.nativeEvent.contentOffset.y / height),
        ),
      );
      if (nextIndex === activeIndexRef.current) {
        if (swipePausedRef.current) {
          log(`remount active player → video ${nextIndex + 1} (swipe cancelled)`);
        }
      } else {
        activateVideo(nextIndex);
      }
      swipePausedRef.current = false;
      setSuspendedIndex(null);
    },
    [activateVideo, height, log],
  );

  const handleScrollBeginDrag = useCallback(() => {
    const index = activeIndexRef.current;
    if (index < 0) {
      return;
    }
    swipePausedRef.current = true;
    activationTokenRef.current += 1;
    setPlayingIndex(null);
    setSuspendedIndex(index);
    log(`pause and suspend player → video ${index + 1} (swipe began)`);
  }, [log]);

  const toggleLike = useCallback(
    (index: number) => {
      const nextLiked = !likedVideos[index];
      setLikedVideos((current) =>
        current.map((liked, videoIndex) => (videoIndex === index ? nextLiked : liked)),
      );
      log(`${nextLiked ? "like" : "unlike"} test tap → video ${index + 1}`);
    },
    [likedVideos, log],
  );

  const testShare = useCallback(
    (index: number) => {
      const nextReposted = !repostedVideos[index];
      setRepostedVideos((current) =>
        current.map((reposted, videoIndex) =>
          videoIndex === index ? nextReposted : reposted,
        ),
      );
      log(`${nextReposted ? "repost" : "undo repost"} test tap → video ${index + 1}`);
      const scale = shareScales.current[index];
      Animated.sequence([
        Animated.spring(scale, {
          friction: 4,
          toValue: 1.3,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          friction: 4,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [log, repostedVideos],
  );

  const shortFrameWidth = width * 0.9;
  const shortFrameHeight = shortFrameWidth * (16 / 9);
  // The wrapper's page is always 16:9. Oversize that landscape canvas so a
  // contained 9:16 Short exactly fills this vertical frame without cropping.
  const youtubeCanvasWidth = shortFrameHeight * (16 / 9);

  return (
    <View style={styles.screen}>
      <FlatList
        data={[...PLAYBACK_SPIKE_VIDEO_IDS]}
        getItemLayout={(_, index) => ({ index, length: height, offset: height * index })}
        keyExtractor={(videoId) => videoId}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollBeginDrag={handleScrollBeginDrag}
        pagingEnabled
        renderItem={({ item: videoId, index }) => (
          <View style={[styles.page, { height }]}>
            <View
              style={[
                styles.playerFrame,
                { height: shortFrameHeight, width: shortFrameWidth },
              ]}
            >
              {suspendedIndex === index ? (
                <View style={styles.suspendedPlayer}>
                  <Text style={styles.suspendedText}>PAUSED FOR SWIPE</Text>
                </View>
              ) : (
                <YoutubePlayer
                  height={shortFrameHeight}
                  initialPlayerParams={{
                    controls: false,
                    iv_load_policy: 3,
                    preventFullScreen: true,
                    showClosedCaptions: false,
                  }}
                  mute={playingIndex !== index}
                  onChangeState={(state: PLAYER_STATES) => handleStateChange(index, state)}
                  onError={(error: string) => log(`player error → video ${index + 1}: ${error}`)}
                  onReady={() => handleReady(index)}
                  play={playingIndex === index}
                  ref={playerRefs.current[index]}
                  videoId={videoId}
                  webViewProps={{ injectedJavaScript: DISABLE_YOUTUBE_CAPTIONS_SCRIPT }}
                  width={youtubeCanvasWidth}
                />
              )}
              <View style={styles.actions}>
                <Pressable
                  accessibilityLabel={likedVideos[index] ? "Unlike test video" : "Like test video"}
                  onPress={() => toggleLike(index)}
                  style={[styles.actionButton, likedVideos[index] && styles.likedButton]}
                >
                  <Text style={[styles.actionIcon, likedVideos[index] && styles.likedIcon]}>♥</Text>
                  <Text style={styles.actionLabel}>{likedVideos[index] ? "Liked" : "Like"}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={repostedVideos[index] ? "Undo test repost" : "Test repost"}
                  onPress={() => testShare(index)}
                  style={[styles.actionButton, repostedVideos[index] && styles.repostedButton]}
                >
                  <View style={styles.repostIconContainer}>
                    <Animated.Text
                      style={[
                        styles.actionIcon,
                        repostedVideos[index] && styles.repostedIcon,
                        { transform: [{ scale: shareScales.current[index] }] },
                      ]}
                    >
                      ↻
                    </Animated.Text>
                    {repostedVideos[index] && <Text style={styles.repostCheck}>✓</Text>}
                  </View>
                  <Text style={styles.actionLabel}>
                    {repostedVideos[index] ? "Reposted" : "Repost"}
                  </Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.dimensionsLabel}>
              Full uncropped Short · 9:16 frame {Math.round(shortFrameWidth)} × {Math.round(shortFrameHeight)}
            </Text>
            <Text style={styles.videoLabel}>Video {String.fromCharCode(65 + index)}</Text>
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />

      <View pointerEvents="box-none" style={styles.debugOverlay}>
        <View pointerEvents="none" style={styles.debugPanel}>
          <Text style={styles.debugTitle}>PLAYBACK SPIKE</Text>
          <Text style={styles.debugText}>
            active={debug.activeIndex} previous={debug.previousIndex ?? "none"} id={debug.videoId}
          </Text>
          <Text style={styles.debugText}>activated={debug.activationTimestamp}</Text>
          <Text style={styles.debugText}>
            state={debug.playerState} buffering={String(debug.buffering)} position=
            {debug.playbackPosition?.toFixed(2) ?? "unavailable"}s
          </Text>
          {eventLog.slice(0, 3).map((entry) => (
            <Text key={entry} numberOfLines={1} style={styles.logText}>
              {entry}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 24,
    minWidth: 76,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionIcon: {
    color: "#ffffff",
    fontSize: 27,
    lineHeight: 30,
  },
  actionLabel: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },
  actions: {
    bottom: 18,
    flexDirection: "column",
    gap: 12,
    position: "absolute",
    right: 12,
  },
  debugOverlay: {
    bottom: 0,
    left: 0,
    paddingBottom: 36,
    paddingHorizontal: 12,
    paddingTop: 52,
    position: "absolute",
    right: 0,
    top: 0,
  },
  debugPanel: {
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    borderRadius: 8,
    padding: 10,
  },
  debugText: {
    color: "#ffffff",
    fontFamily: "monospace",
    fontSize: 11,
  },
  debugTitle: {
    color: "#72ff72",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  dimensionsLabel: {
    color: "#a9a9a9",
    fontFamily: "monospace",
    fontSize: 10,
    marginTop: 6,
  },
  logText: {
    color: "#b8d8ff",
    fontFamily: "monospace",
    fontSize: 9,
    marginTop: 2,
  },
  likedButton: {
    backgroundColor: "rgba(0, 0, 0, 0.68)",
  },
  likedIcon: {
    color: "#ff2d55",
  },
  page: {
    alignItems: "center",
    backgroundColor: "#161616",
    justifyContent: "center",
  },
  playerFrame: {
    alignItems: "center",
    backgroundColor: "#000000",
    borderColor: "#f0f0f0",
    borderWidth: 2,
    justifyContent: "center",
    overflow: "hidden",
  },
  screen: {
    backgroundColor: "#161616",
    flex: 1,
  },
  repostCheck: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    position: "absolute",
  },
  repostedButton: {
    backgroundColor: "rgba(0, 0, 0, 0.68)",
  },
  repostedIcon: {
    color: "#34c759",
  },
  repostIconContainer: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 34,
  },
  suspendedPlayer: {
    alignItems: "center",
    backgroundColor: "#050505",
    flex: 1,
    justifyContent: "center",
  },
  suspendedText: {
    color: "#9cff9c",
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "700",
  },
  videoLabel: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
  },
});
