const BASE_URL = '/api';

async function request(path, options = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
        const error = new Error(data?.error || `Request failed with status ${res.status}`);
        // The HTTP status, for callers that treat e.g. 401 and 503 differently.
        // A network failure never gets here (fetch itself rejects), so a
        // missing `status` means the request didn't reach the server.
        error.status = res.status;
        throw error;
    }

    return data;
}

// `options` (e.g. `{ signal }`) is passed through to fetch.
export const api = {
    get: (path, options) => request(path, options),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
