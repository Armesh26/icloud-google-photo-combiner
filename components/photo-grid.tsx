"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import PhotoCard from "./photo-card";
import PhotoModal from "./photo-modal";
import SelectionToolbar from "./selection-toolbar";
import type { PhotoWithAlbum } from "@/lib/db";

type Props = {
  photos: PhotoWithAlbum[];
};

const PAGE_SIZE = 60;

export default function PhotoGrid({ photos }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState<"all" | "google" | "icloud">("all");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filteredPhotos = useMemo(() => {
    if (filter === "all") return photos;
    return photos.filter((p) => p.albums?.source === filter);
  }, [photos, filter]);

  const visiblePhotos = useMemo(
    () => filteredPhotos.slice(0, visibleCount),
    [filteredPhotos, visibleCount]
  );

  const hasMore = visibleCount < filteredPhotos.length;

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filteredPhotos.length));
        }
      },
      { rootMargin: "600px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, filteredPhotos.length]);

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedPhotos = useMemo(
    () => photos.filter((p) => selectedIds.has(p.id)),
    [photos, selectedIds]
  );

  const imageCount = filteredPhotos.filter((p) => p.media_type === "image").length;
  const videoCount = filteredPhotos.filter((p) => p.media_type === "video").length;

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">
            {imageCount} photo{imageCount !== 1 ? "s" : ""}
            {videoCount > 0 && (
              <>, {videoCount} video{videoCount !== 1 ? "s" : ""}</>
            )}
          </span>
          <div className="flex rounded-lg overflow-hidden border border-zinc-700">
            {(["all", "google", "icloud"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {f === "all" ? "All" : f === "google" ? "Google" : "iCloud"}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            const allIds = new Set(filteredPhotos.map((p) => p.id));
            const allSelected = filteredPhotos.every((p) => selectedIds.has(p.id));
            setSelectedIds(allSelected ? new Set() : allIds);
          }}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {filteredPhotos.length > 0 && filteredPhotos.every((p) => selectedIds.has(p.id))
            ? "Deselect all"
            : `Select all${filter !== "all" ? ` (${filter})` : ""}`}
        </button>
      </div>

      {/* Grid */}
      {visiblePhotos.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-lg">No photos found</p>
          <p className="text-sm mt-1">
            Try adding an album with photos to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {visiblePhotos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              selected={selectedIds.has(photo.id)}
              onToggleSelect={toggleSelect}
              onPreview={() =>
                setPreviewIndex(filteredPhotos.indexOf(photo))
              }
            />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading more...
          </div>
        </div>
      )}

      {/* Modal */}
      <PhotoModal
        photo={previewIndex !== null ? filteredPhotos[previewIndex] : null}
        prevPhoto={previewIndex !== null ? filteredPhotos[(previewIndex - 1 + filteredPhotos.length) % filteredPhotos.length] : null}
        nextPhoto={previewIndex !== null ? filteredPhotos[(previewIndex + 1) % filteredPhotos.length] : null}
        onClose={() => setPreviewIndex(null)}
        onPrev={() =>
          setPreviewIndex((i) =>
            i !== null ? (i - 1 + filteredPhotos.length) % filteredPhotos.length : null
          )
        }
        onNext={() =>
          setPreviewIndex((i) =>
            i !== null ? (i + 1) % filteredPhotos.length : null
          )
        }
      />

      {/* Selection toolbar */}
      <SelectionToolbar
        selectedPhotos={selectedPhotos}
        onClearSelection={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
