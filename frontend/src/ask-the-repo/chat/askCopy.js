// User-facing wording for Ask the Repo's request states, shared by
// ChatPanel (which shows it) and useAskRepo (which announces it in the
// chat's live region), so the two can't drift apart.

export const LOADING_TEXT = 'Searching the repo…';
export const SLOW_TEXT = 'The first question after a server restart can take up to 20 seconds while the repo is indexed.';

// Live mode: the empty state for a project with no checked starters
// (see ./starters.js). The composer still works, so point to it.
export const NO_STARTERS = 'No starter questions for this project yet. Ask anything below.';

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

// Static mode (the public demo): visitors pick from captured questions.
export const PICKER_LABEL = 'Choose a question';
export const NO_PICKER_QUESTIONS = 'No pre-generated questions for this project yet.';

// "Sep 28, 2026", the Ask tab's date format, in UTC so the capture date
// doesn't shift with the visitor's time zone.
function captureDate(capturedAt) {
    const date = new Date(capturedAt);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// Where static answers came from, from GET /api/ask/config's `capture`
// (`{ model, capturedAt }`). Leaves out whichever part is missing.
export function captureNote(capture) {
    const details = [capture?.model, capture?.capturedAt && captureDate(capture.capturedAt)].filter(Boolean);
    const run = details.length > 0 ? `a local model run (${details.join(', ')})` : 'a local model run';
    return `These answers were generated ahead of time from ${run} on sample data. Run the project locally to ask anything.`;
}
