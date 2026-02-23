# PRD: AI Suggest (Generate with AI)

## Overview
An AI-powered response assistant that analyzes the conversation thread and generates contextual draft replies for staff to choose from. Accessible via a "Generate with AI" button in the compose toolbar's more menu. When triggered, a panel appears above the compose bar showing a brief thread summary and 2-3 clickable draft responses. Clicking a draft inserts it into the compose textarea for review before sending. Staff always has the final edit — AI suggests, humans decide.

## Reference
- **Design screenshots:** `docs/designref/messaging-composer/` — TextMagic reference UI showing AI panel with thread summary and draft suggestions
- **Key behaviors from reference:**
  - "Generate with AI" option in the three-dot more menu
  - Panel opens above compose bar with thread summary paragraph
  - "Click to generate a draft response:" header
  - 2-3 response cards with: action icon + bold verb label + suggestion text
  - Each card is clickable — inserts the draft text into the compose textarea
  - Small "Generate with AI" label at bottom of panel
  - Panel has an X close button

## Files
- **prd.json:** `docs/prds/messaging-ai-suggest/prd.json`
- **progress.txt:** `docs/prds/messaging-ai-suggest/progress.txt`

## Context for Agent
- **Branch name:** ralph/ai-suggest
- **Tech stack:** SvelteKit + Svelte 5 runes, Express ES modules, Supabase, Tailwind v4
- **Key files to modify:**
  - `api/routes/messages.js` — add AI suggest endpoint (existing file)
  - `api/services/ai-suggest.js` — AI prompt logic + Claude API call (new file)
  - `src/lib/components/messaging/AiSuggestPanel.svelte` — suggestion panel UI (new file)
  - `src/lib/components/messaging/ComposeBar.svelte` — add more menu + AI trigger (existing file)
  - `src/lib/components/messaging/ChatsTab.svelte` — wire AI panel into thread view (existing file)
- **Design system:** Dark bg #0a0a0c, gold accent #C5A55A, Playfair Display headings
- **API base:** http://localhost:3001 (dev) / https://api.lemedspa.app (prod)

## Technical Context
- **AI Provider:** Anthropic Claude (Haiku model for cost efficiency). The API already has Anthropic SDK available — check for `@anthropic-ai/sdk` in package.json or install it.
- **Cost estimate:** Claude Haiku at ~$0.0003/request. At 50 suggestions/day = ~$0.45/month. Negligible.
- **Prompt strategy:** Send the last 10-15 messages from the thread as context. Include business context (Le Med Spa, services, hours, address). Ask for 3 draft responses with different tones/approaches.
- **Privacy:** Patient phone numbers should be stripped from the AI prompt. Only send message bodies and direction (inbound/outbound). No PII in the prompt beyond first name.
- **Rate limiting:** Simple in-memory rate limit — max 10 AI suggestions per conversation per hour to prevent abuse.
- **Env var:** `ANTHROPIC_API_KEY` — must be set in production. If missing, the feature is silently disabled (no errors, button just doesn't appear).

## API Shape Reference

**New endpoint:**
```
POST /api/messages/ai-suggest
Body: { conversationId: UUID }
Response: {
  summary: "Brief 2-3 sentence summary of the conversation...",
  suggestions: [
    {
      label: "Recommend",
      icon: "phone",
      text: "Full draft response text that will be inserted into compose..."
    },
    {
      label: "Suggest",
      icon: "sparkles",
      text: "Alternative draft response text..."
    },
    {
      label: "Encourage",
      icon: "message-circle",
      text: "Third option draft response text..."
    }
  ]
}
```

**AI prompt template (approximate):**
```
You are an assistant for Le Med Spa, a luxury medical aesthetics practice in Encino, CA.

Business context:
- Address: 17414 Ventura Blvd, Encino, CA 91316
- Phone: (818) 463-3772
- Hours: Mon-Sat 10am-6pm, Sunday by appointment
- Services: Medical aesthetics (XERF, Sylfirm X, PicoSure Pro, lasers), facials, injectables, body contouring, wellness
- Tone: Professional, warm, luxurious but approachable

Here is the recent conversation:
{messages formatted as "Patient: ..." and "Staff: ..." lines}

Generate:
1. A brief 2-3 sentence summary of this conversation.
2. Exactly 3 draft response suggestions with different approaches. Each suggestion should have:
   - A one-word action label (e.g., Recommend, Suggest, Confirm, Reassure, Follow-up, Invite, Clarify)
   - The full response text (1-3 sentences, conversational, warm, professional)

Respond in JSON format.
```

## Visual Specifications

### More Menu (three-dot button in ComposeBar toolbar)
- **Trigger:** Three vertical dots icon button (MoreVertical from Lucide)
- **Position:** After the existing toolbar icons (emoji, tag, template, attachment)
- **Menu items:**
  - Schedule (already exists as SchedulePopover — move it into this menu)
  - Generate with AI (opens AI panel)
- **Menu style:** Dark dropdown, same as other app dropdowns

### AI Suggest Panel
- **Position:** Slides up above the compose bar, within the thread panel area
- **Background:** `bg-surface-raised` with `border-t border-border`
- **Close button:** X icon in top-right corner
- **Thread summary:** Paragraph text in `text-text-secondary`, preceded by "Thread summary" heading in gold
- **Draft suggestions header:** "Click to generate a draft response:" in `text-text-primary` font-medium
- **Suggestion cards:** Each card is a clickable row with:
  - Left: colored icon (different Lucide icon per suggestion — Phone, Sparkles, MessageCircle)
  - Bold label (e.g., "Recommend", "Suggest", "Encourage")
  - Body text in `text-text-secondary`
  - Hover: subtle `bg-surface-hover` highlight
  - Click: inserts `text` into compose textarea, closes panel
- **Loading state:** Skeleton pulse animation while AI generates
- **Error state:** "Couldn't generate suggestions. Try again." with retry button
- **Footer:** Small "AI Generated with AI" label at bottom

## Non-Goals
- No streaming/SSE for response generation (wait for full response)
- No conversation history storage of AI suggestions (fire-and-forget)
- No AI-generated images or media
- No auto-send — AI always drafts, staff always reviews before sending
- No fine-tuning or training on conversation history
- No per-user AI preferences or tone customization
- No knowledge base / RAG integration (future consideration)
