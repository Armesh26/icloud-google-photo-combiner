import axios from "axios";
import * as cheerio from "cheerio";

export type ScrapedPhoto = {
  photo_url: string;
  thumbnail_url: string;
  width: number | null;
  height: number | null;
  media_type: "image" | "video";
};

// URL path segments that indicate non-album content (avatars, UI assets)
const EXCLUDED_PATH_SEGMENTS = ["/a/", "/u/0/", "/-", "/default-user", "/icon"];

function isAlbumPhotoUrl(url: string): boolean {
  if (!url.includes("googleusercontent.com/")) return false;
  for (const seg of EXCLUDED_PATH_SEGMENTS) {
    if (url.includes(seg)) return false;
  }
  const path = url.replace(/https:\/\/lh3\.googleusercontent\.com/, "").split("=")[0];
  if (path.length < 20) return false;
  return true;
}

/**
 * Google Photos shared album scraper.
 *
 * Strategy priority:
 *   1. Extract videos from video-downloads.googleusercontent.com URLs
 *   2. Extract og:video meta tags for video URLs
 *   3. Parse AF_initDataCallback data blobs for images
 *   4. Raw URL regex fallback
 *   5. og:image meta tags fallback
 */
export async function scrapeGooglePhotosAlbum(
  albumUrl: string
): Promise<ScrapedPhoto[]> {
  const response = await axios.get(albumUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    maxRedirects: 5,
    timeout: 20000,
  });

  const html: string = response.data;
  const seenUrls = new Set<string>();
  const photos: ScrapedPhoto[] = [];

  // --- Strategy 1: Extract videos first ---
  extractVideos(html, photos, seenUrls);

  // --- Strategy 2: Parse AF_initDataCallback for images ---
  extractFromDataCallbacks(html, photos, seenUrls);

  // --- Strategy 3: Raw URL regex fallback ---
  if (photos.length === 0) {
    extractFromRawUrls(html, photos, seenUrls);
  }

  // --- Strategy 4: og:image meta tags fallback ---
  if (photos.length === 0) {
    extractFromHtmlTags(html, photos, seenUrls);
  }

  return photos;
}

// ---------------------------------------------------------------------------
// Video extraction
// ---------------------------------------------------------------------------

