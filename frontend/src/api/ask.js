import { useQuery } from '@tanstack/react-query';
import { api } from './client';

// Ask the Repo's two endpoints. The response shapes are documented in
// backend/README.md under "Ask the Repo".

// `{ enabled, mode, projects: [{ id, label, count }] }`. `enabled` is false
// (and `mode` null) where the server has no language model (LLM_PROVIDER
// unset), and `projects` is [] for a corpus without a project list. `mode`
// is 'live' (typed questions) or 'static' (the public demo: pick from
// `questions: [{ id, question, project }]`, answered from a capture
// described by `capture: { model, capturedAt }`).
export function useAskConfig() {
    return useQuery({
        queryKey: ['ask', 'config'],
        queryFn: () => api.get('/ask/config'),
        // Only changes when the server restarts or a record is re-tagged;
        // refetching on every window focus would just re-run the export.
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
}

// POST /api/ask. Resolves to `{ answer, sources, model }`; rejects with the
// client's Error, whose `status` says which failure it was (401, 502, 503…).
// `project` is a project-* tag, or null/"all" for the whole repo. In static
// mode, send `questionId` instead: the server takes only the id (each
// captured question has its own project), never free text.
export function askRepo({ question, project, questionId }, { signal } = {}) {
    const body = questionId ? { questionId } : { question, project: project ?? 'all' };
    return api.post('/ask', body, { signal });
}
