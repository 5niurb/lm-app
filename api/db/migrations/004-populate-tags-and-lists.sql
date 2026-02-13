-- Migration 004: Populate tags and lists from existing metadata
-- Run AFTER 003-add-tags-and-lists.sql
-- This is a one-time data migration based on patients3 import + AR enrichment

-- Tag contacts as 'patient' if they have AR data (patient_status = 'patient')
UPDATE contacts
SET tags = array_append(tags, 'patient')
WHERE patient_status = 'patient'
  AND NOT (tags @> ARRAY['patient']);

-- Tag TextMagic-only contacts (no AR data) as 'lead'
UPDATE contacts
SET tags = array_append(tags, 'lead')
WHERE source = 'textmagic' AND patient_status IS NULL
  AND NOT (tags @> ARRAY['lead']);

-- Tag partners from metadata lists
UPDATE contacts
SET tags = array_append(tags, 'partner')
WHERE metadata->>'lists' ILIKE '%Partners%'
  AND NOT (tags @> ARRAY['partner']);

-- Tag employees from metadata lists
UPDATE contacts
SET tags = array_append(tags, 'employee')
WHERE metadata->>'lists' ILIKE '%LM Team%'
  AND NOT (tags @> ARRAY['employee']);

-- Tag VIPs
UPDATE contacts
SET tags = array_append(tags, 'vip')
WHERE metadata->>'tags' ILIKE '%VIP%'
  AND NOT (tags @> ARRAY['vip']);

-- Tag FriendFam
UPDATE contacts
SET tags = array_append(tags, 'friendfam')
WHERE metadata->>'tags' ILIKE '%FriendFam%'
  AND NOT (tags @> ARRAY['friendfam']);

-- Tag Vendors
UPDATE contacts
SET tags = array_append(tags, 'vendor')
WHERE metadata->>'tags' ILIKE '%Vendor%'
  AND NOT (tags @> ARRAY['vendor']);

-- Populate lists[] from metadata->>'lists' (comma-separated values)
UPDATE contacts SET lists = array_append(lists, 'patients')
WHERE metadata->>'lists' ILIKE '%Patients%' AND NOT (lists @> ARRAY['patients']);

UPDATE contacts SET lists = array_append(lists, 'diamond')
WHERE metadata->>'lists' ILIKE '%Diamond%' AND NOT (lists @> ARRAY['diamond']);

UPDATE contacts SET lists = array_append(lists, 'partners')
WHERE metadata->>'lists' ILIKE '%Partners%' AND NOT (lists @> ARRAY['partners']);

UPDATE contacts SET lists = array_append(lists, 'lm-team')
WHERE metadata->>'lists' ILIKE '%LM Team%' AND NOT (lists @> ARRAY['lm-team']);

UPDATE contacts SET lists = array_append(lists, 'to-book')
WHERE metadata->>'lists' ILIKE '%To Book%' AND NOT (lists @> ARRAY['to-book']);

UPDATE contacts SET lists = array_append(lists, 'leads')
WHERE metadata->>'lists' ILIKE '%Leads%' AND NOT (lists @> ARRAY['leads']);
