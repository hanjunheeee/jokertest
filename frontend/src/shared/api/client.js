import { handleApiResponse } from "./response.js";
import { API_BASE_URL } from "../env.js";

const BASE_URL = API_BASE_URL;

const createRequestOptions = (options) => {
    return {
        method: "GET",

        credentials: "include",

        cache: "no-store",

        ...options,

        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
    };
};

let refreshPromise = null;

export const refreshAccessToken = () => {
    if (!refreshPromise) {
        refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
            method:      "POST",
            credentials: "include",
            cache:       "no-store",
        })
            .then((response) => response.ok)
            .catch(() => false)
            .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
};

export const apiClient = async (endpoint, options = {}, _isRetry = false) => {
    const url = `${BASE_URL}${endpoint}`;
    const requestOptions = createRequestOptions(options);

    const response = await fetch(url, requestOptions);

    if (response.status === 401 && !_isRetry && endpoint !== "/auth/refresh") {
        const body = await response.clone().json().catch(() => ({}));
        if (body.code === "ACCESS_TOKEN_EXPIRED") {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                return apiClient(endpoint, options, true);
            }
        }
    }

    return await handleApiResponse(response);
};

export const api = {
    get:    (endpoint)       => apiClient(endpoint),
    post:   (endpoint, body) => apiClient(endpoint, { method: "POST",   body: JSON.stringify(body) }),
    put:    (endpoint, body) => apiClient(endpoint, { method: "PUT",    body: JSON.stringify(body) }),
    patch:  (endpoint, body) => apiClient(endpoint, { method: "PATCH",  body: JSON.stringify(body) }),
    delete: (endpoint)       => apiClient(endpoint, { method: "DELETE" }),
};
