export function parseYouTubeShortsId(originalUrl: string): string {
  let parsed: URL;

  try {
    parsed = new URL(originalUrl.trim());
  } catch {
    throw new Error("Enter a complete YouTube Shorts URL.");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname !== "youtube.com" && hostname !== "m.youtube.com") {
    throw new Error("The URL must use youtube.com/shorts/…");
  }

  const match = parsed.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/);
  if (!match) {
    throw new Error("The URL must contain an 11-character YouTube Shorts video ID.");
  }

  return match[1];
}

export function requireNonNegativeInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a whole number of zero or greater.`);
  }
  return parsed;
}

export function requirePositiveSeconds(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Video duration must be greater than zero seconds.");
  }
  return Math.round(parsed * 1000) / 1000;
}
