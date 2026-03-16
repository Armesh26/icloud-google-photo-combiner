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

    const { eventId } = (await req.json()) as { eventId: string };

    if (!eventId) {
      return NextResponse.json(
        { error: "Event ID required" },
        { status: 400 }
      );
    }

    // Get the event to check ownership
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("user_id")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (event.user_id !== user.id) {
      return NextResponse.json(
        { error: "Only the event owner can delete this event" },
        { status: 403 }
      );
    }

    // Get all albums for this event
    const { data: albums } = await supabase
      .from("albums")
      .select("id")
      .eq("event_id", eventId);

    // Delete photos for all albums
    if (albums && albums.length > 0) {
      const albumIds = albums.map((a) => a.id);
      await supabase.from("photos").delete().in("album_id", albumIds);
    }

    // Delete albums
    await supabase.from("albums").delete().eq("event_id", eventId);

    // Delete event members
    await supabase.from("event_members").delete().eq("event_id", eventId);

    // Delete the event
    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete event error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
