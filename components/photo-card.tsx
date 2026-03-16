"use client";

import { useEffect, useState } from "react";
import type { PhotoWithAlbum } from "@/lib/db";

type Props = {
  photo: PhotoWithAlbum;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onPreview: (photo: PhotoWithAlbum) => void;
};

export default function PhotoCard({
  photo,
  selected,
  onToggleSelect,
  onPreview,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: coarse)");
    setIsTouch(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  const isVideo = photo.media_type === "video";
  const sourceBadge = photo.albums?.source === "google" ? "G" : "iC";
  const badgeColor =
    photo.albums?.source === "google" ? "bg-red-500/80" : "bg-blue-500/80";

  return (
    <div
      className={`group relative rounded-lg overflow-hidden bg-zinc-900 cursor-pointer transition-all duration-200 ${
        selected
          ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-zinc-950"
          : "hover:ring-1 hover:ring-white/20"
      }`}
    >
      {/* Selection checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(photo.id);
        }}
        className={`absolute top-2 left-2 z-20 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
          selected
            ? "bg-indigo-500 border-indigo-500 text-white"
            : "border-white/50 bg-black/30 text-transparent group-hover:border-white/80"
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </button>

      {/* Badges */}
      <div className="absolute top-2 right-2 z-20 flex gap-1">
        {isVideo && (
          <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded bg-purple-500/80">
            VID
          </span>
        )}
        <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${badgeColor}`}>
          {sourceBadge}
        </span>
      </div>

      {/* Thumbnail - tap selects on touch, click previews on desktop */}
      <div
        onClick={() => (isTouch ? onToggleSelect(photo.id) : onPreview(photo))}
        className="aspect-square relative"
      >
        {!loaded && (
          <div className="absolute inset-0 bg-zinc-800 animate-pulse" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.thumbnail_url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
        {/* Video play icon overlay */}
        {isVideo && loaded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      <div className="absolute bottom-2 right-2 z-20 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPreview(photo);
          }}
          className="p-1.5 rounded-md bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
          title="Preview"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </button>
        <a
          href={photo.photo_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-md bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
          title="Open original"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      </div>
    </div>
  );
}
