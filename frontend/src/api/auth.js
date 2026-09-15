import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';

export function useLogin() {
    return useMutation({
        mutationFn: ({ username, password }) => api.post('/auth/login', { username, password }),
    });
}

export function useLogout() {
    return useMutation({
        mutationFn: () => api.post('/auth/logout'),
    });
}

export function useSignup() {
    return useMutation({
        mutationFn: ({ username, password, gitName, gitEmail }) =>
            api.post('/auth/signup', { username, password, gitName, gitEmail }),
    });
}

export function useMe() {
    return useQuery({
        queryKey: ['me'],
        queryFn: () => api.get('/auth/me'),
        retry: false,
    });
}