import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { validateAlbumUrl } from "@/lib/utils";
import { scrapeAndStoreAlbum } from "@/lib/scrape";

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { eventId, albumUrl } = body as {
      eventId: string;
      albumUrl: string;
    };

    if (!eventId || !albumUrl) {
      return NextResponse.json(
        { error: "Event ID and album URL are required" },
        { status: 400 }
      );
    }

    const validation = validateAlbumUrl(albumUrl);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Verify event exists and belongs to the current user
    const { data: event } = await supabase
      .from("events")
      .select("id, user_id")
      .eq("id", eventId)
      .single();

    if (!event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    if (event.user_id && event.user_id !== user.id) {
      return NextResponse.json(
        { error: "You don't own this event" },
        { status: 403 }
      );
    }

    const { data: existingAlbum } = await supabase
      .from("albums")
      .select("id")
      .eq("event_id", eventId)
      .eq("album_url", albumUrl)
      .single();

    if (existingAlbum) {
      return NextResponse.json(
        { error: "This album has already been added to the event" },
        { status: 409 }
      );
    }

    const source = validation.source!;
    const { data: album, error: albumError } = await supabase
      .from("albums")
      .insert({
        event_id: eventId,
        source,
        album_url: albumUrl,
      })
      .select()
      .single();

    if (albumError || !album) {
      return NextResponse.json(
        { error: "Failed to create album" },
        { status: 500 }
      );
    }

    const count = await scrapeAndStoreAlbum(album.id, source, albumUrl, true);

    return NextResponse.json({
      albumId: album.id,
      photoCount: count,
    });
  } catch (error) {
    console.error("Add album error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
