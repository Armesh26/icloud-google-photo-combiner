const GOOGLE_DOMAINS = ["photos.app.goo.gl", "photos.google.com"];
const ICLOUD_DOMAINS = ["icloud.com", "www.icloud.com", "share.icloud.com"];

export function validateAlbumUrl(url: string): {
  valid: boolean;
  source: "google" | "icloud" | null;
  error?: string;
} {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    if (GOOGLE_DOMAINS.includes(hostname)) {
      return { valid: true, source: "google" };
    }

    if (ICLOUD_DOMAINS.includes(hostname)) {
      // Accept multiple iCloud sharing URL formats:
      //   https://www.icloud.com/sharedalbum/#TOKEN
      //   https://share.icloud.com/photos/XXXXX
      if (
        parsed.pathname.startsWith("/sharedalbum") ||
        parsed.pathname.startsWith("/photos/")
      ) {
        return { valid: true, source: "icloud" };
      }
      return {
        valid: false,
        source: null,
        error: "iCloud URL must be a shared album or photos link",
      };
    }

    return {
      valid: false,
      source: null,
      error: "Domain not allowed. Use Google Photos or iCloud shared album links.",
    };
  } catch {
    return { valid: false, source: null, error: "Invalid URL format" };
  }
}

export function shouldRescrape(lastScrapedAt: string | null): boolean {
  if (!lastScrapedAt) return true;
  const thirtyMinutes = 30 * 60 * 1000;
  return Date.now() - new Date(lastScrapedAt).getTime() > thirtyMinutes;
}
