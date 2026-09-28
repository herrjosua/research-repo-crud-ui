// GET /api/ask/config's `questions` and `capture` in static mode (the
// public demo), for stories: a few of the captured questions, as the
// server lists them. Story fixture only; the real list is the backend's
// ask/static/questions.json.
export const STATIC_QUESTIONS = [
    { id: 'all-scribe-draft-trust', question: "Why didn't physicians trust the ambient scribe's draft notes?", project: null },
    { id: 'all-documentation-burden', question: 'How much documentation burden do clinicians report?', project: null },
    { id: 'all-coders-billing-suggestions', question: 'What did coders think of the AI billing code suggestions?', project: null },
    { id: 'all-prior-auth-usability-tests', question: 'What did the prior auth usability tests find?', project: null },
    { id: 'prior-auth-draft-review', question: 'What made the prior auth drafts hard to review?', project: 'project-prior-auth' },
];

export const STATIC_CAPTURE = { model: 'gemma2:9b', capturedAt: '2026-09-28T17:36:53.970Z' };
