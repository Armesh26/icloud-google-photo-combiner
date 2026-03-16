"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PhotoGrid from "@/components/photo-grid";
import MemberManager from "@/components/member-manager";
import type { Event, Album, PhotoWithAlbum } from "@/lib/db";

type EventData = {
  event: Event;
  albums: Album[];
  photos: PhotoWithAlbum[];
  isOwner: boolean;
};

export default function EventGalleryPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const hasAutoRefreshed = useRef(false);

  const fetchEvent = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${id}`, { cache: "no-store" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorCode(res.status);
        if (res.status === 401) setError(json.error || "Sign in to view this event");
        else if (res.status === 403) setError(json.error || "You don't have access to this event");
        else if (res.status === 404) setError("Event not found");
        else setError("Failed to load event");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
      setErrorCode(null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const backgroundRefresh = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      else setChecking(true);

      try {
        const res = await fetch("/api/refresh-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: id, force: true }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.updated) await fetchEvent();
        }
      } catch {
        // silent — background refresh is best-effort
      } finally {
        setRefreshing(false);
        setChecking(false);
      }
    },
    [id, fetchEvent]
  );

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  // Passive background refresh: once per mount, after initial data loads
  useEffect(() => {
    if (!data || hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;
    backgroundRefresh(false);
  }, [data, backgroundRefresh]);

  useEffect(() => {
    function handleFocus() {
      fetchEvent();
    }
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fetchEvent();
    });
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchEvent]);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading event...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            {errorCode === 401 ? (
              <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            ) : errorCode === 403 ? (
              <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            )}
          </div>
          <h1 className="text-xl font-bold mb-2">{error || "Not found"}</h1>
          {errorCode === 401 ? (
            <div className="space-y-3 mt-4">
              <p className="text-zinc-500 text-sm">You need to sign in to view this event.</p>
              <button
                onClick={() => router.push("/login")}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors text-sm"
              >
                Sign in
              </button>
            </div>
          ) : errorCode === 403 ? (
            <p className="text-zinc-500 text-sm mt-2">
              Ask the event creator to add your email to the invite list.
            </p>
          ) : null}
          <Link
            href="/"
            className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors mt-4 inline-block"
          >
            &larr; Go home
          </Link>
        </div>
      </main>
    );
  }

  const { event, albums, photos, isOwner } = data;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <Link
              href={isOwner ? "/dashboard" : "/"}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-2 inline-block"
            >
              &larr; {isOwner ? "Dashboard" : "Home"}
            </Link>
            <h1 className="text-3xl font-bold">{event.name}</h1>
            <p className="text-zinc-500 text-sm mt-1">
              {albums.length} album{albums.length !== 1 ? "s" : ""} &middot;{" "}
              {photos.length} photo{photos.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex gap-3">
            {isOwner && (
              <button
                onClick={() => backgroundRefresh(true)}
                disabled={refreshing}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-60"
                title="Re-scrape all albums for new photos"
              >
                <svg
                  className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            )}
            {isOwner && (
              <Link
                href={`/event/${id}/add-album`}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm font-medium transition-colors"
              >
                + Add Album
              </Link>
            )}
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert("Link copied!");
              }}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm font-medium transition-colors"
            >
              Share Link
            </button>
            {!isOwner && (
              <button
                onClick={async () => {
                  if (!confirm("Leave this event? You'll need a new invite to access it again.")) return;
                  const res = await fetch("/api/leave-event", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ eventId: id }),
                  });
                  if (res.ok) {
                    router.push("/dashboard");
                  } else {
                    const json = await res.json().catch(() => ({}));
                    alert(json.error || "Failed to leave event");
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium transition-colors"
              >
                Leave Event
              </button>
            )}
            {isOwner && (
              <button
                onClick={async () => {
                  const confirmText = `Type "${event.name}" to permanently delete this event and all its data:`;
                  const input = prompt(confirmText);
                  if (input !== event.name) {
                    if (input !== null) alert("Event not deleted. You must type the exact event name to confirm.");
                    return;
                  }
                  const res = await fetch("/api/delete-event", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ eventId: id }),
                  });
                  if (res.ok) {
                    router.push("/dashboard");
                  } else {
                    const json = await res.json().catch(() => ({}));
                    alert(json.error || "Failed to delete event");
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium transition-colors"
              >
                Delete Event
              </button>
            )}
          </div>
        </div>

        {albums.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {albums.map((album) => (
              <span
                key={album.id}
                className={`group/album inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                  album.source === "google"
                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                    : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {album.source === "google" ? "Google Photos" : "iCloud"}
                {isOwner && (
                  <button
                    onClick={async () => {
                      const confirmText = `Type "delete" to remove this ${album.source === "google" ? "Google Photos" : "iCloud"} album and all its photos:`;
                      const input = prompt(confirmText);
                      if (input?.toLowerCase() !== "delete") {
                        if (input !== null) alert("Album not deleted. You must type 'delete' to confirm.");
                        return;
                      }
                      const res = await fetch("/api/delete-album", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ albumId: album.id }),
                      });
                      if (res.ok) {
                        fetchEvent();
                      } else {
                        const json = await res.json().catch(() => ({}));
                        alert(json.error || "Failed to delete album");
                      }
                    }}
                    className="ml-1 opacity-0 group-hover/album:opacity-100 hover:text-white transition-all"
                    title="Delete album"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {checking && (
          <div className="flex items-center gap-2 mb-4 text-xs text-zinc-500">
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Checking for new photos...
          </div>
        )}

        {isOwner && <MemberManager eventId={id} />}

        <PhotoGrid photos={photos} />
      </div>
    </main>
  );
}
