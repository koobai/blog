ALTER TABLE laodao_drafts ADD COLUMN kind TEXT NOT NULL DEFAULT 'laodao';
ALTER TABLE laodao_drafts ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}';

UPDATE laodao_drafts
SET payload_json = json_object(
  'content', content,
  'images', json_array(),
  'locationName', COALESCE(location_name, ''),
  'lat', COALESCE(lat, 0),
  'lng', COALESCE(lng, 0),
  'url', ''
)
WHERE payload_json = '{}';

CREATE INDEX IF NOT EXISTS idx_laodao_drafts_kind_created_at
  ON laodao_drafts(kind, created_at DESC);
