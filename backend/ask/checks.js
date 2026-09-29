// Checks on a finished answer: which sentences cite nothing, which figures
// their own citations don't contain, and which stack three or more
// citations. Pure functions of the answer, its sources and the question, so
// the live route (via ask/pipeline.js), the evaluation harness
// (scripts/eval-ask.js) and the capture script's review
// (scripts/capture-static-answers.js) apply the same rules, and stored runs
// can be re-judged. None of this can say a citation is *correct*; it finds
// the ones that can't be.

const MARKER_RE = /\[(\d+)\]/g;
const LIST_ITEM_RE = /^\s*(?:[-•*]|\d+[.)])\s+/;
// Where a sentence that opens with its own markers begins: after
// punctuation, before "[n]…" and a lowercase word.
const LEADING_MARKERS_SPLIT_RE = /(?<=[.!?])\s+(?=(?:\[\d+\]\s*)+[a-z])/;
// A sentence saying the sources don't cover something. Not a claim, so it
// needs no citation (a figure in it still needs one). Either DECLINE_RE
// ("the sources do not say…"), or a negation and the word "sources"
// anywhere, in either order ("The question cannot be answered from the
// provided sources", "Steps 1–6 are not labeled … in the sources").
const DECLINE_RE = /\b(sources?|records?|notes?|data|research|documents?|repository|repo)\b[^.]{0,60}\b(do not|don't|does not|doesn't|did not|didn't|not|no|never)\b[^.]{0,40}\b(say|state|mention|describe|include|contain|specify|provide|give|report|answer|cover|address|discuss|information|detail)/i;
const NEGATION_RE = /\b(not|cannot|no)\b/i;
const SOURCES_RE = /\bsources\b/i;

function isDecline(text) {
    return DECLINE_RE.test(text) || (NEGATION_RE.test(text) && SOURCES_RE.test(text));
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
// Sentences
// ---------------------------------------------------------------------------

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
// before it.
function answerSentences(answer) {
    const out = [];
    let listStart = null; // index in `out` where the current run of list items began
    for (const line of String(answer).split(/\n+/)) {
        if (!line.trim()) continue;
        const listItem = LIST_ITEM_RE.test(line);
        const body = line.replace(LIST_ITEM_RE, '');
        const pieces = body.split(LEADING_MARKERS_SPLIT_RE)
            .flatMap((part) => part.split(/(?<=[.!?](?:\s*\[\d+\])*)\s+(?!\[)/))
            .map((p) => p.trim()).filter(Boolean);
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
//                item uses the group's). A decline may repeat the question's
//                own figures ("the sources don't describe the step 3
//                wireframe"). Counts are written "N of M".
function analyseAnswer(answer, sources, question = '') {
    return answerSentences(answer).map((sentence) => {
        const own = [...new Set(sentence.markers)];
        const cites = own.length > 0 ? own : sentence.groupMarkers;
        let exempt = null;
        if (own.length === 0) {
            if (isDecline(sentence.text)) exempt = 'decline';
            else if (!sentence.listItem && sentence.text.endsWith(':')) exempt = 'list intro';
            else if (sentence.listItem && sentence.groupMarkers.length > 0) exempt = 'group-cited list item';
        }
        const cited = cites.map((n) => sourceEvidence(sources[n - 1])).join('\n');
        const evidence = exempt === 'decline' ? `${cited}\n${question}` : cited;
        const { numbers, pairs } = unsupportedFiguresIn(sentence.text, evidence);
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

function checkAnswer(answer, sources, question = '') {
    return summariseSentences(analyseAnswer(answer, sources, question));
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
    MARKER_RE,
    DECLINE_RE,
    isDecline,
};
