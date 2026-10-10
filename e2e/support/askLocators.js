// The Ask tab's thread, as the labeled region the screen reader lands on.
// Specs look for the answer's paragraph here, not with a bare `p` filter: the
// hidden polite live region (a sibling outside the thread) repeats the answer
// text when it arrives (v1.3.6.57), so a bare filter matches two elements.
export const conversation = (page) => page.getByRole('region', { name: 'Conversation', exact: true });

// The live region that announces a new answer or error to a screen reader.
export const announcement = (page) => page.locator('p.cds--visually-hidden[aria-live="polite"]');
