// Mirrors `docs/Build_Direction_B_v2_Design_decomposed/src/data/mock/constants.ts`'s
// `PROJECTS` (id/label/count only — `PROJECT_META`'s stats/description
// belong to the project-home main panel, out of scope for the left rail).
// Story/test fixture only: the app's real list comes from GET
// /api/ask/config (ids there are project-* tags; these short ids stand in
// for them). Same `{ id, label, count }` shape.
export const PROJECTS = [
    { id: 'all', label: 'All Projects', count: 247 },
    { id: 'checkout', label: 'Checkout Redesign', count: 84 },
    { id: 'onboarding', label: 'Onboarding v3', count: 63 },
    { id: 'mobile-nav', label: 'Mobile Navigation', count: 51 },
    { id: 'design-system', label: 'Design System Audit', count: 49 },
];

// The project list as GET /api/ask/config returns it for the real corpus
// (labels and counts from its research/projects.yml), after AskTheRepo.jsx
// puts "All projects" first: ten entries, some with labels too long for
// the rail.
export const CONFIG_PROJECTS = [
    { id: 'all', label: 'All projects', count: 97 },
    { id: 'project-ambient-scribe', label: 'Ambient AI Scribe', count: 19 },
    { id: 'project-onboarding', label: 'Onboarding', count: 21 },
    { id: 'project-care-coordination', label: 'Care Coordination & Alert Triage', count: 8 },
    { id: 'project-design-system', label: 'Design System', count: 6 },
    { id: 'project-prior-auth', label: 'AI-Assisted Prior Authorization', count: 5 },
    { id: 'project-him', label: 'HIM Coding, Billing & Release of Information', count: 5 },
    { id: 'project-patient-chatbot', label: 'Patient Scheduling Chatbot', count: 5 },
    { id: 'project-clinician-dashboard', label: 'Clinician Dashboard', count: 3 },
    { id: 'project-cross-cutting', label: 'Cross-cutting', count: 25 },
];

// The label a source's `recordProject` shows as, the way AskTheRepo.jsx
// resolves real tags against the config's project list.
export function projectLabelFor(projectId) {
    return PROJECTS.find((project) => project.id === projectId)?.label ?? null;
}
