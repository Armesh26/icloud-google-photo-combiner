import axios from "axios";
import type { ScrapedPhoto } from "./googleScraper";

export type { ScrapedPhoto };

function extractToken(albumUrl: string): string | null {
  const hashIndex = albumUrl.indexOf("#");
  if (hashIndex !== -1) return albumUrl.slice(hashIndex + 1);

  const shareMatch = albumUrl.match(/share\.icloud\.com\/photos\/([A-Za-z0-9_-]+)/);
  if (shareMatch) return shareMatch[1];

  return null;
}

const ICLOUD_BASE = "https://p46-sharedstreams.icloud.com";

async function getStreamBaseUrl(token: string): Promise<string> {
  try {
    const response = await axios.post(
      `${ICLOUD_BASE}/${token}/sharedstreams/webstream`,
      { streamCtag: null },
      {
        headers: {
          "Content-Type": "text/plain",
          Origin: "https://www.icloud.com",
        },
        timeout: 10000,
        validateStatus: (s) => s < 500,
      }
    );

    if (response.status === 330 && response.data?.["X-Apple-MMe-Host"]) {
      return `https://${response.data["X-Apple-MMe-Host"]}`;
    }
    return ICLOUD_BASE;
  } catch {
    return ICLOUD_BASE;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ICloudPhotoMeta = Record<string, any>;
type Derivative = { checksum: string; fileSize: number | string; [k: string]: unknown };

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "avi"]);

function isVideoAsset(meta: ICloudPhotoMeta): boolean {
  if (meta.mediaAssetType === "video") return true;
  const derivatives = meta.derivatives;
  if (derivatives) {
    for (const key of Object.keys(derivatives)) {
      const ext = derivatives[key]?.fileLocation?.split(".")?.pop()?.toLowerCase();
      if (ext && VIDEO_EXTENSIONS.has(ext)) return true;
    }
  }
  return false;
}

/**
 * Each photo in the stream has a `derivatives` map like:
 *   { "2": { checksum: "...", fileSize: 12345 }, "3": { checksum: "...", fileSize: 999999 } }
 *
 * The largest fileSize is the original; the smallest is the thumbnail.
 * We pick the largest for photo_url and smallest for thumbnail_url.
 */
function pickDerivatives(meta: ICloudPhotoMeta): {
  bestChecksum: string | null;
  thumbChecksum: string | null;
} {
  const derivatives = meta?.derivatives;
  if (!derivatives) return { bestChecksum: null, thumbChecksum: null };

  let bestChecksum: string | null = null;
  let bestSize = -1;
  let thumbChecksum: string | null = null;
  let thumbSize = Infinity;

  for (const d of Object.values(derivatives) as Derivative[]) {
    if (!d.checksum) continue;
    const size = typeof d.fileSize === "string" ? parseInt(d.fileSize, 10) : (d.fileSize || 0);

    if (size > bestSize) {
      bestSize = size;
      bestChecksum = d.checksum;
    }
    if (size < thumbSize) {
      thumbSize = size;
      thumbChecksum = d.checksum;
    }
  }

  return { bestChecksum, thumbChecksum };
}

export async function scrapeICloudAlbum(
  albumUrl: string
): Promise<ScrapedPhoto[]> {
  const token = extractToken(albumUrl);
  if (!token) {
    throw new Error("Invalid iCloud shared album URL — no token found");
  }

  const baseUrl = await getStreamBaseUrl(token);

  const streamRes = await axios.post(
    `${baseUrl}/${token}/sharedstreams/webstream`,
    { streamCtag: null },
    {
      headers: {
        "Content-Type": "text/plain",
        Origin: "https://www.icloud.com",
      },
      timeout: 15000,
    }
  );

  const streamData = streamRes.data;
  const photoMetas: ICloudPhotoMeta[] = streamData.photos || [];
  const photoGuids: string[] = [];

  for (const photo of photoMetas) {
    if (photo.photoGuid) {
      photoGuids.push(photo.photoGuid);
    }
  }

  if (photoGuids.length === 0) return [];

  const metaByGuid = new Map<string, ICloudPhotoMeta>();
  for (const meta of photoMetas) {
    if (meta.photoGuid) metaByGuid.set(meta.photoGuid, meta);
  }

  // For each guid, determine which checksums are the best (original) and thumb
  const guidToBest = new Map<string, { bestChecksum: string; thumbChecksum: string }>();
  for (const guid of photoGuids) {
    const meta = metaByGuid.get(guid);
    if (!meta) continue;
    const { bestChecksum, thumbChecksum } = pickDerivatives(meta);
    if (bestChecksum) {
      guidToBest.set(guid, {
        bestChecksum,
        thumbChecksum: thumbChecksum || bestChecksum,
      });
    }
  }

  // Fetch asset URLs in batches
  const batchSize = 25;
  // Build a global checksum → URL map across all batches
  const checksumToUrl = new Map<string, string>();

  for (let i = 0; i < photoGuids.length; i += batchSize) {
    const batch = photoGuids.slice(i, i + batchSize);

    const assetRes = await axios.post(
      `${baseUrl}/${token}/sharedstreams/webasseturls`,
      { photoGuids: batch },
      {
        headers: {
          "Content-Type": "text/plain",
          Origin: "https://www.icloud.com",
        },
        timeout: 15000,
      }
    );

    const items = assetRes.data?.items;
    if (!items) continue;

    for (const [checksum, assetInfo] of Object.entries(items) as [
      string,
      Record<string, string>,
    ][]) {
      const urlPath = assetInfo.url_path;
      const urlLocation = assetInfo.url_location;
      if (!urlPath || !urlLocation) continue;
      checksumToUrl.set(checksum, `https://${urlLocation}${urlPath}`);
    }
  }

  // Now produce one photo per guid, using only the best derivative
  const photos: ScrapedPhoto[] = [];

  for (const guid of photoGuids) {
    const picks = guidToBest.get(guid);
    if (!picks) continue;

    const photoUrl = checksumToUrl.get(picks.bestChecksum);
    if (!photoUrl) continue;

    const thumbUrl = checksumToUrl.get(picks.thumbChecksum) || photoUrl;

    const meta = metaByGuid.get(guid);
    const w = meta?.width ? parseInt(meta.width, 10) : null;
    const h = meta?.height ? parseInt(meta.height, 10) : null;
    const mediaType = meta && isVideoAsset(meta) ? "video" : "image";

    photos.push({
      photo_url: photoUrl,
      thumbnail_url: thumbUrl,
      width: w,
      height: h,
      media_type: mediaType,
    });
  }

  return photos;
}
