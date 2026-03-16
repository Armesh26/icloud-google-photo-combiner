import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { albumId } = (await req.json()) as { albumId: string };

    if (!albumId) {
      return NextResponse.json(
        { error: "Album ID required" },
        { status: 400 }
      );
    }

    // Get the album and its event
    const { data: album, error: albumError } = await supabase
      .from("albums")
      .select("id, event_id")
      .eq("id", albumId)
      .single();

    if (albumError || !album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    // Get the event to check ownership
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("user_id")
      .eq("id", album.event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (event.user_id !== user.id) {
      return NextResponse.json(
        { error: "Only the event owner can delete albums" },
        { status: 403 }
      );
    }

    // Delete photos first (cascade should handle this, but be explicit)
    await supabase.from("photos").delete().eq("album_id", albumId);

    // Delete the album
    const { error: deleteError } = await supabase
      .from("albums")
      .delete()
      .eq("id", albumId);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete album" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete album error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
