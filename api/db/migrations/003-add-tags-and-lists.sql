-- Migration 003: Add tags and lists arrays to contacts table
-- Enables CRM-like tagging: patient, lead, partner, employee, vip, etc.
-- Tags are multi-label (a contact can be patient + partner + employee)

-- Add array columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lists TEXT[] DEFAULT '{}';

-- GIN indexes for fast array containment queries (@> operator)
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_contacts_lists ON contacts USING GIN (lists);
