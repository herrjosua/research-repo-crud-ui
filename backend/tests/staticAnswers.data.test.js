const fs = require('fs');
const {
    ANSWERS_FILE, QUESTIONS_FILE, CAPTURE_SCRIPT_VERSION,
    citationMarkers, validateQuestionList, validateStaticAnswers,
} = require('../ask/staticAnswers');

// The checked-in data behind LLM_PROVIDER=static (ask/static/). The answers
// are captured by scripts/capture-static-answers.js and never edited by hand.

const answers = JSON.parse(fs.readFileSync(ANSWERS_FILE, 'utf8'));
const questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));

describe('ask/static/answers.json', () => {
    it('passes the same validation the server runs at startup', () => {
        expect(validateStaticAnswers(answers)).toEqual([]);
    });

    it('has consistent metadata', () => {
        expect(answers.metadata).toEqual({
            model: expect.any(String),
            embedModel: expect.any(String),
            capturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
            corpusCommit: expect.stringMatching(/^[0-9a-f]{40}$/),
            scriptVersion: expect.any(Number),
        });
        expect(answers.metadata.scriptVersion).toBeLessThanOrEqual(CAPTURE_SCRIPT_VERSION);
        expect(Date.parse(answers.metadata.capturedAt)).toBeLessThanOrEqual(Date.now());
    });

    it('answers exactly the curated questions, in order', () => {
        expect(validateQuestionList(questions)).toEqual([]);
        expect(answers.questions.map(({ id, question, project }) => ({ id, question, project }))).toEqual(questions);
    });

    it.each(answers.questions.map((entry) => [entry.id, entry]))('%s has a question, an answer, and a source for every [n]', (id, entry) => {
        expect(entry.question.trim()).not.toBe('');
        expect(entry.answer.trim()).not.toBe('');
        const markers = citationMarkers(entry.answer);
        if (markers.length > 0) expect(entry.sources.length).toBeGreaterThanOrEqual(1);
        expect(Math.max(0, ...markers)).toBeLessThanOrEqual(entry.sources.length);
        // renumberCitations numbers sources by first citation, so the answer
        // cites [1]..[k] and every source.
        expect(new Set(markers)).toEqual(new Set(entry.sources.map((_, i) => i + 1)));
        for (const source of entry.sources) expect(source.project).toBe(entry.project);
    });
});
