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

// Normalize base URL for consistent comparison
function normalizeBaseUrl(url: string): string {
  // Remove any trailing parameters after = and normalize
  return url.split("=")[0].replace(/\/+$/, "");
}

/**
 * Google Photos shared album scraper.
 *
 * Strategy priority:
 *   1. Identify all video thumbnail base URLs (to exclude from images)
 *   2. Extract videos only if we have a real playable video URL
 *   3. Parse AF_initDataCallback data blobs for images (excluding video thumbnails)
 *   4. Raw URL regex fallback
 *   5. og:image meta tags fallback
 *   6. Post-process: Test each URL to detect video thumbnails that weren't caught
 */
export async function fetchGoogleAlbumName(albumUrl: string): Promise<string | null> {
  try {
    const res = await axios.get(albumUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      maxRedirects: 5,
      timeout: 10000,
    });
    const $ = cheerio.load(res.data as string);
    const ogTitle = $("meta[property='og:title']").attr("content");
    if (ogTitle) return ogTitle.trim();
    const title = $("title").text();
    // Strip " - Google Photos" suffix if present
    return title ? title.replace(/\s*[-–]\s*Google Photos\s*$/i, "").trim() || null : null;
  } catch {
    return null;
  }
}

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
  const videoThumbnailBaseUrls = new Set<string>();
  const photos: ScrapedPhoto[] = [];

  // --- Strategy 1: Identify video thumbnails to exclude ---
  identifyVideoThumbnails(html, videoThumbnailBaseUrls);

  // --- Strategy 2: Extract real videos (only if we have playable URLs) ---
  extractVideos(html, photos, seenUrls);

  // --- Strategy 3: Parse AF_initDataCallback for images ---
  extractFromDataCallbacks(html, photos, seenUrls, videoThumbnailBaseUrls);

  // --- Strategy 4: Raw URL regex fallback ---
  if (photos.length === 0) {
    extractFromRawUrls(html, photos, seenUrls, videoThumbnailBaseUrls);
  }

  // --- Strategy 5: og:image meta tags fallback ---
  if (photos.length === 0) {
    extractFromHtmlTags(html, photos, seenUrls, videoThumbnailBaseUrls);
  }

  // --- Strategy 6: Filter out video thumbnails by testing URLs ---
  // Google doesn't expose video markers in HTML, so we test each URL
  const filteredPhotos = await filterVideoThumbnails(photos);

  return filteredPhotos;
}

/**
 * Test each photo URL to determine if it's actually a video thumbnail.
 * Video thumbnails will return an image when accessed with =w0, but
 * the same base URL won't work as a downloadable image (returns small/broken).
 * We detect this by checking Content-Length - video thumbnails return very small responses.
 */
async function filterVideoThumbnails(photos: ScrapedPhoto[]): Promise<ScrapedPhoto[]> {
  // Only filter items marked as images - videos are already handled
  const imagesToTest = photos.filter(p => p.media_type === "image");
  const videos = photos.filter(p => p.media_type === "video");

  if (imagesToTest.length === 0) {
    return photos;
  }

  console.log(`[Video Filter] Testing ${imagesToTest.length} images for video thumbnails...`);

  // Test in batches to avoid overwhelming the server
  const BATCH_SIZE = 10;
  const validImages: ScrapedPhoto[] = [];

  for (let i = 0; i < imagesToTest.length; i += BATCH_SIZE) {
    const batch = imagesToTest.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (photo) => {
        const isVideoThumb = await isVideoThumbnail(photo.photo_url);
        return { photo, isVideoThumb };
      })
    );

    for (const { photo, isVideoThumb } of results) {
      if (!isVideoThumb) {
        validImages.push(photo);
      } else {
        console.log(`[Video Filter] Filtered out video thumbnail: ${photo.photo_url.slice(0, 60)}...`);
      }
    }
  }

  console.log(`[Video Filter] Kept ${validImages.length} images, filtered ${imagesToTest.length - validImages.length} video thumbnails`);

  return [...videos, ...validImages];
}

/**
 * Check if a URL is a video thumbnail by testing if it responds to =dv parameter.
 * Video thumbnails will redirect to video-downloads.googleusercontent.com,
 * while regular images will return an error.
 */
