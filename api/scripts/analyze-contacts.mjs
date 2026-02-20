import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Paginate to get ALL contacts
let all = [];
let from = 0;
while (true) {
	const { data } = await sb
		.from('contacts')
		.select(
			'id, source, source_id, phone_normalized, full_name, first_name, last_name, tags, email'
		)
		.range(from, from + 999);
	if (!data || data.length === 0) break;
	all = all.concat(data);
	if (data.length < 1000) break;
	from += 1000;
}
console.log('Total contacts:', all.length);

// By source
const bySource = {};
for (const c of all) bySource[c.source || 'null'] = (bySource[c.source || 'null'] || 0) + 1;
console.log('By source:', JSON.stringify(bySource));

// Duplicates by phone_normalized
const phoneMap = {};
for (const c of all) {
	if (c.phone_normalized) {
		if (!phoneMap[c.phone_normalized]) phoneMap[c.phone_normalized] = [];
		phoneMap[c.phone_normalized].push(c);
	}
}
const dupes = Object.entries(phoneMap).filter(([, v]) => v.length > 1);
console.log('\nPhone numbers with multiple contacts:', dupes.length);
for (const [phone, contacts] of dupes.slice(0, 10)) {
	console.log('  +' + phone + ':');
	for (const c of contacts) {
		console.log(
			'    ',
			c.source,
			'|',
			c.full_name || 'unnamed',
			'|',
			c.email || 'no email',
			'| tags:',
			(c.tags || []).join(',')
		);
	}
}

// Tag analysis
const bothTags = all.filter((c) => c.tags && c.tags.includes('lead') && c.tags.includes('patient'));
console.log('\nContacts with BOTH lead+patient:', bothTags.length);
const leads = all.filter((c) => c.tags && c.tags.includes('lead'));
console.log('Contacts with lead tag:', leads.length);
const patients = all.filter((c) => c.tags && c.tags.includes('patient'));
console.log('Contacts with patient tag:', patients.length);
const noPhone = all.filter((c) => !c.phone_normalized);
console.log('Contacts without phone:', noPhone.length);
