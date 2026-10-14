-- fanMade GoGo! schema v6. Contains no user data or secrets.

BEGIN;

CREATE SCHEMA IF NOT EXISTS fanmade;

SET search_path=fanmade,public;

CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, nickname TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', demo INTEGER NOT NULL DEFAULT 0, is_admin INTEGER NOT NULL DEFAULT 0, rowid BIGSERIAL);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE TABLE sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires BIGINT NOT NULL, rowid BIGSERIAL);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE events(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, date TEXT NOT NULL, location TEXT NOT NULL, instructions TEXT NOT NULL, theme TEXT NOT NULL DEFAULT 'sage', published INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 0, city TEXT NOT NULL DEFAULT '', venue TEXT NOT NULL DEFAULT '', session TEXT NOT NULL DEFAULT '全天', end_date TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '23:59', identity_key TEXT, kind TEXT NOT NULL DEFAULT '其他', poster TEXT NOT NULL DEFAULT '', featured INTEGER NOT NULL DEFAULT 0, rowid BIGSERIAL);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE TABLE materials(id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), name TEXT NOT NULL, description TEXT NOT NULL, image TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('free','swap','both')), total INTEGER NOT NULL CHECK(total>=0), per_person INTEGER NOT NULL CHECK(per_person>0), reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0), collected INTEGER NOT NULL DEFAULT 0 CHECK(collected>=0), creator_id TEXT REFERENCES users(id), category TEXT NOT NULL DEFAULT '其他', size TEXT NOT NULL DEFAULT '', medium TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', deadline TEXT NOT NULL DEFAULT '', paused INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1, rowid BIGSERIAL, CHECK(reserved+collected<=total));

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

CREATE TABLE reservations(id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), kind TEXT NOT NULL CHECK(kind IN ('free','swap')), status TEXT NOT NULL CHECK(status IN ('pending','reserved','collected','cancelled','rejected')), nickname TEXT NOT NULL, contact TEXT NOT NULL, contact_key TEXT NOT NULL, note TEXT NOT NULL, code TEXT UNIQUE NOT NULL, token_hash TEXT UNIQUE NOT NULL, request_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL, creator_id TEXT REFERENCES users(id), recipient_id TEXT REFERENCES users(id), note_image TEXT NOT NULL DEFAULT '', rowid BIGSERIAL);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE TABLE reservation_items(reservation_id TEXT NOT NULL REFERENCES reservations(id), material_id TEXT NOT NULL REFERENCES materials(id), quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(reservation_id,material_id), rowid BIGSERIAL);

ALTER TABLE reservation_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE exchange_applications(reservation_id TEXT PRIMARY KEY REFERENCES reservations(id), offer TEXT NOT NULL, image TEXT NOT NULL, rowid BIGSERIAL);

ALTER TABLE exchange_applications ENABLE ROW LEVEL SECURITY;

CREATE TABLE uploads(filename TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), created_at TEXT NOT NULL, guest_hash TEXT NOT NULL DEFAULT '', rowid BIGSERIAL);

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

CREATE TABLE event_creators(event_id TEXT NOT NULL REFERENCES events(id),creator_id TEXT NOT NULL REFERENCES users(id),instructions TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(event_id,creator_id), rowid BIGSERIAL);

ALTER TABLE event_creators ENABLE ROW LEVEL SECURITY;

CREATE TABLE event_aliases(alias_id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id), rowid BIGSERIAL);

ALTER TABLE event_aliases ENABLE ROW LEVEL SECURITY;

CREATE TABLE manual_handoffs(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id),creator_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('free','swap')),nickname TEXT NOT NULL DEFAULT '',contact TEXT NOT NULL DEFAULT '',location TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',request_key TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,created_at TEXT NOT NULL, rowid BIGSERIAL);

ALTER TABLE manual_handoffs ENABLE ROW LEVEL SECURITY;

CREATE TABLE manual_handoff_items(handoff_id TEXT NOT NULL REFERENCES manual_handoffs(id),material_id TEXT NOT NULL REFERENCES materials(id),quantity INTEGER NOT NULL CHECK(quantity>0),PRIMARY KEY(handoff_id,material_id), rowid BIGSERIAL);

ALTER TABLE manual_handoff_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE share_lists(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id),creator_id TEXT NOT NULL REFERENCES users(id),material_ids TEXT NOT NULL,created_at TEXT NOT NULL, rowid BIGSERIAL);

ALTER TABLE share_lists ENABLE ROW LEVEL SECURITY;

CREATE TABLE personal_collections(creator_id TEXT PRIMARY KEY REFERENCES users(id),event_id TEXT UNIQUE NOT NULL REFERENCES events(id), rowid BIGSERIAL);

ALTER TABLE personal_collections ENABLE ROW LEVEL SECURITY;

CREATE TABLE user_favorites(user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('material','event','creator')),target_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,kind,target_id), rowid BIGSERIAL);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

CREATE INDEX event_owner ON events(owner_id);

CREATE INDEX reservation_event ON reservations(event_id);

CREATE INDEX reservation_contact ON reservations(contact_key,event_id);

CREATE INDEX item_material ON reservation_items(material_id);

CREATE UNIQUE INDEX event_identity ON events(identity_key);

CREATE INDEX material_creator ON materials(event_id,creator_id);

CREATE INDEX reservation_creator ON reservations(event_id,creator_id);

CREATE INDEX membership_creator ON event_creators(creator_id,event_id);

CREATE INDEX handoff_owner ON manual_handoffs(event_id,creator_id);

CREATE INDEX reservation_recipient ON reservations(recipient_id,created_at);

REVOKE ALL ON SCHEMA fanmade FROM PUBLIC;

REVOKE ALL ON SCHEMA fanmade FROM anon, authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA fanmade FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA fanmade FROM PUBLIC, anon, authenticated;

COMMIT;

-- Run through the Supabase SQL editor as project owner, only on a new empty project.

-- Create a PRIVATE Storage bucket named fanmade-images; no anonymous read policies.
