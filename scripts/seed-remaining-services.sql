-- =============================================================================
-- Seed remaining services: IV Therapy, Bioidentical Hormones, Body Contouring
-- Plus pre/post care content blocks and consent forms for each
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. IV THERAPY (regenerative_wellness)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO services (name, slug, category, description, duration_min, price_from, is_active, sort_order, metadata)
VALUES (
  'IV Therapy',
  'iv-therapy',
  'regenerative_wellness',
  'Customized intravenous vitamin and nutrient infusions for hydration, energy, immune support, and recovery. Formulations include Myers'' Cocktail, NAD+, glutathione, and beauty drips.',
  45,
  199,
  true,
  11,
  '{"popular": true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- IV Therapy — Pre-Treatment Instructions
INSERT INTO service_content (service_id, content_type, title, summary, page_slug, content_json, is_active, version)
SELECT s.id,
  'pre_instructions',
  'IV Therapy Pre-Treatment Instructions',
  'Preparation guidelines for your IV therapy session at Le Med Spa.',
  'iv-therapy-pre',
  '[
    {"heading": "Hydration", "body": "Drink at least 16 oz of water in the 2 hours before your appointment. Well-hydrated veins are easier to access and make the infusion more comfortable."},
    {"heading": "Eat a Light Meal", "body": "Have a light meal or snack 1-2 hours before your session. Arriving on an empty stomach may cause lightheadedness during the infusion."},
    {"heading": "Wear Comfortable Clothing", "body": "Wear a short-sleeved shirt or top with sleeves that can be easily rolled up above the elbow. This allows easy access to the inner arm for IV placement."},
    {"heading": "Medications & Supplements", "body": "Continue taking your regular medications as prescribed. Inform your provider of any blood thinners, supplements, or medications you are currently taking. Bring a list if possible."},
    {"heading": "Allergies & Sensitivities", "body": "Please inform us of any known allergies, especially to vitamins, minerals, preservatives, or latex. If you have had a previous adverse reaction to an IV infusion, let us know before your appointment."},
    {"heading": "Health Conditions", "body": "Notify your provider if you have kidney disease, heart conditions, G6PD deficiency, hemochromatosis, or are pregnant or breastfeeding. Some IV formulations may need to be adjusted."},
    {"heading": "Plan Your Time", "body": "IV therapy sessions typically last 30-60 minutes depending on the formulation. Please plan to relax during your infusion — bring a book, headphones, or simply enjoy the spa atmosphere."}
  ]'::jsonb,
  true,
  1
FROM services s WHERE s.slug = 'iv-therapy'
ON CONFLICT DO NOTHING;

-- IV Therapy — Post-Treatment Instructions
INSERT INTO service_content (service_id, content_type, title, summary, page_slug, content_json, is_active, version)
SELECT s.id,
  'post_instructions',
  'IV Therapy Post-Treatment Instructions',
  'Aftercare guidelines following your IV therapy session.',
  'iv-therapy-post',
  '[
    {"heading": "Stay Hydrated", "body": "Continue drinking water throughout the day. Proper hydration helps your body absorb and utilize the nutrients from your infusion."},
    {"heading": "Monitor the IV Site", "body": "Keep the bandage on for at least 30 minutes after your infusion. Minor bruising or tenderness at the insertion site is normal and should resolve within 1-2 days. Apply a cold compress if needed."},
    {"heading": "Rest & Recovery", "body": "Many patients feel an immediate boost in energy and well-being. However, some may feel tired as the body processes the nutrients. Listen to your body and rest if needed."},
    {"heading": "Normal Side Effects", "body": "You may experience a warm sensation, slight metallic taste, or mild flushing during or shortly after the infusion  — these are normal and temporary. A vitamin B complex can cause bright yellow urine, which is harmless."},
    {"heading": "When to Contact Us", "body": "Contact Le Med Spa if you experience excessive swelling, redness, or warmth at the IV site, fever, persistent nausea or vomiting, shortness of breath, or significant rash. Call 911 if you experience difficulty breathing or chest pain."},
    {"heading": "Follow-Up Treatments", "body": "For optimal results, IV therapy is often recommended as a series. Your provider will recommend a treatment schedule based on your individual needs and goals. Monthly maintenance infusions are common."}
  ]'::jsonb,
  true,
  1
