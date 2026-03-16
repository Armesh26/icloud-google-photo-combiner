import axios from "axios";
import type { ScrapedPhoto } from "./googleScraper";

export type { ScrapedPhoto };

// ── iCloud "Shared Photo Link" scraper ─────────────────────────────────────
// Handles https://share.icloud.com/photos/<TOKEN>
//
// These use Apple's CloudKit API (ckdatabasews.icloud.com), not sharedstreams.
// Flow:
//   1. records/resolve  → zone ID + anonymous access token + partition URL
//   2. records/query    → CPLMaster records with signed downloadURLs
//   3. Replace ${f} template in URLs and build ScrapedPhoto[]

const CK_BASE = "https://ckdatabasews.icloud.com";
const CK_CONTAINER = "com.apple.photos.cloud";
const CK_ENV = "production";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CKRecord = Record<string, any>;

const VIDEO_ITEM_TYPES = new Set([
  "com.apple.quicktime-movie",
  "public.mpeg-4",
  "public.movie",
  "public.avi",
]);

function ckUrl(downloadURL: string | undefined): string | null {
  if (!downloadURL) return null;
  // ${f} is a filename template; the server ignores it for content but needs something
  return downloadURL.replace("${f}", "photo.jpeg");
}

export async function fetchICloudShareLinkName(albumUrl: string): Promise<string | null> {
  try {
    const tokenMatch = albumUrl.match(/share\.icloud\.com\/photos\/([A-Za-z0-9_-]+)/);
    if (!tokenMatch) return null;
    const res = await axios.post(
      `${CK_BASE}/database/1/${CK_CONTAINER}/${CK_ENV}/public/records/resolve?remapEnums=true`,
      { shortGUIDs: [{ value: tokenMatch[1] }] },
      { headers: { "Content-Type": "text/plain", Origin: "https://www.icloud.com" }, timeout: 10000 }
    );
    const share = res.data?.results?.[0]?.share;
    const title = share?.fields?.["cloudkit.title"]?.value;
    return title && title.trim() ? title.trim() : null;
  } catch {
    return null;
  }
}

export async function scrapeICloudShareLink(albumUrl: string): Promise<ScrapedPhoto[]> {
  const tokenMatch = albumUrl.match(/share\.icloud\.com\/photos\/([A-Za-z0-9_-]+)/);
  if (!tokenMatch) throw new Error("Invalid iCloud share link URL — no token found");
  const shortGUID = tokenMatch[1];

  // Step 1: Resolve the shortGUID → zone info + anonymous access credentials
  const resolveRes = await axios.post(
    `${CK_BASE}/database/1/${CK_CONTAINER}/${CK_ENV}/public/records/resolve?remapEnums=true&getCurrentSyncToken=true`,
    { shortGUIDs: [{ value: shortGUID }] },
    {
      headers: { "Content-Type": "text/plain", Origin: "https://www.icloud.com" },
      timeout: 15000,
    }
  );

  const result = resolveRes.data?.results?.[0];
  if (!result) throw new Error("iCloud share link: resolve returned no results");

  const { zoneID, anonymousPublicAccess } = result;
  if (!anonymousPublicAccess?.token || !anonymousPublicAccess?.databasePartition) {
    throw new Error("iCloud share link: no anonymous access token in resolve response");
  }

  const { token, databasePartition } = anonymousPublicAccess as {
    token: string;
    databasePartition: string;
  };

  // Step 2: Query CPLAsset+Master records from the shared zone using the token
  const allRecords: CKRecord[] = [];
  let syncToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      query: {
        recordType: "CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted",
        filterBy: [
          {
            fieldName: "direction",
            comparator: "EQUALS",
            fieldValue: { value: "DESCENDING", type: "STRING" },
          },
        ],
      },
      zoneID,
      resultsLimit: 200,
    };
    if (syncToken) body.syncToken = syncToken;

    const queryRes = await axios.post(
      `${databasePartition}/database/1/${CK_CONTAINER}/${CK_ENV}/shared/records/query?remapEnums=true&getCurrentSyncToken=true&publicAccessAuthToken=${encodeURIComponent(token)}`,
      body,
      {
        headers: { "Content-Type": "text/plain", Origin: "https://www.icloud.com" },
        timeout: 15000,
      }
    );

    const batch: CKRecord[] = queryRes.data?.records ?? [];
    allRecords.push(...batch);
    syncToken = queryRes.data?.syncToken;

    // Stop if we got fewer records than requested (last page)
    if (batch.length < 200) break;
  } while (syncToken);

  // Step 3: Build ScrapedPhoto[] from CPLMaster records (CPLAsset records are skipped)
  const photos: ScrapedPhoto[] = [];

  for (const record of allRecords) {
    if (record.recordType !== "CPLMaster") continue;

    const f = record.fields ?? {};
    const itemType: string = f.itemType?.value ?? "";
    const isVideo = VIDEO_ITEM_TYPES.has(itemType);

    const width: number | null = f.resOriginalWidth?.value ?? null;
    const height: number | null = f.resOriginalHeight?.value ?? null;

    const photoUrl =
      ckUrl(f.resOriginalRes?.value?.downloadURL) ??
      ckUrl(f.resJPEGMedRes?.value?.downloadURL);
    const thumbUrl =
      ckUrl(f.resJPEGMedRes?.value?.downloadURL) ??
      ckUrl(f.resOriginalRes?.value?.downloadURL);

    if (!photoUrl) continue;

    photos.push({
      photo_url: photoUrl,
      thumbnail_url: thumbUrl ?? photoUrl,
      width,
      height,
      media_type: isVideo ? "video" : "image",
    });
  }

  return photos;
}

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

export async function fetchICloudAlbumName(albumUrl: string): Promise<string | null> {
  try {
    const token = extractToken(albumUrl);
    if (!token) return null;
    const baseUrl = await getStreamBaseUrl(token);
    const res = await axios.post(
      `${baseUrl}/${token}/sharedstreams/webstream`,
      { streamCtag: null },
      { headers: { "Content-Type": "text/plain", Origin: "https://www.icloud.com" }, timeout: 10000 }
    );
    const name = res.data?.streamName;
    return name && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
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

  // Fetch asset URLs in parallel batches
  const batchSize = 25;
  const checksumToUrl = new Map<string, string>();

  const batches: string[][] = [];
  for (let i = 0; i < photoGuids.length; i += batchSize) {
    batches.push(photoGuids.slice(i, i + batchSize));
  }

  const batchResults = await Promise.all(
    batches.map((batch) =>
      axios.post(
        `${baseUrl}/${token}/sharedstreams/webasseturls`,
        { photoGuids: batch },
        {
          headers: { "Content-Type": "text/plain", Origin: "https://www.icloud.com" },
          timeout: 15000,
        }
      )
    )
  );

  for (const assetRes of batchResults) {
    const items = assetRes.data?.items;
    if (!items) continue;
    for (const [checksum, assetInfo] of Object.entries(items) as [string, Record<string, string>][]) {
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
