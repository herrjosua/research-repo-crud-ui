// The base class for anything that goes wrong talking to a chat model's
// provider: OllamaError (ask/ollama.js) and BedrockError (ask/bedrock.js).
// routes/ask.js turns one into a generic 502 and routes/dev.js into a 502
// naming the problem. `message` is safe to show and log; `detail` is for the
// server log only. Neither ever holds a credential, and neither is the
// provider's own error object, so logging message and detail is always
// sanitized.
class LlmError extends Error {
    constructor(message, detail) {
        super(message);
        this.name = 'LlmError';
        this.detail = detail;
    }
}

module.exports = { LlmError };
