type PlaybackSpikeVideo = {
  originalUrl: string;
  videoId: string;
};

/**
 * Keep exactly three entries so the A → B → C → B → A test sequence stays fixed.
 * Preserve each submitted URL independently from its parsed YouTube video ID.
 */
export const PLAYBACK_SPIKE_VIDEOS = [
  {
    originalUrl: "https://www.youtube.com/shorts/l0un24OLf_8?feature=share",
    videoId: "l0un24OLf_8",
  },
  {
    originalUrl: "https://www.youtube.com/shorts/SZJS4EohvMg?feature=share",
    videoId: "SZJS4EohvMg",
  },
  {
    originalUrl: "https://www.youtube.com/shorts/2VWoUEoe0dU?feature=share",
    videoId: "2VWoUEoe0dU",
  },
] as const satisfies readonly [PlaybackSpikeVideo, PlaybackSpikeVideo, PlaybackSpikeVideo];

export const PLAYBACK_SPIKE_VIDEO_IDS = PLAYBACK_SPIKE_VIDEOS.map(
  ({ videoId }) => videoId,
);
