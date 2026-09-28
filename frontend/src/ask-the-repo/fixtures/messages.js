// Mirrors `docs/Build_Direction_B_v2_Design_decomposed/src/data/mock/conversations.ts`'s
// `INITIAL_MESSAGES`, reshaped to what POST /api/ask returns (see
// backend/README.md): message `{ id, role, content, sources?, timestamp }`,
// where an assistant's `content` is plain text with `[n]` citation markers
// (`[n]` is `sources[n - 1]`) and each source is `{ id, kind, title,
// excerpt, project, recordProject, date, page?, contextBefore?,
// contextAfter? }`. `project` echoes the request's filter (null here);
// `recordProject` is the cited record's own project (fixture ids from
// `./constants.js`). `page` is fixture-only: real markdown records have no
// pages. Story/test fixture only; the app's conversations start empty.
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
            content: `Across 22 interviews and 340 survey responses in the Checkout Redesign project, three pain points dominate:

- Address form friction: 68% of participants flagged the address form as the single largest obstacle [1][2]. Issues include excessive required fields, no autofill support on mobile, and confusing field ordering (zip before city).
- Payment method limitations: interviewees cited missing Apple Pay and PayPal most often, and some abandoned mid-session when their preferred method wasn't available [3].
- Forced account creation: the registration gate before checkout caused a 41% drop-off in the usability study [4].

A secondary theme, unclear shipping cost disclosure, appeared in 31% of sessions.
Users want to see the total cost, including shipping, before entering payment details.`,
            sources: [
                {
                    id: 's1',
                    kind: 'interview',
                    title: 'Checkout Usability Study — Wave 2',
                    excerpt: 'I kept hitting the address form and giving up.',
                    project: null,
                    recordProject: 'checkout',
                    date: 'Aug 14, 2026',
                    page: 7,
                    contextBefore: 'Facilitator asked P04 to complete a purchase on the mobile prototype using a saved cart. The participant moved quickly through product review and the cart summary, then slowed noticeably at the shipping step.',
                    contextAfter: 'Asked what "giving up" meant in practice, P04 said they usually switch to a laptop or abandon the order entirely. They pointed specifically at the zip code field appearing before city and state.',
                },
                {
                    id: 's2',
                    kind: 'survey',
                    title: 'Post-Purchase Survey Q3 2026',
                    excerpt: '68.4% of respondents rated the address entry experience as "frustrating".',
                    project: null,
                    recordProject: 'checkout',
                    date: 'Sep 2, 2026',
                    contextBefore: 'Question 6 asked respondents to rate each checkout step on a five-point scale from "effortless" to "frustrating". The sample (n = 340) was recruited via an in-product prompt shown after order confirmation.',
                    contextAfter: 'Mobile respondents were significantly more likely to choose "frustrating" than desktop respondents (74% vs. 52%, p < 0.05). Payment entry was the next-lowest-rated step at 41%.',
                },
                {
                    id: 's3',
                    kind: 'transcript',
                    title: 'Interview with P07 — Maya S.',
                    excerpt: 'Apple Pay is on every other site.',
                    project: null,
                    recordProject: 'checkout',
                    date: 'Aug 19, 2026',
                    page: 3,
                    contextBefore: 'Facilitator: "Walk me through what happened when you reached the payment screen." P07: "I looked for the Apple Pay button first, like I always do. When it wasn\'t there I just sort of stopped."',
                    contextAfter: 'P07: "So when it\'s missing I start wondering whether the store is legit. I ended up closing the tab and buying it somewhere else." Facilitator noted this as the session\'s abandonment moment.',
                },
                {
                    id: 's4',
                    kind: 'synthesis',
                    title: 'Q3 Checkout Research Synthesis',
                    excerpt: 'Forced registration is a well-documented conversion killer.',
                    project: null,
                    recordProject: 'checkout',
                    date: 'Sep 10, 2026',
                    page: 12,
                    contextBefore: 'Section 3 consolidates findings from the Wave 2 usability study, the Q3 post-purchase survey, and funnel analytics. The registration gate before checkout accounted for a 41% drop-off among first-time visitors.',
                    contextAfter: 'Recommendation: offer guest checkout by default and prompt for account creation only after order confirmation, when the saved-details benefit is concrete. Flagged high-priority for the next sprint.',
                },
            ],
            timestamp: '14:02',
        },
    ],
};
