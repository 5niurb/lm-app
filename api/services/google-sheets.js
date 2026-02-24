/**
 * Google Sheets API service — read/write access via service account.
 *
 * Env vars:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH — path to service account JSON key file
 *   GOOGLE_SPREADSHEET_ID — spreadsheet ID (extracted from URL or set directly)
 *
 * The service account email must be shared as Editor on the target spreadsheet.
 */
import { google } from 'googleapis';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default spreadsheet ID (LeMed Contacts)
const SPREADSHEET_ID =
	process.env.GOOGLE_SPREADSHEET_ID || '17QsXyjLGB5b2hUPesyInsVfJ2ME2H_JJi0sDTDxFayo';

/**
 * Resolve the service account key file path.
 * Checks env var first, then common local locations.
 */
function resolveKeyFile() {
	if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
		return process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
	}
	// Check common locations relative to project root
	const candidates = [
		resolve(__dirname, '../../lmapp-google service key 488108-c743678110c2.json'),
		resolve(__dirname, '../../google-service-key.json')
	];
	for (const p of candidates) {
		if (existsSync(p)) return p;
	}
	return null;
}

/** @type {import('googleapis').sheets_v4.Sheets | null} */
let sheetsClient = null;

/**
 * Get an authenticated Google Sheets client (singleton).
 * @returns {import('googleapis').sheets_v4.Sheets}
 */
export function getSheetsClient() {
	if (sheetsClient) return sheetsClient;

	const keyFile = resolveKeyFile();
	if (!keyFile) {
		throw new Error(
			'Google service account key not found. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or place key file in project root.'
		);
	}

	const auth = new google.auth.GoogleAuth({
		keyFile,
		scopes: ['https://www.googleapis.com/auth/spreadsheets']
	});

	sheetsClient = google.sheets({ version: 'v4', auth });
	return sheetsClient;
}

/**
 * Read all rows from a sheet tab.
 * @param {string} sheetName — tab name (e.g. 'patients3')
 * @param {string} [range] — optional A1 range (e.g. 'A1:AG')
 * @returns {Promise<{headers: string[], rows: string[][]}>}
 */
export async function readSheet(sheetName, range) {
	const sheets = getSheetsClient();
	const fullRange = range ? `'${sheetName}'!${range}` : `'${sheetName}'`;
	const { data } = await sheets.spreadsheets.values.get({
		spreadsheetId: SPREADSHEET_ID,
		range: fullRange
	});
	const values = data.values || [];
	const headers = values[0] || [];
	const rows = values.slice(1);
	return { headers, rows };
}

/**
 * Write values to specific cells in a sheet.
 * @param {string} sheetName — tab name
 * @param {string} range — A1 notation range (e.g. 'AE2:AG500')
 * @param {string[][]} values — 2D array of values
 */
export async function writeSheet(sheetName, range, values) {
	const sheets = getSheetsClient();
	await sheets.spreadsheets.values.update({
		spreadsheetId: SPREADSHEET_ID,
		range: `'${sheetName}'!${range}`,
		valueInputOption: 'RAW',
		requestBody: { values }
	});
}

/**
 * Batch update specific cells scattered across a sheet.
 * More efficient than multiple writeSheet calls.
 * @param {Array<{range: string, values: string[][]}>} updates
 */
export async function batchWriteSheet(updates) {
	const sheets = getSheetsClient();
	await sheets.spreadsheets.values.batchUpdate({
		spreadsheetId: SPREADSHEET_ID,
		requestBody: {
			valueInputOption: 'RAW',
			data: updates.map((u) => ({
				range: u.range,
				values: u.values
			}))
		}
	});
}

export { SPREADSHEET_ID };
