import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { scrapeAndStoreAlbum } from "@/lib/scrape";
import type { Album } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId, force } = (await req.json()) as {
      eventId: string;
      force?: boolean;
    };

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId is required" },
        { status: 400 }
      );
    }

    const { data: event } = await supabase
      .from("events")
      .select("id, user_id")
      .eq("id", eventId)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const isOwner = event.user_id === user.id;

    if (!isOwner) {
      const { data: membership } = await supabase
        .from("event_members")
        .select("id, status")
        .eq("event_id", eventId)
        .eq("email", user.email!)
        .eq("status", "accepted")
        .single();

      if (!membership) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const shouldForce = !!force;

    const { data: albums } = await supabase
      .from("albums")
      .select("*")
      .eq("event_id", eventId);

    if (!albums || albums.length === 0) {
      return NextResponse.json({ updated: false, albums: [] });
    }

    const results = await Promise.allSettled(
      albums.map(async (album: Album) => {
        const count = await scrapeAndStoreAlbum(
          album.id,
          album.source,
          album.album_url,
          shouldForce
        );
        return { albumId: album.id, count };
      })
    );

    const updated = results.some(
      (r) => r.status === "fulfilled" && r.value.count > 0
    );

    const albumResults = results.map((r, i) => ({
      albumId: albums[i].id,
      status: r.status,
      count: r.status === "fulfilled" ? r.value.count : 0,
    }));

    return NextResponse.json({ updated, albums: albumResults });
  } catch (error) {
    console.error("Refresh event error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