async function isVideoThumbnail(photoUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // Get the base URL and test with =dv (video download) parameter
    const baseUrl = photoUrl.split("=")[0];
    const videoTestUrl = `${baseUrl}=dv`;
    
    // Use redirect: "manual" to check the redirect location
    const response = await fetch(videoTestUrl, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    clearTimeout(timeoutId);

    // If it redirects to video-downloads.googleusercontent.com, it's a video
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get("location") || "";
      if (location.includes("video-downloads.googleusercontent.com")) {
        return true;
      }
    }

    // If the =dv URL returns 200 and video content-type, it's a video thumbnail
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.startsWith("video/")) {
        return true;
      }
    }

    // If =dv fails or returns non-video, it's a real image
    return false;
  } catch {
    // On timeout/error, assume it's a real image (conservative approach)
    return false;
  }
}

// ---------------------------------------------------------------------------
// Identify video thumbnails (to exclude from image results)
// ---------------------------------------------------------------------------

function identifyVideoThumbnails(html: string, videoThumbnailBaseUrls: Set<string>) {
  const $ = cheerio.load(html);

  // Check og:video - if present, this page has a video
  const ogVideoUrl = $('meta[property="og:video"]').attr("content");
  if (ogVideoUrl) {
    const baseUrl = normalizeBaseUrl(ogVideoUrl);
    videoThumbnailBaseUrls.add(baseUrl);
    console.log(`[Video Detection] og:video found: ${baseUrl.slice(0, 80)}...`);
  }

  // Check og:type - if it's "video.other", the og:image is likely a video thumbnail
  const ogType = $('meta[property="og:type"]').attr("content");
  if (ogType === "video.other") {
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) {
      const baseUrl = normalizeBaseUrl(ogImage);
      videoThumbnailBaseUrls.add(baseUrl);
      console.log(`[Video Detection] og:type=video.other, marking og:image as video thumbnail: ${baseUrl.slice(0, 80)}...`);
    }
  }

  // Find URLs with video thumbnail markers (=m18, =m22, =m37)
  const videoThumbPattern = /https:\/\/lh3\.googleusercontent\.com\/[^\s"'\\]+?=m(?:18|22|37)[^\s"'\\]*/g;
  const matches = html.match(videoThumbPattern) || [];
  for (const url of matches) {
    const baseUrl = normalizeBaseUrl(url);
    videoThumbnailBaseUrls.add(baseUrl);
  }

  // Also scan AF_initDataCallback for video/ mime types near lh3 URLs
  const callbackPattern = /AF_initDataCallback\(\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = callbackPattern.exec(html)) !== null) {
    const startIdx = match.index + match[0].length - 1;
    const jsonStr = extractBalancedBraces(html, startIdx);
    if (!jsonStr) continue;

    try {
      const parsed = lenientJsonParse(jsonStr);
      if (parsed?.data) {
        findVideoThumbnailsInData(parsed.data, videoThumbnailBaseUrls);
      }
    } catch {
      // Expected for some callbacks
    }
  }

  console.log(`[Video Detection] Total video thumbnail base URLs identified: ${videoThumbnailBaseUrls.size}`);
}

function findVideoThumbnailsInData(data: unknown, videoThumbnailBaseUrls: Set<string>) {
  if (!Array.isArray(data)) return;

  // Look for lh3 URLs that have video markers NEARBY in the SAME flat array level
  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    if (typeof item === "string" && item.includes("lh3.googleusercontent.com/")) {
      // Check if nearby items (within 15 positions) indicate this is a video
      let isVideo = false;
      for (let j = Math.max(0, i - 15); j < Math.min(data.length, i + 15); j++) {
        const sibling = data[j];
        if (typeof sibling === "string") {
          const lower = sibling.toLowerCase();
          if (
            lower.startsWith("video/") ||
            lower.includes("video-downloads.googleusercontent.com") ||
            lower === "video" ||
            lower.includes("video/mp4") ||
            lower.includes("video/webm")
          ) {
            isVideo = true;
            break;
          }
        }
      }

      if (isVideo) {
        const baseUrl = normalizeBaseUrl(item);
        videoThumbnailBaseUrls.add(baseUrl);
        console.log(`[Video Detection] Found video thumbnail: ${baseUrl.slice(0, 80)}...`);
      }
    } else if (Array.isArray(item)) {
      // Recurse into nested arrays
      findVideoThumbnailsInData(item, videoThumbnailBaseUrls);
    }
  }
}

