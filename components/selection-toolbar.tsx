"use client";

import { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { PhotoWithAlbum } from "@/lib/db";

type Props = {
  selectedPhotos: PhotoWithAlbum[];
  onClearSelection: () => void;
};

const MAX_ZIP_ITEMS = 50;
const MAX_ZIP_BYTES = 1024 * 1024 * 1024; // 1 GB

export default function SelectionToolbar({
  selectedPhotos,
  onClearSelection,
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [corsFailures, setCorsFailures] = useState<string[]>([]);

  if (selectedPhotos.length === 0) return null;

  const overLimit = selectedPhotos.length > MAX_ZIP_ITEMS;

  async function handleDownload() {
    if (overLimit) return;

    setDownloading(true);
    setProgress(0);
    setCorsFailures([]);

    const toZip = selectedPhotos.slice(0, MAX_ZIP_ITEMS);
    const zip = new JSZip();
    let totalBytes = 0;
    const failedUrls: string[] = [];
    let completed = 0;

    try {
      for (const photo of toZip) {
        if (totalBytes >= MAX_ZIP_BYTES) {
          failedUrls.push(photo.photo_url);
          completed++;
          setProgress(Math.round((completed / toZip.length) * 100));
          continue;
        }

        try {
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(photo.photo_url)}`;
          const response = await fetch(proxyUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const blob = await response.blob();
          totalBytes += blob.size;

          if (totalBytes > MAX_ZIP_BYTES) {
            failedUrls.push(photo.photo_url);
          } else {
            const isVideo = photo.media_type === "video";
            const ext = isVideo
              ? "mp4"
              : blob.type.includes("png")
                ? "png"
                : "jpg";
            zip.file(`${isVideo ? "video" : "photo"}-${completed + 1}.${ext}`, blob);
          }
        } catch {
          failedUrls.push(photo.photo_url);
        }

        completed++;
        setProgress(Math.round((completed / toZip.length) * 100));
      }

      const filesInZip = Object.keys(zip.files).length;

      if (filesInZip > 0) {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `photofuse-${Date.now()}.zip`);
      }

      // CORS fallback: open failed URLs in new tabs so the user can save manually
      if (failedUrls.length > 0) {
        setCorsFailures(failedUrls);
      }
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  }

  function openFailedUrls() {
    for (const url of corsFailures) {
      window.open(url, "_blank");
    }
    setCorsFailures([]);
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl px-6 py-3 flex flex-col items-center gap-2 animate-in slide-in-from-bottom max-w-[90vw]">
      <div className="flex items-center gap-4 w-full">
        <span className="text-sm text-zinc-300 font-medium whitespace-nowrap">
          {selectedPhotos.length} selected
        </span>

        <div className="h-5 w-px bg-zinc-700" />

        {overLimit ? (
          <span className="text-xs text-amber-400">
            Max {MAX_ZIP_ITEMS} items per download. Deselect some to continue.
          </span>
        ) : (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-sm font-medium transition-colors whitespace-nowrap"
          >
            {downloading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {progress}%
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download ZIP
              </>
            )}
          </button>
        )}

        <button
          onClick={onClearSelection}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Clear selection"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* CORS fallback notice */}
      {corsFailures.length > 0 && (
        <div className="flex items-center gap-3 text-xs w-full">
          <span className="text-amber-400">
            {corsFailures.length} file{corsFailures.length !== 1 ? "s" : ""} couldn&apos;t be zipped (CORS).
          </span>
          <button
            onClick={openFailedUrls}
            className="text-indigo-400 hover:text-indigo-300 underline whitespace-nowrap"
          >
            Open in new tabs
          </button>
        </div>
      )}
    </div>
  );
}
