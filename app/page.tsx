import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            No uploads needed
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
            Photo
            <span className="text-indigo-500">Fuse</span>
          </h1>

          <p className="text-xl text-zinc-400 mb-4 text-balance">
            Combine Google Photos and iCloud shared albums into one beautiful
            gallery. Just paste your links.
          </p>

          <p className="text-sm text-zinc-600 mb-10">
            Sign in with just your email. Photos load directly from Google
            &amp; Apple CDNs.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/create"
              className="px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors text-lg"
            >
              Create an Event
            </Link>
            <Link
              href="/dashboard"
              className="px-8 py-3.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-semibold transition-colors text-lg"
            >
              My Events
            </Link>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="border-t border-zinc-900 py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-sm font-medium text-zinc-500 uppercase tracking-widest mb-10">
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <Step
              number="1"
              title="Create an event"
              description="Name your event — a trip, wedding, hackathon, or anything."
            />
            <Step
              number="2"
              title="Paste album links"
              description="Add Google Photos or iCloud shared album URLs. Add as many as you want."
            />
            <Step
              number="3"
              title="Share the gallery"
              description="Get a single link with all photos combined. Select and download as a ZIP."
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-6 px-4">
        <p className="text-center text-xs text-zinc-600">
          PhotoFuse &mdash; Images are never stored on our servers. They load
          directly from source CDNs.
        </p>
      </footer>
    </main>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4 text-indigo-400 font-bold text-sm">
        {number}
      </div>
      <h3 className="font-semibold text-zinc-200 mb-2">{title}</h3>
      <p className="text-sm text-zinc-500">{description}</p>
    </div>
  );
}
