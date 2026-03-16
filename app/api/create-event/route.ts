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
    const { name, albumUrls } = body as {
      name: string;
      albumUrls: string[];
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Event name is required" },
        { status: 400 }
      );
    }

    if (!albumUrls || albumUrls.length === 0) {
      return NextResponse.json(
        { error: "At least one album link is required" },
        { status: 400 }
      );
    }

    for (const url of albumUrls) {
      const validation = validateAlbumUrl(url);
      if (!validation.valid) {
        return NextResponse.json(
          { error: `Invalid URL "${url}": ${validation.error}` },
          { status: 400 }
        );
      }
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({ name: name.trim(), user_id: user.id })
      .select()
      .single();

    if (eventError || !event) {
      console.error("Supabase insert error:", eventError);
      return NextResponse.json(
        { error: `Failed to create event: ${eventError?.message || "unknown"}` },
        { status: 500 }
      );
    }

    const albumRows = albumUrls.map((url) => ({
      event_id: event.id,
      source: validateAlbumUrl(url).source!,
      album_url: url,
    }));

    const { data: albums, error: albumsError } = await supabase
      .from("albums")
      .insert(albumRows)
      .select();

    if (albumsError || !albums) {
      return NextResponse.json(
        { error: `Failed to create albums: ${albumsError?.message || "unknown"}` },
        { status: 500 }
      );
    }

    const scrapeResults = await Promise.allSettled(
      albums.map((album) =>
        scrapeAndStoreAlbum(album.id, album.source, album.album_url, true)
          .then((count) => ({ url: album.album_url, count }))
      )
    );

    const results = scrapeResults.map((r, i) => ({
      url: albums[i].album_url,
      status: r.status,
      count: r.status === "fulfilled" ? r.value.count : 0,
      error: r.status === "rejected" ? r.reason?.message : undefined,
    }));

    return NextResponse.json({ id: event.id, results });
  } catch (error) {
    console.error("Create event error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
