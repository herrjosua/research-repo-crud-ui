// Mirrors `docs/Build_Direction_B_v2_Design_decomposed/src/data/mock/conversations.ts`'s
// `INITIAL_MESSAGES` (message shape: `{ id, role, content, sources?,
// timestamp }`, `sources` shaped like `{ id, kind, title, excerpt,
// project, date, page? }`). Only conversation `c1` ("Pain points in
// checkout flow" — see `./conversations.js`) has seeded history, same as
// the reference's own `convMessages: { c1: INITIAL_MESSAGES }` — every
// other conversation starts empty until Story 8 wires real per-conversation
// history from the backend, which is exactly the swap this shape is meant
// to make mechanical: replace this map with a fetch keyed by conversation
// id, keep every consumer (ChatPanel, ChatMessage, AssistantMessage) as is.
export const INITIAL_MESSAGES_BY_CONVERSATION = {
    c1: [
        {
            id: 'm1',
            role: 'user',
            content: 'What are the top pain points users reported in the checkout flow?',
            timestamp: '14:02',
        },
        {
            id: 'm2',
            role: 'assistant',
            content: `Across 22 interviews and 340 survey responses in the **Checkout Redesign** project, three pain points dominate:

**1. Address form friction** — 68% of participants flagged the address form as the single largest obstacle. Issues include excessive required fields, no autofill support on mobile, and confusing field ordering (zip before city).

**2. Payment method limitations** — 54% of interviewees mentioned missing payment options. Apple Pay and PayPal were cited most frequently. Several participants abandoned mid-session specifically because their preferred method wasn't available.

**3. Forced account creation** — The registration gate before checkout caused 41% drop-off in the usability study. Participants used phrases like "just let me buy" and "why do you need my life story."

A secondary theme — **unclear shipping cost disclosure** — appeared in 31% of sessions. Users want to see total cost (including shipping) before entering payment details.`,
            sources: [
                { id: 's1', kind: 'interview', title: 'Checkout Usability Study — Wave 2', excerpt: 'I kept hitting the address form and giving up.', project: 'Checkout Redesign', date: 'Aug 14, 2026', page: 7 },
                { id: 's2', kind: 'survey', title: 'Post-Purchase Survey Q3 2026', excerpt: '68.4% of respondents rated the address entry experience as "frustrating".', project: 'Checkout Redesign', date: 'Sep 2, 2026' },
                { id: 's3', kind: 'transcript', title: 'Interview with P07 — Maya S.', excerpt: 'Apple Pay is on every other site.', project: 'Checkout Redesign', date: 'Aug 19, 2026', page: 3 },
                { id: 's4', kind: 'synthesis', title: 'Q3 Checkout Research Synthesis', excerpt: 'Forced registration is a well-documented conversion killer.', project: 'Checkout Redesign', date: 'Sep 10, 2026', page: 12 },
            ],
            timestamp: '14:02',
        },
    ],
};
