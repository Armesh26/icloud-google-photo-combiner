import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

async function getAuthenticatedOwner(eventId: string) {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, event: null, error: "Unauthorized" };

  const { data: event } = await supabase
    .from("events")
    .select("id, user_id")
    .eq("id", eventId)
    .single();

  if (!event) return { supabase, user, event: null, error: "Event not found" };
  if (event.user_id !== user.id)
    return { supabase, user, event, error: "Only the event owner can manage members" };

  return { supabase, user, event, error: null };
}

export async function GET(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const { supabase, error } = await getAuthenticatedOwner(eventId);
    if (error) {
      const status = error === "Unauthorized" ? 401 : error === "Event not found" ? 404 : 403;
      return NextResponse.json({ error }, { status });
    }

    const { data: members } = await supabase
      .from("event_members")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    return NextResponse.json({ members: members || [] });
  } catch (e) {
    console.error("List members error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { eventId, email } = (await req.json()) as {
      eventId: string;
      email: string;
    };

    if (!eventId || !email?.trim()) {
      return NextResponse.json(
        { error: "eventId and email are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { supabase, error } = await getAuthenticatedOwner(eventId);
    if (error) {
      const status = error === "Unauthorized" ? 401 : error === "Event not found" ? 404 : 403;
      return NextResponse.json({ error }, { status });
    }

    const { data: member, error: insertError } = await supabase
      .from("event_members")
      .insert({ event_id: eventId, email: normalizedEmail })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "This email already has access" },
          { status: 409 }
        );
      }
      throw insertError;
    }

    return NextResponse.json({ member });
  } catch (e) {
    console.error("Add member error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const memberId = req.nextUrl.searchParams.get("memberId");
    const eventId = req.nextUrl.searchParams.get("eventId");

    if (!memberId || !eventId) {
      return NextResponse.json(
        { error: "memberId and eventId are required" },
        { status: 400 }
      );
    }

    const { supabase, error } = await getAuthenticatedOwner(eventId);
    if (error) {
      const status = error === "Unauthorized" ? 401 : error === "Event not found" ? 404 : 403;
      return NextResponse.json({ error }, { status });
    }

    await supabase
      .from("event_members")
      .delete()
      .eq("id", memberId)
      .eq("event_id", eventId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Remove member error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
