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

    const scrapeResults = await Promise.allSettled(
      albumUrls.map(async (url) => {
        const validation = validateAlbumUrl(url);
        const source = validation.source!;

        const { data: album, error: albumError } = await supabase
          .from("albums")
          .insert({
            event_id: event.id,
            source,
            album_url: url,
          })
          .select()
          .single();

        if (albumError || !album) {
          throw new Error(`Failed to create album for ${url}`);
        }

        const count = await scrapeAndStoreAlbum(album.id, source, url, true);
        return { url, count };
      })
    );

    const results = scrapeResults.map((r, i) => ({
      url: albumUrls[i],
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
