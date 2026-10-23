// Chat client for Amazon Bedrock's Converse API (bedrock-runtime), with the
// same chat()/chatDetailed() shape as ask/ollama.js so ask/pipeline.js can
// use either. Chat only: embeddings stay on Ollama (ask/activeProvider.js).
//
// The AWS SDK (@aws-sdk/client-bedrock-runtime) is required inside the
// default send function, the first time a request is sent, so nothing loads
// it unless LLM_PROVIDER=bedrock or the evaluation harness runs with
// --provider bedrock. Credentials come from the SDK's default chain
// (AWS_PROFILE); none are passed in, read or logged here.

const { LlmError } = require('./llmError');

// The models this app may call, by inference profile ID. Anything else
// refuses to start (ask/config.js resolveBedrockConfig).
//   temperature  whether inferenceConfig.temperature may be sent. Off for
//                all three: Sonnet 5.5 rejects it (ValidationException
//                "temperature is deprecated for this model"); Opus 5.5 and
//                gpt-oss are untested. A later probe can turn one on.
//   effort       whether the effort level is sent, as
//                additionalModelRequestFields.output_config.effort. The
//                Claude models only (verified on Sonnet 5.5 at low and high).
const BEDROCK_MODELS = {
    'global.anthropic.claude-sonnet-5-5': { temperature: false, effort: true },
    'global.anthropic.claude-opus-5-5': { temperature: false, effort: true },
    'openai.gpt-oss-20b-1:0': { temperature: false, effort: false },
};

const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

// The only stopReasons whose reply is an answer. Anything else, a missing
// one included (max_tokens, model_context_window_exceeded, content_filtered,
// guardrail_intervened, tool_use, …), is a BedrockError.
const ANSWER_STOP_REASONS = ['end_turn', 'stop_sequence'];

const DEFAULTS = {
    region: 'us-east-1',
    maxTokens: 4096,
    effort: 'high',
    // The SDK's own retries, set explicitly so a run can record them.
    maxAttempts: 3,
    // Like ask/ollama.js: an answer is seconds to a minute.
    timeoutMs: 180_000,
};

// Thrown for anything that goes wrong calling Bedrock: every SDK failure,
// any stopReason but end_turn or stop_sequence (ANSWER_STOP_REASONS; a
// missing one too), and a reply with no text block. `message` is
// "Bedrock <error name> (HTTP <status>)", with a label for the failures
// seen so far; `detail` is the SDK's message, credentials redacted, cut to
// 500 characters, plus the request ID. `stats` is the call's usage when
// Bedrock answered (a stopReason, no text), so its tokens can still be
// counted; `attempts` the SDK's attempts, when known.
class BedrockError extends LlmError {
    constructor(message, detail, { stats = null, attempts = null } = {}) {
        super(message, detail);
        this.name = 'BedrockError';
        this.stats = stats;
        this.attempts = attempts;
    }
}