// ---------------------------------------------------------------------------
// Video extraction - only extract if we have a REAL playable video URL
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

  // ONLY add video if we have a video-downloads URL (real playable video)
  // Skip og:video fallback since those often don't work without auth
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
  }
  // NOTE: We intentionally do NOT fall back to og:video with =dv anymore
  // because those URLs often return 500 errors without authentication.
  // Videos without a video-downloads URL will simply be skipped entirely.
}

// ---------------------------------------------------------------------------
// AF_initDataCallback extraction (for images)
// ---------------------------------------------------------------------------

function extractFromDataCallbacks(
  html: string,
  photos: ScrapedPhoto[],
  seenUrls: Set<string>,
  videoThumbnailBaseUrls: Set<string>
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
        walkDataArray(parsed.data, photos, seenUrls, videoThumbnailBaseUrls);
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
  videoThumbnailBaseUrls: Set<string>
) {
  if (!Array.isArray(data)) return;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];

    if (typeof item === "string" && item.includes("lh3.googleusercontent.com/")) {
      // Skip if this looks like a video thumbnail (=m18, =m22, =m37)
      if (item.includes("=m18") || item.includes("=m37") || item.includes("=m22")) {
        continue;
      }

      const w = typeof data[i + 1] === "number" ? (data[i + 1] as number) : null;
      const h = typeof data[i + 2] === "number" ? (data[i + 2] as number) : null;

      if (w === null || h === null) continue;
      if (w < 200 && h < 200) continue;

      const baseUrl = normalizeBaseUrl(item);
      if (!isAlbumPhotoUrl(baseUrl)) continue;
      if (seenUrls.has(baseUrl)) continue;

      // Skip if this base URL was identified as a video thumbnail
      if (videoThumbnailBaseUrls.has(baseUrl)) {
        console.log(`[Video Detection] Skipping video thumbnail in walkDataArray: ${baseUrl.slice(0, 80)}...`);
        continue;
      }

      // Check if this is associated with a video by looking for video markers nearby in the SAME array level
      let isVideo = false;
      for (let j = Math.max(0, i - 15); j < Math.min(data.length, i + 15); j++) {
        const sibling = data[j];
        if (typeof sibling === "string") {
          const lower = sibling.toLowerCase();
          if (
            lower.startsWith("video/") ||
            lower.includes("video-downloads.googleusercontent.com") ||
            lower === "video" ||
            lower.includes("video/mp4") ||
            lower.includes("video/webm")
          ) {
            isVideo = true;
            break;
          }
        }
      }

      // Skip if this is a video thumbnail - we only want real images
      if (isVideo) {
        console.log(`[Video Detection] Skipping item with nearby video marker: ${baseUrl.slice(0, 80)}...`);
        continue;
      }

      seenUrls.add(baseUrl);

      photos.push({
        photo_url: `${baseUrl}=w0`,
        thumbnail_url: `${baseUrl}=w400-h400-c`,
        width: w,
        height: h,
        media_type: "image",
      });
    } else if (Array.isArray(item)) {
      walkDataArray(item, photos, seenUrls, videoThumbnailBaseUrls);
    }
  }
}

// ---------------------------------------------------------------------------
// Raw URL extraction (fallback)
// ---------------------------------------------------------------------------

function extractFromRawUrls(
  html: string,
  photos: ScrapedPhoto[],
  seenUrls: Set<string>,
  videoThumbnailBaseUrls: Set<string>
) {
  const urlPattern = /https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9_\-/]{30,}/g;
  const matches = html.match(urlPattern) || [];

  for (const rawUrl of matches) {
    // Skip video thumbnails
    if (rawUrl.includes("=m18") || rawUrl.includes("=m22") || rawUrl.includes("=m37")) continue;

    const baseUrl = normalizeBaseUrl(rawUrl);
    if (!isAlbumPhotoUrl(baseUrl)) continue;
    if (seenUrls.has(baseUrl)) continue;
    if (videoThumbnailBaseUrls.has(baseUrl)) continue;
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
  seenUrls: Set<string>,
  videoThumbnailBaseUrls: Set<string>
) {
  const $ = cheerio.load(html);
  $('meta[property="og:image"]').each((_, el) => {
    const src = $(el).attr("content") || "";
    if (src.includes("googleusercontent.com")) {
      const baseUrl = normalizeBaseUrl(src);
      if (seenUrls.has(baseUrl)) return;
      if (videoThumbnailBaseUrls.has(baseUrl)) return;
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
