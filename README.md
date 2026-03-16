# PhotoFuse

Aggregate photos from Google Photos and iCloud shared albums into a single unified gallery page. No login required — users paste public shared album links and get a combined gallery they can share.

## Tech Stack

- **Next.js 14** (App Router, React Server Components)
- **TypeScript**
- **TailwindCSS**
- **Supabase** (Postgres)
- **cheerio** + **axios** (scraping)
- **JSZip** (client-side zip download)

## Features

- Create events (trips, weddings, hackathons, etc.)
- Paste Google Photos / iCloud shared album URLs
- Unified responsive photo gallery with masonry grid
- Multi-select + download as ZIP (client-side, no server cost)
- Add additional albums to existing events
- Shareable event links
- Source filtering (Google / iCloud / All)
- Photo preview modal with keyboard navigation
- Lazy loading + pagination for thousands of images
- 30-minute scrape cache to avoid re-fetching

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

## Local Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd icloud-google-photo-combiner
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Go to **Settings > API** and copy your Project URL and anon key

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push
```

### 2. Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

The free tier is sufficient — images load from Google/Apple CDNs, not your server.

## Project Structure

```
app/
├── page.tsx                    # Home / landing page
├── create/page.tsx             # Create event form
├── event/[slug]/page.tsx       # Event gallery
├── event/[slug]/add-album/     # Add album to event
├── api/
│   ├── create-event/route.ts   # POST create event + scrape
│   ├── add-album/route.ts      # POST add album to event
│   └── events/[slug]/route.ts  # GET event data + photos
components/
├── photo-grid.tsx              # Grid with filtering + pagination
├── photo-card.tsx              # Individual photo card
├── photo-modal.tsx             # Full-screen preview
└── selection-toolbar.tsx       # Multi-select + ZIP download
lib/
├── db.ts                       # Supabase client + types
├── utils.ts                    # URL validation, slugify, cache check
├── scrape.ts                   # Orchestrates scraping + DB storage
├── googleScraper.ts            # Google Photos HTML scraper
└── icloudScraper.ts            # iCloud sharedstreams API client
supabase/
└── schema.sql                  # Database schema
```

## How Scraping Works

**Google Photos**: Fetches the public shared album HTML page and extracts `lh3.googleusercontent.com` image URLs using regex + cheerio. Appends `=w0` for original resolution.

**iCloud**: Extracts the album token from the URL fragment, calls Apple's `sharedstreams` API endpoints to get photo GUIDs, then fetches asset download URLs in batches.

Albums are scraped once when added. Re-scraping only happens if data is older than 30 minutes (checked on page load, non-blocking).

## Security

- Only `photos.app.goo.gl`, `photos.google.com`, and `icloud.com` domains are accepted
- No user authentication or PII stored
- No image files stored — only metadata + CDN URLs
- All images load directly from source CDNs
