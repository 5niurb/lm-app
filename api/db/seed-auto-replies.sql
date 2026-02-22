-- Seed: default auto-reply rules
-- All rules start as is_active=false so staff can review and enable them.
-- Idempotent: skips insert if a rule with matching response_body already exists.

INSERT INTO auto_reply_rules (trigger_type, trigger_keywords, response_body, is_active, priority, hours_restriction)
SELECT 'keyword', ARRAY['hours','open','close','closed'],
       'Le Med Spa is open Mon-Fri 10am-6pm, Sat 10am-4pm. Sunday by appointment only. Call (818) 463-3772.',
       false, 10, 'always'
WHERE NOT EXISTS (
  SELECT 1 FROM auto_reply_rules
  WHERE trigger_keywords @> ARRAY['hours'] AND trigger_type = 'keyword'
);

INSERT INTO auto_reply_rules (trigger_type, trigger_keywords, response_body, is_active, priority, hours_restriction)
SELECT 'keyword', ARRAY['address','location','where','directions'],
       E'We\u2019re at 17414 Ventura Blvd, Encino, CA 91316. Google Maps: https://maps.app.goo.gl/LeMedSpa',
       false, 10, 'always'
WHERE NOT EXISTS (
  SELECT 1 FROM auto_reply_rules
  WHERE trigger_keywords @> ARRAY['address'] AND trigger_type = 'keyword'
);

INSERT INTO auto_reply_rules (trigger_type, trigger_keywords, response_body, is_active, priority, hours_restriction)
SELECT 'keyword', ARRAY['book','appointment','schedule','reserve'],
       'Book online at https://lemedspa.com/booking or call (818) 463-3772.',
       false, 10, 'always'
WHERE NOT EXISTS (
  SELECT 1 FROM auto_reply_rules
  WHERE trigger_keywords @> ARRAY['book'] AND trigger_type = 'keyword'
);

INSERT INTO auto_reply_rules (trigger_type, trigger_keywords, response_body, is_active, priority, hours_restriction)
SELECT 'any', '{}',
       E'Thanks for texting Le Med Spa! We\u2019re currently closed and will respond when we reopen. For emergencies, call (818) 463-3772.',
       false, 99, 'after_hours'
WHERE NOT EXISTS (
  SELECT 1 FROM auto_reply_rules
  WHERE trigger_type = 'any' AND hours_restriction = 'after_hours'
);