// Anything in an SDK message that could be a credential: access key IDs,
// and the signature, credential and session-token parts of a signed request
// (a signature mismatch message can quote them).
function redact(text) {
    return String(text)
        .replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, '[redacted]')
        .replace(/((?:X-Amz-)?(?:Credential|Signature|Security-Token|SignedHeaders))=[^\s,&'"]+/gi, '$1=[redacted]');
}

// A short name for the failures seen so far, or null.
function errorLabel(name, message) {
    if (name === 'AccessDeniedException' && /aws-marketplace:(ViewSubscriptions|Subscribe)\b/.test(message)) {
        return 'model access not enabled (Marketplace)';
    }
    if (name === 'AccessDeniedException' && message.includes('INVALID_PAYMENT_INSTRUMENT')) return 'Marketplace payment instrument';
    if (name === 'ValidationException') return 'bad parameter';
    if (name === 'ThrottlingException' || name === 'ServiceQuotaExceededException') return 'throttled';
    return null;
}

// An SDK failure as a BedrockError. Only the error's name, status, message
// and request ID are read: never the error object itself, which can carry
// the request and client config.
function toBedrockError(err) {
    const name = (err && typeof err.name === 'string' && err.name) || 'Error';
    const meta = (err && err.$metadata) || {};
    const status = meta.httpStatusCode ?? 'none';
    const text = err && err.message !== undefined ? String(err.message) : '';
    const label = errorLabel(name, text);
    const requestId = meta.requestId ? ` (request ID ${meta.requestId})` : '';
    return new BedrockError(
        `Bedrock ${name} (HTTP ${status})${label ? `: ${label}` : ''}`,
        `${redact(text).slice(0, 500)}${requestId}`,
        { attempts: typeof meta.attempts === 'number' ? meta.attempts : null },
    );
}

// The real send: one BedrockRuntimeClient per client, built on first use.
function sdkSend({ region, maxAttempts, timeoutMs }) {
    let runtime = null;
    let Converse = null;
    return async (input) => {
        if (!runtime) {
            const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
            runtime = new BedrockRuntimeClient({ region, maxAttempts });
            Converse = ConverseCommand;
        }
        return runtime.send(new Converse(input), { abortSignal: AbortSignal.timeout(timeoutMs) });
    };
}

// Throws (a plain Error, naming the variable) for a model, effort or token
// limit this app doesn't support.
function validateBedrockSettings({ modelId, effort, maxTokens, region }) {
    if (!Object.hasOwn(BEDROCK_MODELS, modelId)) {
        throw new Error(`BEDROCK_MODEL_ID=${modelId} is not supported. Use one of ${Object.keys(BEDROCK_MODELS).join(', ')}.`);
    }
    if (!EFFORT_LEVELS.includes(effort)) {
        throw new Error(`BEDROCK_EFFORT=${effort} is not supported. Use one of ${EFFORT_LEVELS.join(', ')}, or leave it unset for ${DEFAULTS.effort}.`);
    }
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) {
        throw new Error(`BEDROCK_MAX_TOKENS=${maxTokens} is not supported. Use a positive integer, or leave it unset for ${DEFAULTS.maxTokens}.`);
    }
    if (typeof region !== 'string' || !/^[a-z]{2}(-[a-z]+)+-\d+$/.test(region)) {
        throw new Error(`BEDROCK_REGION=${region} is not supported. Use a region name like ${DEFAULTS.region}, or leave it unset.`);
    }
}

