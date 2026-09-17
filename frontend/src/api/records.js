import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useUpdateRecord(id) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => api.put(`/records/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['record', id] });
            queryClient.invalidateQueries({ queryKey: ['records'] });
        },
    });
}

export function useDeleteRecord() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => api.delete(`/records/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['records'] });
        },
    });
}

export function useRecordHistory(id, enabled) {
    return useQuery({
        queryKey: ['record', id, 'history'],
        queryFn: () => api.get(`/records/${id}/history`),
        enabled: enabled,
    });
}