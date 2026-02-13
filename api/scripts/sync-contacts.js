/**
 * Sync contacts from Google Sheets into the contacts table.
 *
 * Usage:
 *   node api/scripts/sync-contacts.js                    # sync from Google Sheet (requires API key)
 *   node api/scripts/sync-contacts.js --csv <file.csv>   # import from CSV file
 *
 * The Google Sheet "patients3" tab is the source of truth, unifying contacts from
 * Aesthetic Record, GoHighLevel, and TextMagic.
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from api/.env)
 *   GOOGLE_SHEETS_API_KEY or GOOGLE_SERVICE_ACCOUNT_JSON (optional, for live sync)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from api/ directory
const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    if (!process.env[t.slice(0, eq)]) {
      process.env[t.slice(0, eq)] = t.slice(eq + 1);
    }
  }
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Parse CLI args
const args = process.argv.slice(2);
const csvIndex = args.indexOf('--csv');
const csvFile = csvIndex >= 0 ? args[csvIndex + 1] : null;

/**
 * Normalize a phone number to digits only (for matching).
 * +1 (818) 463-3772 → 18184633772
 * (818) 463-3772 → 8184633772
 */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  // If starts with 1 and is 11 digits, keep as-is
  // If 10 digits, it's a US number without country code
  return digits || null;
}

/**
 * Parse CSV content into an array of objects.
 * Handles quoted fields with commas inside.
 */
function parseCsv(content) {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  // Parse header row
  const headers = parseCsvLine(lines[0]);
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const record = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j].trim().toLowerCase()] = (values[j] || '').trim();
    }
    records.push(record);
  }

  return records;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

/**
 * Map a CSV record to our contacts table schema.
 * Adapts to various column naming conventions.
 * Handles the patients3 unified sheet format (AR + GHL + TextMagic columns).
 */
function mapRecord(raw) {
  // Try common column names for each field
  const firstName = raw['first name'] || raw['first_name'] || raw['firstname'] || raw['first'] || '';
  const lastName = raw['last name'] || raw['last_name'] || raw['lastname'] || raw['last'] || '';
  const fullName = raw['full name'] || raw['full_name'] || raw['name'] || raw['contact name'] ||
                   (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || '');
  const phone = raw['phone'] || raw['phone number'] || raw['phone_number'] || raw['mobile'] || raw['cell'] || '';
  const email = raw['email'] || raw['email address'] || raw['email_address'] || '';
  const source = raw['source'] || raw['origin'] || 'google_sheet';
  const sourceId = raw['ar id'] || raw['id'] || raw['patient id'] || raw['patient_id'] || raw['contact id'] || '';
  const status = raw['status'] || raw['patient status'] || raw['patient_status'] || raw['contact type'] || '';

  // Primary fields that go into top-level columns (not metadata)
  const primaryKeys = new Set([
    'first name', 'first_name', 'firstname', 'first',
    'last name', 'last_name', 'lastname', 'last',
    'full name', 'full_name', 'name', 'contact name',
    'phone', 'phone number', 'phone_number', 'mobile', 'cell',
    'email', 'email address', 'email_address',
    'source', 'origin',
    'ar id', 'id', 'patient id', 'patient_id', 'contact id',
    'status', 'patient status', 'patient_status', 'contact type'
  ]);

  // Columns we specifically want in metadata (vs. junk columns)
  const metadata = {};
  const metadataMapping = {
    'total sales': 'total_sales',
    'visited': 'last_visited',
    'nick name': 'nickname',
    'referral source': 'referral_source',
    'dob': 'dob',
    'address line 1': 'address_line1',
    'address line 2': 'address_line2',
    'city': 'city',
    'state': 'state',
    'zip': 'zip',
    'country': 'country',
    'membership type': 'membership_type',
    'patient created date': 'patient_created_date',
    'lists': 'lists',
    'tags': 'tags',
    'ghl contact id': 'ghl_contact_id',
    'ghl contact name': 'ghl_contact_name',
    'ghl date added': 'ghl_date_added',
    'ghl date updated': 'ghl_date_updated',
    'ghl phone': 'ghl_phone',
    'textmagic phone': 'textmagic_phone',
    'textmagic contact id': 'textmagic_contact_id',
    'textmagic make': 'textmagic_make'
  };

  for (const [csvKey, metaKey] of Object.entries(metadataMapping)) {
    if (raw[csvKey] && raw[csvKey].trim()) {
      metadata[metaKey] = raw[csvKey].trim();
    }
  }

  // Catch any extra columns not in primary or metadata mapping
  for (const [key, val] of Object.entries(raw)) {
    if (!primaryKeys.has(key) && !metadataMapping[key] && val && val.trim()) {
      // Skip image columns and empty values
      if (key.includes('image') || key.includes('user_image')) continue;
      metadata[key] = val.trim();
    }
  }

  // Normalize source names
  let normalizedSource = source.toLowerCase();
  if (normalizedSource.includes('aesthetic') || normalizedSource.includes('ar')) {
    normalizedSource = 'aesthetic_record';
  } else if (normalizedSource.includes('highlevel') || normalizedSource.includes('ghl')) {
    normalizedSource = 'gohighlevel';
  } else if (normalizedSource.includes('textmagic') || normalizedSource.includes('tm')) {
    normalizedSource = 'textmagic';
  } else if (!['aesthetic_record', 'gohighlevel', 'textmagic', 'manual'].includes(normalizedSource)) {
    normalizedSource = 'google_sheet';
  }

  return {
    first_name: firstName || null,
    last_name: lastName || null,
    full_name: fullName || null,
    phone: phone || null,
    phone_normalized: normalizePhone(phone),
    email: email || null,
    source: normalizedSource,
    source_id: sourceId || null,
    patient_status: status ? status.toLowerCase() : null,
    metadata: Object.keys(metadata).length > 0 ? metadata : {},
    last_synced_at: new Date().toISOString()
  };
}