FROM services s WHERE s.slug = 'iv-therapy'
ON CONFLICT DO NOTHING;

-- IV Therapy — Consent Form
INSERT INTO service_content (service_id, content_type, title, summary, page_slug, content_json, is_active, version)
SELECT s.id,
  'consent_form',
  'IV Therapy Informed Consent',
  'Informed consent for intravenous vitamin and nutrient infusion therapy.',
  'consent-iv-therapy',
  '[
    {"heading": "Nature of the Procedure", "body": "Intravenous (IV) therapy involves the administration of vitamins, minerals, amino acids, and/or other nutrients directly into the bloodstream through a small catheter placed in a vein. The specific formulation will be discussed with you prior to treatment."},
    {"heading": "Expected Benefits", "body": "Potential benefits include improved hydration, increased energy, enhanced immune function, better nutrient absorption (bypassing the digestive system), faster recovery, and overall wellness support."},
    {"heading": "Risks & Side Effects", "body": "As with any procedure involving venipuncture, risks include bruising, pain or discomfort at the injection site, phlebitis (vein inflammation), infiltration (fluid leaking into surrounding tissue), infection, allergic reaction, air embolism (rare), and vasovagal response (fainting)."},
    {"heading": "Contraindications", "body": "IV therapy may not be appropriate for individuals with congestive heart failure, renal insufficiency, certain electrolyte imbalances, G6PD deficiency (for high-dose vitamin C), hemochromatosis (for iron-containing formulas), or those who are pregnant without provider approval."},
    {"type": "checkbox", "heading": "Acknowledgment of Risks", "body": "I understand the potential risks and side effects of IV therapy as described above.", "label": "I acknowledge the risks and side effects"},
    {"type": "checkbox", "heading": "Consent to Treatment", "body": "I voluntarily consent to receive IV therapy. I have had the opportunity to ask questions and have received satisfactory answers.", "label": "I consent to IV therapy treatment"},
    {"heading": "Post-Treatment Care", "body": "I understand that I should monitor the IV site, stay hydrated, and contact Le Med Spa if I experience any concerning symptoms. I will follow all post-treatment instructions provided."}
  ]'::jsonb,
  true,
  1
FROM services s WHERE s.slug = 'iv-therapy'
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. BIOIDENTICAL HORMONE THERAPY (regenerative_wellness)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO services (name, slug, category, description, duration_min, price_from, is_active, sort_order, metadata)
VALUES (
  'Bioidentical Hormone Therapy',
  'bioidentical-hormones',
  'regenerative_wellness',
  'Personalized hormone replacement therapy using bioidentical hormones to restore balance, alleviate symptoms of hormonal imbalance, and support overall vitality. Includes pellet, cream, and injectable options.',
  30,
  299,
  true,
  12,
  '{"consultation_required": true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Bioidentical Hormones — Pre-Treatment Instructions
INSERT INTO service_content (service_id, content_type, title, summary, page_slug, content_json, is_active, version)
SELECT s.id,
  'pre_instructions',
  'Bioidentical Hormone Therapy Pre-Treatment Instructions',
  'How to prepare for your hormone therapy consultation and treatment at Le Med Spa.',
  'bioidentical-hormones-pre',
  '[
    {"heading": "Lab Work", "body": "Complete blood work is required before starting hormone therapy. If labs have not already been drawn, they will be ordered at your initial consultation. Fasting for 10-12 hours prior to lab work is recommended for accurate hormone-level readings."},
    {"heading": "Medication List", "body": "Bring a complete list of all current medications, supplements, and over-the-counter products. Include dosages and frequency. This helps your provider avoid interactions and optimize your treatment plan."},
    {"heading": "Symptom Diary", "body": "Track your symptoms for 1-2 weeks before your appointment, noting energy levels, sleep quality, mood changes, hot flashes, libido, weight changes, and any other concerns. This helps your provider tailor your treatment."},
    {"heading": "If Receiving Pellet Insertion", "body": "For pellet insertion procedures: avoid blood thinners (aspirin, ibuprofen, fish oil) for 7 days prior unless medically necessary. Avoid intense exercise for 24 hours before the procedure. Wear loose, comfortable clothing."},
    {"heading": "For Topical/Injectable Treatments", "body": "If transitioning from another hormone therapy, discuss timing with your provider. Do not stop any current hormone therapy abruptly without medical guidance."},
    {"heading": "Questions to Prepare", "body": "Write down any questions or concerns you have about hormone therapy, including expected timeline for results, potential side effects, monitoring schedule, and treatment duration."}
  ]'::jsonb,
  true,
  1
