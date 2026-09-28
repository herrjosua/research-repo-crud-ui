// Starter questions for the Ask tab's empty state, keyed by the project
// filter they were checked under ('all', or a project-* tag).
//
// Every question here was asked three times against the real corpus, under
// that same filter, and kept only if each run cited at least two correct
// records including a raw session, and the three answers agreed. Questions
// about numbered lists (chunking drops the numbers) and topics with known
// retrieval misses are avoided. Re-check a question the same way before
// adding or rewording one.
//
// A project with no entry gets no starters (see `startersFor`): the "all"
// questions were only verified unfiltered, and asked under another
// project's filter they mostly come back "not covered".
export const STARTERS = {
    all: [
        "Why didn't physicians trust the ambient scribe's draft notes?",
        'How much documentation burden do clinicians report?',
        'What did coders think of the AI billing code suggestions?',
        'What did the prior auth usability tests find?',
    ],
    'project-ambient-scribe': [
        'How did physicians handle medication errors in the scribe draft?',
        'What happened when the session locked during dictation?',
        'How did physicians react to the medication flag concept?',
    ],
    'project-prior-auth': [
        'What made the prior auth drafts hard to review?',
        'What did the prior auth usability tests find?',
    ],
};

export function startersFor(projectId) {
    return STARTERS[projectId] ?? [];
}
