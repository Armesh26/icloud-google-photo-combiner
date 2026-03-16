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

    // Check that user is a member (not owner)
    const { data: event } = await supabase
      .from("events")
      .select("user_id")
      .eq("id", eventId)
      .single();

    if (event?.user_id === user.id) {
      return NextResponse.json(
        { error: "Owners cannot leave their own event. Delete the event instead." },
        { status: 400 }
      );
    }

    // Remove the membership
    const { error: deleteError } = await supabase
      .from("event_members")
      .delete()
      .eq("event_id", eventId)
      .eq("email", user.email!);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to leave event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leave event error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
