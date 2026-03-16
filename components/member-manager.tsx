"use client";

import { useEffect, useState, useCallback } from "react";
import type { EventMember } from "@/lib/db";

type Props = {
  eventId: string;
};

export default function MemberManager({ eventId }: Props) {
  const [members, setMembers] = useState<EventMember[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fetchMembers = useCallback(async () => {
    const res = await fetch(`/api/event-members?eventId=${eventId}`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
    }
  }, [eventId]);

  useEffect(() => {
    if (!open) return;
    fetchMembers();
  }, [open, fetchMembers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setLoading(true);
    try {
      const res = await fetch("/api/event-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setMembers((prev) => [...prev, data.member]);
      setEmail("");
    } catch {
      setError("Failed to add member");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(memberId: string) {
    const res = await fetch(
      `/api/event-members?eventId=${eventId}&memberId=${memberId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    }
  }

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
        Manage Access
        {members.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-400">
            {members.length}
          </span>
        )}
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-3">
            Only people with emails listed here (and you) can view this event.
          </p>

          <form onSubmit={handleAdd} className="flex gap-2 mb-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors whitespace-nowrap"
            >
              {loading ? "Adding..." : "Add"}
            </button>
          </form>

          {error && (
            <p className="text-xs text-red-400 mb-3">{error}</p>
          )}

          {members.length === 0 ? (
            <p className="text-xs text-zinc-600">
              No members yet. Only you can view this event.
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800"
                >
                  <span className="text-sm text-zinc-300">{m.email}</span>
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-red-400 transition-colors"
                    title="Remove access"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
