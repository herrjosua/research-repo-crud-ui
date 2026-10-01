const {
    SYSTEM_PROMPT, PROMPT_BEHAVIORS, systemPrompt, buildMessages,
} = require('../ask/answer');
const { createAskPipeline } = require('../ask/pipeline');
const { chunkRecord } = require('../ask/corpus');

const ALL_OFF = {
    premiseCheck: false, openItems: false, declineWithEvidence: false, listFormat: false,
};
const BARE_DECLINE = 'If the sources do not answer the question, say so plainly in one or two sentences and cite nothing.';
const DASH_LISTS = 'use "- " for a list item if you need a list';

describe('prompt behaviors', () => {
    it('are off by default except declineWithEvidence', () => {
        expect(PROMPT_BEHAVIORS).toEqual({ ...ALL_OFF, declineWithEvidence: true });
        expect(systemPrompt()).toBe(SYSTEM_PROMPT);
        expect(SYSTEM_PROMPT).toBe(systemPrompt({ ...ALL_OFF, declineWithEvidence: true }));
    });

    it('all off, leave the prompt as it was before they existed', () => {
        const prompt = systemPrompt(ALL_OFF);
        expect(prompt.split('\n')).toHaveLength(10);
        expect(prompt).toContain(BARE_DECLINE);
        expect(prompt).toContain(DASH_LISTS);
        expect(prompt).not.toMatch(/assumes something|still open|what they do show|its own line/);
    });

    it('premiseCheck adds a rule to check what the question assumes, before anything else', () => {
        const prompt = systemPrompt({ ...ALL_OFF, premiseCheck: true });
        expect(prompt).toMatch(/If the question assumes something .* say so in your first sentence, with its citation, before anything else\./);
        expect(prompt.split('\n')).toHaveLength(11);
        expect(prompt).toContain(BARE_DECLINE);
    });

    it('openItems adds a rule to list each open item, one per item, cited', () => {
        const prompt = systemPrompt({ ...ALL_OFF, openItems: true });
        expect(prompt).toMatch(/If the question asks what is unresolved, still open or not yet known, list each open question, follow-up or unconfirmed item the sources state, one per list item, each with its own citation\./);
        expect(prompt.split('\n')).toHaveLength(11);
    });

    it('declineWithEvidence replaces the bare decline with one sentence and then what the sources do show', () => {
        const prompt = systemPrompt({ ...ALL_OFF, declineWithEvidence: true });
        expect(prompt).not.toContain(BARE_DECLINE);
        expect(prompt).not.toMatch(/cite nothing/);
        expect(prompt).toContain('If the sources do not contain what was asked, say so plainly in one sentence, then say what they do show on the topic, citing each sentence.');
        expect(prompt.split('\n')).toHaveLength(10);
    });

    it('listFormat replaces the list rule: one item per line, cited at its end, numbered when ordered', () => {
        const prompt = systemPrompt({ ...ALL_OFF, listFormat: true });
        expect(prompt).not.toContain(DASH_LISTS);
        expect(prompt).toContain('Write plain text only: no markdown, no bold, no headings, no HTML. Separate paragraphs with a blank line.');
        expect(prompt).toMatch(/each item on its own line with its citation at the end of that item\. Number items that have an order/);
        expect(prompt.split('\n')).toHaveLength(11);
    });

    it('can all be on together, each rule once', () => {
        const prompt = systemPrompt({
            premiseCheck: true, openItems: true, declineWithEvidence: true, listFormat: true,
        });
        expect(prompt.split('\n')).toHaveLength(13);
        for (const rule of [/assumes something/g, /still open/g, /what they do show/g, /its own line/g]) {
            expect(prompt.match(rule)).toHaveLength(1);
        }
        // The premise check comes before the other answering rules.
        expect(prompt.indexOf('assumes something')).toBeLessThan(prompt.indexOf('Be specific'));
    });

    it('buildMessages uses the behaviors it is given, and the default prompt without them', () => {
        expect(buildMessages('q', [])[0].content).toBe(SYSTEM_PROMPT);
        expect(buildMessages('q', [], ALL_OFF)[0].content).toBe(systemPrompt(ALL_OFF));
        expect(buildMessages('q', [], { ...ALL_OFF, openItems: true })[0].content)
            .toBe(systemPrompt({ ...ALL_OFF, openItems: true }));
    });
});

describe('prompt behaviors in the pipeline', () => {
    const record = {
        id: 'finding:a', kind: 'finding', type: 'synthesis', title: 'A', html: '<h2>Overview</h2><p>a finding</p>',
    };
    const passages = chunkRecord(record).map((chunk) => ({
        record, chunk, vector: [1, 0], participants: null, previous: null, next: null,
    }));
    const index = { refresh: async () => ({ passages, records: [record] }), embedQuery: async () => [1, 0] };
    const recordingClient = () => {
        const systems = [];
        return {
            systems,
            chatModel: 'test',
            chat: async (messages) => {
                systems.push(messages[0].content);
                return 'Yes [1].';
            },
        };
    };

    it('sends the default prompt unless promptBehaviors overrides it', async () => {
        const ollama = recordingClient();
        await createAskPipeline({ ollama, index }).ask('q', null);
        const behaviors = { ...ALL_OFF, premiseCheck: true, listFormat: true };
        await createAskPipeline({ ollama, index, promptBehaviors: behaviors }).ask('q', null);
        expect(ollama.systems).toEqual([SYSTEM_PROMPT, systemPrompt(behaviors)]);
    });
});
