import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';

export function useRecords() {
    return useQuery({
        queryKey: ['records'],
        queryFn: () => api.get('/records?summary=true'),
    });
}

export function useRecord(id) {
    return useQuery({
        queryKey: ['record', id],
        queryFn: () => api.get(`/records/${id}`),
        enabled: !!id,
    });
}

export function useCreateSession() {
    return useMutation({
        mutationFn: (data) => api.post('/sessions', { mode: 'raw', ...data }),
    });
}