-- Backfill NULL area_id on profiles and collection_requests
-- Run after deploying the fix to requests.cjs

-- 1. Fix profiles: set area_id from society's area_id where it's null
UPDATE profiles p
SET area_id = s.area_id
FROM societies s
WHERE p.society_id = s.id
  AND p.area_id IS NULL
  AND s.area_id IS NOT NULL;

-- 2. Fix collection_requests: set area_id from resident's area_id where it's null
UPDATE collection_requests cr
SET area_id = p.area_id
FROM profiles p
WHERE cr.resident_id = p.id
  AND cr.area_id IS NULL
  AND p.area_id IS NOT NULL;

-- 3. Remaining null-area requests: set area_id from society lookup
UPDATE collection_requests cr
SET area_id = s.area_id
FROM societies s
WHERE cr.society_id = s.id
  AND cr.area_id IS NULL
  AND s.area_id IS NULL;

-- Verify: count remaining null-area records
SELECT 'profiles with null area_id' AS label, count(*) AS cnt FROM profiles WHERE role = 'resident' AND area_id IS NULL
UNION ALL
SELECT 'requests with null area_id', count(*) FROM collection_requests WHERE area_id IS NULL;
