const {
    createBedrockClient, BedrockError, BEDROCK_MODELS, EFFORT_LEVELS,
} = require('../ask/bedrock');
const { LlmError } = require('../ask/llmError');
const { OllamaError } = require('../ask/ollama');
const { resolveBedrockConfig } = require('../ask/config');
const { createAskPipeline, CHAT_OPTIONS } = require('../ask/pipeline');
const { chunkRecord } = require('../ask/corpus');

// The Bedrock chat client (ask/bedrock.js) with an injected send: no SDK,
// no network, no credentials. Each fixture is a Converse response shape.

const SONNET = 'global.anthropic.claude-sonnet-5-5';
const OPUS = 'global.anthropic.claude-opus-5-5';
const GPT_OSS = 'openai.gpt-oss-20b-1:0';

const messages = [
    { role: 'system', content: 'You answer from the sources.' },
    { role: 'user', content: 'Sources: [1] …\n\nQuestion: why?' },
];

const reply = (content, extra = {}) => ({
    output: { message: { role: 'assistant', content } },
    stopReason: 'end_turn',
    usage: { inputTokens: 1000, outputTokens: 209, totalTokens: 1209 },
    metrics: { latencyMs: 3200 },
    $metadata: { httpStatusCode: 200, requestId: 'req-ok', attempts: 1 },
    ...extra,
});

const client = (modelId, fixture = reply([{ text: 'Because [1].' }]), settings = {}) => {
    const send = jest.fn(async () => fixture);
    return { send, bedrock: createBedrockClient({ modelId, send, ...settings }) };
};

describe('the Bedrock request', () => {
    it('splits the system and user messages, and sends maxTokens and effort to a Claude model', async () => {
        for (const modelId of [SONNET, OPUS]) {
            const { send, bedrock } = client(modelId, undefined, { effort: 'low', maxTokens: 2048 });
            await bedrock.chat(messages, CHAT_OPTIONS);
            expect(send).toHaveBeenCalledTimes(1);
            expect(send.mock.calls[0][0]).toEqual({
                modelId,
                system: [{ text: 'You answer from the sources.' }],
                messages: [{ role: 'user', content: [{ text: 'Sources: [1] …\n\nQuestion: why?' }] }],
                inferenceConfig: { maxTokens: 2048 },
                additionalModelRequestFields: { output_config: { effort: 'low' } },
            });
        }
    });

    it('sends no temperature, and ignores num_ctx, though the pipeline passes both', async () => {
        const { send, bedrock } = client(SONNET);
        await bedrock.chat(messages, { temperature: 0.2, num_ctx: 8192 });
        const input = send.mock.calls[0][0];
        expect(input.inferenceConfig).toEqual({ maxTokens: 4096 });
        expect(JSON.stringify(input)).not.toMatch(/temperature|num_ctx|seed/);
    });

    it('has temperature off for every model in the table', () => {
        expect(Object.values(BEDROCK_MODELS).every((m) => m.temperature === false)).toBe(true);
    });

    it('sends no effort to gpt-oss', async () => {
        const { send, bedrock } = client(GPT_OSS, undefined, { effort: 'max' });
        await bedrock.chat(messages, CHAT_OPTIONS);
        expect(send.mock.calls[0][0].additionalModelRequestFields).toBeUndefined();
        expect(send.mock.calls[0][0].inferenceConfig).toEqual({ maxTokens: 4096 });
        expect(bedrock.effort).toBeNull();
    });

    it('defaults to effort high and 4096 tokens in us-east-1', async () => {
        const { send, bedrock } = client(SONNET);
        await bedrock.chat(messages);
        expect(send.mock.calls[0][0].additionalModelRequestFields).toEqual({ output_config: { effort: 'high' } });
        expect(bedrock).toMatchObject({ region: 'us-east-1', maxTokens: 4096, effort: 'high', contextSize: null });
    });

    it('throws when the options carry a seed, before sending anything', async () => {
        const { send, bedrock } = client(SONNET);
        await expect(bedrock.chat(messages, { ...CHAT_OPTIONS, seed: 42 })).rejects.toThrow(/takes no seed/);
        await expect(bedrock.chat(messages, { seed: 0 })).rejects.not.toBeInstanceOf(BedrockError);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses messages that are not one system and one user message', async () => {
        const { bedrock } = client(SONNET);
        await expect(bedrock.chat([...messages, { role: 'assistant', content: 'x' }])).rejects.toThrow(/exactly one user message/);
        await expect(bedrock.chat([messages[0]])).rejects.toThrow(/exactly one user message/);
    });
});

