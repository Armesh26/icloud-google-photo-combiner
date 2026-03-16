import { getSupabase } from "./db";
import { scrapeGooglePhotosAlbum } from "./googleScraper";
import {
  scrapeICloudAlbum,
  scrapeICloudShareLink,
  fetchICloudAlbumName,
  fetchICloudShareLinkName,
} from "./icloudScraper";
import { fetchGoogleAlbumName } from "./googleScraper";
import type { ScrapedPhoto } from "./googleScraper";
import { shouldRescrape } from "./utils";

// ---------------------------------------------------------------------------
// In-memory lock: prevents concurrent scrapes of the same album across
// simultaneous requests in a single serverless instance. On Vercel this is
// per-isolate; separate cold starts get their own lock map, which is fine —
// worst case two isolates both scrape, but the DB upsert is idempotent.
// ---------------------------------------------------------------------------

const activeScrapes = new Map<string, Promise<number>>();

/**
 * The single entry-point for all scraping. Handles:
 *  - 30-minute cache window (skips if fresh)
 *  - Concurrency dedup (returns existing promise if album is already being scraped)
 *  - Retry with exponential backoff on 429
 *
 * @param force  If true, ignore the cache window and scrape regardless.
 */
export async function scrapeAndStoreAlbum(
  albumId: string,
  source: "google" | "icloud",
  albumUrl: string,
  force = false
): Promise<number> {
  // Check cache window unless forced (e.g. first add)
  if (!force) {
    const supabase = getSupabase();
    const { data: album } = await supabase
      .from("albums")
      .select("last_scraped_at")
      .eq("id", albumId)
      .single();

    if (album && !shouldRescrape(album.last_scraped_at)) {
      return -1; // signal: skipped, data is fresh
    }
  }

  // Dedup: if this album is already being scraped, piggyback on that promise
  const existing = activeScrapes.get(albumId);
  if (existing) return existing;

  const promise = doScrape(albumId, source, albumUrl);
  activeScrapes.set(albumId, promise);

  try {
    return await promise;
  } finally {
    activeScrapes.delete(albumId);
  }
}

async function resolveAlbumName(source: string, albumUrl: string): Promise<string | null> {
  try {
    if (source === "google") return await fetchGoogleAlbumName(albumUrl);
    if (albumUrl.includes("share.icloud.com/photos/")) return await fetchICloudShareLinkName(albumUrl);
    return await fetchICloudAlbumName(albumUrl);
  } catch {
    return null;
  }
}

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 2000;

async function doScrape(
  albumId: string,
  source: "google" | "icloud",
  albumUrl: string
): Promise<number> {
  let photos: ScrapedPhoto[] = [];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      photos =
        source === "google"
          ? await scrapeGooglePhotosAlbum(albumUrl)
          : albumUrl.includes("share.icloud.com/photos/")
            ? await scrapeICloudShareLink(albumUrl)
            : await scrapeICloudAlbum(albumUrl);
      lastError = null;
      break;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Retry only on 429 or 5xx; bail immediately on other errors
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 429 || (status && status >= 500)) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }

  if (lastError) throw lastError;

  // Pre-test video URLs: HEAD request to verify they're actually playable
  // Hide any video that returns non-2xx
  const validatedPhotos = await validateMediaUrls(photos);

  const supabase = getSupabase();

  // Delete old rows and re-insert (full refresh)
  await supabase.from("photos").delete().eq("album_id", albumId);

  if (validatedPhotos.length === 0) return 0;

  const rows = validatedPhotos.map((p) => ({
    album_id: albumId,
    photo_url: p.photo_url,
    thumbnail_url: p.thumbnail_url,
    width: p.width,
    height: p.height,
    media_type: p.media_type,
  }));

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("photos").insert(batch);
    if (error) throw new Error(`Failed to insert photos: ${error.message}`);
  }

  // Fetch album name once (only if not already stored)
  const { data: albumRow } = await supabase
    .from("albums")
    .select("album_name")
    .eq("id", albumId)
    .single();

  const updatePayload: Record<string, unknown> = { last_scraped_at: new Date().toISOString() };

  if (!albumRow?.album_name) {
    const name = await resolveAlbumName(source, albumUrl);
    if (name) updatePayload.album_name = name;
  }

  await supabase.from("albums").update(updatePayload).eq("id", albumId);

  return validatedPhotos.length;
}

// ---------------------------------------------------------------------------
// Validate media URLs: HEAD request to check if videos are actually playable
// Images are assumed valid (they almost always work with referrerPolicy)
// ---------------------------------------------------------------------------

async function validateMediaUrls(photos: ScrapedPhoto[]): Promise<ScrapedPhoto[]> {
  const results = await Promise.all(
    photos.map(async (photo) => {
      // Only validate videos - images almost always work
      if (photo.media_type !== "video") {
        return photo;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(photo.photo_url, {
          method: "HEAD",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          },
        });

        clearTimeout(timeoutId);

        // 2xx or 206 (partial content) means the video URL is valid.
        // 501/405 means the CDN doesn't support HEAD (e.g. iCloud) — treat as valid.
        if (res.ok || res.status === 206 || res.status === 501 || res.status === 405) {
          return photo;
        }

        // Non-2xx (excluding above): video URL is broken, hide this item
        console.log(`Video URL failed (${res.status}): ${photo.photo_url.slice(0, 80)}...`);
        return null;
      } catch (err) {
        // Timeout or network error: hide this item
        console.log(`Video URL check failed: ${err instanceof Error ? err.message : err}`);
        return null;
      }
    })
  );

  return results.filter((p): p is ScrapedPhoto => p !== null);
}
