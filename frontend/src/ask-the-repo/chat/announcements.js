// What the chat's polite live region says when an answer arrives (v1.3.6.57).
// A screen reader user can't glance at the thread, so the announcement reads
// the answer itself, then says what they can do next. Without the text they
// heard only a source count and had to hunt for the answer.

// A long answer read aloud in full can't be skipped, so past this it is cut at
// a sentence end and says where to read the rest.
export const ANSWER_SPOKEN_MAX_CHARS = 600;

const NEXT_STEPS = 'Tab to a citation to open its source, or ask another question.';

function sourcesPhrase(count) {
    if (count === 0) return 'No sources cited';
    return `${count} source${count === 1 ? '' : 's'} cited`;
}

// The answer as speech: no [n] markers (the buttons carry them, and "one two
// three" in the middle of a sentence is noise), no list bullets, one line.
export function spokenAnswer(answer) {
    return answer
        .split('\n')
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s*\[\d+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function shorten(text) {
    if (text.length <= ANSWER_SPOKEN_MAX_CHARS) return { text, cut: false };
    const head = text.slice(0, ANSWER_SPOKEN_MAX_CHARS);
    const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
    if (sentenceEnd > ANSWER_SPOKEN_MAX_CHARS / 3) return { text: head.slice(0, sentenceEnd + 1), cut: true };
    const space = head.lastIndexOf(' ');
    return { text: `${head.slice(0, space > 0 ? space : head.length).replace(/[\s,.;:!?-]+$/, '')}…`, cut: true };
}

export function answerAnnouncement(answer, sourceCount) {
    const { text, cut } = shorten(spokenAnswer(answer));
    const parts = ['Answer received.', text];
    if (cut) parts.push('The rest of the answer is in the conversation.');
    parts.push(`${sourcesPhrase(sourceCount)}.`, NEXT_STEPS);
    return parts.filter(Boolean).join(' ');
}
