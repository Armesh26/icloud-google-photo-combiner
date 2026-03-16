"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

export default function NavBar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    setUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold">
          Photo<span className="text-indigo-500">Fuse</span>
        </Link>

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="w-20 h-8 bg-zinc-800 rounded-lg animate-pulse" />
          ) : user ? (
            <>
              <span className="text-xs text-zinc-500 hidden sm:inline">
                {user.email}
              </span>
              <Link
                href="/dashboard"
                className="px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
