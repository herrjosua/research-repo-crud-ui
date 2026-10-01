const {
    createAskPipeline, promptSizeWarning, CHAT_OPTIONS, PROMPT_WARN_SHARE,
} = require('../ask/pipeline');
const { chunkRecord } = require('../ask/corpus');

describe('promptSizeWarning', () => {
    it('warns only over 85% of num_ctx', () => {
        expect(PROMPT_WARN_SHARE).toBe(0.85);
        expect(CHAT_OPTIONS.num_ctx).toBe(8192);
        expect(promptSizeWarning(null)).toBeNull();
        expect(promptSizeWarning(6963)).toBeNull(); // 0.85 × 8192 = 6963.2
        expect(promptSizeWarning(6964)).toMatch(/6964 tokens, over 85% of num_ctx 8192/);
        expect(promptSizeWarning(900, 1000)).toMatch(/900 tokens, over 85% of num_ctx 1000/);
    });
});

describe('the prompt-size guard in ask()', () => {
    const record = {
        id: 'finding:a', kind: 'finding', type: 'synthesis', title: 'A', html: '<h2>Overview</h2><p>a finding</p>',
    };
    const passages = chunkRecord(record).map((chunk) => ({
        record, chunk, vector: [1, 0], participants: null, previous: null, next: null,
    }));
    const index = { refresh: async () => ({ passages, records: [record] }), embedQuery: async () => [1, 0] };
    const detailedClient = (promptTokens) => {
        const calls = [];
        return {
            calls,
            chatModel: 'test',
            chat: async () => { throw new Error('chat() should not be called when chatDetailed() exists'); },
            chatDetailed: async (messages, options) => {
                calls.push(options);
                return { content: 'Yes [1].', thinking: '', stats: { promptTokens } };
            },
        };
    };
    let warn;
    beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => warn.mockRestore());

    it("keeps Ollama's prompt token count with the answer, and doesn't warn under the limit", async () => {
        const ollama = detailedClient(1200);
        const result = await createAskPipeline({ ollama, index }).ask('q', null);
        expect(result.promptTokens).toBe(1200);
        expect(result.answer).toBe('Yes [1].');
        expect(ollama.calls).toEqual([CHAT_OPTIONS]);
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns once when the prompt is over 85% of num_ctx, and still answers', async () => {
        const result = await createAskPipeline({ ollama: detailedClient(7500), index }).ask('q', null);
        expect(result.answer).toBe('Yes [1].');
        expect(result.promptTokens).toBe(7500);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/7500 tokens, over 85% of num_ctx 8192/);
    });

    it('has no count, and no warning, from a client with only chat()', async () => {
        const ollama = { chatModel: 'test', chat: async () => 'Yes [1].' };
        const result = await createAskPipeline({ ollama, index }).ask('q', null);
        expect(result.promptTokens).toBeNull();
        expect(warn).not.toHaveBeenCalled();
    });
});
