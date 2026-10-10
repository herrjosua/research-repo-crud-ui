import { ANSWER_SPOKEN_MAX_CHARS, answerAnnouncement, spokenAnswer } from './announcements';

const NEXT = 'Tab to a citation to open its source, or ask another question.';

describe('spokenAnswer', () => {
    it('drops [n] markers, list bullets and line breaks', () => {
        expect(spokenAnswer('Drafts were late [1][2].\n\n- Nurses wanted chart text [3]\n2. Codes were old')).toBe(
            'Drafts were late. Nurses wanted chart text Codes were old',
        );
    });
});

describe('answerAnnouncement', () => {
    it('reads the answer, then the source count, then what the user can do', () => {
        expect(answerAnnouncement('Drafts cited outdated codes [1].', 1)).toBe(
            `Answer received. Drafts cited outdated codes. 1 source cited. ${NEXT}`,
        );
    });

    it('says when no sources were cited', () => {
        expect(answerAnnouncement('Nothing in the repo covers that.', 0)).toContain('No sources cited.');
    });

    it('cuts a long answer at a sentence end and says where the rest is', () => {
        const sentence = 'The drafts were slow to review because the codes were out of date. ';
        const spoken = answerAnnouncement(sentence.repeat(30), 2);
        const body = spoken.split(' The rest of the answer')[0].replace('Answer received. ', '');
        expect(body.length).toBeLessThanOrEqual(ANSWER_SPOKEN_MAX_CHARS);
        expect(body.endsWith('out of date.')).toBe(true);
        expect(spoken).toContain('The rest of the answer is in the conversation. 2 sources cited.');
    });

    it('cuts at a word, with an ellipsis, when there is no sentence end to cut at', () => {
        const spoken = answerAnnouncement('word '.repeat(300), 0);
        expect(spoken).toContain('… The rest of the answer is in the conversation.');
    });
});
