// Checks on a finished answer: which sentences cite nothing, which figures
// their own citations don't contain, and which stack three or more
// citations. Pure functions of the answer, its sources, the question and
// the sources the prompt showed, so the live route (via ask/pipeline.js),
// the evaluation harness (scripts/eval-ask.js) and the capture script's
// review (scripts/capture-static-answers.js) apply the same rules, and
// stored runs can be re-judged. None of this can say a citation is
// *correct*; it finds the ones that can't be.

const MARKER_RE = /\[(\d+)\]/g;
const LIST_ITEM_RE = /^\s*(?:[-•*]|\d+[.)])\s+/;
// Where a sentence that opens with its own markers begins: after
// punctuation, before "[n]…" and a lowercase word.
const LEADING_MARKERS_SPLIT_RE = /(?<=[.!?])\s+(?=(?:\[\d+\]\s*)+[a-z])/;
// Where one sentence ends and the next begins: after punctuation and any
// markers, before anything but another marker; or after punctuation and a
// closing quotation mark, before a capital or another quotation ('…in bed."
// [2] Next'), since a quote can also end mid-sentence ('"do I have to do
// this?" before proceeding').
const SENTENCE_SPLIT_RE = /(?<=[.!?](?:\s*\[\d+\])*)\s+(?!\[)|(?<=[.!?]["”](?:\s*\[\d+\])*)\s+(?=[A-Z"“])/;

// Characters some models write (gpt-oss:20b) that the checks read as their
// plain forms: a narrow no-break space ("34 %") and a non-breaking hyphen
// ("non‑clinical"). Applied to the answer before anything is judged.
function normalizeText(text) {
    return String(text).replace(/\u202F/g, ' ').replace(/\u2011/g, '-');
}

// A sentence saying the sources don't cover something. Not a claim, so it
// needs no citation (a figure in it still needs one). Either DECLINE_RE
// ("the sources do not say…"), or a negation and the word "sources" within
// DECLINE_WINDOW characters of each other, in either order ("The question
// cannot be answered from the provided sources", "Steps 1–6 are not labeled
// … in the provided sources"). The window keeps a long claim that mentions
// "sources" far from its negation from passing as a decline.
const DECLINE_RE = /\b(sources?|records?|notes?|data|research|documents?|surveys?|repository|repo)\b[^.]{0,60}\b(do not|don't|does not|doesn't|did not|didn't|not|no|never)\b[^.]{0,40}\b(say|state|mention|describe|include|contain|specify|provide|give|report|answer|cover|address|discuss|information|detail)/i;
const NEGATION_RE = /\b(not|cannot|no)\b/gi;
const SOURCES_RE = /\bsources\b/gi;
const DECLINE_WINDOW = 80;

// The fewest characters between a negation and the word "sources" in
// `text` (between the end of the first and the start of the second), or
// null when it lacks either.
function negationSourcesGap(text) {
    const negations = [...String(text).matchAll(NEGATION_RE)];
    const sources = [...String(text).matchAll(SOURCES_RE)];
    let gap = null;
    for (const a of negations) {
        for (const b of sources) {
            const [first, second] = a.index < b.index ? [a, b] : [b, a];
            const between = Math.max(0, second.index - (first.index + first[0].length));
            if (gap === null || between < gap) gap = between;
        }
    }
    return gap;
}

function isDecline(text) {
    if (DECLINE_RE.test(text)) return true;
    const gap = negationSourcesGap(text);
    return gap !== null && gap <= DECLINE_WINDOW;
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

const NUMBER_WORDS = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
    'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];
const NUMBER_WORD_RE = new RegExp(`\\b(${NUMBER_WORDS.slice(1).join('|')})\\b`, 'g');
const NUMBER_RE = /\d+(?:\.\d+)?/g;
const PAIR_RE = /(\d+(?:\.\d+)?)\s*(?:of|out of|\/)\s*(\d+(?:\.\d+)?)/g;

// Text with "one" through "twenty" written as digits, so "four" and "4"
// compare equal. Percent signs need no handling: "52%" yields "52".
function digitsForWords(text) {
    return String(text).toLowerCase().replace(NUMBER_WORD_RE, (word) => String(NUMBER_WORDS.indexOf(word)));
}

function numbersIn(text) {
    return digitsForWords(text).match(NUMBER_RE) || [];
}

// "N of M" / "N out of M" / "N/M" counts, as "N of M" strings.
function countPairsIn(text) {
    return [...digitsForWords(text).matchAll(PAIR_RE)].map((m) => `${m[1]} of ${m[2]}`);
}

// What a cited source offers as evidence for a figure: its title, section
// and a raw session's roster line as well as its excerpt, since the model is
// shown all of them. Otherwise "Participant in session 1…" is flagged for
// the "1" in its heading, and "6 participants" for a count only the roster
// line gives.
function sourceEvidence(source) {
    if (!source) return '';
    return [source.title, source.section, source.participants, source.excerpt].filter(Boolean).join('\n');
}

// Figures and "N of M" counts in `text` that `evidence` doesn't contain.
// Counts are compared whole, so a right number in the wrong count ("4 of 4"
// against an excerpt saying "4 of 5") is still caught.
function unsupportedFiguresIn(text, evidence) {
    const knownNumbers = new Set(numbersIn(evidence));
    const knownPairs = new Set(countPairsIn(evidence));
    return {
        numbers: [...new Set(numbersIn(text))].filter((n) => !knownNumbers.has(n)),
        pairs: [...new Set(countPairsIn(text))].filter((pair) => !knownPairs.has(pair)),
    };
}

// ---------------------------------------------------------------------------
// Dates. A source's label in the prompt carries its record's date
// (ask/answer.js sourceLabel: "RAW SESSION · usability test · Apr 8, 2025 —
// …"; the source's `date`, as ask/corpus.js formatDate writes it), so a
// sentence may repeat it. A date mention that matches one of its sources'
// dates is taken out of the sentence before its figures are counted; its
// digits never become evidence for anything else, so a stray "04" or "08"
// is still a figure. Labels carry no time of day, so a time is always a
// figure.
// ---------------------------------------------------------------------------

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE_PART = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
// The forms a sentence may write a date in, each to { year, month, day },
// with year or day null when the form leaves it out.
const DATE_FORMS = [
    // 2025-04-08
    { re: /\b(\d{4})-(\d{2})-(\d{2})\b/gi, parse: (m) => ({ year: +m[1], month: +m[2], day: +m[3] }) },
    // 04/08/2025, 4/8/2025
    { re: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/gi, parse: (m) => ({ year: +m[3], month: +m[1], day: +m[2] }) },
    // April 8, 2025; Apr 8, 2025; April 8th; April 8th, 2025
    { re: new RegExp(`\\b${MONTH_RE_PART}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`, 'gi'), parse: (m) => ({ year: m[3] ? +m[3] : null, month: monthNumber(m[1]), day: +m[2] }) },
    // April 2025
    { re: new RegExp(`\\b${MONTH_RE_PART}\\s+(\\d{4})\\b`, 'gi'), parse: (m) => ({ year: +m[2], month: monthNumber(m[1]), day: null }) },
];

function monthNumber(name) {
    return MONTHS.findIndex((month) => month.startsWith(name.toLowerCase().replace(/\.$/, '').slice(0, 3))) + 1;
}

// A source's date as its label shows it ("Apr 8, 2025"), or null.
function sourceDate(source) {
    const m = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(String((source && source.date) || ''));
    return m ? { year: +m[3], month: monthNumber(m[1]), day: +m[2] } : null;
}

function sameDate(mention, date) {
    return mention.month === date.month
        && (mention.year === null || mention.year === date.year)
        && (mention.day === null || mention.day === date.day);
}

// `text` with every date mention that matches one of `dates` blanked out.
// A mention is matched whole, by its parsed date, never by its digits.
function withoutSourceDates(text, dates) {
    if (dates.length === 0) return text;
    let out = String(text);
    for (const { re, parse } of DATE_FORMS) {
        out = out.replace(re, (whole, ...groups) => {
            const mention = parse([whole, ...groups]);
            return mention.month >= 1 && dates.some((date) => sameDate(mention, date)) ? ' ' : whole;
        });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

// A quoted span within one line, and what stands in for the spaces after
// its inner full stops while the line is split.
const QUOTE_RE = /"[^"\n]*"|“[^“”\n]*”/g;
const QUOTE_SPACE = '\u0000';
// "vs." and "avg." with the space after them, which never ends a sentence:
// the models write "(6.5 min vs. 9 min…)" and "(avg. 1.2 hrs/day)" mid-
// sentence. Only these two; no other abbreviation occurs in stored answers.
const ABBREVIATION_RE = /\b(?:vs|avg)\.\s+/gi;

function markersIn(text) {
    return [...String(text).matchAll(MARKER_RE)].map((m) => Number(m[1]));
}

function withoutMarkers(text) {
    return String(text).replace(MARKER_RE, '').replace(/[ \t]+([.,;:!?])/g, '$1').trim();
}

// The answer as sentences and list items, each with its own [n] markers. A
// split only happens after punctuation and any markers that follow it (the
// model writes both "…sessions [1]." and "…sessions. [1]"), and a list
// item's leading "1." or "-" is kept out of it. Markers after punctuation
// that are followed by a lowercase word start the next sentence instead:
// "…coordinators. [1] mentions that…" has [1] as its subject. (Followed by
// a capital, as in "…sessions. [1] The next…", they stay a trailing
// citation of the sentence before.) A line of nothing but
// markers belongs to what precedes it: a list's trailing "[1][2]" cites the
// whole list (a group citation), and anywhere else it joins the sentence
// before it. A quotation in straight or curly double quotes is never split
// at its own full stops: '"I love this job. I do not love…" [2]' is one
// sentence, cited [2], and a sentence can end at the quote's closing mark.
// Nor is a sentence split after "vs." or "avg.".
function answerSentences(answer) {
    const out = [];
    let listStart = null; // index in `out` where the current run of list items began
    for (const line of normalizeText(answer).split(/\n+/)) {
        if (!line.trim()) continue;
        const listItem = LIST_ITEM_RE.test(line);
        const body = line.replace(LIST_ITEM_RE, '')
            .replace(QUOTE_RE, (quote) => quote.replace(/(?<=[.!?])\s+/g, QUOTE_SPACE))
            .replace(ABBREVIATION_RE, (abbreviation) => abbreviation.replace(/\s+$/, QUOTE_SPACE));
        const pieces = body.split(LEADING_MARKERS_SPLIT_RE)
            .flatMap((part) => part.split(SENTENCE_SPLIT_RE))
            .map((p) => p.replaceAll(QUOTE_SPACE, ' ').trim()).filter(Boolean);
        for (const piece of pieces) {
            const text = withoutMarkers(piece);
            const markers = markersIn(piece);
            if (!text) {
                const previous = out[out.length - 1];
                if (!previous) continue;
                if (previous.listItem && listStart !== null) {
                    for (const item of out.slice(listStart)) item.groupMarkers = [...new Set([...item.groupMarkers, ...markers])];
                } else {
                    previous.markers = [...previous.markers, ...markers];
                }
                continue;
            }
            if (listItem && listStart === null) listStart = out.length;
            if (!listItem) listStart = null;
            out.push({ text, markers, listItem, groupMarkers: [] });
        }
    }
    // A list intro ("The steps are: [1]") also cites the list below it.
    out.forEach((sentence, i) => {
        if (sentence.listItem || !sentence.text.endsWith(':') || sentence.markers.length === 0) return;
        for (let j = i + 1; j < out.length && out[j].listItem; j += 1) {
            out[j].groupMarkers = [...new Set([...out[j].groupMarkers, ...sentence.markers])];
        }
    });
    return out;
}

// Every sentence of an answer, checked against the sources it cites:
//   exempt       why it needs no citation of its own: 'decline', 'list intro'
//                (ends with ":"), or 'group-cited list item'; null otherwise
//   uncited      not exempt and cites nothing
//   stack        distinct sources it cites (3 or more is a stack)
//   unsupported  figures and "N of M" counts that none of *its own* cited
//                sources contain, in title, section or excerpt (a group-cited
//                item uses the group's), after any mention of one of those
//                sources' label dates is taken out. A decline that cites
//                nothing may repeat figures from the question or from any
//                source the prompt showed (`shown`, in the same shape as
//                `sources`): "Steps 1, 2, 4, 5 and 6 are not labeled … in
//                the sources" names steps the shown flow lists. Counts are
//                written "N of M".
function analyseAnswer(answer, sources, question = '', shown = []) {
    return answerSentences(answer).map((sentence) => {
        const own = [...new Set(sentence.markers)];
        const cites = own.length > 0 ? own : sentence.groupMarkers;
        let exempt = null;
        if (own.length === 0) {
            if (isDecline(sentence.text)) exempt = 'decline';
            else if (!sentence.listItem && sentence.text.endsWith(':')) exempt = 'list intro';
            else if (sentence.listItem && sentence.groupMarkers.length > 0) exempt = 'group-cited list item';
        }
        const citedSources = cites.map((n) => sources[n - 1]).filter(Boolean);
        const evidenceSources = exempt === 'decline' ? [...citedSources, ...shown] : citedSources;
        const evidence = [
            ...evidenceSources.map(sourceEvidence),
            ...(exempt === 'decline' ? [question] : []),
        ].join('\n');
        const dates = evidenceSources.map(sourceDate).filter(Boolean);
        const { numbers, pairs } = unsupportedFiguresIn(withoutSourceDates(sentence.text, dates), evidence);
        return {
            text: sentence.text,
            listItem: sentence.listItem,
            cites,
            exempt,
            uncited: exempt === null && own.length === 0,
            stack: own.length,
            unsupported: [...numbers, ...pairs],
        };
    });
}

// The answer-level summary of analyseAnswer's sentences, which POST
// /api/ask returns as `checks` (with `retried`, which the pipeline adds) and
// the harness judges by:
//   uncited             sentences that need a citation and have none
//   unsupportedFigures  figures and "N of M" counts missing from their own
//                       sentence's cited sources, once per sentence they
//                       appear in
//   stacked             sentences citing three or more distinct sources
// Each is [] when the answer is clean.
function summariseSentences(sentences) {
    return {
        uncited: sentences.filter((s) => s.uncited).map((s) => s.text),
        unsupportedFigures: sentences.flatMap((s) => s.unsupported),
        stacked: sentences.filter((s) => s.stack >= 3).map((s) => s.text),
    };
}

function checkAnswer(answer, sources, question = '', shown = []) {
    return summariseSentences(analyseAnswer(answer, sources, question, shown));
}

module.exports = {
    checkAnswer,
    summariseSentences,
    analyseAnswer,
    answerSentences,
    numbersIn,
    countPairsIn,
    sourceEvidence,
    unsupportedFiguresIn,
    sourceDate,
    withoutSourceDates,
    normalizeText,
    negationSourcesGap,
    MARKER_RE,
    DECLINE_RE,
    DECLINE_WINDOW,
    isDecline,
};
