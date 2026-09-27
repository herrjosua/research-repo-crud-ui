// Mirrors `docs/Build_Direction_B_v2_Design_decomposed/src/data/mock/constants.ts`'s
// `PROJECTS` (id/label/count only — `PROJECT_META`'s stats/description
// belong to the project-home main panel, out of scope for the left rail).
// Real wiring (Story 8) swaps this for a `GET /api/projects`-shaped
// response; keeping the same field names now makes that swap mechanical.
export const PROJECTS = [
    { id: 'all', label: 'All Projects', count: 247 },
    { id: 'checkout', label: 'Checkout Redesign', count: 84 },
    { id: 'onboarding', label: 'Onboarding v3', count: 63 },
    { id: 'mobile-nav', label: 'Mobile Navigation', count: 51 },
    { id: 'design-system', label: 'Design System Audit', count: 49 },
];
