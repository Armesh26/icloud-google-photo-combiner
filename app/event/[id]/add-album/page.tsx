"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/auth-guard";

export default function AddAlbumPage() {
  return (
    <AuthGuard>
      <AddAlbumContent />
    </AuthGuard>
  );
}

function AddAlbumContent() {
  const params = useParams();
  const eventId = params.id as string;

  const [albumUrl, setAlbumUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = albumUrl.trim();
    if (!trimmed) {
      setError("Album URL is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/add-album", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, albumUrl: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add album");
        return;
      }

      setSuccess(`Added album with ${data.photoCount} photos!`);
      setAlbumUrl("");

      setTimeout(() => {
        window.location.href = `/event/${eventId}`;
      }, 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Link
          href={`/event/${eventId}`}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8 inline-block"
        >
          &larr; Back to event
        </Link>

        <h1 className="text-3xl font-bold mb-2">Add Album</h1>
        <p className="text-zinc-400 mb-10">
          Add another Google Photos or iCloud shared album to this event.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="albumUrl"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Album Link
            </label>
            <input
              id="albumUrl"
              type="url"
              value={albumUrl}
              onChange={(e) => setAlbumUrl(e.target.value)}
              placeholder="https://photos.app.goo.gl/... or https://www.icloud.com/sharedalbum/#..."
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scraping album...
              </>
            ) : (
              "Add Album"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