FROM services s WHERE s.slug = 'bioidentical-hormones'
ON CONFLICT DO NOTHING;

-- Bioidentical Hormones — Post-Treatment Instructions
INSERT INTO service_content (service_id, content_type, title, summary, page_slug, content_json, is_active, version)
SELECT s.id,
  'post_instructions',
  'Bioidentical Hormone Therapy Post-Treatment Instructions',
  'Aftercare and follow-up guidelines for your hormone therapy treatment.',
  'bioidentical-hormones-post',
  '[
    {"heading": "For Pellet Insertion", "body": "Keep the insertion site clean and dry for 24 hours. Leave the Steri-Strip in place for 5-7 days. Avoid soaking in baths, pools, or hot tubs for 5 days. Avoid intense lower body exercise (squats, lunges, cycling, running) for 5-7 days. Walking is encouraged."},
    {"heading": "Expected Timeline", "body": "Most patients begin noticing improvements within 2-4 weeks. Full effects of hormone optimization typically develop over 8-12 weeks. Pellets typically last 3-6 months depending on activity level and metabolism."},
    {"heading": "For Topical Hormones", "body": "Apply the cream to thin-skinned areas as directed (usually inner arms, inner thighs, or behind the knees). Allow to dry completely before dressing. Wash hands after application. Avoid skin-to-skin contact with others at the application site."},
    {"heading": "Monitor & Track", "body": "Continue tracking your symptoms after starting treatment. Note improvements as well as any new symptoms. This information is valuable for dose adjustments at follow-up appointments."},
    {"heading": "Side Effects to Watch For", "body": "Temporary side effects may include water retention, breast tenderness, mood fluctuations, acne, or hair texture changes as your body adjusts. These typically resolve within the first few weeks. Contact us if symptoms persist or worsen."},
    {"heading": "Follow-Up Labs & Appointments", "body": "Follow-up blood work will be ordered 4-6 weeks after starting treatment to check hormone levels and adjust dosing. Regular monitoring (every 3-6 months) is essential for safe, effective hormone optimization."},
    {"heading": "When to Contact Us", "body": "Call Le Med Spa immediately if you experience signs of infection at the pellet site (increasing redness, warmth, discharge), severe mood changes, chest pain, shortness of breath, severe headaches, or leg swelling."}
  ]'::jsonb,
  true,
  1
FROM services s WHERE s.slug = 'bioidentical-hormones'
ON CONFLICT DO NOTHING;

-- Bioidentical Hormones — Consent Form
INSERT INTO service_content (service_id, content_type, title, summary, page_slug, content_json, is_active, version)
SELECT s.id,
  'consent_form',
  'Bioidentical Hormone Therapy Informed Consent',
  'Informed consent for bioidentical hormone replacement therapy.',
  'consent-bioidentical-hormones',
  '[
    {"heading": "Nature of the Treatment", "body": "Bioidentical hormone replacement therapy (BHRT) involves the use of hormones that are chemically identical to those naturally produced by the human body. Treatment may be administered via subcutaneous pellets, topical creams, or injections. The goal is to restore optimal hormone balance."},
    {"heading": "Expected Benefits", "body": "Potential benefits include relief from symptoms of hormonal imbalance (fatigue, mood changes, hot flashes, decreased libido, weight gain, brain fog, sleep disturbances), improved bone density, cardiovascular support, and enhanced quality of life."},
    {"heading": "Risks & Side Effects", "body": "Risks include hormonal fluctuations during dose optimization, water retention, breast tenderness, acne, mood changes, hair changes, and potential for over- or under-dosing. Pellet insertion may cause bruising, infection, or pellet extrusion (rare). There is ongoing medical debate about long-term cardiovascular and cancer risks of hormone therapy."},
    {"heading": "Contraindications", "body": "BHRT may not be appropriate for individuals with a history of hormone-sensitive cancers (breast, uterine, prostate), active blood clots or clotting disorders, unexplained vaginal bleeding, active liver disease, or those who are pregnant or breastfeeding."},
    {"type": "checkbox", "heading": "Acknowledgment of Risks", "body": "I understand the potential risks, side effects, and limitations of bioidentical hormone therapy as described above.", "label": "I acknowledge the risks and limitations"},
    {"type": "checkbox", "heading": "Commitment to Monitoring", "body": "I understand that regular lab work and follow-up appointments are essential for safe hormone therapy. I commit to attending scheduled follow-ups and completing recommended blood work.", "label": "I commit to required follow-up monitoring"},
    {"heading": "Alternatives", "body": "I understand that alternatives to BHRT include lifestyle modifications (diet, exercise, stress management, sleep optimization), synthetic hormone therapy, non-hormonal medications, and herbal/supplement approaches. These have been discussed with me."}
  ]'::jsonb,
  true,
  1
