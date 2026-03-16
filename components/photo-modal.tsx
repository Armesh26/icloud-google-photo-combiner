"use client";

import { useEffect, useCallback } from "react";
import type { PhotoWithAlbum } from "@/lib/db";

type Props = {
  photo: PhotoWithAlbum | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export default function PhotoModal({ photo, onClose, onPrev, onNext }: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    },
    [onClose, onPrev, onNext]
  );

  useEffect(() => {
    if (!photo) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [photo, handleKeyDown]);

  if (!photo) return null;

  const isVideo = photo.media_type === "video";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[60] p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Prev */}
      <button
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-[60] p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Next */}
      <button
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-[60] p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Content */}
      <div
        className="max-w-[90vw] max-h-[90vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-lg bg-black"
            poster={photo.thumbnail_url}
            // @ts-expect-error referrerPolicy is valid on video elements
            referrerPolicy="no-referrer"
          >
            <source
              src={`/api/proxy-image?url=${encodeURIComponent(photo.photo_url)}`}
              type="video/mp4"
            />
          </video>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo.photo_url}
            alt=""
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
          />
        )}

        {/* Info bar */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent rounded-b-lg">
          <div className="flex items-center justify-between text-white/80 text-sm">
            <span className="capitalize flex items-center gap-2">
              {photo.albums?.source === "google" ? "Google Photos" : "iCloud"}
              {isVideo && (
                <span className="text-[10px] font-bold bg-purple-500/80 text-white px-1.5 py-0.5 rounded">
                  VIDEO
                </span>
              )}
            </span>
            {photo.width && photo.height && (
              <span>{photo.width} x {photo.height}</span>
            )}
            <a
              href={isVideo ? `/api/proxy-image?url=${encodeURIComponent(photo.photo_url)}` : photo.photo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors"
            >
              {isVideo ? "Download Video" : "Open Original"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
