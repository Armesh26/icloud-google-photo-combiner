"use client";

import { useEffect, useCallback } from "react";
import type { PhotoWithAlbum } from "@/lib/db";

type Props = {
  photo: PhotoWithAlbum | null;
  prevPhoto: PhotoWithAlbum | null;
  nextPhoto: PhotoWithAlbum | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export default function PhotoModal({ photo, prevPhoto, nextPhoto, onClose, onPrev, onNext }: Props) {
  // Preload adjacent images so next/prev feels instant
  useEffect(() => {
    if (prevPhoto && prevPhoto.media_type !== "video") {
      new window.Image().src = prevPhoto.photo_url;
    }
    if (nextPhoto && nextPhoto.media_type !== "video") {
      new window.Image().src = nextPhoto.photo_url;
    }
  }, [prevPhoto, nextPhoto]);
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
        className="max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <>
            <video
              controls
              autoPlay
              className="max-w-full max-h-[80vh] rounded-t-lg bg-black"
              poster={photo.thumbnail_url}
              // @ts-expect-error referrerPolicy is valid on video elements
              referrerPolicy="no-referrer"
            >
              <source
                src={`/api/proxy-image?url=${encodeURIComponent(photo.photo_url)}`}
                type="video/mp4"
              />
            </video>
            {/* Info bar below video so it doesn't block native controls */}
            <div className="px-4 py-2 bg-black/60 rounded-b-lg flex items-center justify-between text-white/80 text-sm">
              <span className="flex items-center gap-2">
                {photo.albums?.source === "google" ? "Google Photos" : "iCloud"}
                <span className="text-[10px] font-bold bg-purple-500/80 text-white px-1.5 py-0.5 rounded">VIDEO</span>
              </span>
              <a
                href={`/api/proxy-image?url=${encodeURIComponent(photo.photo_url)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors"
              >
                Download Video
              </a>
            </div>
          </>
        ) : (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.photo_url}
              alt=""
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            {/* Info bar overlaid on image */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent rounded-b-lg">
              <div className="flex items-center justify-between text-white/80 text-sm">
                <span className="capitalize">
                  {photo.albums?.source === "google" ? "Google Photos" : "iCloud"}
                </span>
                {photo.width && photo.height && (
                  <span>{photo.width} x {photo.height}</span>
                )}
                <a
                  href={photo.photo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors"
                >
                  Open Original
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
