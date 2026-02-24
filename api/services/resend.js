const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'noreply@updates.lemedspa.com';

/**
 * Send a one-time password (OTP) email via the Resend API.
 *
 * @param {string} to - Recipient email address
 * @param {string} otp - The one-time password to include in the email
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function sendOtpEmail(to, otp) {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		console.error('RESEND_API_KEY is not set — cannot send OTP email');
		return { success: false, error: 'Email service not configured' };
	}

	try {
		const response = await fetch(RESEND_API_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: FROM_ADDRESS,
				to: [to],
				subject: 'Your Le Med Spa verification code',
				html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a1a1a; margin-bottom: 16px;">Verification Code</h2>
            <p style="color: #444; font-size: 16px; line-height: 1.5;">
              Your one-time verification code for Le Med Spa is:
            </p>
            <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1a1a1a;">${otp}</span>
            </div>
            <p style="color: #888; font-size: 14px; line-height: 1.5;">
              This code expires in 10 minutes. If you did not request this code, you can safely ignore this email.
            </p>
          </div>
        `
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error('Resend API error:', response.status, errorBody);
			return { success: false, error: `Email send failed: ${response.status}` };
		}

		const data = await response.json();
		return { success: true, data };
	} catch (err) {
		console.error('Failed to send OTP email:', err);
		return { success: false, error: err.message };
	}
}

/**
 * Send a generic email via the Resend API.
 *
 * @param {{ to: string, from?: string, fromName?: string, cc?: string[], bcc?: string[], subject: string, text: string, html?: string }} opts
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function sendEmail({ to, from, fromName, cc, bcc, subject, text, html }) {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		console.error('RESEND_API_KEY is not set — cannot send email');
		return { success: false, error: 'Email service not configured' };
	}

	const fromAddr = from || FROM_ADDRESS;
	const fromFull = fromName ? `${fromName} <${fromAddr}>` : fromAddr;

	try {
		const response = await fetch(RESEND_API_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: fromFull,
				to: [to],
				...(cc?.length && { cc }),
				...(bcc?.length && { bcc }),
				subject,
				text,
				...(html && { html })
			})
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error('Resend API error:', response.status, errorBody);
			return { success: false, error: `Email send failed: ${response.status}` };
		}

		const data = await response.json();
		return { success: true, data };
	} catch (err) {
		console.error('Failed to send email:', err);
		return { success: false, error: err.message };
	}
}
