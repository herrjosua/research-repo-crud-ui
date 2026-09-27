// Mirrors `docs/Build_Direction_B_v2_Design_decomposed/src/data/mock/starters.ts`'s
// `STARTERS` — keyed by project id (see `./constants.js`'s `PROJECTS`),
// falling back to `all`'s list for any id without its own entry.
export const STARTERS = {
    all: [
        'What are the most common pain points across all projects?',
        'Which findings have the highest severity ratings?',
        'What research gaps exist in the current corpus?',
        'Summarise the key themes from the last quarter',
    ],
    checkout: [
        'What are the top pain points in the checkout flow?',
        'Why do users abandon before payment?',
        'What did participants say about the address form?',
        'How does guest checkout compare to account creation?',
    ],
    onboarding: [
        'Where do new users drop off during onboarding?',
        'What is the most confusing step in sign-up?',
        'How long does the median user take to complete onboarding?',
        'What motivates users to complete their profile?',
    ],
    'mobile-nav': [
        'How discoverable is the hamburger menu on mobile?',
        'What navigation patterns do users expect on mobile?',
        'Which nav items are most frequently missed?',
        'How does mobile nav compare to desktop across sessions?',
    ],
    'design-system': [
        'What are the main barriers to component adoption?',
        'How do engineers describe documentation quality?',
        'Which components have the most reported issues?',
        'What would make the design system easier to contribute to?',
    ],
};