function extractVideos(
  html: string,
  photos: ScrapedPhoto[],
  seenUrls: Set<string>
) {
  const $ = cheerio.load(html);

  // Get the best video URL (prefer video-downloads for highest quality)
  const videoDownloadPattern = /https:\/\/video-downloads\.googleusercontent\.com\/[^\s"'\\]+/g;
  const videoDownloadMatches = html.match(videoDownloadPattern) || [];
  
  // Get thumbnail info from og:video meta tag
  const ogVideoUrl = $('meta[property="og:video"]').attr("content");
  const ogVideoWidth = $('meta[property="og:video:width"]').attr("content");
  const ogVideoHeight = $('meta[property="og:video:height"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");

  // If we have a video-downloads URL, use that (highest quality)
  if (videoDownloadMatches.length > 0) {
    const videoUrl = videoDownloadMatches[0];
    if (!videoUrl) {
      return;
    }

    // Mark as seen to prevent duplicates
    seenUrls.add(videoUrl);
    
    // Also mark the og:video base URL as seen to prevent duplicate entry
    if (ogVideoUrl) {
      const ogBase = ogVideoUrl.split("=")[0];
      seenUrls.add(ogBase);
    }

    // Get thumbnail from og:image or og:video base
    let thumbnailUrl = videoUrl; // fallback
    if (ogImage && ogImage.includes("googleusercontent.com")) {
      thumbnailUrl = ogImage.split("=")[0] + "=w400-h400-c";
    } else if (ogVideoUrl) {
      thumbnailUrl = ogVideoUrl.split("=")[0] + "=w400-h400-c";
    }

    photos.push({
      photo_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      width: ogVideoWidth ? parseInt(ogVideoWidth, 10) : null,
      height: ogVideoHeight ? parseInt(ogVideoHeight, 10) : null,
      media_type: "video",
    });
  } else if (ogVideoUrl) {
    // Fallback: use og:video URL with =dv parameter
    const baseUrl = ogVideoUrl.split("=")[0];
    
    if (!seenUrls.has(baseUrl)) {
      seenUrls.add(baseUrl);

      const thumbnailUrl = ogImage && ogImage.includes("googleusercontent.com")
        ? ogImage.split("=")[0] + "=w400-h400-c"
        : `${baseUrl}=w400-h400-c`;

      photos.push({
        photo_url: `${baseUrl}=dv`,
        thumbnail_url: thumbnailUrl,
        width: ogVideoWidth ? parseInt(ogVideoWidth, 10) : null,
        height: ogVideoHeight ? parseInt(ogVideoHeight, 10) : null,
        media_type: "video",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// AF_initDataCallback extraction (for images)
// ---------------------------------------------------------------------------

function extractFromDataCallbacks(
  html: string,
  photos: ScrapedPhoto[],
  seenUrls: Set<string>
) {
  const callbackPattern = /AF_initDataCallback\(\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = callbackPattern.exec(html)) !== null) {
    const startIdx = match.index + match[0].length - 1;
    const jsonStr = extractBalancedBraces(html, startIdx);
    if (!jsonStr) continue;

    try {
      const parsed = lenientJsonParse(jsonStr);
      if (parsed?.data) {
        walkDataArray(parsed.data, photos, seenUrls, jsonStr);
      }
    } catch {
      // Expected for some callbacks
    }
  }
}

function extractBalancedBraces(html: string, start: number): string | null {
  let depth = 0;
  const maxLen = Math.min(html.length, start + 256 * 1024);
  for (let i = start; i < maxLen; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < maxLen && html[i] !== quote) {
        if (html[i] === "\\") i++;
        i++;
      }
    }
  }
  return null;
}

function lenientJsonParse(str: string): Record<string, unknown> | null {
  try {
    return JSON.parse(str);
  } catch {
    const normalized = str
      .replace(/'/g, '"')
      .replace(/,\s*([\]}])/g, "$1")
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
    try {
      return JSON.parse(normalized);
    } catch {
      return null;
    }
  }
}

function walkDataArray(
  data: unknown,
  photos: ScrapedPhoto[],
  seenUrls: Set<string>,
  fullJson: string
) {
  if (!Array.isArray(data)) return;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    if (typeof item === "string" && item.includes("lh3.googleusercontent.com/")) {
      // Skip if this looks like a video thumbnail (=m18)
      if (item.includes("=m18") || item.includes("=m37") || item.includes("=m22")) {
        continue;
      }

      const w = typeof data[i + 1] === "number" ? (data[i + 1] as number) : null;
      const h = typeof data[i + 2] === "number" ? (data[i + 2] as number) : null;

      if (w === null || h === null) continue;
      if (w < 200 && h < 200) continue;

      const baseUrl = item.split("=")[0];
      if (!isAlbumPhotoUrl(baseUrl)) continue;
      if (seenUrls.has(baseUrl)) continue;

      // Check if this is associated with a video by looking for video markers nearby
      let isVideo = false;
      for (let j = Math.max(0, i - 15); j < Math.min(data.length, i + 15); j++) {
        const sibling = data[j];
        if (typeof sibling === "string") {
          const lower = sibling.toLowerCase();
          if (
            lower.startsWith("video/") ||
            lower.includes("video-downloads.googleusercontent.com")
          ) {
            isVideo = true;
            break;
          }
        }
      }

      // Skip if this is a video - we handle videos separately
      if (isVideo) continue;

      seenUrls.add(baseUrl);

      photos.push({
        photo_url: `${baseUrl}=w0`,
        thumbnail_url: `${baseUrl}=w400-h400-c`,
        width: w,
        height: h,
        media_type: "image",
      });
    } else if (Array.isArray(item)) {
      walkDataArray(item, photos, seenUrls, fullJson);
    }
  }
}

// ---------------------------------------------------------------------------
// Raw URL extraction (fallback)
// ---------------------------------------------------------------------------

function extractFromRawUrls(
  html: string,
  photos: ScrapedPhoto[],
  seenUrls: Set<string>
) {
  const urlPattern = /https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9_\-/]{30,}/g;
  const matches = html.match(urlPattern) || [];

  for (const rawUrl of matches) {
    // Skip video thumbnails
    if (rawUrl.includes("=m18")) continue;

    const baseUrl = rawUrl.split("=")[0];
    if (!isAlbumPhotoUrl(baseUrl)) continue;
    if (seenUrls.has(baseUrl)) continue;
    seenUrls.add(baseUrl);

    photos.push({
      photo_url: `${baseUrl}=w0`,
      thumbnail_url: `${baseUrl}=w400-h400-c`,
      width: null,
      height: null,
      media_type: "image",
    });
  }
}

// ---------------------------------------------------------------------------
// HTML tag fallback
// ---------------------------------------------------------------------------

function extractFromHtmlTags(
  html: string,
  photos: ScrapedPhoto[],
  seenUrls: Set<string>
) {
  const $ = cheerio.load(html);
  $('meta[property="og:image"]').each((_, el) => {
    const src = $(el).attr("content") || "";
    if (src.includes("googleusercontent.com")) {
      const baseUrl = src.split("=")[0];
      if (seenUrls.has(baseUrl)) return;
      seenUrls.add(baseUrl);

      photos.push({
        photo_url: `${baseUrl}=w0`,
        thumbnail_url: `${baseUrl}=w400-h400-c`,
        width: null,
        height: null,
        media_type: "image",
      });
    }
  });
}