FROM services s WHERE s.slug = 'bioidentical-hormones'
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. BODY CONTOURING (bespoke_treatments)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO services (name, slug, category, description, duration_min, price_from, is_active, sort_order, metadata)
VALUES (
  'Body Contouring',
  'body-contouring',
  'bespoke_treatments',
  'Non-invasive body sculpting treatments to reduce stubborn fat, tighten skin, and improve body contours. Technologies include radiofrequency, cryolipolysis, and ultrasound-based treatments.',
  60,
  499,
  true,
  13,
  '{"consultation_required": true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Body Contouring — Pre-Treatment Instructions
INSERT INTO service_content (service_id, content_type, title, summary, page_slug, content_json, is_active, version)
SELECT s.id,
  'pre_instructions',
  'Body Contouring Pre-Treatment Instructions',
  'How to prepare for your body contouring procedure at Le Med Spa.',
  'body-contouring-pre',
  '[
    {"heading": "Consultation First", "body": "A consultation is required before your first body contouring treatment. During this visit, your provider will assess treatment areas, discuss realistic expectations, recommend the appropriate technology, and create a personalized treatment plan."},
    {"heading": "Hydration & Diet", "body": "Drink plenty of water in the days leading up to your treatment. Avoid excessive salt, alcohol, and caffeine for 24-48 hours before, as these can increase water retention and affect results."},
    {"heading": "Skin Preparation", "body": "The treatment area should be clean, dry, and free of lotions, oils, or self-tanner. Do not shave the treatment area within 24 hours if the area has hair. Avoid sun exposure and tanning for 2 weeks prior."},
    {"heading": "Clothing", "body": "Wear loose, comfortable clothing. Avoid tight garments or compression wear to your appointment. You may be asked to change into a treatment gown."},
    {"heading": "Medications & Supplements", "body": "Avoid blood thinners (ibuprofen, aspirin, fish oil, vitamin E) for 7 days prior if your treatment involves any applicator that may cause bruising. Continue prescription medications as directed."},
    {"heading": "Exercise", "body": "Maintain your regular exercise routine leading up to treatment. Being at a stable weight helps optimize results. Body contouring is not a weight-loss procedure — it targets specific areas of stubborn fat."},
    {"heading": "What to Expect", "body": "Treatments are generally well-tolerated. Depending on the technology, you may feel pulling, cooling, warming, or tingling sensations. Sessions typically last 25-60 minutes per treatment area."}
  ]'::jsonb,
  true,
  1
FROM services s WHERE s.slug = 'body-contouring'
ON CONFLICT DO NOTHING;

