"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { Event, InviteWithEvent } from "@/lib/db";

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteWithEvent[]>([]);
  const [sharedEvents, setSharedEvents] = useState<InviteWithEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    const res = await fetch("/api/invites");
    if (res.ok) {
      const data = await res.json();
      setPendingInvites(data.pending || []);
      setSharedEvents(data.accepted || []);
    }
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setEvents(data || []);
      await loadInvites();
      setLoading(false);
    }
    load();
  }, [router, loadInvites]);

  async function handleInviteAction(
    memberId: string,
    action: "accept" | "decline"
  ) {
    setRespondingTo(memberId);
    try {
      const res = await fetch("/api/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, action }),
      });
      if (res.ok) {
        await loadInvites();
      }
    } finally {
      setRespondingTo(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Pending Invites
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
                {pendingInvites.length}
              </span>
            </h2>
            <div className="grid gap-3">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between px-5 py-4 rounded-xl bg-zinc-900 border border-amber-500/20"
                >
                  <div>
                    <h3 className="font-semibold text-zinc-200">
                      {invite.events.name}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Invited {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleInviteAction(invite.id, "accept")}
                      disabled={respondingTo === invite.id}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-xs font-medium transition-colors"
                    >
                      {respondingTo === invite.id ? "..." : "Accept"}
                    </button>
                    <button
                      onClick={() => handleInviteAction(invite.id, "decline")}
                      disabled={respondingTo === invite.id}
                      className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors border border-zinc-700"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Events */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">My Events</h1>
              <p className="text-zinc-500 text-sm mt-1">
                {events.length} event{events.length !== 1 ? "s" : ""}
              </p>
            </div>
            <Link
              href="/create"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors text-sm"
            >
              + New Event
            </Link>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-zinc-800 rounded-2xl">
              <p className="text-zinc-500 text-lg mb-2">No events yet</p>
              <p className="text-zinc-600 text-sm mb-6">
                Create your first event to combine photo albums.
              </p>
              <Link
                href="/create"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors text-sm"
              >
                Create Event
              </Link>
            </div>
          ) : (
            <div className="grid gap-3">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/event/${event.id}`}
                  className="group flex items-center justify-between px-5 py-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <div>
                    <h2 className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                      {event.name}
                    </h2>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {new Date(event.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/event/${event.id}/add-album`}
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700"
                    >
                      + Album
                    </Link>
                    <svg
                      className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Shared With Me */}
        {sharedEvents.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Shared With Me
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-medium">
                {sharedEvents.length}
              </span>
            </h2>
            <div className="grid gap-3">
              {sharedEvents.map((invite) => (
                <Link
                  key={invite.id}
                  href={`/event/${invite.events.id}`}
                  className="group flex items-center justify-between px-5 py-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <div>
                    <h3 className="font-semibold text-zinc-200 group-hover:text-white transition-colors">
                      {invite.events.name}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Joined {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <svg
                    className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
