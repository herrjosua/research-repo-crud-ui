import '@testing-library/jest-dom/vitest';

// jsdom implements neither of these, but Carbon's <Tabs> (first used by
// ask-the-repo/AskTheRepo.jsx) reads both just to mount, so every test that
// renders it throws "ResizeObserver is not defined" /
// "window.matchMedia is not a function" without a stand-in.
if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {}, // deprecated, kept for older consumers
        removeListener: () => {},
        dispatchEvent: () => false,
    });
}