-- Body Contouring — Post-Treatment Instructions
INSERT INTO service_content (service_id, content_type, title, summary, page_slug, content_json, is_active, version)
SELECT s.id,
  'post_instructions',
  'Body Contouring Post-Treatment Instructions',
  'Aftercare guidelines following your body contouring treatment.',
  'body-contouring-post',
  '[
    {"heading": "Immediate Aftercare", "body": "Some redness, swelling, tingling, or numbness in the treated area is normal and typically resolves within hours to days. For cryolipolysis, you may experience more prolonged numbness (up to several weeks) which is expected."},
    {"heading": "Massage the Area", "body": "Gently massage the treated area for 5-10 minutes, 2-3 times daily for 2 weeks after treatment. This helps break up treated fat cells and improves lymphatic drainage for better results."},
    {"heading": "Stay Active & Hydrated", "body": "Resume your normal exercise routine immediately (unless otherwise instructed). Drink at least 8-10 glasses of water daily to support your body''s natural fat elimination process. Stay active to help metabolize the treated fat."},
    {"heading": "Healthy Lifestyle", "body": "Maintain a healthy diet and regular exercise program. While treated fat cells are permanently eliminated, remaining fat cells can still expand with significant weight gain. Results are best maintained with a stable weight."},
    {"heading": "Timeline for Results", "body": "Results develop gradually over 8-12 weeks as your body naturally processes and eliminates the treated fat cells. Full results may take up to 4-6 months. Multiple sessions may be recommended for optimal contouring."},
    {"heading": "When to Contact Us", "body": "Contact Le Med Spa if you experience severe pain, skin changes (blistering, darkening), prolonged swelling beyond 2 weeks, or any symptoms that concern you. These complications are rare but should be evaluated promptly."},
    {"heading": "Follow-Up", "body": "A follow-up appointment will be scheduled 8-12 weeks after treatment to assess results and determine if additional sessions would be beneficial. Most patients achieve their desired results in 2-4 sessions."}
  ]'::jsonb,
  true,
  1
FROM services s WHERE s.slug = 'body-contouring'
ON CONFLICT DO NOTHING;

-- Body Contouring — Consent Form
INSERT INTO service_content (service_id, content_type, title, summary, page_slug, content_json, is_active, version)
SELECT s.id,
  'consent_form',
  'Body Contouring Informed Consent',
  'Informed consent for non-invasive body contouring treatments.',
  'consent-body-contouring',
  '[
    {"heading": "Nature of the Procedure", "body": "Non-invasive body contouring uses technologies such as cryolipolysis (controlled cooling), radiofrequency energy, or focused ultrasound to reduce localized fat deposits and/or tighten skin without surgery. The specific technology and treatment parameters will be discussed prior to your procedure."},
    {"heading": "Expected Benefits", "body": "Potential benefits include reduction of stubborn fat in targeted areas, improved body contours, and skin tightening. Results are gradual and develop over weeks to months. Body contouring is not a weight loss solution and is most effective for patients near their ideal weight with specific areas of concern."},
    {"heading": "Risks & Side Effects", "body": "Common side effects include temporary redness, swelling, bruising, numbness, tingling, firmness, and discomfort in the treated area. Rare but possible complications include paradoxical adipose hyperplasia (fat area increases instead of decreases, more common with cryolipolysis), burns, blistering, hyperpigmentation, and asymmetric results."},
    {"heading": "Contraindications", "body": "Body contouring may not be suitable for individuals with cryoglobulinemia, cold agglutinin disease, paroxysmal cold hemoglobinuria, Raynaud''s disease (for cryolipolysis), implanted medical devices in the treatment area, hernia at or near the treatment site, or who are pregnant or breastfeeding."},
    {"type": "checkbox", "heading": "Acknowledgment of Risks", "body": "I understand the potential risks, limitations, and expected outcomes of body contouring as described above.", "label": "I acknowledge the risks and limitations"},
    {"type": "checkbox", "heading": "Realistic Expectations", "body": "I understand that body contouring is not a weight-loss procedure and results vary by individual. Multiple treatments may be needed, and maintaining results requires a healthy lifestyle.", "label": "I have realistic expectations for the procedure"},
    {"heading": "Post-Treatment Commitment", "body": "I understand the importance of following post-treatment instructions, including massage, hydration, and maintaining a stable weight. I commit to attending follow-up appointments as recommended."}
  ]'::jsonb,
  true,
  1
FROM services s WHERE s.slug = 'body-contouring'
ON CONFLICT DO NOTHING;

-- Verify — should show 13 services total (10 existing + 3 new)
-- SELECT name, slug, category FROM services ORDER BY sort_order;
-- Should show 27 content blocks total (18 existing + 9 new)
-- SELECT sc.title, sc.content_type, s.name FROM service_content sc JOIN services s ON sc.service_id = s.id ORDER BY s.sort_order, sc.content_type;
