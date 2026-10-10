// Carbon feature flags the app runs with. main.jsx hands them to <FeatureFlags>;
// vitest.setup.js enables the same ones globally, so the unit tests (and the
// Virtual Screen Reader tests in particular) exercise the same Modal focus-wrap
// behaviour as production instead of Carbon's default "focus sentinel" markup.
export const CARBON_FLAGS = {
    'enable-experimental-focus-wrap-without-sentinels': true,
    'enable-focus-wrap-without-sentinels': true,
};
