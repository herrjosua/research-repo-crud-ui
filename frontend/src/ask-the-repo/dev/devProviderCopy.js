// The dev-only provider toggle's text (DevProviderToggle.jsx), shared with its tests.

export const TOGGLE_LABEL = 'Ask the Repo provider (dev only)';

// Order is the switcher's order. `spoken` is how the result is announced.
export const PROVIDER_OPTIONS = [
    { provider: 'static', text: 'Static', spoken: 'pre-generated answers (static)' },
    { provider: 'ollama', text: 'Live (Ollama)', spoken: 'live answers (Ollama)' },
];
