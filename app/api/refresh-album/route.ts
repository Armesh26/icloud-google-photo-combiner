import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { scrapeAndStoreAlbum } from "@/lib/scrape";
import type { Album } from "@/lib/db";

/**
 * POST /api/refresh-album
 *
 * Explicit refresh endpoint. The scrape orchestrator handles:
 *  - 30-minute cache (returns early if fresh)
 *  - Concurrency dedup (one scrape per album at a time)
 *  - Retry with backoff on 429/5xx
 *
 * Body: { albumId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { albumId } = (await req.json()) as { albumId: string };

    if (!albumId) {
      return NextResponse.json(
        { error: "albumId is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();
    const { data: album } = await supabase
      .from("albums")
      .select("*")
      .eq("id", albumId)
      .single();

    if (!album) {
      return NextResponse.json(
        { error: "Album not found" },
        { status: 404 }
      );
    }

    const typedAlbum = album as Album;
    const count = await scrapeAndStoreAlbum(
      typedAlbum.id,
      typedAlbum.source,
      typedAlbum.album_url
    );

    if (count === -1) {
      return NextResponse.json({ refreshed: false, reason: "cache_fresh" });
    }

    return NextResponse.json({ refreshed: true, photoCount: count });
  } catch (error) {
    console.error("Refresh album error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