async function syncFromCsv(filePath) {
  console.log(`Reading CSV: ${filePath}`);
  const content = readFileSync(filePath, 'utf-8');
  const records = parseCsv(content);
  console.log(`Parsed ${records.length} records`);

  if (records.length === 0) {
    console.log('No records to sync.');
    return;
  }

  // Show first record for debugging
  console.log('Sample record:', JSON.stringify(records[0], null, 2));

  const contacts = records
    .map(mapRecord)
    .filter(c => c.full_name || c.phone || c.email); // Skip empty rows

  console.log(`Mapped ${contacts.length} valid contacts`);

  // Upsert in batches of 100
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < contacts.length; i += 100) {
    const batch = contacts.slice(i, i + 100);

    // For each contact, try to find existing by phone_normalized or email
    for (const contact of batch) {
      let existing = null;

      if (contact.phone_normalized) {
        const { data } = await supabase
          .from('contacts')
          .select('id')
          .eq('phone_normalized', contact.phone_normalized)
          .limit(1)
          .maybeSingle();
        existing = data;
      }

      if (!existing && contact.email) {
        const { data } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', contact.email)
          .limit(1)
          .maybeSingle();
        existing = data;
      }

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('contacts')
          .update({
            ...contact,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) {
          console.error(`  Error updating ${contact.full_name}: ${error.message}`);
          errors++;
        } else {
          updated++;
        }
      } else {
        // Insert new
        const { error } = await supabase
          .from('contacts')
          .insert(contact);

        if (error) {
          console.error(`  Error inserting ${contact.full_name}: ${error.message}`);
          errors++;
        } else {
          inserted++;
        }
      }
    }

    console.log(`  Processed ${Math.min(i + 100, contacts.length)} / ${contacts.length}`);
  }

  console.log(`\nSync complete: ${inserted} inserted, ${updated} updated, ${errors} errors`);
}

async function syncFromGoogleSheet() {
  const sheetId = '17QsXyjLGB5b2hUPesyInsVfJ2ME2H_JJi0sDTDxFayo';
  const tabName = 'patients3';

  // Try published CSV export first (if sheet tab is published)
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;

  console.log(`Fetching Google Sheet: ${tabName}`);
  console.log(`URL: ${csvUrl}`);

  const res = await fetch(csvUrl);

  if (!res.ok || res.headers.get('content-type')?.includes('html')) {
    console.error('Failed to fetch Google Sheet. The sheet may not be published.');
    console.error('');
    console.error('To fix, either:');
    console.error('  1. Publish the "patients3" tab: File → Share → Publish to web → patients3 tab → CSV');
    console.error('  2. Export as CSV manually and run: node api/scripts/sync-contacts.js --csv <file.csv>');
    console.error('  3. Set up a Google Service Account (future — not yet implemented)');
    process.exit(1);
  }

  const csvContent = await res.text();
  const records = parseCsv(csvContent);
  console.log(`Fetched ${records.length} records from Google Sheet`);

  if (records.length === 0) {
    console.log('No records found.');
    return;
  }

  console.log('Sample record:', JSON.stringify(records[0], null, 2));

  const contacts = records
    .map(mapRecord)
    .filter(c => c.full_name || c.phone || c.email);

  console.log(`Mapped ${contacts.length} valid contacts`);

  // Same upsert logic as CSV
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < contacts.length; i += 100) {
    const batch = contacts.slice(i, i + 100);

    for (const contact of batch) {
      let existing = null;

      if (contact.phone_normalized) {
        const { data } = await supabase
          .from('contacts')
          .select('id')
          .eq('phone_normalized', contact.phone_normalized)
          .limit(1)
          .maybeSingle();
        existing = data;
      }

      if (!existing && contact.email) {
        const { data } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', contact.email)
          .limit(1)
          .maybeSingle();
        existing = data;
      }

      if (existing) {
        const { error } = await supabase
          .from('contacts')
          .update({
            ...contact,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) {
          console.error(`  Error updating ${contact.full_name}: ${error.message}`);
          errors++;
        } else {
          updated++;
        }
      } else {
        const { error } = await supabase
          .from('contacts')
          .insert(contact);

        if (error) {
          console.error(`  Error inserting ${contact.full_name}: ${error.message}`);
          errors++;
        } else {
          inserted++;
        }
      }
    }

    console.log(`  Processed ${Math.min(i + 100, contacts.length)} / ${contacts.length}`);
  }

  console.log(`\nSync complete: ${inserted} inserted, ${updated} updated, ${errors} errors`);
}

// Main
if (csvFile) {
  if (!existsSync(csvFile)) {
    console.error(`File not found: ${csvFile}`);
    process.exit(1);
  }
  await syncFromCsv(csvFile);
} else {
  await syncFromGoogleSheet();
}
