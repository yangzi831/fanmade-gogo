-- Run as project owner in SQL Editor, or let npm run cloud:init create the bucket.
-- No anonymous or authenticated storage.objects policies are granted.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('fanmade-images','fanmade-images',false,2097152,ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='fanmade-images' AND public=true) THEN
    RAISE EXCEPTION 'fanmade-images must be PRIVATE; use a new private bucket instead';
  END IF;
END $$;
COMMIT;
