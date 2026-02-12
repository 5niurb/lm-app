-- =============================================================================
-- LM App — Development Seed Data
-- Run after schema.sql to populate sample data for local development
-- =============================================================================

-- Sample phone extension
INSERT INTO phone_extensions (extension, forward_number, ring_timeout, voicemail_enabled)
VALUES ('100', '+15551234567', 20, true);

-- Sample call routing rule: weekday business hours ring extension 100
INSERT INTO call_routing_rules (name, priority, day_of_week, start_time, end_time, action_type, action_target, fallback_action)
VALUES (
  'Weekday Business Hours',
  10,
  ARRAY[1,2,3,4,5],
  '09:00',
  '18:00',
  'ring_extension',
  (SELECT id::text FROM phone_extensions WHERE extension = '100' LIMIT 1),
  'voicemail'
);

-- After-hours rule: always go to voicemail
INSERT INTO call_routing_rules (name, priority, day_of_week, start_time, end_time, action_type, fallback_action)
VALUES (
  'After Hours',
  0,
  ARRAY[0,1,2,3,4,5,6],
  '00:00',
  '23:59',
  'voicemail',
  'voicemail'
);