// `send` is the Converse call: (input) => response. It defaults to the
// SDK; the tests inject a fake, so they never load the SDK or reach AWS.
function createBedrockClient({
    modelId,
    region = DEFAULTS.region,
    maxTokens = DEFAULTS.maxTokens,
    effort = DEFAULTS.effort,
    maxAttempts = DEFAULTS.maxAttempts,
    timeoutMs = DEFAULTS.timeoutMs,
    send,
} = {}) {
    validateBedrockSettings({ modelId, effort, maxTokens, region });
    const model = BEDROCK_MODELS[modelId];
    const converse = send || sdkSend({ region, maxAttempts, timeoutMs });

    // The Converse request for ask/answer.js buildMessages' system and user
    // messages. options.temperature is sent only where the model table
    // allows it (nowhere yet); num_ctx is an Ollama option and is ignored.
    function request(messages, options) {
        if (options.seed !== undefined) {
            throw new Error('Bedrock Converse takes no seed; ASK_SEED and --seed do not apply to LLM_PROVIDER=bedrock');
        }
        const system = messages.filter((m) => m.role === 'system');
        const user = messages.filter((m) => m.role === 'user');
        if (user.length !== 1 || system.length > 1 || system.length + user.length !== messages.length) {
            throw new Error('the Bedrock client takes at most one system message and exactly one user message');
        }
        const input = {
            modelId,
            messages: [{ role: 'user', content: [{ text: user[0].content }] }],
            inferenceConfig: { maxTokens },
        };
        if (system.length === 1) input.system = [{ text: system[0].content }];
        if (model.temperature && options.temperature !== undefined) input.inferenceConfig.temperature = options.temperature;
        if (model.effort) input.additionalModelRequestFields = { output_config: { effort } };
        return input;
    }

    // Non-streaming chat; resolves to { content, thinking, reasoningBlocks,
    // stats }, like ask/ollama.js. `content` is the reply's text blocks only.
    // A reasoning block is never part of it: its text is `thinking`, and
    // `reasoningBlocks` says how many came back (0 for none). `stats` is the
    // call's usage; output tokens can include thinking Bedrock doesn't
    // return, so cost comes from them, never from the answer's length.
    async function chatDetailed(messages, options = {}) {
        const input = request(messages, options);
        let res;
        try {
            res = await converse(input);
        } catch (err) {
            throw toBedrockError(err);
        }
        const usage = (res && res.usage) || {};
        const count = (n) => (typeof n === 'number' ? n : null);
        const meta = (res && res.$metadata) || {};
        const stats = {
            inputTokens: count(usage.inputTokens),
            outputTokens: count(usage.outputTokens),
            totalTokens: count(usage.totalTokens),
            cacheReadTokens: count(usage.cacheReadInputTokens),
            cacheWriteTokens: count(usage.cacheWriteInputTokens),
            latencyMs: count(res && res.metrics && res.metrics.latencyMs),
            stopReason: (res && res.stopReason) || null,
            attempts: count(meta.attempts),
            // What ask/pipeline.js reads for its prompt-size count.
            promptTokens: count(usage.inputTokens),
        };
        const requestId = meta.requestId ? ` (request ID ${meta.requestId})` : '';
        if (stats.stopReason === 'max_tokens') {
            throw new BedrockError(
                'Bedrock stopped at max_tokens',
                `the reply hit BEDROCK_MAX_TOKENS=${maxTokens} before it finished${requestId}`,
                { stats, attempts: stats.attempts },
            );
        }
        if (!ANSWER_STOP_REASONS.includes(stats.stopReason)) {
            throw new BedrockError(
                stats.stopReason ? `Bedrock stopped at ${stats.stopReason}` : 'Bedrock returned no stopReason',
                `only ${ANSWER_STOP_REASONS.join(' or ')} is an answer${requestId}`,
                { stats, attempts: stats.attempts },
            );
        }
        const blocks = res && res.output && res.output.message && Array.isArray(res.output.message.content)
            ? res.output.message.content
            : [];
        const texts = blocks.filter((b) => b && typeof b.text === 'string').map((b) => b.text);
        const reasoning = blocks.filter((b) => b && b.reasoningContent);
        if (texts.length === 0) {
            throw new BedrockError(
                'Bedrock returned no text block',
                `stopReason ${stats.stopReason}, ${blocks.length} content block(s), ${reasoning.length} of them reasoning${requestId}`,
                { stats, attempts: stats.attempts },
            );
        }
        const thinking = reasoning
            .map((b) => (b.reasoningContent.reasoningText && typeof b.reasoningContent.reasoningText.text === 'string' ? b.reasoningContent.reasoningText.text : ''))
            .join('');
        return {
            content: texts.join(''), thinking, reasoningBlocks: reasoning.length, stats,
        };
    }

    return {
        provider: 'bedrock',
        chatModel: modelId,
        region,
        maxTokens,
        // The effort level sent, or null for a model that isn't sent one.
        effort: model.effort ? effort : null,
        // Bedrock refuses an over-long prompt instead of cutting it, so
        // ask/pipeline.js gives no prompt-size warning (null).
        contextSize: null,

        // Local only: the settings are valid and the model is in the table.
        // No network call, so it says nothing about credentials or access.
        async checkReady() {
            try {
                validateBedrockSettings({ modelId, effort, maxTokens, region });
            } catch (err) {
                throw new BedrockError(err.message);
            }
        },

        chatDetailed,

        async chat(messages, options = {}) {
            return (await chatDetailed(messages, options)).content;
        },
    };
}

module.exports = {
    createBedrockClient,
    validateBedrockSettings,
    BedrockError,
    BEDROCK_MODELS,
    BEDROCK_DEFAULTS: DEFAULTS,
    EFFORT_LEVELS,
    ANSWER_STOP_REASONS,
    redact,
};
