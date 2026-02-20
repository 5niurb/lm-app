/**
 * Upload audio files to Twilio Assets via the Serverless API.
 *
 * Usage: node twilio/upload-assets.js [--service-name <name>]
 *
 * Uploads all .mp3/.wav files from twilio/assets/ to a Twilio Serverless Service.
 * Creates the service if it doesn't exist. Deploys a new build so files are accessible.
 *
 * After upload, prints the public URLs for each asset.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envPath = resolve(__dirname, '..', 'api', '.env');
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

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
if (!accountSid || !authToken) {
	console.error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
	process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
const SERVICE_NAME = 'lm-ivr-assets';
const assetsDir = resolve(__dirname, 'assets');

// Helper: API call
async function api(url, opts = {}) {
	const res = await fetch(url, {
		...opts,
		headers: { Authorization: authHeader, ...(opts.headers || {}) }
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`API ${res.status}: ${body}`);
	}
	return res.json();
}

// 1. Find or create the service
console.log('Finding/creating Twilio Serverless service...');
let service;
const servicesData = await api('https://serverless.twilio.com/v1/Services');
service = servicesData.services.find((s) => s.unique_name === SERVICE_NAME);

if (!service) {
	console.log(`  Creating service: ${SERVICE_NAME}`);
	const params = new URLSearchParams();
	params.set('UniqueName', SERVICE_NAME);
	params.set('FriendlyName', 'LM IVR Audio Assets');
	params.set('IncludeCredentials', 'false');
	const createRes = await fetch('https://serverless.twilio.com/v1/Services', {
		method: 'POST',
		headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params.toString()
	});
	if (!createRes.ok) {
		const body = await createRes.text();
		console.error(`Failed to create service: ${body}`);
		process.exit(1);
	}
	service = await createRes.json();
	console.log(`  Created: ${service.sid}`);
} else {
	console.log(`  Found: ${service.sid} (${service.friendly_name})`);
}

// 2. Find or create environment
let environment;
const envsData = await api(`https://serverless.twilio.com/v1/Services/${service.sid}/Environments`);
environment = envsData.environments[0]; // Use first environment

if (!environment) {
	console.log('  Creating environment...');
	const params = new URLSearchParams();
	params.set('UniqueName', 'production');
	const envRes = await fetch(
		`https://serverless.twilio.com/v1/Services/${service.sid}/Environments`,
		{
			method: 'POST',
			headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params.toString()
		}
	);
	if (!envRes.ok) {
		const body = await envRes.text();
		console.error(`Failed to create environment: ${body}`);
		process.exit(1);
	}
	environment = await envRes.json();
	console.log(`  Created: ${environment.sid} | ${environment.domain_name}`);
} else {
	console.log(`  Environment: ${environment.sid} | ${environment.domain_name}`);
}

// 3. Scan local files
const audioExts = ['.mp3', '.wav', '.m4a'];
const files = readdirSync(assetsDir).filter((f) => audioExts.includes(extname(f).toLowerCase()));
if (files.length === 0) {
	console.log('No audio files found in twilio/assets/');
	process.exit(0);
}
console.log(`\nFound ${files.length} audio files to upload:`);
files.forEach((f) => console.log(`  ${f}`));

// 4. Upload each file as an asset
const assetVersionSids = [];

for (const file of files) {
	const filePath = resolve(assetsDir, file);
	const fileContent = readFileSync(filePath);
	const ext = extname(file).toLowerCase();
	const contentType = ext === '.mp3' ? 'audio/mpeg' : ext === '.m4a' ? 'audio/mp4' : 'audio/wav';

	// Clean up the filename for the path
	// Remove double extensions like .mp3.mp3 and spaces
	let cleanName = file;
	// Fix double extensions
	cleanName = cleanName
		.replace(/\.mp3\.mp3$/, '.mp3')
		.replace(/\.wav\.wav$/, '.wav')
		.replace(/\.m4a\.m4a$/, '.m4a');
	// Replace spaces and parens with dashes/clean chars
	cleanName = cleanName.replace(/[()]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-');

	const assetPath = `/assets/${cleanName}`;

	console.log(`\nUploading: ${file} → ${assetPath}`);

	// Create the Asset resource
	const assetParams = new URLSearchParams();
	assetParams.set('FriendlyName', cleanName);
	const assetRes = await fetch(`https://serverless.twilio.com/v1/Services/${service.sid}/Assets`, {
		method: 'POST',
		headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: assetParams.toString()
	});

	let asset;
	if (assetRes.status === 409) {
		// Already exists, find it
		const existingAssets = await api(
			`https://serverless.twilio.com/v1/Services/${service.sid}/Assets?PageSize=100`
		);
		asset = existingAssets.assets.find((a) => a.friendly_name === cleanName);
		if (!asset) {
			console.error(`  Asset conflict but couldn't find existing: ${cleanName}`);
			continue;
		}
		console.log(`  Asset already exists: ${asset.sid}`);
	} else if (!assetRes.ok) {
		const body = await assetRes.text();
		console.error(`  Failed to create asset: ${body}`);
		continue;
	} else {
		asset = await assetRes.json();
		console.log(`  Asset created: ${asset.sid}`);
	}

	// Upload the asset version using multipart form
	const boundary = '----FormBoundary' + Math.random().toString(36).substr(2);
	const parts = [];

	// Path part
	parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="Path"\r\n\r\n${assetPath}`);
	// Visibility part
	parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="Visibility"\r\n\r\npublic`);
	// Content part (binary)
	const contentHeader = `--${boundary}\r\nContent-Disposition: form-data; name="Content"; filename="${cleanName}"\r\nContent-Type: ${contentType}\r\n\r\n`;
	const contentFooter = `\r\n--${boundary}--\r\n`;

	const headerBuf = Buffer.from(contentHeader, 'utf-8');
	const footerBuf = Buffer.from(contentFooter, 'utf-8');
	const partsBuf = Buffer.from(parts.join('\r\n') + '\r\n', 'utf-8');
	const body = Buffer.concat([partsBuf, headerBuf, fileContent, footerBuf]);

	const versionRes = await fetch(
		`https://serverless-upload.twilio.com/v1/Services/${service.sid}/Assets/${asset.sid}/Versions`,
		{
			method: 'POST',
			headers: {
				Authorization: authHeader,
				'Content-Type': `multipart/form-data; boundary=${boundary}`
			},
			body: body
		}
	);

	if (!versionRes.ok) {
		const errBody = await versionRes.text();
		console.error(`  Failed to upload version: ${errBody}`);
		continue;
	}

	const version = await versionRes.json();
	console.log(`  Version uploaded: ${version.sid}`);
	assetVersionSids.push(version.sid);
}

if (assetVersionSids.length === 0) {
	console.error('\nNo assets were uploaded successfully.');
	process.exit(1);
}

// 5. Create a build with all asset versions
console.log(`\nCreating build with ${assetVersionSids.length} assets...`);
const buildParams = new URLSearchParams();
assetVersionSids.forEach((sid) => buildParams.append('AssetVersions', sid));

const buildRes = await fetch(`https://serverless.twilio.com/v1/Services/${service.sid}/Builds`, {
	method: 'POST',
	headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
	body: buildParams.toString()
});

if (!buildRes.ok) {
	const body = await buildRes.text();
	console.error(`Failed to create build: ${body}`);
	process.exit(1);
}

const build = await buildRes.json();
console.log(`  Build created: ${build.sid} (status: ${build.status})`);

// 6. Poll until build is complete
console.log('  Waiting for build to complete...');
let buildStatus = build.status;
while (buildStatus === 'building') {
	await new Promise((r) => setTimeout(r, 3000));
	const statusRes = await api(
		`https://serverless.twilio.com/v1/Services/${service.sid}/Builds/${build.sid}`
	);
	buildStatus = statusRes.status;
	console.log(`  Build status: ${buildStatus}`);
}

if (buildStatus !== 'completed') {
	console.error(`Build failed with status: ${buildStatus}`);
	process.exit(1);
}

// 7. Deploy the build to the environment
console.log('Deploying build...');
const deployParams = new URLSearchParams();
deployParams.set('BuildSid', build.sid);

const deployRes = await fetch(
	`https://serverless.twilio.com/v1/Services/${service.sid}/Environments/${environment.sid}/Deployments`,
	{
		method: 'POST',
		headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: deployParams.toString()
	}
);

if (!deployRes.ok) {
	const body = await deployRes.text();
	console.error(`Failed to deploy: ${body}`);
	process.exit(1);
}

const deployment = await deployRes.json();
console.log(`  Deployed: ${deployment.sid}`);

// 8. Print public URLs
console.log('\n=== PUBLIC ASSET URLs ===');
const domain = environment.domain_name;
for (const file of files) {
	let cleanName = file;
	cleanName = cleanName
		.replace(/\.mp3\.mp3$/, '.mp3')
		.replace(/\.wav\.wav$/, '.wav')
		.replace(/\.m4a\.m4a$/, '.m4a');
	cleanName = cleanName.replace(/[()]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-');
	console.log(`https://${domain}/assets/${cleanName}`);
}
console.log('\nDone!');
