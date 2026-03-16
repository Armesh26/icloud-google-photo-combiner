import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export type Event = {
  id: string;
  user_id: string | null;
  name: string;
  created_at: string;
};

export type Album = {
  id: string;
  event_id: string;
  source: "google" | "icloud";
  album_url: string;
  album_name: string | null;
  last_scraped_at: string | null;
  created_at: string;
};

export type Photo = {
  id: string;
  album_id: string;
  photo_url: string;
  thumbnail_url: string;
  width: number | null;
  height: number | null;
  media_type: "image" | "video";
  created_at: string;
};

export type PhotoWithAlbum = Photo & {
  albums: Pick<Album, "source">;
};

export type EventMember = {
  id: string;
  event_id: string;
  email: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export type InviteWithEvent = EventMember & {
  events: Pick<Event, "id" | "name">;
};
