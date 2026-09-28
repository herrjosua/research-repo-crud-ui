// Mirrors `docs/Build_Direction_B_v2_Design_decomposed/src/data/mock/conversations.ts`'s
// `CONVERSATIONS` (message bodies/`INITIAL_MESSAGES` belong to the chat
// panel — Story 4 — not this rail). Story/test fixture only: in the app,
// conversations start empty and are created as questions are asked
// (`../chat/useAskRepo.js`), in this same shape (`id`, `title`, `project`,
// `lastMessage`, `time`; `unread` is fixture-only).
export const CONVERSATIONS = [
    { id: 'c1', title: 'Pain points in checkout flow', project: 'checkout', lastMessage: 'Users consistently cited the address form as…', time: '2m', unread: true },
    { id: 'c2', title: 'Onboarding drop-off reasons', project: 'onboarding', lastMessage: 'Three dominant themes emerged from the 12…', time: '1h' },
    { id: 'c3', title: 'Mobile nav discoverability', project: 'mobile-nav', lastMessage: 'Hamburger menu awareness dropped to 34%…', time: '3h' },
    { id: 'c4', title: 'Component adoption barriers', project: 'design-system', lastMessage: 'Engineering cited documentation gaps as the…', time: 'Yesterday' },
    { id: 'c5', title: 'Guest checkout preference', project: 'checkout', lastMessage: 'Of 22 participants, 18 preferred skipping…', time: 'Yesterday' },
    { id: 'c6', title: 'First-run experience gaps', project: 'onboarding', lastMessage: 'The empty state after signup was cited by…', time: 'Mon' },
    { id: 'c7', title: 'Search intent patterns', project: 'all', lastMessage: 'Users arrive with high-intent queries but…', time: 'Mon' },
];
