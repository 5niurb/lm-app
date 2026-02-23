import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabase.js';

/** In-memory rate limiter: conversationId → { count, resetAt } */
const rateLimits = new Map();
const MAX_PER_HOUR = 10;

/**
 * Check and increment rate limit for a conversation.
 * @param {string} conversationId
 * @returns {boolean} true if allowed
 */
function checkRateLimit(conversationId) {
	const now = Date.now();
	const entry = rateLimits.get(conversationId);

	if (!entry || now > entry.resetAt) {
		rateLimits.set(conversationId, { count: 1, resetAt: now + 3600000 });
		return true;
	}

	if (entry.count >= MAX_PER_HOUR) return false;
	entry.count++;
	return true;
}

/** Strip phone numbers from text before sending to AI */
function stripPhones(text) {
	return (text || '').replace(/\+?\d{10,15}/g, '[phone]');
}

/**
 * Generate AI response suggestions for a conversation.
 * @param {string} conversationId
 * @returns {Promise<{summary: string, suggestions: Array<{label: string, icon: string, text: string}>}>}
 */
export async function generateSuggestions(conversationId) {
	if (!process.env.ANTHROPIC_API_KEY) {
		throw new Error('AI features not configured');
	}

	if (!checkRateLimit(conversationId)) {
		const err = new Error('Rate limit exceeded — max 10 AI suggestions per conversation per hour');
		err.status = 429;
		throw err;
	}

	// Fetch last 15 messages (excluding internal notes)
	const { data: messages, error } = await supabaseAdmin
		.from('messages')
		.select('direction, body, created_at, sender:profiles!messages_sent_by_fkey(full_name)')
		.eq('conversation_id', conversationId)
		.or('is_internal_note.is.null,is_internal_note.eq.false')
		.order('created_at', { ascending: false })
		.limit(15);

	if (error) throw new Error('Failed to fetch conversation history');

	const thread = (messages || [])
		.reverse()
		.map((m) => {
			const role = m.direction === 'inbound' ? 'Patient' : m.sender?.full_name || 'Staff';
			return `${role}: ${stripPhones(m.body || '')}`;
		})
		.join('\n');

	const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

	const response = await client.messages.create({
		model: 'claude-haiku-4-5-20251001',
		max_tokens: 1024,
		messages: [
			{
				role: 'user',
				content: `You are an assistant for Le Med Spa, a luxury medical spa in Encino, CA. Analyze this SMS conversation and generate response suggestions for the staff member.

Business context: Le Med Spa offers Botox, fillers, laser treatments, facials, IV therapy, and skincare products. The tone should be professional, warm, and luxurious.

Conversation:
${thread}

Respond in valid JSON with this exact structure:
{
  "summary": "1-2 sentence summary of the conversation and what the patient needs",
  "suggestions": [
    {"label": "Short action verb (e.g. Confirm, Suggest, Follow up)", "icon": "lucide-icon-name", "text": "The full draft message to send"},
    {"label": "...", "icon": "...", "text": "..."},
    {"label": "...", "icon": "...", "text": "..."}
  ]
}

Generate 2-3 suggestions. Use icons: calendar, sparkles, message-circle, heart, phone, clock, gift. Keep messages concise and professional. Do not include phone numbers.`
			}
		]
	});

	const content = response.content[0]?.text || '';

	// Extract JSON from response (handle markdown code blocks)
	const jsonMatch = content.match(/\{[\s\S]*\}/);
	if (!jsonMatch) throw new Error('Failed to parse AI response');

	const parsed = JSON.parse(jsonMatch[0]);

	return {
		summary: parsed.summary || 'Unable to summarize conversation.',
		suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : []
	};
}
