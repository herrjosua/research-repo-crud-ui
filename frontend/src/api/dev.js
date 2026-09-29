import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// The backend's dev-only routes (backend/routes/dev.js). They exist only on
// a server started with DEV_TOOLS_ENABLED=true and NODE_ENV development or
// test; anywhere else GET answers 404, which hides the toggle that uses
// these. Only imported from ask-the-repo/dev/, which the production build
// leaves out entirely (see AskTheRepo.jsx).

const PROVIDER_KEY = ['dev', 'provider'];

// `{ provider: 'static' | 'ollama' | null }`: Ask the Repo's provider right
// now. Errors (the 404 above) aren't retried: they mean "no dev tools here".
export function useDevProvider() {
    return useQuery({
        queryKey: PROVIDER_KEY,
        queryFn: () => api.get('/dev/provider'),
        retry: false,
    });
}

// POST /api/dev/provider. On success, the Ask config is reset rather than
// just invalidated, so it goes back to pending: the Ask tab shows its
// config loading state and disables asking until it knows the new mode,
// instead of offering the old mode's questions to a server that has left it.
export function useSetDevProvider() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (provider) => api.post('/dev/provider', { provider }),
        onSuccess: (data) => {
            queryClient.setQueryData(PROVIDER_KEY, data);
            queryClient.resetQueries({ queryKey: ['ask', 'config'] });
        },
    });
}
