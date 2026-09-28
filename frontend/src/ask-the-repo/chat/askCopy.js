// User-facing wording for Ask the Repo's request states, shared by
// ChatPanel (which shows it) and useAskRepo (which announces it in the
// chat's live region), so the two can't drift apart.

export const LOADING_TEXT = 'Searching the repo…';
export const SLOW_TEXT = 'The first question after a server restart can take up to 20 seconds while the repo is indexed.';

export const UNAVAILABLE_COPY = {
    title: "Ask the Repo isn't available here.",
    subtitle: "Answers need a language model, and this environment doesn't run one. You can still browse everything under Research Records.",
};

// One entry per useAskRepo error kind. `retry`: the question can be sent
// again as is (and goes back into the composer).
export const ERROR_COPY = {
    model: {
        title: "Couldn't get an answer.",
        subtitle: "The language model didn't respond. Try again in a moment.",
        retry: true,
    },
    session: {
        title: 'Your session has ended.',
        subtitle: 'Sign in again to keep asking.',
        retry: false,
    },
    unknown: {
        title: 'Something went wrong getting an answer.',
        subtitle: 'Try again.',
        retry: true,
    },
};
