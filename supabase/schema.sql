-- PhotoFuse Database Schema
-- Run this in Supabase SQL Editor to set up the database

create extension if not exists "uuid-ossp";

create table events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  name text not null,
  created_at timestamptz not null default now()
);

create index idx_events_user_id on events (user_id);

create table albums (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  source text not null check (source in ('google', 'icloud')),
  album_url text not null,
  album_name text,
  last_scraped_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_albums_event_id on albums (event_id);
create index idx_albums_last_scraped on albums (last_scraped_at);

create table photos (
  id uuid primary key default uuid_generate_v4(),
  album_id uuid not null references albums(id) on delete cascade,
  photo_url text not null,
  thumbnail_url text not null,
  width integer,
  height integer,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  created_at timestamptz not null default now()
);

create index idx_photos_album_id on photos (album_id);

create table event_members (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique(event_id, email)
);

create index idx_event_members_event_id on event_members (event_id);
create index idx_event_members_email on event_members (email);

-- Migration for existing databases:
-- ALTER TABLE albums ADD COLUMN IF NOT EXISTS album_name text;
-- ALTER TABLE photos ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video'));
-- ALTER TABLE events ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
-- CREATE INDEX IF NOT EXISTS idx_events_user_id ON events (user_id);
-- ALTER TABLE events ALTER COLUMN slug DROP NOT NULL;
-- ALTER TABLE events DROP CONSTRAINT IF EXISTS events_slug_key;
-- DROP INDEX IF EXISTS idx_events_slug;
-- CREATE TABLE IF NOT EXISTS event_members (
--   id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
--   event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
--   email text NOT NULL,
--   created_at timestamptz NOT NULL DEFAULT now(),
--   UNIQUE(event_id, email)
-- );
-- CREATE INDEX IF NOT EXISTS idx_event_members_event_id ON event_members (event_id);
-- CREATE INDEX IF NOT EXISTS idx_event_members_email ON event_members (email);
-- ALTER TABLE event_members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined'));
