import { NextResponse } from "next/server";
import { parseYouTubeShortsId } from "@/lib/youtube";

type YouTubeOEmbed = {
  author_name?: string;
  author_url?: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== "string") throw new Error("Enter a YouTube Shorts URL first.");
    const videoId = parseYouTubeShortsId(body.url);
    const canonicalUrl = `https://www.youtube.com/shorts/${videoId}`;
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`, { cache: "no-store" });
    if (!response.ok) throw new Error("YouTube did not return creator information for this video.");
    const metadata = await response.json() as YouTubeOEmbed;
    const displayName = metadata.author_name?.trim();
    if (!displayName) throw new Error("YouTube did not return a creator display name.");

    const authorUrl = metadata.author_url ? new URL(metadata.author_url) : null;
    const finalSegment = authorUrl?.pathname.split("/").filter(Boolean).at(-1) ?? "";
    const handle = finalSegment.replace(/^@/, "") || displayName.replace(/\s+/g, "").slice(0, 120);
    return NextResponse.json({ displayName, handle, authorUrl: metadata.author_url ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to get the YouTube creator profile.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
