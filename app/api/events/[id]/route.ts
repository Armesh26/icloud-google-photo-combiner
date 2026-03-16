import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import type { Album } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseServer();
    const { id } = params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Sign in to view this event" },
        { status: 401 }
      );
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    const isOwner = event.user_id === user.id;

    if (!isOwner) {
      const { data: membership } = await supabase
        .from("event_members")
        .select("id, status")
        .eq("event_id", id)
        .eq("email", user.email!)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to this event" },
          { status: 403 }
        );
      }

      if (membership.status === "pending") {
        return NextResponse.json(
          { error: "You have a pending invite for this event. Accept it from your dashboard first." },
          { status: 403 }
        );
      }

      if (membership.status === "declined") {
        return NextResponse.json(
          { error: "You declined the invite to this event" },
          { status: 403 }
        );
      }
    }

    const { data: albums } = await supabase
      .from("albums")
      .select("*")
      .eq("event_id", event.id);

    const albumIds = (albums || []).map((a: Album) => a.id);

    const { data: photos, error: photosError } = albumIds.length > 0
      ? await supabase
          .from("photos")
          .select("*, albums!inner(source)")
          .in("album_id", albumIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (photosError) {
      return NextResponse.json(
        { error: "Failed to fetch photos" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      event,
      albums: albums || [],
      photos: photos || [],
      isOwner,
    });
  } catch (error) {
    console.error("Get event error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