describe('the Bedrock reply', () => {
    it('keeps only the text blocks when a reasoning block comes first, and records the reasoning length', async () => {
        const { bedrock } = client(GPT_OSS, reply([
            { reasoningContent: { reasoningText: { text: 'Let me think about the sources.' } } },
            { text: 'The answer [1].' },
        ]));
        const result = await bedrock.chatDetailed(messages, CHAT_OPTIONS);
        expect(result.content).toBe('The answer [1].');
        expect(result.thinking).toBe('Let me think about the sources.');
        expect(result.reasoningBlocks).toBe(1);
        expect(await bedrock.chat(messages)).toBe('The answer [1].');
    });

    it('reports no reasoning when only a text block comes back', async () => {
        const { bedrock } = client(SONNET);
        expect(await bedrock.chatDetailed(messages)).toMatchObject({ content: 'Because [1].', thinking: '', reasoningBlocks: 0 });
    });

    it('throws a BedrockError when only reasoning comes back, with the usage for the cost', async () => {
        const { bedrock } = client(GPT_OSS, reply([{ reasoningContent: { reasoningText: { text: 'hmm' } } }]));
        const err = await bedrock.chat(messages).catch((e) => e);
        expect(err).toBeInstanceOf(BedrockError);
        expect(err.message).toBe('Bedrock returned no text block');
        expect(err.stats.outputTokens).toBe(209);
    });

    it('throws a BedrockError on stopReason max_tokens, even with text', async () => {
        const { bedrock } = client(SONNET, reply([{ text: 'Because the sour' }], { stopReason: 'max_tokens' }));
        const err = await bedrock.chat(messages).catch((e) => e);
        expect(err).toBeInstanceOf(BedrockError);
        expect(err.message).toBe('Bedrock stopped at max_tokens');
        expect(err.detail).toContain('req-ok');
        expect(err.stats).toMatchObject({ inputTokens: 1000, outputTokens: 209, stopReason: 'max_tokens' });
        expect(err.attempts).toBe(1);
    });

    it.each(['stop_sequence', 'end_turn'])('answers on stopReason %s', async (stopReason) => {
        const { bedrock } = client(SONNET, reply([{ text: 'Because [1].' }], { stopReason }));
        expect(await bedrock.chat(messages)).toBe('Because [1].');
    });

    it.each(['model_context_window_exceeded', 'content_filtered', 'guardrail_intervened', 'tool_use', 'malformed_model_output', 'something_new'])(
        'throws a BedrockError on stopReason %s, even with text, with the usage and attempts',
        async (stopReason) => {
            const { bedrock } = client(SONNET, reply([{ text: 'Because [1].' }], { stopReason }));
            const err = await bedrock.chat(messages).catch((e) => e);
            expect(err).toBeInstanceOf(BedrockError);
            expect(err.message).toBe(`Bedrock stopped at ${stopReason}`);
            expect(err.detail).toBe('only end_turn or stop_sequence is an answer (request ID req-ok)');
            expect(err.stats).toMatchObject({ inputTokens: 1000, outputTokens: 209, stopReason });
            expect(err.attempts).toBe(1);
        },
    );

    it.each([undefined, null, ''])('throws a BedrockError when stopReason is missing (%j)', async (stopReason) => {
        const { bedrock } = client(SONNET, reply([{ text: 'Because [1].' }], { stopReason }));
        const err = await bedrock.chat(messages).catch((e) => e);
        expect(err).toBeInstanceOf(BedrockError);
        expect(err.message).toBe('Bedrock returned no stopReason');
        expect(err.stats).toMatchObject({ outputTokens: 209, stopReason: null });
        expect(err.attempts).toBe(1);
    });

    it('maps the usage into stats, with promptTokens for the pipeline', async () => {
        const { bedrock } = client(SONNET, reply([{ text: 'ok' }], {
            usage: {
                inputTokens: 5000, outputTokens: 300, totalTokens: 5300, cacheReadInputTokens: 0, cacheWriteInputTokens: 0,
            },
            $metadata: { requestId: 'r', attempts: 2 },
        }));
        expect((await bedrock.chatDetailed(messages)).stats).toEqual({
            inputTokens: 5000,
            outputTokens: 300,
            totalTokens: 5300,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            latencyMs: 3200,
            stopReason: 'end_turn',
            attempts: 2,
            promptTokens: 5000,
        });
    });

    it('gives null where Bedrock leaves a count out', async () => {
        const { bedrock } = client(SONNET, { output: { message: { content: [{ text: 'ok' }] } }, stopReason: 'end_turn' });
        expect((await bedrock.chatDetailed(messages)).stats).toMatchObject({
            inputTokens: null, outputTokens: null, cacheReadTokens: null, latencyMs: null, attempts: null, promptTokens: null,
        });
    });
});

