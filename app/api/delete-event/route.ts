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

    // Delete the event (albums, photos, and members cascade automatically)
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
