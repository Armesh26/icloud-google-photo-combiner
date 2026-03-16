"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/auth-guard";

export default function CreateEventPage() {
  return (
    <AuthGuard>
      <CreateEventContent />
    </AuthGuard>
  );
}

function CreateEventContent() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [albumUrls, setAlbumUrls] = useState([""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addUrlField() {
    setAlbumUrls((prev) => [...prev, ""]);
  }

  function removeUrlField(index: number) {
    setAlbumUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function updateUrl(index: number, value: string) {
    setAlbumUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const validUrls = albumUrls.map((u) => u.trim()).filter(Boolean);

    if (!trimmedName) {
      setError("Event name is required");
      return;
    }
    if (validUrls.length === 0) {
      setError("At least one album link is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/create-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, albumUrls: validUrls }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      router.push(`/event/${data.id}`);
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
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8 inline-block"
        >
          &larr; Back home
        </Link>

        <h1 className="text-3xl font-bold mb-2">Create an Event</h1>
        <p className="text-zinc-400 mb-10">
          Combine photos from Google Photos and iCloud shared albums into one
          gallery.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Event name */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-zinc-300 mb-2"
            >
              Event Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Goa Trip, Wedding, Hackathon"
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              disabled={loading}
            />
          </div>

          {/* Album URLs */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Album Links
            </label>
            <p className="text-xs text-zinc-500 mb-4">
              Paste Google Photos or iCloud shared album URLs
            </p>

            <div className="space-y-3">
              {albumUrls.map((url, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => updateUrl(idx, e.target.value)}
                    placeholder="https://photos.app.goo.gl/... or https://www.icloud.com/sharedalbum/#..."
                    className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    disabled={loading}
                  />
                  {albumUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeUrlField(idx)}
                      className="px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-400/30 transition-colors"
                      disabled={loading}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addUrlField}
              disabled={loading}
              className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add another album
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="w-5 h-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Creating &amp; scraping albums...
              </>
            ) : (
              "Create Event"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