describe('Bedrock errors', () => {
    // An SDK-like error: name, message, $metadata, and fields that must never
    // reach the message or detail.
    const sdkError = (name, message, status) => Object.assign(new Error(message), {
        name,
        $fault: 'client',
        $metadata: { httpStatusCode: status, requestId: `req-${name}`, attempts: 1 },
        $response: { headers: { authorization: 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/x, Signature=deadbeef' } },
        config: { credentials: { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', sessionToken: 'FwoGZXIvYXdzEBYtoken' } },
    });
    const failing = (err) => createBedrockClient({ modelId: SONNET, send: jest.fn(async () => { throw err; }) });
    const failure = async (err) => failing(err).chat(messages).catch((e) => e);
    const secrets = /AKIAIOSFODNN7EXAMPLE|wJalrXUtnFEMI\/K7MDENG\/bPxRfiCYEXAMPLEKEY|FwoGZXIvYXdzEBYtoken|deadbeef|secretAccessKey|sessionToken|authorization/i;

    it.each([
        ['AccessDeniedException', 'User: arn:aws:iam::111122223333:user/ux-research-demo is not authorized to perform: aws-marketplace:ViewSubscriptions', 403,
            'Bedrock AccessDeniedException (HTTP 403): model access not enabled (Marketplace)'],
        ['AccessDeniedException', 'Model access is denied due to IAM user or service role is not authorized to perform the required AWS Marketplace actions (aws-marketplace:Subscribe)', 403,
            'Bedrock AccessDeniedException (HTTP 403): model access not enabled (Marketplace)'],
        ['AccessDeniedException', 'Model access is denied due to INVALID_PAYMENT_INSTRUMENT: A valid payment instrument must be provided.', 403,
            'Bedrock AccessDeniedException (HTTP 403): Marketplace payment instrument'],
        ['ValidationException', 'temperature is deprecated for this model', 400, 'Bedrock ValidationException (HTTP 400): bad parameter'],
        ['ThrottlingException', 'Too many requests, please wait before trying again.', 429, 'Bedrock ThrottlingException (HTTP 429): throttled'],
        ['ServiceQuotaExceededException', 'Your request exceeds the service quota for your account.', 400, 'Bedrock ServiceQuotaExceededException (HTTP 400): throttled'],
        ['InternalServerException', 'An internal server error occurred.', 500, 'Bedrock InternalServerException (HTTP 500)'],
    ])('labels %s (%s)', async (name, message, status, expected) => {
        const err = await failure(sdkError(name, message, status));
        expect(err).toBeInstanceOf(BedrockError);
        expect(err).toBeInstanceOf(LlmError);
        expect(err.message).toBe(expected);
        expect(err.detail).toBe(`${message} (request ID req-${name})`);
        expect(`${err.message} ${err.detail}`).not.toMatch(secrets);
    });

    it('redacts credentials an SDK message quotes, and cuts it to 500 characters', async () => {
        const quoted = `The request signature we calculated does not match. Credential=AKIAIOSFODNN7EXAMPLE/20261023/us-east-1/bedrock/aws4_request, SignedHeaders=host, Signature=deadbeef ${'x'.repeat(600)}`;
        const err = await failure(sdkError('InvalidSignatureException', quoted, 403));
        expect(err.message).toBe('Bedrock InvalidSignatureException (HTTP 403)');
        expect(err.detail).not.toMatch(secrets);
        expect(err.detail).toContain('Credential=[redacted]');
        expect(err.detail.length).toBeLessThanOrEqual(500 + ' (request ID req-InvalidSignatureException)'.length);
    });

    it('wraps a failure with no HTTP response (no credentials, a timeout)', async () => {
        const err = await failure(Object.assign(new Error('Could not load credentials from any providers'), { name: 'CredentialsProviderError' }));
        expect(err.message).toBe('Bedrock CredentialsProviderError (HTTP none)');
        expect(err.detail).toBe('Could not load credentials from any providers');
    });

    it('OllamaError and BedrockError are both LlmErrors', () => {
        expect(new OllamaError('x')).toBeInstanceOf(LlmError);
        expect(new BedrockError('x')).toBeInstanceOf(LlmError);
    });
});

describe('Bedrock settings', () => {
    it('resolves the defaults with only BEDROCK_MODEL_ID', () => {
        expect(resolveBedrockConfig({ BEDROCK_MODEL_ID: SONNET })).toEqual({
            modelId: SONNET, region: 'us-east-1', maxTokens: 4096, effort: 'high',
        });
        expect(resolveBedrockConfig({
            BEDROCK_MODEL_ID: GPT_OSS, BEDROCK_REGION: 'us-west-2', BEDROCK_MAX_TOKENS: '1024', BEDROCK_EFFORT: 'XHigh',
        })).toEqual({ modelId: GPT_OSS, region: 'us-west-2', maxTokens: 1024, effort: 'xhigh' });
    });

    it('refuses an unknown model, a missing one, and a bad effort or token limit', () => {
        expect(() => resolveBedrockConfig({ BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku' })).toThrow(/BEDROCK_MODEL_ID=anthropic.claude-3-haiku is not supported/);
        expect(() => resolveBedrockConfig({})).toThrow(/needs BEDROCK_MODEL_ID/);
        expect(() => resolveBedrockConfig({ BEDROCK_MODEL_ID: SONNET, BEDROCK_EFFORT: 'extreme' })).toThrow(/BEDROCK_EFFORT=extreme/);
        expect(() => resolveBedrockConfig({ BEDROCK_MODEL_ID: SONNET, BEDROCK_MAX_TOKENS: '0' })).toThrow(/BEDROCK_MAX_TOKENS=0/);
        expect(() => resolveBedrockConfig({ BEDROCK_MODEL_ID: SONNET, BEDROCK_MAX_TOKENS: 'lots' })).toThrow(/BEDROCK_MAX_TOKENS=lots/);
        expect(EFFORT_LEVELS).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    });

    it('checkReady is local: it validates and sends nothing', async () => {
        const { send, bedrock } = client(SONNET);
        await expect(bedrock.checkReady()).resolves.toBeUndefined();
        expect(send).not.toHaveBeenCalled();
    });
});

describe('the pipeline on Bedrock', () => {
    const record = {
        id: 'finding:a', kind: 'finding', type: 'synthesis', title: 'A', html: '<h2>Overview</h2><p>a finding</p>',
    };
    const passages = chunkRecord(record).map((chunk) => ({
        record, chunk, vector: [1, 0], participants: null, previous: null, next: null,
    }));
    const index = { refresh: async () => ({ passages, records: [record] }), embedQuery: async () => [1, 0] };

    it('answers with the model as the profile ID, counts input tokens, and never warns on prompt size', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { send, bedrock } = client(SONNET, reply([{ text: 'Yes [1].' }], { usage: { inputTokens: 200000, outputTokens: 10, totalTokens: 200010 } }));
        const result = await createAskPipeline({ ollama: bedrock, index }).ask('q', null);
        expect(result.answer).toBe('Yes [1].');
        expect(result.model).toBe(SONNET);
        expect(result.promptTokens).toBe(200000);
        expect(warn).not.toHaveBeenCalled();
        expect(send.mock.calls[0][0].messages[0].content[0].text).toContain('q');
        expect(send.mock.calls[0][0].system[0].text.length).toBeGreaterThan(0);
        warn.mockRestore();
    });
});

// ask/activeProvider.js and everything that loads with the server or the
// harness: the SDK is required only when Bedrock is the provider and a
// request is actually sent.
describe('loading the AWS SDK', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
        jest.dontMock('@aws-sdk/client-bedrock-runtime');
        jest.dontMock('@aws-sdk/client-sts');
    });

    function load(env, then = () => {}) {
        const required = [];
        let result;
        jest.isolateModules(() => {
            jest.doMock('@aws-sdk/client-bedrock-runtime', () => {
                required.push('bedrock-runtime');
                class BedrockRuntimeClient {
                    constructor(config) { required.push(config); }

                    async send(command) { return reply([{ text: `sent ${command.input.modelId}` }]); }
                }
                class ConverseCommand {
                    constructor(input) { this.input = input; }
                }
                return { BedrockRuntimeClient, ConverseCommand };
            });
            jest.doMock('@aws-sdk/client-sts', () => {
                required.push('sts');
                return {};
            });
            Object.assign(process.env, env);
            for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
            const activeProvider = require('../ask/activeProvider');
            require('../routes/ask');
            require('../routes/dev');
            require('../scripts/eval-ask');
            result = then(activeProvider);
        });
        return { required, result };
    }

    it.each(['ollama', 'static', undefined])('is never required with LLM_PROVIDER=%s', (provider) => {
        const { required } = load({ LLM_PROVIDER: provider }, (activeProvider) => activeProvider.getPipeline());
        expect(required).toEqual([]);
    });

    it('is not required by starting with LLM_PROVIDER=bedrock, only by the first request, with maxAttempts 3', async () => {
        const { required, result } = load(
            { LLM_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: SONNET, BEDROCK_REGION: undefined },
            (activeProvider) => {
                activeProvider.getPipeline('bedrock');
                return activeProvider;
            },
        );
        expect(required).toEqual([]);
        expect(await result.getBedrock().chat(messages, CHAT_OPTIONS)).toBe(`sent ${SONNET}`);
        expect(required).toEqual(['bedrock-runtime', { region: 'us-east-1', maxAttempts: 3 }]);
    });

    it('refuses to start with an unknown BEDROCK_MODEL_ID', () => {
        expect(() => load({ LLM_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: 'anthropic.claude-v2' }))
            .toThrow('BEDROCK_MODEL_ID=anthropic.claude-v2 is not supported');
    });

    it('builds the bedrock pipeline without a seed, and the ollama one with ASK_SEED', () => {
        const seen = {};
        jest.isolateModules(() => {
            jest.doMock('../ask/pipeline', () => ({
                createAskPipeline: (args) => { seen[args.ollama.provider || 'ollama'] = args; return {}; },
            }));
            Object.assign(process.env, { LLM_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: GPT_OSS, ASK_SEED: '7' });
            const activeProvider = require('../ask/activeProvider');
            activeProvider.getPipeline('bedrock');
            activeProvider.getPipeline('ollama');
        });
        jest.dontMock('../ask/pipeline');
        expect(seen.bedrock.seed).toBeUndefined();
        expect(seen.ollama.seed).toBe(7);
        // One embedding index, built on Ollama's embed, for both.
        expect(seen.bedrock.index).toBe(seen.ollama.index);
    });
});
