import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: pending } = await supabase
      .from("event_members")
      .select("*, events(id, name)")
      .eq("email", user.email!)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const { data: accepted } = await supabase
      .from("event_members")
      .select("*, events(id, name)")
      .eq("email", user.email!)
      .eq("status", "accepted")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      pending: pending || [],
      accepted: accepted || [],
    });
  } catch (e) {
    console.error("Get invites error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { memberId, action } = (await req.json()) as {
      memberId: string;
      action: "accept" | "decline";
    };

    if (!memberId || !["accept", "decline"].includes(action)) {
      return NextResponse.json(
        { error: "memberId and action (accept/decline) are required" },
        { status: 400 }
      );
    }

    const newStatus = action === "accept" ? "accepted" : "declined";

    const { data: member, error: updateError } = await supabase
      .from("event_members")
      .update({ status: newStatus })
      .eq("id", memberId)
      .eq("email", user.email!)
      .select()
      .single();

    if (updateError || !member) {
      return NextResponse.json(
        { error: "Invite not found or not yours" },
        { status: 404 }
      );
    }

    return NextResponse.json({ member });
  } catch (e) {
    console.error("Update invite error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
